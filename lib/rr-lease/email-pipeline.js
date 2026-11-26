// Read-only, explicit mailbox worker. No login, secret persistence, financial
// verification or automatic send. Provider credentials are supplied by the host
// only after the carrier authorizes the mailbox. All attachments are enumerated.
import { createHash } from 'node:crypto';
import { makeIntakeProposal, parseUSDCents } from './intake-contract.js';
const MAX=3*1024*1024, MAX_JSON=12*1024*1024, MAX_PAGES=1000, MAX_ITEMS=10000;
const sha=b=>createHash('sha256').update(b).digest('hex');
const fail=m=>{throw Error(m)};
const cleanName=(x)=>String(x||'original').replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,255)||'original';
const safeId=x=>{if(typeof x!=='string'||!x||x.length>2048||/[\x00-\x1f\x7f]/.test(x))fail('Invalid provider identifier');return encodeURIComponent(x)};
const date=x=>{const t=new Date(x);if(!Number.isFinite(t.valueOf()))fail('Invalid provider timestamp');return t.toISOString()};
const mime=x=>typeof x==='string'?x.split(';')[0].trim().toLowerCase():null;
const lower=x=>String(x||'').trim().toLowerCase();
const validKind=new Set(['ratecon','bol','pod','fuel','expense','firstline_report','amazon_report','unknown']);
const text=(x,n)=>typeof x==='string'&&x.trim()&&x.trim().length<=n?x.trim():undefined;
function bytes64(value){
 if(typeof value!=='string'||value.length>MAX_JSON||!/^[A-Za-z0-9+/_-]*={0,2}$/.test(value))fail('Invalid provider attachment bytes');
 const b=Buffer.from(value.replace(/-/g,'+').replace(/_/g,'/'),'base64');
 // Reject truncated or malformed provider encodings instead of advancing.
 if(b.toString('base64').replace(/=+$/,'')!==value.replace(/-/g,'+').replace(/_/g,'/').replace(/=+$/,''))fail('Noncanonical attachment encoding');
 return b;
}
async function readResponse(r,cap){
 if(!r.ok)fail('Provider read failed: HTTP '+r.status);
 const size=r.headers.get('content-length');
 if(size&&(!/^\d+$/.test(size)||+size>cap))fail('Provider response exceeds limit; window not completed');
 const reader=r.body?.getReader();if(!reader)fail('Empty provider response');
 const chunks=[];let n=0;try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>cap){await reader.cancel();fail('Provider response exceeds limit; window not completed')}chunks.push(Buffer.from(value))}}finally{reader.releaseLock()}
 return Buffer.concat(chunks,n)
}
const baseURL={gmail:'https://gmail.googleapis.com/gmail/v1/users/me',outlook:'https://graph.microsoft.com/v1.0/me'};
export function createMailboxReader({provider,mailbox,getAccessToken,fetcher=fetch}){
 if(!Object.hasOwn(baseURL,provider)||!mailbox||mailbox!==lower(mailbox)||typeof getAccessToken!=='function')fail('Explicit mailbox provider and token supplier required');
 const base=baseURL[provider],root=new URL(base);
 async function get(path,raw=false){
  const url=new URL(path.startsWith('https://')?path:base+path);
  if(url.origin!==root.origin||url.username||url.password||url.hash||!(url.pathname===root.pathname||url.pathname.startsWith(root.pathname+'/')))fail('Unexpected provider URL');
  const token=await getAccessToken();if(typeof token!=='string'||!token||/[\r\n]/.test(token))fail('Authorized read token required');
  const r=await fetcher(url.href,{method:'GET',headers:{Authorization:'Bearer '+token,Accept:raw?'application/octet-stream':'application/json',...(provider==='outlook'?{Prefer:'IdType="ImmutableId"'}:{})},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});
  const bytes=await readResponse(r,raw?MAX:MAX_JSON);
  return raw?bytes:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 }
 async function checkMailbox(){
  const u=provider==='gmail'?await get('/profile'):await get('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,id');
  if(provider==='gmail'?lower(u.emailAddress)!==mailbox:![lower(u.mail),lower(u.userPrincipalName)].includes(mailbox))fail('Provider token mailbox mismatch');
 }
 function envelope(message,receivedAt,sender){
  // Stable evidence excludes mutable Gmail label/history IDs and Outlook read state.
  const evidence=provider==='gmail'?{id:message.id,internalDate:message.internalDate,payload:message.payload}:{id:message.id,subject:message.subject,from:message.from,receivedDateTime:message.receivedDateTime,body:message.body,internetMessageId:message.internetMessageId};
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
  const bytes=Buffer.from(JSON.stringify(canonical({format:'roadready-mail-evidence-v1',provider,mailbox,messageId:message.id,receivedAt,sender,message:evidence})),'utf8');
  return {messageId:message.id,partId:'@message',receivedAt,sender,fileName:'message.json',mimeType:'application/json',bytes:bytes.length<=MAX?bytes:null,holdReason:bytes.length>MAX?'Message envelope exceeds archive limit; original retained in mailbox':null,subject:message.subject||message.payload?.headers?.find(h=>lower(h.name)==='subject')?.value||'',message};
 }
 function part(message,meta,bytes,holdReason){
  if(bytes&&!bytes.length)bytes=null;
  return {messageId:message.messageId,partId:meta.id,receivedAt:message.receivedAt,sender:message.sender,fileName:cleanName(meta.name),mimeType:mime(meta.mimeType),bytes,holdReason:holdReason||(!bytes?'Empty attachment; retain source reference':null),subject:message.subject};
 }
 async function* gmail(start,end){
  // Query by epoch seconds and filter internalDate exactly; overlap rounded query
  // bounds, never treat a page or estimated resultSize as complete.
  const from=Math.floor(Date.parse(start)/1000)-1,to=Math.ceil(Date.parse(end)/1000)+1;
  let token=null,pages=0;const pageTokens=new Set(),seen=new Set();
  do{
   if(++pages>MAX_PAGES)fail('Gmail pagination limit');
   const q=new URLSearchParams({q:'after:'+from+' before:'+to,maxResults:'100',includeSpamTrash:'true'});if(token)q.set('pageToken',token);
   const page=await get('/messages?'+q);if(page.messages!=null&&!Array.isArray(page.messages))fail('Invalid Gmail list');
   for(const entry of page.messages||[]){
    const id=safeId(entry.id);if(seen.has(entry.id))continue;seen.add(entry.id);if(seen.size>MAX_ITEMS)fail('Mailbox window item limit');
    const msg=await get('/messages/'+id+'?format=full');if(msg.id!==entry.id)fail('Gmail message identity changed');
    const receivedAt=date(Number(msg.internalDate));if(receivedAt<start||receivedAt>=end)continue;
    const fromHeader=msg.payload?.headers?.find(h=>lower(h.name)==='from')?.value||'';
    const sender=lower((/<([^<>]+)>/.exec(fromHeader)?.[1])||fromHeader);
    const ev=envelope(msg,receivedAt,sender);yield ev;
    const walk=async function*(node,path){
     if(!node||typeof node!=='object')fail('Invalid Gmail MIME tree');
     const b=node.body||{},name=node.filename||'',id=node.partId||path,declared=Number(b.size||0);
     if(b.attachmentId||name){
      const meta={id:'part:'+id,name:name||'attachment',mimeType:node.mimeType};
      if(!Number.isSafeInteger(declared)||declared<0)fail('Invalid Gmail attachment size');
      if(declared>MAX){yield part(ev,meta,null,'Attachment exceeds 3 MiB; retrieve original for owner review')}
      else{
       const body=b.attachmentId?await get('/messages/'+safeId(msg.id)+'/attachments/'+safeId(b.attachmentId)):b;
       if(typeof body.data!=='string'){if(declared===0){yield part(ev,meta,null,'Empty attachment');}else fail('Missing Gmail attachment data')}
       else{const bytes=bytes64(body.data);if(bytes.length!==declared||bytes.length>MAX)fail('Gmail original size changed');yield part(ev,meta,bytes,null)}
      }
     }
     if(node.parts!=null&&!Array.isArray(node.parts))fail('Invalid Gmail part list');
     for(let i=0;i<(node.parts||[]).length;i++)yield* walk(node.parts[i],path+'.'+i);
    };
    yield* walk(msg.payload,'0');
   }
   token=page.nextPageToken||null;if(token&&(typeof token!=='string'||pageTokens.has(token)))fail('Gmail cursor loop');if(token)pageTokens.add(token);
  }while(token);
 }
 async function* outlook(start,end){
  const q=new URLSearchParams({'$filter':"receivedDateTime ge "+start+" and receivedDateTime lt "+end,'$orderby':'receivedDateTime asc','$select':'id,subject,from,receivedDateTime,body,hasAttachments,internetMessageId','$top':'50'});
  let next='/messages?'+q,pages=0;const pagesSeen=new Set(),seen=new Set();
  while(next){
   if(++pages>MAX_PAGES||pagesSeen.has(next))fail('Outlook pagination loop/limit');pagesSeen.add(next);
   const page=await get(next);if(!Array.isArray(page.value))fail('Invalid Outlook list');
   for(const msg of page.value){
    safeId(msg.id);if(seen.has(msg.id))continue;seen.add(msg.id);if(seen.size>MAX_ITEMS)fail('Mailbox window item limit');
    const receivedAt=date(msg.receivedDateTime);if(receivedAt<start||receivedAt>=end)fail('Outlook returned out-of-window item');
    const ev=envelope(msg,receivedAt,lower(msg.from?.emailAddress?.address));yield ev;
    // Graph hasAttachments excludes inline items; list for every message.
    const prefix='/messages/'+safeId(msg.id)+'/attachments';let cursor=prefix+'?$select=id,name,contentType,size,isInline&$top=50',n=0;const cursors=new Set();
    while(cursor){
     if(++n>MAX_PAGES||cursors.has(cursor))fail('Outlook attachment pagination loop/limit');cursors.add(cursor);
     const attachments=await get(cursor);if(!Array.isArray(attachments.value))fail('Invalid Outlook attachments');
     for(const at of attachments.value){
      const meta={id:'part:'+at.id,name:at.name,mimeType:at.contentType};safeId(at.id);
      const declared=at.size;if(!Number.isSafeInteger(declared)||declared<0)fail('Invalid Outlook attachment size');
      if(at['@odata.type']!=='#microsoft.graph.fileAttachment'){yield part(ev,meta,null,'Item/reference attachment requires manual original retrieval');continue}
      if(declared>MAX){yield part(ev,meta,null,'Attachment exceeds 3 MiB; retrieve original for owner review');continue}
      if(!declared){yield part(ev,meta,null,'Empty attachment');continue}
      const bytes=await get(prefix+'/'+safeId(at.id)+'/$value',true);
      if(bytes.length!==declared)fail('Outlook attachment size changed');yield part(ev,meta,bytes,null);
     }
     cursor=attachments['@odata.nextLink']||null;
     if(cursor&&new URL(cursor).pathname!==root.pathname+prefix)fail('Unexpected Outlook attachment cursor');
    }
   }
   next=page['@odata.nextLink']||null;if(next&&new URL(next).pathname!==root.pathname+'/messages')fail('Unexpected Outlook list cursor');
  }
 }
 return {async *readWindow(start,end){await checkMailbox();yield* (provider==='gmail'?gmail(start,end):outlook(start,end))}};
}
export function sourceRefs(provider,mailbox,messageId,partId){return {sourceRef:provider+':'+sha(Buffer.from(mailbox+'\x1f'+messageId)),attachmentRef:sha(Buffer.from(partId))};}
export function makeMailProposal({provider,mailbox,item,extracted}){
 const refs=sourceRefs(provider,mailbox,item.messageId,item.partId);
 if(!item.bytes)return Object.freeze({source:provider,...refs,kind:'unknown',sha256:null,amountCents:null,brokerRules:{},status:'DRAFT',requiresVerification:true});
 const digest=sha(item.bytes);
 const kind=item.bytes&&validKind.has(extracted?.kind)?extracted.kind:'unknown';
 let amountCents=null;try{if(item.bytes&&typeof extracted?.amount==='string')amountCents=parseUSDCents(extracted.amount)}catch{amountCents=null}
 const rules={};for(const key of ['tracking','detention','layover','lumper','podDeadline']){const v=text(extracted?.brokerRules?.[key],2000);if(v&&item.bytes)rules[key]=v}
 return makeIntakeProposal({source:provider,...refs,kind,sha256:digest,amountCents,brokerRules:rules});
}
// Only explicit labelled IDs on Amazon-domain booking/cancellation messages.
// No payout amount, operator identity, or payment verification from email.
export function amazonEmailSignal(item){
 if(item.partId!=='@message'||!item.bytes||!/^[^@]+@(amazon\.com|amazonrelay\.com)$/i.test(item.sender)||!/book|cancel|trip|block|load/i.test(item.subject))return null;
 const s=item.subject+' '+JSON.stringify(item.message||{}).slice(0,500000);
 const pick=label=>{const m=[...s.matchAll(new RegExp('\\b'+label+'\\s*(?:ID)?\\s*[:#]\\s*([A-Za-z0-9][A-Za-z0-9._:-]{2,119})','gi'))].map(x=>x[1].toUpperCase());return new Set(m).size===1?m[0]:null};
 const trip=pick('Trip'),block=pick('Block');return trip||block?{trip,block}:null;
}
async function invoke(db,name,args){const {data,error}=await db.rpc(name,args);if(error)fail('Database refused '+name+' ('+(error.code||'unknown')+')');return data}
export async function runMailboxWindow({db,carrier,provider,mailbox,reader,initialStart,end,overlapMs=300000,extract=async()=>null}){
 const scope={p_carrier:carrier,p_provider:provider,p_mailbox:mailbox};
 const rawCursor=await invoke(db,'rr_lease_step2c_mail_cursor',scope);const expected=rawCursor??null;
 const until=date(end);const current=expected?Date.parse(expected):Date.parse(initialStart);
 if(!Number.isFinite(current)||Date.parse(until)<=current||Date.parse(until)>Date.now()||Date.parse(until)-current>30*86400000||!Number.isSafeInteger(overlapMs)||overlapMs<0||overlapMs>86400000)fail('Invalid bounded mailbox window');
 const start=date(expected?current-overlapMs:current),manifest=[],seen=new Set();
 for await(const item of reader.readWindow(start,until)){
  if(manifest.length>=MAX_ITEMS)fail('Mailbox window item limit');
  const refs=sourceRefs(provider,mailbox,item.messageId,item.partId),key=refs.sourceRef+'|'+refs.attachmentRef;
  if(seen.has(key))fail('Duplicate provider item in window');seen.add(key);
  if(item.receivedAt<start||item.receivedAt>=until)fail('Unexpected item timestamp');
  let extracted=null;
  // A failed extraction cannot block archiving. It creates an owner-review
  // item instead. Extraction receives no credentials or DB posting capability.
  if(item.bytes)try{extracted=await extract(Object.freeze({...item,bytes:Buffer.from(item.bytes)}))}catch{}
  const proposal=makeMailProposal({provider,mailbox,item,extracted});
  const result=await invoke(db,'rr_lease_step2c_record_mail',{...scope,p_message_id:item.messageId,p_part_id:item.partId,p_received_at:item.receivedAt,p_sender:item.sender||null,p_file_name:item.fileName,p_mime:item.mimeType||null,p_bytes:item.bytes?.toString('base64')??null,p_sha256:item.bytes?sha(item.bytes):null,p_hold_reason:item.holdReason||null,p_proposal:proposal,p_signal:amazonEmailSignal(item)});
  if(result.sourceRef!==refs.sourceRef||result.attachmentRef!==refs.attachmentRef)fail('Archive identity mismatch');
  manifest.push(refs);
 }
 manifest.sort((a,b)=>(a.sourceRef+'|'+a.attachmentRef).localeCompare(b.sourceRef+'|'+b.attachmentRef));
 // Reached only after provider enumeration and every durable source write.
 return invoke(db,'rr_lease_step2c_finish_window',{...scope,p_expected:expected,p_start:start,p_end:until,p_manifest:manifest,p_complete:true});
}
