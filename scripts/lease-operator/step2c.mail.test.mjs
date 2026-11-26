import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMailProposal,runMailboxWindow,createMailboxReader,sourceRefs,amazonEmailSignal } from '../../lib/rr-lease/email-pipeline.js';
const mailbox='fixture@example.invalid',carrier='synthetic-carrier',start='2026-01-01T00:00:00.000Z',end='2026-01-01T01:00:00.000Z',receivedAt='2026-01-01T00:20:00.000Z';
const item={messageId:'m1',partId:'part:1',receivedAt,sender:'test@example.invalid',fileName:'receipt.pdf',mimeType:'application/pdf',bytes:Buffer.from('%PDF-1.4 test')};
test('AI output remains DRAFT and held original never receives fabricated SHA',()=>{
 const p=makeMailProposal({provider:'gmail',mailbox,item,extracted:{kind:'fuel',amount:'$10.05',operatorId:'fake',status:'POSTED',brokerRules:{detention:'2h',layover:'$100'}}});
 assert.equal(p.amountCents,1005);assert.equal(p.status,'DRAFT');assert.equal(p.requiresVerification,true);assert.equal(p.operatorId,undefined);assert.equal(p.brokerRules.layover,'$100');
 const hold=makeMailProposal({provider:'gmail',mailbox,item:{...item,bytes:null},extracted:{kind:'fuel',amount:'100'}});assert.equal(hold.sha256,null);assert.equal(hold.kind,'unknown');assert.equal(hold.amountCents,null);
});
test('email replay does not advance cursor on interrupted enumeration or failed source write',async()=>{
 let cursor=null;const records=new Map(),calls=[];let failed=false;
 const db={async rpc(name,args){calls.push(name);if(name.endsWith('_mail_cursor'))return {data:cursor};
  if(name.endsWith('_record_mail')){if(failed)return {error:{code:'boom'}};const refs=sourceRefs(args.p_provider,args.p_mailbox,args.p_message_id,args.p_part_id);records.set(refs.sourceRef+'|'+refs.attachmentRef,refs);return {data:refs};}
  if(name.endsWith('_finish_window')){assert.equal(args.p_complete,true);assert.equal(args.p_manifest.length,records.size);cursor=args.p_end;return {data:{checkedThrough:cursor}};}throw Error(name)}};
 const opts={db,carrier,provider:'gmail',mailbox,initialStart:start,end,extract:async()=>{throw Error('AI down')}};
 const broken={async *readWindow(){yield item;throw Error('page failure')}};
 await assert.rejects(()=>runMailboxWindow({...opts,reader:broken}),/page failure/);assert.equal(cursor,null);assert.equal(calls.filter(x=>x.endsWith('_finish_window')).length,0);
 failed=true;const good={async *readWindow(){yield item;yield {...item,partId:'part:2',bytes:null,holdReason:'Oversize'}}};
 await assert.rejects(()=>runMailboxWindow({...opts,reader:good}),/Database refused/);assert.equal(cursor,null);failed=false;
 await runMailboxWindow({...opts,reader:good});assert.equal(records.size,2);assert.equal(cursor,end);
});
test('Gmail enumerates all pages and attachment bytes; verifies mailbox before read',async()=>{
 const data=Buffer.from('%PDF-1.4 fixture'),now=Date.parse(receivedAt);const visited=[];
 const fetcher=async url=>{const u=new URL(url);visited.push(u.pathname+u.search);let body;
  if(u.pathname.endsWith('/profile'))body={emailAddress:mailbox};
  else if(u.pathname.endsWith('/messages'))body=u.searchParams.has('pageToken')?{messages:[{id:'m2'}]}:{messages:[{id:'m1'}],nextPageToken:'p2'};
  else if(u.pathname.endsWith('/messages/m1'))body={id:'m1',internalDate:String(now),payload:{headers:[{name:'From',value:'Fixture <fixture@example.invalid>'}],mimeType:'multipart/mixed',parts:[{partId:'1',filename:'a.pdf',mimeType:'application/pdf',body:{size:data.length,attachmentId:'a1'}}]}};
  else if(u.pathname.endsWith('/messages/m2'))body={id:'m2',internalDate:String(now),payload:{mimeType:'text/plain',body:{size:0}}};
  else if(u.pathname.endsWith('/attachments/a1'))body={size:data.length,data:data.toString('base64url')};
  else throw Error('Unexpected '+url);
  return Response.json(body);
 };
 const reader=createMailboxReader({provider:'gmail',mailbox,getAccessToken:async()=> 'fake',fetcher});
 const seen=[];for await(const x of reader.readWindow(start,end))seen.push(x);
 assert.equal(seen.length,3);assert.equal(seen[1].bytes.toString(),data.toString());assert.ok(visited.some(s=>s.includes('pageToken=p2')));
 const other=createMailboxReader({provider:'gmail',mailbox:'other@example.invalid',getAccessToken:async()=> 'fake',fetcher});
 await assert.rejects(async()=>{for await(const x of other.readWindow(start,end))void x},/mismatch/);
});
test('Outlook enumerates inline and oversized items, follows attachment nextLink and rejects foreign cursors',async()=>{
 const data=Buffer.from('%PDF-1.4 outlook'),base='https://graph.microsoft.com/v1.0/me';let foreign=false;
 const fetcher=async url=>{const u=new URL(url);if(u.pathname.endsWith('/me'))return Response.json({mail:mailbox});
  if(u.pathname.endsWith('/messages'))return Response.json({value:[{id:'m1',subject:'Synthetic',from:{emailAddress:{address:'fixture@example.invalid'}},receivedDateTime:receivedAt,body:{content:'test'},hasAttachments:false}]});
  if(u.pathname.endsWith('/attachments')){
   if(u.searchParams.has('$skiptoken'))return Response.json({value:[{'@odata.type':'#microsoft.graph.referenceAttachment',id:'ref',name:'other',contentType:'application/pdf',size:100}]});
   return Response.json({value:[{'@odata.type':'#microsoft.graph.fileAttachment',id:'a',name:'inline.pdf',contentType:'application/pdf',size:data.length,isInline:true},{'@odata.type':'#microsoft.graph.fileAttachment',id:'large',name:'big.pdf',contentType:'application/pdf',size:4000000}],'@odata.nextLink':foreign?'https://evil.example/v1.0/me/messages/m1/attachments':base+'/messages/m1/attachments?$skiptoken=x'});
  }
  if(u.pathname.endsWith('/a/$value'))return new Response(data);
  throw Error('Unexpected '+url);
 };
 const reader=createMailboxReader({provider:'outlook',mailbox,getAccessToken:async()=> 'fake',fetcher});
 const seen=[];for await(const x of reader.readWindow(start,end))seen.push(x);
 assert.equal(seen.length,4);assert.deepEqual(seen[1].bytes,data);assert.equal(seen[2].bytes,null);assert.match(seen[2].holdReason,/exceeds/);assert.match(seen[3].holdReason,/manual/);
 foreign=true;await assert.rejects(async()=>{for await(const x of reader.readWindow(start,end))void x},/Unexpected provider URL|Unexpected Outlook/);
});
test('Amazon email signal is never a payment or assignment',()=>{
 const s=amazonEmailSignal({...item,partId:'@message',sender:'relay@amazon.com',subject:'Booking Trip ID: T-TEST-01',message:{estimated:'$500'}});
 assert.deepEqual(s,{trip:'T-TEST-01',block:null});
 assert.equal(amazonEmailSignal({...item,partId:'@message',sender:'relay@evil.example',subject:'Trip ID: T-TEST-01'}),null);
});
