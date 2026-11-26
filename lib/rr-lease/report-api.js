import { authenticatedClient } from './operator-api.js';
import { createClient } from '@supabase/supabase-js';
import { parseAmazon,parseFirstLine,reportDigest } from './report-import.js';
const MAX=3*1024*1024;
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function bounded(req){
 const n=req.headers.get('content-length');if(n!==null&&(!/^\d+$/.test(n)||+n>MAX))throw Object.assign(Error('report_size'),{status:413});
 if(!req.body)throw Object.assign(Error('report_required'),{status:400});
 const rd=req.body.getReader(),chunks=[];let size=0;try{for(;;){const {done,value}=await rd.read();if(done)break;size+=value.byteLength;if(size>MAX){await rd.cancel();throw Object.assign(Error('report_size'),{status:413})}chunks.push(Buffer.from(value))}}finally{rd.releaseLock()}
 if(!size)throw Object.assign(Error('report_required'),{status:400});return Buffer.concat(chunks,size)
}
export function reportImportHandler(kind,{authFactory=authenticatedClient,serviceFactory,env=process.env}={}){
 if(!['amazon','firstline'].includes(kind))throw Error('Unknown report');
 return async req=>{
 let auth;try{auth=authFactory(req)}catch{return reply({error:'authentication_required'},401)}
 try{
 const {data,error}=await auth.client.auth.getUser(auth.token),u=data?.user;
 if(error||!u?.id||u.is_anonymous||!u.email_confirmed_at)return reply({error:'authentication_required'},401);
 const membership=await auth.client.from('rr_lease_operators').select('id').eq('carrier_user_id',u.id).eq('workspace_kind','carrier').limit(1);
 if(membership.error||membership.data?.length!==1)return reply({error:'carrier_required'},403);
 const mime=(req.headers.get('content-type')||'').split(';')[0].trim().toLowerCase(),format=mime==='text/csv'?'csv':mime==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'?'xlsx':null;
 if(!format||kind==='firstline'&&format!=='csv')return reply({error:'unsupported_report_format'},415);
 const bytes=await bounded(req);const digest=reportDigest(bytes);
 let parsed;try{parsed=kind==='amazon'?parseAmazon(bytes,format):parseFirstLine(bytes)}catch{return reply({error:'report_schema_or_reconciliation_failed'},422)}
 // Only the server parser may submit parsed report rows; the service-only RPC
 // rechecks and locks owner membership, archive bytes, and canonical identity.
 const url=env.SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL,key=env.SUPABASE_SERVICE_ROLE_KEY;
 if(!serviceFactory&&(!url||!key))return reply({error:'import_unavailable'},503);
 const db=serviceFactory?serviceFactory():createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const result=await db.rpc('rr_lease_step2c_import_report',{p_carrier:u.id,p_kind:kind,p_format:format,p_bytes:bytes.toString('base64'),p_sha256:digest,p_rows:parsed.rows,p_summary:{...parsed,rows:undefined}});
 if(result.error)return reply({error:'report_review_required'},result.error.code==='42501'?403:409);
 return reply(result.data);
 }catch(e){return reply({error:e.status?e.message:'import_failed'},e.status||500)}
 };
}
