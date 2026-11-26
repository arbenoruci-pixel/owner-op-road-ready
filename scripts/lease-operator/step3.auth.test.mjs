// Disposable local Auth + PostgREST only. Signed sessions for synthetic drivers.
// This calls the same request handlers exported by the five Next.js routes.
import { createServer, request as upstreamRequest } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { createHmac, randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { submitTonu, submitMaintenance } from '../../app/operator/step3Actions.js';
import { PDFDocument } from 'pdf-lib';
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
const scoped=token=>createClient(url,key,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const quote=x=>x===null?'null':"'"+String(x).replaceAll("'","''")+"'";
const j=x=>quote(JSON.stringify(x))+'::jsonb';
const digest=b=>createHash('sha256').update(b).digest('hex');
const date=new Date().toISOString().slice(0,10);
const past=new Date(Date.now()-3600000).toISOString(),received=new Date(Date.now()-1800000).toISOString();
const mailbox='step3-fixture@example.invalid';
const source=(msg,part='part:1')=>({sourceRef:'gmail:'+digest(Buffer.from(mailbox+'\x1f'+msg)),attachmentRef:digest(Buffer.from(part))});
const rpc=async(c,name,args={})=>{const r=await c.rpc(name,args);assert.ifError(r.error);return r.data};
const denied=async(c,name,args={})=>{const r=await c.rpc(name,args);assert.ok(r.error,'Unexpected allowed RPC: '+name);assert.equal(r.error.code,'42501',name+': '+JSON.stringify(r.error));};
const form=o=>{const f=new FormData();for(const [k,v] of Object.entries(o))f.set(k,String(v));return f;};
async function actualPdf(label){const p=await PDFDocument.create();p.addPage().drawText(label);return Buffer.from(await p.save());}
async function archive(owner,msg,kind,bytes,filename='original.pdf'){
 const ref=source(msg),hash=digest(bytes),proposal={source:'gmail',...ref,kind,sha256:hash,amountCents:null,brokerRules:{},status:'DRAFT',requiresVerification:true};
 const r=JSON.parse(sql("select public.rr_lease_step2c_record_mail("+[uu(owner.id),quote('gmail'),quote(mailbox),quote(msg),quote('part:1'),quote(received),quote('broker@example.invalid'),quote(filename),quote('application/pdf'),quote(bytes.toString('base64')),quote(hash),'null',j(proposal),'null'].join(',')+")"));
 assert.equal(r.sourceRef,ref.sourceRef);assert.equal(r.attachmentRef,ref.attachmentRef);return ref;
}
async function fileDoc(owner,operatorId,ref,kind,loadId=null,loadNumber=null,accessorials={detention:false,layover:false,lumper:false}){
 return ok(await call('assign',owner.token,{...ref,operatorId,loadId,kind,reason:'Synthetic independently reviewed assignment',execute:true,...(kind==='ratecon'?{accessorials,...(!loadId?{broker:'Fixture broker',loadNumber}:{})}:{})}));
}
const terms={gross_cents:120000,pickup_address:'Fixture origin',delivery_address:'Fixture destination',steps:[{title:'Deliver',detail:'Reviewed steps'}],accessorials:{detention:false,layover:false,lumper:false},broker_rules:{tracking:'Call dispatch'}};
try{
 const [owner,d1,d2,other]=await Promise.all(['owner','driver1','driver2','other'].map(signIn));
 assert.notEqual(d1.id,d2.id);assert.notEqual(d1.token,d2.token);
 const c=scoped(owner.token),a=scoped(d1.token),b=scoped(d2.token),alien=scoped(other.token),anon=scoped(key);
 const op1=randomUUID(),op2=randomUUID(),ownOp=randomUUID(),alienOp=randomUUID();
 sql("insert into public.rr_lease_operators(id,carrier_user_id,company_name,driver_name,workspace_kind,share_bps) values ("+uu(ownOp)+","+uu(owner.id)+",'Fixture carrier','Owner','carrier',10000),("+uu(alienOp)+","+uu(other.id)+",'Other carrier','Other','carrier',10000); insert into public.rr_lease_operators(id,carrier_user_id,driver_user_id,company_name,driver_name,workspace_kind,share_bps) values ("+uu(op1)+","+uu(owner.id)+","+uu(d1.id)+",'Fixture D1','D1','leased',9200),("+uu(op2)+","+uu(owner.id)+","+uu(d2.id)+",'Fixture D2','D2','leased',9000); insert into rr_lease_private.carrier_intake_mailboxes(carrier_user_id,email) values("+uu(owner.id)+","+quote(mailbox)+")");
 console.log('PASS independent real Auth-issued JWT sessions, two drivers and two carriers; no production');
 const proof=await archive(owner,'rate-tonu','ratecon',await actualPdf('Original freight rate 1200 USD'));
 const filed=await fileDoc(owner,op1,proof,'ratecon',null,'TONU-1');
 const rateArgs={p_document_id:filed.documentId,p_fields:terms,p_previous_ratecon_id:null,p_reason:'Reviewed actual rate'};
 await denied(a,'rr_lease_step3_verify_ratecon',rateArgs);await denied(b,'rr_lease_step3_verify_ratecon',rateArgs);await denied(alien,'rr_lease_step3_verify_ratecon',rateArgs);
 const rates=await rpc(c,'rr_lease_step3_worklist');assert.ok(rates.rates.some(x=>x.id===filed.documentId));
 await denied(a,'rr_lease_step3_worklist');await denied(b,'rr_lease_step3_worklist');
 assert.ok(!(await rpc(alien,'rr_lease_step3_worklist')).rates.some(x=>x.id===filed.documentId));
 const rate=await rpc(c,'rr_lease_step3_verify_ratecon',rateArgs);assert.equal(rate.eligible,false);
 const cancel=await archive(owner,'cancel-tonu','unknown',await actualPdf('Broker confirmed cancellation and 250 USD TONU'), 'cancellation.pdf');
 const attachment=await fileDoc(owner,op1,cancel,'supporting',filed.loadId);
 const cancelForm=form({documentId:attachment.documentId,amount:'250.00',cancelledAt:past,reason:'Read separate cancellation original and confirmed compensation',confirmCancellation:'on'});
 const request={p_load_id:filed.loadId,p_document_id:attachment.documentId,p_amount_cents:25000,p_cancelled_at:past,p_reason:'Read separate cancellation original and confirmed compensation'};
 for(const client of [a,b,alien])await denied(client,'rr_lease_step3_approve_tonu',request);
 const anonResult=await anon.rpc('rr_lease_step3_approve_tonu',request);assert.ok(anonResult.error);
 const tampered=scoped(d1.token.slice(0,-10)+'ABCDEFGHIJ');assert.ok((await tampered.rpc('rr_lease_step3_approve_tonu',request)).error);
 const before=await submitTonu(c,filed.loadId,form({documentId:attachment.documentId,amount:'250.00',cancelledAt:past,reason:'Missing checkbox'})).then(()=>false,()=>true);assert.ok(before);
 const bad=await c.rpc('rr_lease_step3_approve_tonu',{...request,p_document_id:filed.documentId});assert.ok(bad.error);
 const results=await Promise.all([submitTonu(c,filed.loadId,cancelForm),submitTonu(c,filed.loadId,cancelForm)]);
 assert.deepEqual(results.map(x=>x.replay).sort(),[false,true]);
 const result=results.find(x=>!x.replay);
 assert.equal(result.driverEffectCents,23000);assert.equal(result.feeBps,800);
 assert.ok((await c.rpc('rr_lease_step3_approve_tonu',{...request,p_amount_cents:25001})).error);
 const ownRows=await a.from('v_driver_ledger_entries').select('*').eq('load_id',filed.loadId);assert.ifError(ownRows.error);
 assert.equal(ownRows.data.length,1);assert.equal(ownRows.data[0].entry_type,'TONU');assert.equal(ownRows.data[0].status,'POSTED');assert.equal(ownRows.data[0].driver_effect_cents,23000);assert.equal(ownRows.data[0].source_document_id,attachment.documentId);
 const cross=await b.from('v_driver_ledger_entries').select('id').eq('load_id',filed.loadId);assert.ifError(cross.error);assert.equal(cross.data.length,0);
 assert.equal(sql("select count(*) from public.rr_lease_loads where id="+uu(filed.loadId)+" and status='cancelled' and load_type='TONU' and final_pod_id is null and actual_delivery_date is null and tonu_confirmation_id="+uu(attachment.documentId)),'1');
 const archiveData=await rpc(c,'rr_lease_step3_intake_original',{p_source_ref:cancel.sourceRef,p_attachment_ref:cancel.attachmentRef});assert.ok(archiveData.bytes);await denied(a,'rr_lease_step3_intake_original',{p_source_ref:cancel.sourceRef,p_attachment_ref:cancel.attachmentRef});
 console.log('PASS signed carrier rate verification, TONU UI submit handler -> RPC -> cancellation original -> one POSTED row, 8% fee, $230 net, no POD, simultaneous replay; driver/other carrier/tampered token denied');
 // Expense original and same-ID posting, three cost checks and immutable issue.
 const fuel=await archive(owner,'fuel-expense','fuel',await actualPdf('Fuel paid by carrier 20 USD'),'fuel.pdf');
 const expense=ok(await call('assign',owner.token,{...fuel,operatorId:op1,kind:'fuel',execute:true,settlementId:result.settlementId,amountCents:2000,paidBy:'carrier',transactionRef:'fuel:step3-fixture',reason:'Exact receipt assignment'}));
 const expArgs={p_adjustment_id:expense.adjustmentId,p_reason:'Verified receipt'};
 await denied(a,'rr_lease_step3_approve_expense',expArgs);await denied(alien,'rr_lease_step3_approve_expense',expArgs);
 const ex=await Promise.all([rpc(c,'rr_lease_step3_approve_expense',expArgs),rpc(c,'rr_lease_step3_approve_expense',expArgs)]);assert.deepEqual(ex.map(x=>x.replay).sort(),[false,true]);
 for(const k of ['insurance','fuel','eld']){
  const args={p_settlement_id:result.settlementId,p_kind:k,p_outcome:k==='fuel'?'complete':'none',p_reason:'Reviewed synthetic cost'};
  await denied(b,'rr_lease_step3_cost_review',args);await rpc(c,'rr_lease_step3_cost_review',args);
 }
 const issueArgs={p_settlement_id:result.settlementId,p_reason:'Reviewed exact statement'};
 await denied(a,'rr_lease_step3_issue',issueArgs);await denied(alien,'rr_lease_step3_issue',issueArgs);
 const issue=await rpc(c,'rr_lease_step3_issue',issueArgs);assert.equal(issue.netCents,21000);
 assert.equal((await rpc(c,'rr_lease_step3_issue',issueArgs)).replay,true);
 assert.equal(sql("select count(*) from public.rr_lease_settlement_snapshots where settlement_id="+uu(result.settlementId)),'1');
 console.log('PASS signed expense approval, owner cost reviews and LOCKED snapshot; TONU $250 - $20 commission - $20 fuel = $210, no payout');
 // The full delivery / itemized path for a second signed driver.
 const ref2=await archive(owner,'rate-itemized','ratecon',await actualPdf('Itemized freight and lumper'));
 const assigned=await fileDoc(owner,op2,ref2,'ratecon',null,'ITEM-2',{detention:false,layover:false,lumper:true});
 await rpc(c,'rr_lease_step3_verify_ratecon',{p_document_id:assigned.documentId,p_fields:{...terms,accessorials:{detention:false,layover:false,lumper:true}},p_previous_ratecon_id:null,p_reason:'Verified second rate'});
 const pod=await actualPdf('Final delivery original'),reservation=ok(await call('create',d2.token,{requestId:randomUUID(),loadId:assigned.loadId,fileName:'final.pdf',mimeType:'application/pdf',byteSize:pod.length}));
 const uploaded=ok(await call('commit',d2.token,pod,{headers:{'x-upload-id':reservation.uploadId,'content-type':'application/pdf'}}));
 ok(await call('review',owner.token,{documentId:uploaded.documentId,approve:true,setAsFinalPod:true,reason:'Verified final'}));
 const finals={p_load_id:assigned.loadId,p_delivery_date:date,p_reason:'All stops completed'};
 await denied(a,'rr_lease_step3_finalize',finals);await denied(b,'rr_lease_step3_finalize',finals);
 const finalized=await rpc(c,'rr_lease_step3_finalize',finals);
 const items={p_load_id:assigned.loadId,p_items:[{type:'FREIGHT',amountCents:105000,documentId:assigned.documentId,paidBy:'operator'},{type:'LUMPER_REIMBURSEMENT',amountCents:15000,documentId:assigned.documentId,paidBy:'carrier'}],p_reason:'Verified components'};
 await denied(b,'rr_lease_step3_post_components',items);await denied(alien,'rr_lease_step3_post_components',items);await rpc(c,'rr_lease_step3_post_components',items);
 const ledger=await b.from('v_driver_ledger_entries').select('*').eq('load_id',assigned.loadId);assert.ifError(ledger.error);assert.equal(ledger.data.length,3);assert.equal(ledger.data.reduce((n,e)=>n+e.driver_effect_cents,0),94500);
 assert.ok(ledger.data.filter(e=>e.entry_type.startsWith('LUMPER')).every(e=>e.fee_bps===0));
 const pods=await rpc(b,'rr_lease_step3_pod_status',{p_operator_id:op2});assert.ok(pods.some(p=>p.document_id===uploaded.documentId));
 assert.equal((await rpc(a,'rr_lease_step3_pod_status',{p_operator_id:op2})).length,0);
 console.log('PASS signed second driver POD and owner finalize/itemized approval, 10% fee frozen, carrier lumper offset, cross-driver POD isolation');
 // Signed standalone Amazon allocation from canonical archived source.
 const report=Buffer.from('synthetic local import'),row={trip:null,block:null,load:'AUTH-SOLO',status:'PAID',amount_cents:50000,event_date:date};
 sql("select public.rr_lease_step2c_import_report("+[uu(owner.id),quote('amazon'),quote('csv'),quote(report.toString('base64')),quote(digest(report)),j([row]),j({})].join(',')+")");
 const amazonId=sql("select id from public.rr_lease_amazon_import_rows where carrier_user_id="+uu(owner.id)+" and amazon_load_id='AUTH-SOLO'");
 const amazonArgs={p_row_id:amazonId,p_operator_id:op2,p_reason:'Independent dispatch confirmation'};
 await denied(b,'rr_lease_step3_assign_amazon',amazonArgs);await denied(alien,'rr_lease_step3_assign_amazon',amazonArgs);
 const am=await rpc(c,'rr_lease_step3_assign_amazon',amazonArgs);assert.ok(am.loadId);
 const arows=await b.from('v_driver_ledger_entries').select('status,amount_cents').eq('load_id',am.loadId);assert.ifError(arows.error);assert.deepEqual(arows.data,[{status:'POSTED',amount_cents:50000}]);
 // Private FirstLine proof review with an independent archived attachment.
 const factorProof=await archive(owner,'factor-proof','unknown',await actualPdf('Factor debit confirmation'));
 const ar=await rpc(c,'rr_lease_step3_intake_original',{p_source_ref:factorProof.sourceRef,p_attachment_ref:factorProof.attachmentRef});
 const fe=randomUUID();sql("insert into public.rr_lease_factoring_events(id,carrier_user_id,operator_id,load_id,event_type,amount_cents,event_at,external_reference,evidence_reference,review_status,invoice_reference) values("+[uu(fe),uu(owner.id),uu(op2),uu(assigned.loadId),quote('DEBIT'),-1000,quote(received),quote('TEST-DEBIT'),quote('synthetic proof'),quote('PENDING_PROOF'),quote('INV-TEST')].join(',')+")");
 const fargs={p_event_id:fe,p_status:'VERIFIED',p_proof_archive_id:ar.archiveId,p_reason:'Independent factor evidence reviewed'};
 const count=sql("select count(*) from public.rr_lease_ledger_entries");
 await denied(a,'rr_lease_step3_review_firstline',fargs);await denied(b,'rr_lease_step3_review_firstline',fargs);await denied(alien,'rr_lease_step3_review_firstline',fargs);
 const fr=await rpc(c,'rr_lease_step3_review_firstline',fargs);assert.equal(fr.driverDeduction,false);assert.equal(sql("select count(*) from public.rr_lease_ledger_entries"),count);
 await denied(a,'rr_lease_step3_firstline_proofs');assert.ok((await rpc(c,'rr_lease_step3_firstline_proofs')).some(x=>x.archive_id===ar.archiveId));
 const week=sql("select date_trunc('week',now() at time zone 'America/Chicago')::date");
 await denied(a,'rr_lease_step3_company_summary',{p_week:week});await denied(b,'rr_lease_step3_company_summary',{p_week:week});
 assert.ok((await rpc(c,'rr_lease_step3_company_summary',{p_week:week})).commissionCents>=0);
 assert.ok((await b.from('rr_lease_factoring_events').select('id')).error);
 console.log('PASS signed Amazon standalone and private FirstLine proof decision, no driver charge, owner profit isolation');
 // Actual form helper used by TRUCK. No OCR / model / network calls outside
 // local Auth/PostgREST. Three entries: manual only, valid PDF and valid PNG.
 assert.notEqual(process.env.RR_INTAKE_AI_ENABLED,'true');
 const f=form({category:'PM',date,unit:'228',description:'Manual oil service',odometer:'500000',nextOdometer:'520000',vendor:'Fixture shop',amount:'125.50'});
 const file=new File([await actualPdf('Service receipt 125.50 USD')],'service.pdf',{type:'application/pdf'});
 const png=new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Kf0AAAAASUVORK5CYII=','base64')],'service.png',{type:'image/png'});
 const m0=await submitMaintenance(a,op1,randomUUID(),f,null);
 const rkey=randomUUID(),m1=await submitMaintenance(a,op1,rkey,f,file);assert.equal(await submitMaintenance(a,op1,rkey,f,file),m1);
 const m2=await submitMaintenance(a,op1,randomUUID(),form({category:'service',date,unit:'228',description:'Manual photo repair',odometer:'500001'}),png);
 assert.equal(new Set([m0,m1,m2]).size,3);
 const records=await a.from('rr_driver_tool_records').select('id,odometer,next_service_odometer,amount_cents,mime_type,kind').eq('operator_id',op1);assert.ifError(records.error);assert.equal(records.data.length,3);assert.ok(records.data.some(x=>x.id===m1&&x.odometer===500000&&x.next_service_odometer===520000&&x.amount_cents===12550&&x.mime_type==='application/pdf'));assert.ok(records.data.some(x=>x.id===m2&&x.odometer===500001&&x.mime_type==='image/png'));
 for(const [id,original] of [[m1,file],[m2,png]]){const stored=await rpc(a,'rr_lease_step3_maintenance_original',{p_record_id:id});assert.deepEqual(Buffer.from(stored,'base64'),Buffer.from(await original.arrayBuffer()));await denied(b,'rr_lease_step3_maintenance_original',{p_record_id:id});}
 await assert.rejects(()=>submitMaintenance(b,op1,randomUUID(),f,file));
 assert.equal(sql("select count(*) from public.rr_driver_tool_records where kind<>'maintenance'"),'0');
 assert.equal(sql("select count(*) from rr_lease_private.driver_tools_pilot"),'0');assert.equal(sql("select count(*) from public.rr_lease_ledger_entries"),count);
 const hidden=await b.from('rr_driver_tool_records').select('id').eq('operator_id',op1);assert.ifError(hidden.error);assert.equal(hidden.data.length,0);
 console.log('PASS signed TRUCK manual record, valid PDF and PNG originals, odometer and next PM, retry, cross-driver denied, OCR disabled, no logbook/Phase2/ledger writes');
 console.log('PASS Step 3 signed GoTrue/PostgREST integration (synthetic only; shared UI submit handlers, no production browser)');
}finally{await new Promise(resolve=>gateway.close(resolve));}
