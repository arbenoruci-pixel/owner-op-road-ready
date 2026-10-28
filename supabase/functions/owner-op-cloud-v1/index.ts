// Owner Operator only. JWTs are verified with Auth; inspection access uses a 256-bit scoped capability.
const URL_BASE = Deno.env.get('SUPABASE_URL');
const ANON = Deno.env.get('SUPABASE_ANON_KEY');
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const BUCKET = 'owner-op-private';
const MAX_BODY = 15 * 1024 * 1024;
function cors(req) {
 const origin=req.headers.get('origin')||'';
 const allowed=/^https:\/\/owner-op-road-ready(?:-[a-z0-9-]+)?\.vercel\.app$/.test(origin)||/^http:\/\/localhost:\d+$/.test(origin);
 return {'Access-Control-Allow-Origin':allowed?origin:'https://owner-op-road-ready.vercel.app','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
}
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
function canonical(v){if(Array.isArray(v))return '['+v.map(x=>canonical(x===undefined?null:x)).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
async function digest(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function body(req){if(Number(req.headers.get('content-length')||0)>MAX_BODY)fail('Request too large',413);const reader=req.body?.getReader();if(!reader)fail('Missing request');let size=0;const chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BODY){await reader.cancel();fail('Request too large',413);}chunks.push(value);}const all=new Uint8Array(size);let off=0;for(const x of chunks){all.set(x,off);off+=x.length;}try{return JSON.parse(new TextDecoder().decode(all));}catch{fail('Invalid JSON');}}
async function request(path,token,method='GET',value,service=false,extra={}){
 const headers={apikey:service?SERVICE:ANON,Authorization:'Bearer '+token,...extra};
 if(value!==undefined&&!(value instanceof Uint8Array))headers['Content-Type']='application/json';
 const res=await fetch(URL_BASE+path,{method,headers,body:value===undefined?undefined:value instanceof Uint8Array?value:JSON.stringify(value),signal:AbortSignal.timeout(20000)});
 return res;
}
async function rpc(action,payload,token){const res=await request('/rest/v1/rpc/owner_op_cloud_v1',token,'POST',{p_action:action,p_payload:payload});const result=await res.json();if(!res.ok)fail(result.message||'Cloud request failed',result.code==='40001'?409:res.status);return result;}
function objectPath(path){return path.split('/').map(encodeURIComponent).join('/');}
async function store(bytes,{uid,category,sha,mime,name,extension},token){
 const path=uid+'/'+category+'/'+sha+'.'+extension;
 let stored=bytes;
 const res=await request('/storage/v1/object/'+BUCKET+'/'+objectPath(path),token,'POST',bytes,false,{'Content-Type':mime,'x-upsert':'false','cache-control':'private, max-age=0'});
 if(!res.ok){
  if(![400,409].includes(res.status))fail('Document upload failed',res.status);
  const existing=await request('/storage/v1/object/authenticated/'+BUCKET+'/'+objectPath(path),token);
  if(!existing.ok)fail('Document upload was not confirmed');
  stored=new Uint8Array(await existing.arrayBuffer());
  const check=category==='log_archive'?new Uint8Array(await new Response(new Blob([stored]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()):stored;
  if(await digest(check)!==sha)fail('Stored document integrity check failed',409);
 }
 return await rpc('register_file',{category,storage_path:path,sha256:sha,mime_type:mime,size_bytes:stored.length,original_name:name},token);
}
function documentBytes(dataUrl){
 if(typeof dataUrl!=='string'||dataUrl.length>14*1024*1024)fail('Document too large',413);
 const match=dataUrl.match(/^data:[^;,]*;base64,([A-Za-z0-9+/=\r\n]+)$/);if(!match)fail('Attach a PDF, JPG, PNG or WebP file');
 const raw=atob(match[1]);if(raw.length>10*1024*1024)fail('Maximum document size is 10 MB',413);
 const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));let mime='',extension='';
 if(raw.startsWith('%PDF-')){mime='application/pdf';extension='pdf';}
 else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255){mime='image/jpeg';extension='jpg';}
 else if(bytes[0]===137&&raw.slice(1,4)==='PNG'){mime='image/png';extension='png';}
 else if(raw.startsWith('RIFF')&&raw.slice(8,12)==='WEBP'){mime='image/webp';extension='webp';}
 else fail('Unsupported or invalid document format');
 return {bytes,mime,extension};
}
function walletMetadata(input={}){const out={};for(const k of ['title','number','state','unit','trailer','plate','vin','carrier','policyNo','mcNumber','usdotNumber','year','quarter','loadNo','bolNo','inspectionDate','expiresOn','notes','present','enabled','updatedAt','attachedAt','attachmentName','attachmentType','attachmentSize'])if(['string','number','boolean'].includes(typeof input[k]))out[k]=typeof input[k]==='string'?input[k].slice(0,k==='notes'?2000:250):input[k];return out;}
async function inspection(p){if(typeof p.token!=='string'||!/^([a-f0-9]{64})$/.test(p.token))fail('Inspection link is invalid or expired',403);const res=await request('/rest/v1/rpc/owner_op_inspection_manifest_v1',SERVICE,'POST',{p_token_sha256:await digest(new TextEncoder().encode(p.token))},true);if(!res.ok)fail('Inspection link is expired or revoked',403);return await res.json();}
Deno.serve(async req=>{
 const headers=cors(req);if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method==='GET')return Response.json({service:'owner-op-cloud-v1',status:'ready',schema:'owner_op',private_storage:true},{headers});
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405,headers});
 try{
  const p=await body(req);let result;
  if(p.action==='inspect'||p.action==='inspection_file'){
   const manifest=await inspection(p);
   if(p.action==='inspection_file'){
    const item=manifest.items.find(i=>i.file_id===p.file_id);if(!item)fail('Document is outside this inspection package',403);
    const res=await request('/storage/v1/object/authenticated/'+BUCKET+'/'+objectPath(item.storage_path),SERVICE,'GET',undefined,true);if(!res.ok)fail('Document unavailable',404);
    return new Response(res.body,{headers:{...headers,'Content-Type':item.mime_type,'Content-Disposition':'inline','Content-Security-Policy':"default-src 'none'; sandbox",'X-Content-SHA256':item.sha256}});
   }
   result={...manifest,items:manifest.items.map(({storage_path,...item})=>item)};
  }else{
   const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!token)fail('Sign in to Owner Operator',401);
   const auth=await request('/auth/v1/user',token);if(!auth.ok)fail('Your session expired; sign in again',401);const user=await auth.json();if(!user.id||user.is_anonymous)fail('A verified account is required',401);
   if(['bootstrap','catalog','list_days','list_shares','revoke_share'].includes(p.action))result=await rpc(p.action,p.payload||{},token);
   else if(p.action==='download_file'){
    const f=await rpc('file',{id:p.file_id},token);const res=await request('/storage/v1/object/authenticated/'+BUCKET+'/'+objectPath(f.storage_path),token);if(!res.ok)fail('Document unavailable',404);
    return new Response(res.body,{headers:{...headers,'Content-Type':f.mime_type,'X-Content-SHA256':f.sha256,'Content-Disposition':'inline','Content-Security-Policy':"default-src 'none'; sandbox"}});
   }else if(p.action==='upload_document'){
    const {bytes,mime,extension}=documentBytes(p.data_url);const sha=await digest(bytes);
    const name=String(p.metadata?.attachmentName||p.document_key||'document').replace(/[\r\n\\/]/g,'_').slice(0,230);
    const f=await store(bytes,{uid:user.id,category:'wallet',sha,mime,name,extension},token);
    result=await rpc('wallet_commit',{document_key:p.document_key,file_id:f.id,metadata:walletMetadata(p.metadata),expected_revision:p.expected_revision},token);
   }else if(p.action==='upload_log'){
    const snapshot=p.snapshot;
    if(snapshot?.kind!=='owner_op_road_ready_day_backup'||!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.sourceDay||'')||!Array.isArray(snapshot.dayData?.events))fail('Invalid daily log backup');
    const raw=new TextEncoder().encode(canonical(snapshot));if(raw.length>1024*1024)fail('Daily log exceeds the 1 MB safety limit; local data remains unchanged',413);
    const sha=await digest(raw);const compressed=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    const f=await store(compressed,{uid:user.id,category:'log_archive',sha,mime:'application/gzip',name:snapshot.sourceDay+'.json.gz',extension:'json.gz'},token);
    result=await rpc('save_day',{log_date:snapshot.sourceDay,home_timezone:snapshot.homeTerminalTimeZone,file_id:f.id,expected_revision:p.expected_revision,device_id:p.device_id,summary:{events:snapshot.dayData.events.length,certification:snapshot.dayData.certifyStatus||'',signed:!!snapshot.dayData.signature?.signed}},token);
   }else if(p.action==='create_snapshot_share'){
    const pack=p.inspection;
    if(pack?.version!==1||!Array.isArray(pack.snapshots)||pack.snapshots.length!==8||!/^\d{4}-\d{2}-\d{2}$/.test(pack.endDay||'')||!Number.isFinite(Date.parse(pack.capturedAt)))fail('Invalid inspection snapshot');
    const elapsed=Date.now()-Date.parse(pack.capturedAt);
    if(elapsed < -120000 || elapsed > 15*60*1000)fail('Inspection snapshot is too old. Create the link again.',409);
    if(!Number.isInteger(p.expected_revision)||!p.expected_archive||typeof p.device_id!=='string')fail('Verified account revision is required');
    const dates=Array.from({length:8},(_,i)=>{const d=new Date(pack.endDay+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-7+i);return d.toISOString().slice(0,10);});
    const logs=[];
    for(let i=0;i<8;i++){
     const snapshot=pack.snapshots[i],view=snapshot?.inspectionView;
     if(snapshot?.kind!=='owner_op_road_ready_day_backup'||snapshot.sourceDay!==dates[i]||!Array.isArray(snapshot.dayData?.events)||view?.version!==1||view.day!==dates[i]||view.capturedAt!==pack.capturedAt||!Array.isArray(view.events)||!Number.isInteger(view.cutoff)||view.cutoff<0||view.cutoff>1440)fail('Inspection day verification failed');
     const raw=new TextEncoder().encode(canonical(snapshot));if(raw.length>1024*1024)fail('Daily inspection snapshot exceeds 1 MB',413);
     const sha=await digest(raw),compressed=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
     const f=await store(compressed,{uid:user.id,category:'log_archive',sha,mime:'application/gzip',name:snapshot.sourceDay+'.json.gz',extension:'json.gz'},token);
     logs.push({day:snapshot.sourceDay,file_id:f.id,sha256:sha});
    }
    const tokenBytes=crypto.getRandomValues(new Uint8Array(32)),shareToken=[...tokenBytes].map(x=>x.toString(16).padStart(2,'0')).join('');
    const payload={logs,end_day:pack.endDay,captured_at:pack.capturedAt,home_timezone:pack.timeZone,profile:pack.profile,wallet_keys:p.wallet_keys||[],device_id:p.device_id,expected_revision:p.expected_revision,expected_archive:p.expected_archive,token_sha256:await digest(new TextEncoder().encode(shareToken))};
    const res=await request('/rest/v1/rpc/owner_op_create_inspection_snapshot_v1',token,'POST',{p_payload:payload});
    const receipt=await res.json();if(!res.ok)fail(receipt.message||'Inspection snapshot could not be committed',receipt.code==='PT409'?409:res.status);
    result={...receipt,token:shareToken};
   }else if(p.action==='create_share'){
    fail('Update Road Ready to create a verified current inspection snapshot.',409);
   }else fail('Unknown action');
  }
  return Response.json({ok:true,result},{headers});
 }catch(error){return Response.json({ok:false,error:error?.message||'Cloud request failed'},{status:error?.status||500,headers});}
});
