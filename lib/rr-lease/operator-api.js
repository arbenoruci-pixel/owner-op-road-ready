import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const MAX=3*1024*1024;
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const MIME=new Set(['application/pdf','image/jpeg','image/png','image/webp']);
class ApiError extends Error {constructor(status,code){super(code);this.status=status;this.code=code;}}
const fail=(status,code)=>{throw new ApiError(status,code)};
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function uuid(v){if(typeof v!=='string'||!UUID.test(v))fail(400,'invalid_identifier');return v.toLowerCase();}
function optionalId(v){return v==null?null:uuid(v);}
function txt(v,max){if(typeof v!=='string'||!v.trim()||v.trim().length>max||/[\x00-\x1f\x7f]/.test(v))fail(400,'invalid_text');return v.trim();}
function bool(v){if(typeof v!=='boolean')fail(400,'boolean_required');return v;}
function exact(obj,allowed){
 if(!obj||Array.isArray(obj)||typeof obj!=='object'||Object.keys(obj).some(k=>!allowed.includes(k)))fail(400,'invalid_fields');
 return obj;
}
function accessorials(v){exact(v,['detention','layover','lumper']);return {detention:bool(v.detention),layover:bool(v.layover),lumper:bool(v.lumper)};}
function type(request){return (request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();}
async function readBounded(request,max){
 const length=request.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>max))fail(413,'payload_too_large');
 if(!request.body)fail(400,'empty_body');
 const reader=request.body.getReader();const chunks=[];let total=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>max){await reader.cancel();fail(413,'payload_too_large');}chunks.push(Buffer.from(value));}}
 finally{reader.releaseLock();}
 if(!total)fail(400,'empty_body');return Buffer.concat(chunks,total);
}
async function json(request){
 if(type(request)!=='application/json')fail(415,'json_required');
 try{return JSON.parse((await readBounded(request,16384)).toString('utf8'));}catch(e){if(e instanceof ApiError)throw e;fail(400,'invalid_json');}
}
export function magicMime(b){
 if(b.length>=5&&b.subarray(0,5).equals(Buffer.from('%PDF-')))return 'application/pdf';
 if(b.length>=3&&b.subarray(0,3).equals(Buffer.from('ffd8ff','hex')))return 'image/jpeg';
 if(b.length>=8&&b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return 'image/png';
 if(b.length>=12&&b.subarray(0,4).equals(Buffer.from('RIFF'))&&b.subarray(8,12).equals(Buffer.from('WEBP')))return 'image/webp';
 return null;
}
// Use a publishable/anon key and the verified bearer ONLY. No service-role
// client or browser-supplied owner/operator/user ID is used for authorization.
// All ownership checks and protected writes are repeated atomically in SQL.
export function authenticatedClient(request,{url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.SUPABASE_ANON_KEY,clientFactory=createClient}={}){
 const match=/^Bearer ([^\s,]+)$/i.exec(request.headers.get('authorization')||'');
 if(!match||match[1].length>8192)fail(401,'authentication_required');
 if(!url||!key||key.startsWith('sb_secret_'))fail(503,'operator_auth_unavailable');
 // Reject mistakenly configured legacy service-role key without logging it.
 try{const payload=JSON.parse(Buffer.from(key.split('.')[1]||'','base64url').toString());if(payload.role==='service_role')fail(503,'operator_auth_unavailable');}catch(e){if(e instanceof ApiError)throw e;}
 const token=match[1];
 return {token,client:clientFactory(url,key,{global:{headers:{Authorization:'Bearer '+token},fetch:(input,init)=>fetch(input,{...init,cache:'no-store'})},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})};
}
const podWriteRpcs = new Set(['rr_lease_step2b_create_upload', 'rr_lease_step2b_commit_upload', 'rr_lease_pod_addendum']);

function classifyPodWriteError({code, message}) {
 if (code === 'P0001') {
  switch (message) {
   case 'Invalid attachment chunk':
   case 'Unexpected chunk size':
   case 'Incomplete attachment or checksum mismatch':
   case 'Storage original is missing or inconsistent':
    return fail(503, 'pod_save_failed');
   case 'Open unfactored load required':
   case 'Open unfactored load required: settlement locked':
   case 'Open unfactored load required: factoring claim exists':
    return fail(409, 'pod_load_closed');
   case 'POD original already assigned to a different load':
   case 'Original already registered through another source; use existing evidence':
    return fail(409, 'pod_original_filed');
   case 'Conflicting attachment retry':
   case 'A verified original cannot change':
    return fail(409, 'conflicting_request');
   default:
    fail(500, 'operator_request_failed');
  }
 }
 if (code === '23505') {
  if (message === 'Original already filed; carrier review required') fail(409, 'pod_original_filed');
  if (['Upload replay has different bytes', 'Request ID already used for another upload', 'Request already used for another original'].includes(message)) {
   fail(409, 'conflicting_request');
  }
  fail(500, 'operator_request_failed');
 }
 if (code === '40001' || code === '40P01') fail(503, 'pod_save_failed');
 if (code === '22023') {
  if (message === 'Upload expired') fail(409, 'pod_upload_expired');
  if (message === 'Upload limit reached' || message === 'Daily correction upload limit reached') fail(429, 'pod_upload_limit');
  if (message === 'Unverified financial load requires carrier review' || message === 'Staged financial load needs owner review') fail(409, 'pod_load_needs_review');
  if (message === 'Unsupported load channel or type') fail(400, 'pod_load_unsupported');
  if (message === 'Invalid file metadata' || message === 'Invalid original metadata') fail(400, 'invalid_file_metadata');
  if (message === 'Broker and load reference required for orphan' || message === 'Use load selector or orphan reference') fail(400, 'choose_load_or_orphan');
 }
}
async function rpc(client,name,args){
 const {data,error}=await client.rpc(name,args);
 if(error){
  if(podWriteRpcs.has(name))classifyPodWriteError(error);
  if(error.code==='42501')fail(403,'access_denied');
  if(error.code==='23505'||error.code==='40001'||error.code==='40P01')fail(409,'conflicting_request');
  if(['22023','22000','22P02','23514'].includes(error.code))fail(400,'invalid_request');
  if(error.code==='P0001')fail(409,'review_required');
  fail(500,'operator_request_failed');
 }
 return data;
}
async function create(request,client){
 const b=exact(await json(request),['requestId','loadId','broker','loadNumber','fileName','mimeType','byteSize']);
 const id=optionalId(b.loadId);const broker=id?null:txt(b.broker,200);const loadNo=id?null:txt(b.loadNumber,120);
 if(id&&(b.broker!=null||b.loadNumber!=null))fail(400,'choose_load_or_orphan');
 const name=txt(b.fileName,255);
 if(/[\\/]/.test(name)||!MIME.has(b.mimeType)||!Number.isSafeInteger(b.byteSize)||b.byteSize<1||b.byteSize>MAX)fail(400,'invalid_file_metadata');
 return rpc(client,'rr_lease_step2b_create_upload',{p_request_id:uuid(b.requestId),p_load_id:id,p_broker:broker,p_load_number:loadNo,p_file_name:name,p_mime:b.mimeType,p_size:b.byteSize});
}
async function readPodOriginal(request) {
 const mime = type(request);
 if (!MIME.has(mime)) fail(415, 'unsupported_document_type');
 const bytes = await readBounded(request, MAX);
 if (magicMime(bytes) !== mime) fail(415, 'mime_signature_mismatch');
 return {
  p_mime: mime,
  p_base64: bytes.toString('base64'),
  p_sha256: createHash('sha256').update(bytes).digest('hex'),
 };
}
async function commit(request,client){
 const id = uuid(request.headers.get('x-upload-id'));
 return rpc(client, 'rr_lease_step2b_commit_upload', {p_upload_id:id, ...await readPodOriginal(request)});
}
async function addendum(request,client){
 const loadId = uuid(request.headers.get('x-load-id'));
 const requestId = uuid(request.headers.get('x-request-id'));
 let fileName;
 try { fileName = decodeURIComponent(request.headers.get('x-file-name') || ''); }
 catch { fail(400, 'invalid_file_metadata'); }
 fileName = txt(fileName, 255);
 if (/[\\/]/.test(fileName)) fail(400, 'invalid_file_metadata');
 return rpc(client, 'rr_lease_pod_addendum', {
  p_load_id:loadId, p_request_id:requestId, p_file_name:fileName, ...await readPodOriginal(request),
 });
}
async function review(request,client){
 const b=exact(await json(request),['documentId','approve','setAsFinalPod','reason']);
 const approve=bool(b.approve),final=bool(b.setAsFinalPod);
 if(!approve&&final)fail(400,'rejection_cannot_be_final');
 return rpc(client,'rr_lease_step2b_review_pod',{p_document_id:uuid(b.documentId),p_approve:approve,p_set_as_final:final,p_reason:txt(b.reason,1000)});
}
async function inbox(request,client){
 const q=new URL(request.url).searchParams;
 if([...q.keys()].some(k=>!['limit','before'].includes(k))||q.getAll('limit').length>1||q.getAll('before').length>1)fail(400,'invalid_query');
 const limit=q.get('limit')||'50';if(!/^\d{1,3}$/.test(limit)||+limit<1||+limit>100)fail(400,'invalid_limit');
 const before=q.get('before');if(before&&(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(before)||!Number.isFinite(Date.parse(before))))fail(400,'invalid_cursor');
 return rpc(client,'rr_lease_step2b_owner_inbox',{p_limit:+limit,p_before:before||null});
}
async function assign(request,client){
 const b=exact(await json(request),['sourceRef','attachmentRef','operatorId','loadId','kind','reason','accessorials','execute','broker','loadNumber','settlementId','amountCents','paidBy','transactionRef']);
 if(!['fuel','expense','ratecon','pod','bol','supporting','unknown'].includes(b.kind))fail(400,'invalid_kind');
 if(b.kind!=='ratecon'&&b.accessorials!=null)fail(400,'unexpected_accessorials');
 const base={p_source_ref:txt(b.sourceRef,1024),p_attachment_ref:txt(b.attachmentRef,1024),p_operator_id:uuid(b.operatorId),p_load_id:optionalId(b.loadId),p_kind:b.kind,p_reason:txt(b.reason,1000),p_accessorials:b.kind==='ratecon'?accessorials(b.accessorials):null};
 // Legacy Step 2B requests can save a nonfinancial MATCHED_DRAFT. The new
 // execution request is explicit. No fallback to legacy after an execution error.
 const extra=['broker','loadNumber','settlementId','amountCents','paidBy','transactionRef'];
 if(b.execute!=null)bool(b.execute);
 const execute=b.execute===true||b.kind==='ratecon'&&!base.p_load_id||b.kind==='expense'||extra.some(k=>b[k]!=null);
 if(!execute)return rpc(client,'rr_lease_step2b_assign_draft',base);
 if(b.execute===false)fail(400,'execution_required_for_new_fields');
 if(b.kind==='unknown')fail(400,'classify_original_first');
 const newRate=b.kind==='ratecon'&&!base.p_load_id;
 const expense=['fuel','expense'].includes(b.kind);
 if(!newRate&&(b.broker!=null||b.loadNumber!=null))fail(400,'unexpected_load_creation_fields');
 if(!expense&&['settlementId','amountCents','paidBy','transactionRef'].some(k=>b[k]!=null))fail(400,'unexpected_financial_fields');
 if(expense&&(!Number.isSafeInteger(b.amountCents)||b.amountCents<1||b.amountCents>100000000000||!['carrier','operator'].includes(b.paidBy)))fail(400,'explicit_draft_expense_required');
 return rpc(client,'rr_lease_step2c_assign_execute',{...base,p_broker:newRate?txt(b.broker,200):null,p_load_number:newRate?txt(b.loadNumber,120):null,p_settlement_id:expense?uuid(b.settlementId):null,p_amount_cents:expense?b.amountCents:null,p_paid_by:expense?b.paidBy:null,p_transaction_ref:expense?txt(b.transactionRef,200):null});
}
async function reports(request,client){
 const q=new URL(request.url).searchParams;
 if([...q.keys()].some(k=>k!=='limit')||q.getAll('limit').length>1)fail(400,'invalid_query');
 const n=q.get('limit')||'100';if(!/^\d{1,3}$/.test(n)||+n<1||+n>100)fail(400,'invalid_limit');
 return rpc(client,'rr_lease_step2c_report_review',{p_limit:+n});
}
const handlers={create,commit,addendum,review,inbox,assign,reports};
export function operatorHandler(action,config){
 if(!Object.hasOwn(handlers,action))throw Error('Unknown operator route');
 return async request=>{
  try{
   const {token,client}=authenticatedClient(request,config);
   // Auth server checks the actual access token (signature, user, expiry).
   // Do not rely on decoded JWT claims or local session storage.
   const {data,error}=await client.auth.getUser(token);
   if(error||!data?.user?.id||data.user.is_anonymous===true||!data.user.email_confirmed_at)fail(401,'authentication_required');
   const result=await handlers[action](request,client);
   return reply(result);
  }catch(e){return e instanceof ApiError?reply({error:e.code},e.status):reply({error:'operator_request_failed'},500);}
 };
}
