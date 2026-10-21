import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
// Execute the installed indexer and its real capture/cache/finish boundaries.
// Cloud responses and the device database below contain synthetic records only.
function fixture({count=2,afterBatch=()=>{},busy=false}={}){
 const cache=new Map(),locals=new Map(),calls=[],document={visibilityState:'visible'};let now=100000,revision=1;
 const snapshot={key:'owner-op-road-ready-state-v1',state:{eventsByDay:{'2026-10-01':[]}}};
 const db={tables:[{name:'app_snapshots',toArray:async()=>[snapshot]}],sync_meta:{get:async k=>cache.get(k),put:async r=>cache.set(r.key,r),delete:async k=>cache.delete(k)},transaction:async(...args)=>args.at(-1)()};
 const query={select:()=>query,eq:()=>query,order:()=>query,maybeSingle:async()=>({data:{record_sync_enabled:true}}),limit:async()=>({data:[]})};
 const client={from:()=>query,rpc:async(name,body)=>{calls.push(body.p_action);if(body.p_action==='batch')afterBatch(document);return {data:body.p_action==='begin'?{busy}: {}};}};
 const localStorage={get length(){return locals.size;},key:i=>[...locals.keys()][i],getItem:k=>locals.get(k)??null,setItem:(k,v)=>locals.set(k,String(v))};
 const source=fs.readFileSync('lib/owner-op-cloud/recordSyncV110451.js','utf8').replace(/^import[^\n]*\n/gm,'').replace(/\bexport /g,'');
 class ClockDate extends Date {static now(){return now;}}
 const names=['cloudClient','cloudSession','sha256','getOwnerOpDb','BUSINESS_STORE_KEY','BUSINESS_STORE_EVENT','bounded','visible','canonical','projectRecords','prepareCorrection','idOf','window','document','navigator','localStorage','crypto','CustomEvent','Date'];
 const values=[()=>client,async()=>({user:{id:'00000000-0000-4000-8000-000000000001'}}),async bytes=>createHash('sha256').update(bytes).digest('hex'),()=>db,'business','business-event',async q=>q,v=>v,JSON.stringify,()=>Array.from({length:count},(_,i)=>({record_key:'row/'+i,kind:'saved_records',data:{i,revision}})),()=>{},v=>v.id,{dispatchEvent(){}},document,{onLine:true},localStorage,webcrypto,class{constructor(type,options){this.type=type;Object.assign(this,options);}},ClockDate];
 const runtime=new Function(...names,source+'\nreturn {syncRecords,recordSyncStatus};')(...values);
 return {...runtime,calls,cache,document,advance:ms=>{now+=ms;},change:()=>{revision++;}};
}
test('unchanged installed inventory skips begin, batches and finish without changing cache',async()=>{
 const f=fixture();await f.syncRecords();assert.deepEqual(f.calls,['begin','batch','finish']);const before=JSON.stringify([...f.cache]);
 f.advance(60001);const result=await f.syncRecords();assert.equal(result.unchanged,true);assert.equal(f.calls.length,3);assert.equal(JSON.stringify([...f.cache]),before);
 f.change();f.advance(60001);await f.syncRecords();assert.deepEqual(f.calls,['begin','batch','finish','begin','batch','finish']);
});
test('hiding the app between batches retains pending work and never sends finish',async()=>{
 const f=fixture({count:201,afterBatch:doc=>{doc.visibilityState='hidden';}});const result=await f.syncRecords();
 assert.equal(result.deferred,true);assert.deepEqual(f.calls,['begin','batch']);assert.equal(f.cache.size,0);assert.equal(f.recordSyncStatus().phase,'waiting');
});
test('hidden startup performs no query or cache acknowledgement',async()=>{
 const f=fixture();f.document.visibilityState='hidden';assert.equal((await f.syncRecords()).deferred,true);assert.equal(f.calls.length,0);assert.equal(f.cache.size,0);
});
test('a server lease held by another run remains busy and unsent',async()=>{
 const f=fixture({busy:true});assert.equal((await f.syncRecords()).busy,true);assert.deepEqual(f.calls,['begin']);assert.equal(f.cache.size,0);
});
test('explicit manual indexing can recheck a previously acknowledged inventory',async()=>{
 const f=fixture();await f.syncRecords();await f.syncRecords({force:true});assert.equal(f.calls.filter(c=>c==='finish').length,2);
});
test('a durable save inside the minute throttle is indexed before being acknowledged',async()=>{
 const f=fixture();await f.syncRecords();f.change();await f.syncRecords({changed:true});assert.equal(f.calls.filter(c=>c==='finish').length,2);
 const result=await f.syncRecords({changed:true});assert.equal(result.unchanged,true);assert.equal(f.calls.filter(c=>c==='finish').length,2);
});
