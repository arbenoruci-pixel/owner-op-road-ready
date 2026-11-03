import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import {createSyncPacer,streamRecordInventory} from './pacing.js';
import * as core from '../../lib/owner-op-cloud/recordsCoreV110451.js';
function fixture({afterBatch=()=>{},busy=false,failFinish=false,rows=3}={}){
 const cache=new Map(),locals=new Map(),calls=[],batches=[],waits=[],reads=[],document={visibilityState:'visible'};let now=100000,phase='current',user='owner';
 const state={activeDriverId:'driver',eventsByDay:{'2026-11-01':[{id:'d',status:'D'}]}};
 const snapshot={key:'owner-op-road-ready-state-v1',state};
 const data={app_snapshots:[snapshot],sync_meta:Array.from({length:rows},(_,i)=>({key:'recovery/'+i,value:{i,text:'x'.repeat(5000)}})),documents_local:[{local_id:'doc',title:'BOL'}]};
 const tables=Object.fromEntries(Object.entries(data).map(([name,rows])=>[name,{name,
 toArray:()=>{throw Error('Unbounded table capture');},toCollection:()=>({primaryKeys:async()=>rows.map(r=>r.key??r.local_id)}),
 get:async k=>{reads.push(name);return rows.find(r=>(r.key??r.local_id)===k)||cache.get(k);},
 put:async r=>cache.set(r.key,r),delete:async k=>cache.delete(k)}]));
 const db={...tables,tables:Object.values(tables)};
 const query={select:()=>query,eq:()=>query,order:()=>query,maybeSingle:async()=>({data:{record_sync_enabled:true}}),limit:async()=>({data:[]})};
 const client={from:()=>query,rpc:async(name,body)=>{calls.push(body.p_action);if(body.p_action==='batch'){batches.push(body.p_records);afterBatch({document,setPhase:v=>{phase=v;},setUser:v=>{user=v;}});}if(failFinish&&body.p_action==='finish')return{error:Error('finish timed out')};return{data:body.p_action==='begin'?{busy}:{}};}};
 const context={...core,cloudClient:()=>client,cloudSession:async()=>({user:{id:user}}),sha256:async bytes=>createHash('sha256').update(bytes).digest('hex'),getOwnerOpDb:()=>db,
 BUSINESS_STORE_KEY:'business',BUSINESS_STORE_EVENT:'business-event',bounded:async q=>q,accountStatus:()=>({phase}),streamRecordInventory,
 createSyncPacer:opts=>createSyncPacer({...opts,now:()=>now,wait:async ms=>{waits.push(ms);now+=ms;}}),
 window:{dispatchEvent(){}},document,navigator:{onLine:true,locks:{request:async(name,opts,callback)=>callback({})}},
 localStorage:{get length(){return locals.size;},key:i=>[...locals.keys()][i],getItem:k=>locals.get(k)??null,setItem:(k,v)=>locals.set(k,String(v))},crypto:webcrypto,
 CustomEvent:class{constructor(type,opts){this.type=type;Object.assign(this,opts);}},Date:class extends Date{static now(){return now;}}};
 const source=fs.readFileSync('lib/owner-op-cloud/recordSyncV110451.js','utf8').replace(/^import[^\n]*\n/gm,'').replace(/\bexport /g,'');
 const runtime=new Function(...Object.keys(context),source+'\nreturn {syncRecords,recordSyncStatus};')(...Object.values(context));
 return {...runtime,calls,batches,waits,reads,cache,state,data,document,setPhase:v=>{phase=v;},advance:ms=>{now+=ms;}};
}

test('installed stream sends logbook first, bounded paced recovery batches, and acknowledges only after finish',async()=>{
 const f=fixture({rows:250}),result=await f.syncRecords();assert.equal(result.error,undefined);
 assert.equal(f.calls[0],'begin');assert.equal(f.calls.at(-1),'finish');assert.ok(f.calls.filter(c=>c==='batch').length>5);
 assert.equal(f.batches[0][0].kind,'drivers');assert.equal(f.batches[0][1].kind,'logbook_days');
 for(const b of f.batches){assert.ok(b.length<=80);assert.ok(Buffer.byteLength(JSON.stringify(b))<165000);}
 assert.equal(f.waits.filter(n=>n===350).length,f.batches.length);assert.equal(f.cache.size,1);assert.equal(f.reads.at(-1),'sync_meta');
 const before=f.calls.length,saved=JSON.stringify([...f.cache]);f.advance(60001);
 assert.equal((await f.syncRecords({changed:true})).unchanged,true);assert.equal(f.calls.length,before);assert.equal(JSON.stringify([...f.cache]),saved);
});
test('changed rows and deletions retain the full inventory/finish contract without reuploading unchanged payloads',async()=>{
 const f=fixture();await f.syncRecords();f.batches.length=0;f.state.eventsByDay['2026-11-01'][0].note='saved edit';
 await f.syncRecords({changed:true});const sent=f.batches.flat();assert.equal(sent.filter(r=>'data' in r).length,1);assert.match(sent.find(r=>'data' in r).record_key,/^event\//);
 f.data.documents_local.length=0;f.batches.length=0;const result=await f.syncRecords({changed:true});assert.equal(result.unchanged,undefined);
 assert.ok(f.batches.flat().every(r=>!('data'in r)));assert.ok(f.batches.flat().every(r=>r.record_key!=='db/documents_local/doc'));
});
test('new account work, hiding, and account changes interrupt between batches without acknowledging or tombstoning unseen rows',async()=>{
 for(const afterBatch of [({document})=>{document.visibilityState='hidden';},({setPhase})=>setPhase('syncing'),({setUser})=>setUser('other')]){
  const f=fixture({rows:100,afterBatch}),result=await f.syncRecords();assert.ok(result.deferred||result.error);
  assert.deepEqual(f.calls,['begin','batch','error']);assert.equal(f.cache.size,0);
 }
});
test('busy ownership and failed finish cannot acknowledge an inventory',async()=>{
 for(const options of [{busy:true},{failFinish:true}]){const f=fixture(options);await f.syncRecords();assert.equal(f.cache.size,0);assert.ok(!options.busy||f.calls.length===1);}
});
test('foreground account work is checked before reading records or making cloud calls',async()=>{
 const f=fixture();f.setPhase('syncing');assert.equal((await f.syncRecords()).deferred,true);assert.equal(f.calls.length,0);assert.equal(f.reads.length,0);
});
