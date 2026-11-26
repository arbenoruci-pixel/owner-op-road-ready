// Disposable local Auth + PostgREST only. Signed sessions for synthetic drivers.
// This calls the same request handlers exported by the five Next.js routes.
import { createServer, request as upstreamRequest } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { createHmac, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { operatorHandler } from '../../lib/rr-lease/operator-api.js';
const secret=process.env.TEST_JWT_SECRET;
if(process.env.PGDATABASE!=='rr_step2b_auth'||process.env.PGHOST!=='127.0.0.1'||!secret||secret.length<32)throw Error('Disposable Auth test environment required');
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const payload=encode({role:'anon',iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600});
const base=encode({alg:'HS256',typ:'JWT'})+'.'+payload;
const key=base+'.'+createHmac('sha256',secret).update(base).digest('base64url');
const gateway=createServer((req,res)=>{
 const isAuth=req.url.startsWith('/auth/v1/'),isRest=req.url.startsWith('/rest/v1/');
 if(!isAuth&&!isRest){res.writeHead(404);res.end();return;}
 const headers={...req.headers};delete headers.host;
 const proxied=upstreamRequest({hostname:'127.0.0.1',port:isAuth?9999:3000,path:req.url.slice(8),method:req.method,headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
 proxied.on('error',()=>{res.writeHead(502);res.end();});req.pipe(proxied);
});
await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+gateway.address().port;
function sql(statement){
 const r=spawnSync('psql',['-X','-A','-t','-v','ON_ERROR_STOP=1','-c',statement],{encoding:'utf8'});
 if(r.status!==0)throw Error('Fixture SQL failed: '+r.stderr);
 return r.stdout.trim();
}
const uu=s=>{assert.match(s,/^[a-f0-9-]{36}$/i);return "'"+s+"'::uuid";};
async function signIn(label){
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const email=label+'-'+randomUUID()+'@example.com',password='Local-Audit-'+randomUUID()+'!';
 const signup=await client.auth.signUp({email,password});assert.ifError(signup.error);
 const login=await client.auth.signInWithPassword({email,password});assert.ifError(login.error);
 const session=login.data.session;assert.ok(session?.access_token);
 const actual=await client.auth.getUser(session.access_token);assert.ifError(actual.error);assert.equal(actual.data.user.id,session.user.id);assert.ok(actual.data.user.email_confirmed_at);
 return {id:session.user.id,token:session.access_token};
}
const methods={create:'POST',commit:'POST',review:'POST',inbox:'GET',assign:'POST'};
async function call(action,token,body,extra={}){
 const headers=new Headers(extra.headers||{});if(token)headers.set('Authorization','Bearer '+token);
 if(body!==undefined&&action!=='commit')headers.set('Content-Type','application/json');
 const req=new Request('http://localhost/api/operator'+(extra.query||''),{method:methods[action],headers,...(body===undefined?{}:{body:action==='commit'?body:JSON.stringify(body)})});
 const res=await operatorHandler(action,{url,key})(req);
 return {status:res.status,body:await res.json()};
}
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.body;};
const expect=(r,status)=>assert.equal(r.status,status,JSON.stringify(r));
const pdf=s=>Buffer.from('%PDF-1.4 synthetic '+s);
try{
 const [owner,d1,d2,other]=await Promise.all(['owner','driver1','driver2','other'].map(signIn));
 assert.notEqual(d1.id,d2.id);assert.notEqual(d1.token,d2.token);
 console.log('PASS two independent signed Supabase Auth driver sessions plus two owner sessions');
 const op1=randomUUID(),op2=randomUUID(),otherOp=randomUUID(),load2=randomUUID();
 sql("insert into public.rr_lease_operators(id,carrier_user_id,company_name,driver_name,workspace_kind,share_bps) values ("+uu(randomUUID())+","+uu(owner.id)+",'Fixture carrier','Owner','carrier',10000),("+uu(otherOp)+","+uu(other.id)+",'Other carrier','Other','carrier',10000); insert into public.rr_lease_operators(id,carrier_user_id,driver_user_id,company_name,driver_name,workspace_kind) values ("+uu(op1)+","+uu(owner.id)+","+uu(d1.id)+",'Driver One','D1','leased'),("+uu(op2)+","+uu(owner.id)+","+uu(d2.id)+",'Driver Two','D2','leased'); insert into public.rr_lease_loads(id,operator_id,broker_name,load_number,status) values("+uu(load2)+","+uu(op2)+",'Broker','D2-001','assigned'); insert into rr_lease_private.intake_review(carrier_user_id,source_ref,attachment_ref,reason) values("+uu(owner.id)+",'gmail:test-fuel','tx-1','Shared fuel'),("+uu(other.id)+",'gmail:other','tx-2','Other only');");
 const bytes=pdf('A'); const intent={requestId:randomUUID(),broker:'Fixture broker',loadNumber:'D1-ORPHAN',fileName:'a.pdf',mimeType:'application/pdf',byteSize:bytes.length};
 expect(await call('create',null,intent),401);
 const tampered=d1.token.slice(0,-12)+'ABCDEFGHIJKL';
 expect(await call('create',tampered,intent),401);
 expect(await call('create',d1.token,{...intent,operatorId:op2}),400);
 expect(await call('create',d1.token,{requestId:randomUUID(),loadId:load2,fileName:'a.pdf',mimeType:'application/pdf',byteSize:bytes.length}),403);
 const [first,second]=await Promise.all([call('create',d1.token,intent),call('create',d1.token,intent)]);
 const id=ok(first).uploadId;assert.equal(ok(second).uploadId,id);
 assert.equal(sql("select count(*) from public.rr_lease_loads where operator_id="+uu(op1)),'0');
 const opts={headers:{'x-upload-id':id,'content-type':'application/pdf'}};
 expect(await call('commit',d2.token,bytes,opts),403);
 expect(await call('commit',d1.token,Buffer.alloc(bytes.length,65),opts),415);
 expect(await call('commit',d1.token,Buffer.alloc(3145729,65),opts),413);
 sql("update public.rr_lease_operators set driver_user_id=null where id="+uu(op1));
 expect(await call('commit',d1.token,bytes,opts),403);
 sql("update public.rr_lease_operators set driver_user_id="+uu(d1.id)+" where id="+uu(op1));
 const [u1,u2]=await Promise.all([call('commit',d1.token,bytes,opts),call('commit',d1.token,bytes,opts)]);
 const a=ok(u1);assert.deepEqual(a,ok(u2));assert.ok(a.orphan);assert.equal(a.review_status,'PENDING');
 const orphan=a.loadId;
 assert.equal(sql("select count(*) from public.rr_lease_loads where id="+uu(orphan)+" and operator_id="+uu(op1)+" and gross_cents is null and settlement_id is null"),'1');
 assert.equal(sql("select count(*) from public.rr_lease_documents where load_id="+uu(orphan)),'1');
 assert.equal(sql("select count(*) from public.rr_lease_ledger_entries"),'0');
 // Replay via a separate intent and canonical business key/checksum.
 const dupe=ok(await call('create',d1.token,{...intent,requestId:randomUUID()}));
 const dupeResult=ok(await call('commit',d1.token,bytes,{headers:{'x-upload-id':dupe.uploadId,'content-type':'application/pdf'}}));
 assert.equal(dupeResult.documentId,a.documentId);
 assert.equal(sql("select count(*) from public.rr_lease_documents where load_id="+uu(orphan)),'1');
 console.log('PASS signature/auth checks, cross-driver authorization, revocation between requests, concurrent create/commit, canonical duplicate, MIME and size, orphan null gross/no ledger');
 // Verify the actual RLS path with each real signed token.
 const scoped=token=>createClient(url,key,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const r1=await scoped(d1.token).from('rr_lease_loads').select('id');
 const r2=await scoped(d2.token).from('rr_lease_loads').select('id');
 assert.ifError(r1.error);assert.ifError(r2.error);assert.deepEqual(r1.data.map(x=>x.id),[orphan]);assert.deepEqual(r2.data.map(x=>x.id),[load2]);
 const old=await scoped(d1.token).rpc('rr_lease_register_driver_pod',{p_document_id:a.documentId});assert.ok(old.error);
 expect(await call('inbox',d1.token),403);
 const own=ok(await call('inbox',owner.token)),alien=ok(await call('inbox',other.token));
 assert.ok(own.pods.some(x=>x.document_id===a.documentId));assert.equal(alien.pods.length,0);assert.equal(alien.intake[0].source_ref,'gmail:other');
 expect(await call('assign',other.token,{sourceRef:'gmail:test-fuel',attachmentRef:'tx-1',operatorId:op1,kind:'fuel',reason:'Not owned'}),403);
 const assignment={sourceRef:'gmail:test-fuel',attachmentRef:'tx-1',operatorId:op1,kind:'fuel',reason:'Assignment only'};
 const [as1,as2]=await Promise.all([call('assign',owner.token,assignment),call('assign',owner.token,assignment)]);
 assert.deepEqual(ok(as1),ok(as2));assert.equal(as1.body.postAllowed,false);assert.equal(as1.body.resolved,false);
 expect(await call('review',d1.token,{documentId:a.documentId,approve:true,setAsFinalPod:true,reason:'Self'}),403);
 expect(await call('review',other.token,{documentId:a.documentId,approve:true,setAsFinalPod:true,reason:'Other'}),403);
 expect(await call('review',owner.token,{documentId:a.documentId,approve:true,reason:'Missing boolean'}),400);
 ok(await call('review',owner.token,{documentId:a.documentId,approve:false,setAsFinalPod:false,reason:'Missing signature'}));
 async function upload(label){
   const b=pdf(label);const i=ok(await call('create',d1.token,{requestId:randomUUID(),loadId:orphan,fileName:label+'.pdf',mimeType:'application/pdf',byteSize:b.length}));
   return ok(await call('commit',d1.token,b,{headers:{'x-upload-id':i.uploadId,'content-type':'application/pdf'}}));
 }
 const [b,c]=await Promise.all([upload('B'),upload('C')]);
 const approve=id=>call('review',owner.token,{documentId:id,approve:true,setAsFinalPod:true,reason:'Final evidence'});
 const contested=await Promise.all([approve(b.documentId),approve(c.documentId)]);
 assert.deepEqual(contested.map(r=>r.status).sort(),[200,409]);
 const winner=contested.find(r=>r.status===200).body.documentId,loser=winner===b.documentId?c.documentId:b.documentId;
 const [rev1,rev2]=await Promise.all([approve(winner),approve(winner)]);assert.deepEqual(ok(rev1),ok(rev2));
 const inter=ok(await call('review',owner.token,{documentId:loser,approve:true,setAsFinalPod:false,reason:'Intermediate stop'}));
 assert.equal(inter.finalPodId,winner);assert.equal(inter.eligible,false);
 assert.equal(sql("select count(*) from public.rr_lease_loads where id="+uu(orphan)+" and final_pod_id="+uu(winner)+" and gross_cents is null and settlement_id is null"),'1');
 assert.equal(sql("select count(*) from public.rr_lease_ledger_entries"),'0');
 console.log('PASS signed RLS isolation in both directions, owner inbox/assignment isolation, concurrent owner final review, idempotent review, intermediate role and DRAFT only');
 console.log('PASS Step 2B real Auth-issued JWT HTTP-handler integration (synthetic accounts, no production)');
}finally{await new Promise(resolve=>gateway.close(resolve));}
