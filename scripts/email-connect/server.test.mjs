import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmailHandlers} from '../../lib/email-import/server.js';
import {seal,open,configuration,EMAIL_SCOPES} from '../../lib/email-import/security.js';
import {emailStore} from '../../lib/email-import/store.js';
import {createMicrosoftDocumentImport} from '../../lib/email-import/microsoft.js';

const origin='https://owner-op-road-ready.vercel.app';
const env={EMAIL_IMPORT_MICROSOFT_CLIENT_ID:'12345678-1234-1234-1234-123456789012',EMAIL_IMPORT_MICROSOFT_CLIENT_SECRET:'synthetic-secret',EMAIL_IMPORT_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')};
const bytes=Buffer.from('%PDF-1.7 synthetic document'),attachment={id:'a1','@odata.type':'#microsoft.graph.fileAttachment',name:'rate.pdf',contentType:'application/pdf',size:bytes.length,isInline:false,contentBytes:bytes.toString('base64')};
function fixture(){
  const rows=new Map(),imports=new Map(),calls=[];let nonce='',cache='synthetic-cache',refresh=false,nonceWrong=false,afterRefresh;
  function storeFactory({owner}){return {
    async get(){return structuredClone(rows.get(owner)||null);},
    async start(row){rows.set(owner,{owner_id:owner,...row});return this.get();},
    async update(id,rev,value,extra={}){const row=rows.get(owner);if(!row||row.connection_id!==id||row.revision!==rev||extra.pending_hash&&extra.pending_hash!=='eq.'+row.pending_hash)return null;rows.set(owner,{...row,...value});return this.get();},
    async disconnect(){rows.delete(owner);},
    async imported(account,sha){return imports.get(owner+account+sha);},
    async mark(value){imports.set(owner+value.accountId+value.sha256,{document_id:value.documentId,sha256:value.sha256});},
  };}
  const authorize=async request=>{const value=request.headers.get('authorization');if(!['Bearer user-a','Bearer user-b'].includes(value))throw Object.assign(Error('signed_out'),{status:401});return value.slice(7);};
  const msalFactory=()=>({
    getTokenCache(){return {serialize:()=>cache,deserialize:value=>{cache=value;},getAccountByHomeId:async id=>id==='home-a'?{homeAccountId:id}:null};},
    async getAuthCodeUrl(options){nonce=options.nonce;calls.push({oauth:options});return 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?'+new URLSearchParams({state:options.state});},
    async acquireTokenByCode(options){calls.push({exchange:options});return {accessToken:'microsoft-token',account:{homeAccountId:'home-a'},idTokenClaims:{nonce:nonceWrong?'wrong':nonce},scopes:['Mail.Read','User.Read']};},
    async acquireTokenSilent(){if(refresh)cache+='-refreshed';await afterRefresh?.();return {accessToken:'microsoft-token'};},
  });
  const fetcher=async(url,options)=>{
    calls.push({url,options});assert.ok(!url.includes('microsoft-token'));assert.ok(!options.method||options.method==='GET','Graph operations must be read-only');
    if(url.includes('/me?$select'))return Response.json({id:'account-a',mail:'driver@example.test',displayName:'Driver'});
    if(url.includes('/attachments/'))return Response.json(attachment);
    if(url.includes('/attachments?'))return Response.json({value:[attachment]});
    return Response.json({value:[{id:'m1',subject:'Rate confirmation',from:{emailAddress:{address:'broker@example.test'}},receivedDateTime:'2026-11-05T10:00:00Z'}],'@odata.nextLink':origin.includes('example')?'':'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skip=20'});
  };
  const api=createEmailHandlers({env:()=>env,authorize,storeFactory,msalFactory,fetcher});
  const req=(action,payload,owner='user-a',extra={})=>new Request(origin+'/api/email-import/'+action,{method:payload===undefined?'GET':'POST',headers:{Authorization:'Bearer '+owner,Origin:origin,...(payload===undefined?{}:{'Content-Type':'application/json'}),...extra},body:payload===undefined?undefined:JSON.stringify(payload)});
  async function connect(){const started=await api.handle(req('connect',{}));assert.equal(started.status,200);const c=started.headers.get('set-cookie').split(';')[0],url=new URL((await started.json()).authorizeUrl),state=url.searchParams.get('state');return {c,state};}
  async function finish(attempt,parameters={}){return api.handle(new Request(origin+'/api/email-import/callback?'+new URLSearchParams({state:attempt.state,code:'synthetic-code',...parameters}),{headers:{Cookie:attempt.c}}));}
  async function connected(){const attempt=await connect();assert.equal((await finish(attempt)).status,303);return rows.get('user-a').connection_id;}
  return {api,req,rows,imports,calls,connect,finish,connected,setRefresh:value=>{refresh=value;},wrongNonce:()=>{nonceWrong=true;},afterRefresh:value=>{afterRefresh=value;}};
}
test('unconfigured service authenticates but makes no mailbox request; rejects cross-origin mutation',async()=>{
  let auth=0;const api=createEmailHandlers({env:()=>({}),authorize:async()=>{auth++;return 'u';},storeFactory:()=>({}),fetcher:()=>assert.fail('No mailbox access')});
  const r=await api.handle(new Request(origin+'/api/email-import/status'));assert.deepEqual(await r.json(),{configured:false,connected:false});assert.equal(auth,1);
  assert.equal((await api.handle(new Request(origin+'/api/email-import/connect',{method:'POST',headers:{Origin:'https://evil.test'}}))).status,403);
  const f=fixture();assert.equal((await f.api.handle(new Request(origin+'/api/email-import/status'))).status,401);
});
test('code+PKCE, account selection, encrypted owner-bound cache and no browser token response',async()=>{
  const f=fixture(),attempt=await f.connect(),options=f.calls.find(c=>c.oauth).oauth;
  assert.equal(options.prompt,'select_account');assert.equal(options.codeChallengeMethod,'S256');assert.equal(options.redirectUri,origin+'/api/email-import/callback');
  assert.deepEqual(options.scopes,EMAIL_SCOPES);assert.ok(options.scopes.every(s=>!/(Send|Write)/.test(s)));
  assert.equal(attempt.c.includes('user-a'),false);assert.equal((await f.finish(attempt)).status,303);
  const row=f.rows.get('user-a');assert.equal(row.sealed_cache.includes('synthetic-cache'),false);
  const status=await (await f.api.handle(f.req('status'))).json();assert.equal(status.account.email,'driver@example.test');assert.equal(JSON.stringify(status).includes('token'),false);
  const other=await (await f.api.handle(f.req('status',undefined,'user-b'))).json();assert.equal(other.connected,false);
  const config=configuration(env);assert.throws(()=>open(row.sealed_cache,config.key,'cache:user-b:'+row.connection_id));
  assert.equal((await f.finish(attempt)).status,400,'callback can only be consumed once');
});
test('state, nonce, cancelled consent and disconnect invalidate a pending callback',async()=>{
  for(const condition of ['state','nonce','cancel','disconnect']){
    const f=fixture(),attempt=await f.connect();
    if(condition==='nonce')f.wrongNonce();
    if(condition==='disconnect')assert.equal((await f.api.handle(f.req('disconnect',{}))).status,200);
    const result=await f.finish(attempt,condition==='state'?{state:'wrong'}:condition==='cancel'?{error:'access_denied'}:{});
    assert.equal(result.status,400);assert.ok(!f.rows.get('user-a')?.sealed_cache);
  }
});
test('refresh remains encrypted and cannot recreate a disconnected account',async()=>{
  const f=fixture(),id=await f.connected();f.setRefresh(true);
  assert.equal((await f.api.handle(f.req('list',{connectionId:id,folder:'inbox'}))).status,200);
  const row=f.rows.get('user-a'),data=open(row.sealed_cache,configuration(env).key,'cache:user-a:'+id);assert.ok(data.cache.endsWith('-refreshed'));
  f.afterRefresh(async()=>{f.rows.delete('user-a');});
  assert.equal((await f.api.handle(f.req('list',{connectionId:id,folder:'inbox'}))).status,409);assert.equal(f.rows.size,0);
});
test('folder paging cursors are encrypted and bound to owner, connection and folder',async()=>{
  const f=fixture(),id=await f.connected(),result=await (await f.api.handle(f.req('list',{connectionId:id,folder:'inbox'}))).json();
  assert.equal(result.items[0].name,'rate.pdf');assert.ok(!result.nextCursor.includes('graph.microsoft.com'));
  assert.equal((await f.api.handle(f.req('list',{connectionId:id,folder:'sentitems',cursor:result.nextCursor}))).status,400);
  assert.equal((await f.api.handle(f.req('list',{connectionId:id,folder:'inbox',cursor:'https://evil.test/steal'}))).status,502);
  assert.equal((await f.api.handle(f.req('read',{connectionId:'wrong',messageId:'m1',attachmentId:'a1'}))).status,409);
});
test('original bytes require explicit save acknowledgement; resends skip and revisions survive',async()=>{
  const f=fixture(),id=await f.connected(),input={connectionId:id,messageId:'m1',attachmentId:'a1'};
  const read=await f.api.handle(f.req('read',input));assert.equal(read.status,200);assert.deepEqual(Buffer.from(await read.arrayBuffer()),bytes);
  const receipt=read.headers.get('x-email-receipt');assert.equal(f.imports.size,0,'download is not save');
  assert.equal((await f.api.handle(f.req('read',input))).headers.get('content-type'),'application/pdf','cancelled review is retryable');
  assert.equal((await f.api.handle(f.req('ack',{receipt,documentId:'saved-document'}))).status,200);
  const duplicate=await (await f.api.handle(f.req('read',{...input,messageId:'resent'}))).json();assert.equal(duplicate.duplicate,true);
  assert.equal((await f.api.handle(f.req('ack',{receipt,documentId:'cross-account'},'user-b'))).status,502);
  const old=attachment.contentBytes,oldSize=attachment.size;attachment.contentBytes=Buffer.from('%PDF-1.7 revised rate').toString('base64');attachment.size=Buffer.from(attachment.contentBytes,'base64').length;
  try{const revised=await f.api.handle(f.req('read',input));assert.equal(revised.headers.get('content-type'),'application/pdf');assert.notEqual(revised.headers.get('x-email-receipt'),receipt);}finally{attachment.contentBytes=old;attachment.size=oldSize;}
});
test('tampered encrypted data fails and keys are purpose-bound',()=>{
  const key=configuration(env).key,value=seal({x:'private'},key,'one');assert.deepEqual(open(value,key,'one'),{x:'private'});
  assert.throws(()=>open(value,key,'two'));assert.throws(()=>open(value.slice(0,-4)+'AAAA',key,'one'));
});
test('RLS store scopes every query to owner and refresh uses compare-and-swap',async()=>{
  const calls=[],store=emailStore({owner:'owner-a',authorization:'Bearer synthetic',fetcher:async(url,options)=>{calls.push({url,options});return Response.json([]);}});
  await store.get();await store.update('connection-a',5,{revision:6});await store.disconnect();await store.imported('mail-a','sha');
  for(const call of calls){assert.equal(new URL(call.url).searchParams.get('owner_id'),'eq.owner-a');assert.equal(call.options.headers.Authorization,'Bearer synthetic');}
  const patch=calls.find(c=>c.options.method==='PATCH');assert.equal(new URL(patch.url).searchParams.get('revision'),'eq.5');assert.equal(new URL(patch.url).searchParams.get('connection_id'),'eq.connection-a');
});
test('Graph rejects malicious continuation paths, routes Sent correctly, and respects cancellation',async()=>{
  const calls=[],api=createMicrosoftDocumentImport({getAccessToken:async()=> 'token',fetcher:async(url,options)=>{calls.push(url);if(options.signal?.aborted)throw new DOMException('Aborted','AbortError');return Response.json({value:[]});}});
  await api.list({folder:'sentitems'});const url=new URL(calls[0]);assert.equal(url.pathname,'/v1.0/me/mailFolders/sentitems/messages');assert.equal(url.searchParams.get('$orderby'),'sentDateTime desc');
  for(const cursor of ['https://graph.microsoft.com/v1.0/me/messages-evil','https://evil.test/v1.0/me/messages','https://graph.microsoft.com/v1.0/me/messages/secret/attachments'])await assert.rejects(api.list({cursor}));
  await assert.rejects(api.list({signal:AbortSignal.abort()}),{name:'AbortError'});
});
