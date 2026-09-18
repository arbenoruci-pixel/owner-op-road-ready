import test from 'node:test';
import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';
import {mergePulledDocument, upsertPulledDocuments} from '../lib/documents/documentPullV110371.js';
import {checkpointReading,saveReadingCheckpoint} from '../source/src/modules/owneros/readingStateV110371.js';
const copy = value => structuredClone(value);
const summary = () => ({pageCount:1,documents:[{id:'group',kind:'bol',pages:[1],fields:{bolNumber:{value:'B-21',correction:{confirmed:true,value:'B-21'}}}}]});
const local = () => ({local_id:'local-1',client_document_id:'client-1',server_id:'server-1',driver_id:'driver-1',type:'bol',mime_type:'application/pdf',file_size_bytes:3,storage_path:'driver-1/original',sync_state:'synced',local_blob_state:'available',extracted:{readerReviewV110345:summary(),extra:'keep'},classification:{selectedType:'bol'}});
const remote = () => ({id:'server-1',client_document_id:'client-1',driver_id:'driver-1',type:'bol',status:'active',mime_type:'application/pdf',file_size_bytes:3,storage_path:'driver-1/original',expires_on:null});
function dbWith(rows=[]) {
  let state=copy(rows),tail=Promise.resolve(),fail=false;const scope=new AsyncLocalStorage();
  const db={rows:()=>copy(state),failNext:()=>{fail=true;},transaction(mode,table,fn){if(scope.getStore())return fn();const run=tail.then(()=>scope.run(true,async()=>{const before=copy(state);try{return await fn();}catch(error){state=before;throw error;}}));tail=run.catch(()=>{});return run;}};
  db.documents_local={
    get:async id=>copy(state.find(row=>row.local_id===id)),
    where:key=>({equals:value=>({toArray:async()=>copy(state.filter(row=>row[key]===value)),first:async()=>copy(state.find(row=>row[key]===value))})}),
    put:async row=>{if(fail){fail=false;throw new Error('QuotaExceededError');}const i=state.findIndex(item=>item.local_id===row.local_id);if(i<0)state.push(copy(row));else state[i]=copy(row);},
    update:async(id,change)=>{const i=state.findIndex(item=>item.local_id===id);if(i>=0)state[i]={...state[i],...copy(change)};return i>=0?1:0;}
  };
  return db;
}
test('metadata pull preserves local saved review, checkpoint and classification',async()=>{
 const db=dbWith([local()]);await saveReadingCheckpoint(db,db.rows()[0],summary());const before=db.rows()[0];await upsertPulledDocuments(db,[{...remote(),expires_on:'2027-01-01'}]);const after=db.rows()[0];
 assert.deepEqual(after.extracted,before.extracted);assert.deepEqual(after.classification,before.classification);assert.equal(after.local_id,'local-1');assert.equal(after.expires_on,'2027-01-01');assert.ok(checkpointReading(after));assert.equal(after.local_blob_state,'available');assert.equal(db.rows().length,1);
});
test('pull of acknowledged upload adopts its owner without creating a duplicate',async()=>{const row={...local(),driver_id:'local-owner-op'},db=dbWith([row]);await upsertPulledDocuments(db,[remote()]);assert.equal(db.rows().length,1);assert.equal(db.rows()[0].driver_id,'driver-1');assert.equal(db.rows()[0].local_id,'local-1');assert.deepEqual(db.rows()[0].extracted,row.extracted);});
test('server-id lookup preserves the row when a partial response has no client id',async()=>{const db=dbWith([local()]),row=remote();delete row.client_document_id;await upsertPulledDocuments(db,[row]);assert.equal(db.rows().length,1);assert.equal(db.rows()[0].client_document_id,'client-1');assert.deepEqual(db.rows()[0].extracted,local().extracted);});
test('pre-existing duplicate local rows keep both independent review histories',async()=>{const a=local(),b={...local(),local_id:'client-1',extracted:{different:'history'}};const db=dbWith([a,b]);await upsertPulledDocuments(db,[remote()]);assert.equal(db.rows().length,2);assert.deepEqual(db.rows()[0].extracted,a.extracted);assert.deepEqual(db.rows()[1].extracted,b.extracted);});
test('cross-owner collisions fail without copying or replacing reviews',async()=>{const db=dbWith([local()]),before=db.rows();await assert.rejects(()=>upsertPulledDocuments(db,[{...remote(),driver_id:'another-driver'}]),/ownership/);assert.deepEqual(db.rows(),before);});
test('known original replacement and checksum conflict reject the metadata pull',async()=>{const db=dbWith([local()]);await assert.rejects(()=>upsertPulledDocuments(db,[{...remote(),file_size_bytes:4}]),/original size changed/);assert.deepEqual(db.rows(),[local()]);const row={...local(),sha256:'a'.repeat(64)};assert.throws(()=>mergePulledDocument(row,{...remote(),sha256:'b'.repeat(64)}),/original changed/);});
test('empty remote fingerprint fields do not erase known local identity',()=>{const row={...local(),sha256:'a'.repeat(64)},before=copy(row);const merged=mergePulledDocument(row,{...remote(),sha256:null,file_size_bytes:null,mime_type:null,storage_path:null});assert.equal(merged.sha256,row.sha256);assert.equal(merged.file_size_bytes,3);assert.equal(merged.mime_type,'application/pdf');assert.deepEqual(row,before);});
test('filling a previously unknown fingerprint keeps a valid checkpoint recoverable',async()=>{const db=dbWith([local()]);await saveReadingCheckpoint(db,db.rows()[0],summary());await upsertPulledDocuments(db,[{...remote(),sha256:'a'.repeat(64)}]);assert.ok(checkpointReading(db.rows()[0]));assert.equal(db.rows()[0].sha256,'a'.repeat(64));});
test('a metadata pull and checkpoint serialize without losing either update',async()=>{const db=dbWith([local()]),baseline=db.rows()[0];await Promise.all([upsertPulledDocuments(db,[{...remote(),expires_on:'2027-01-01'}]),saveReadingCheckpoint(db,baseline,summary())]);assert.equal(db.rows()[0].expires_on,'2027-01-01');assert.ok(checkpointReading(db.rows()[0]));});
test('new cloud document is inserted without fabricating a local reading',async()=>{const db=dbWith();await upsertPulledDocuments(db,[remote()]);assert.equal(db.rows().length,1);assert.equal(db.rows()[0].local_id,'client-1');assert.equal(db.rows()[0].extracted,undefined);});
test('failed metadata write rolls back and preserves the saved review',async()=>{const db=dbWith([local()]),before=db.rows();db.failNext();await assert.rejects(()=>upsertPulledDocuments(db,[remote()]),/Quota/);assert.deepEqual(db.rows(),before);});

test('server committed upload recovers after the local acknowledgement write was interrupted',async()=>{
 const initial={...local(),driver_id:'local-owner-op',server_id:null};delete initial.storage_path;
 const db=dbWith([initial]);await saveReadingCheckpoint(db,db.rows()[0],summary());
 const before=db.rows()[0];await upsertPulledDocuments(db,[remote()]);const after=db.rows()[0];
 assert.equal(db.rows().length,1);assert.equal(after.server_id,'server-1');assert.equal(after.driver_id,'driver-1');
 assert.equal(after.local_id,initial.local_id);assert.deepEqual(after.extracted,before.extracted);assert.ok(checkpointReading(after));
});
test('unacknowledged local upload cannot adopt a mismatched or incomplete original',()=>{
 const initial={...local(),driver_id:'local-owner-op',server_id:null};
 for(const change of [{client_document_id:'other-client'},{mime_type:'image/png'},{file_size_bytes:4},{file_size_bytes:null},{mime_type:null}]) {
  assert.throws(()=>mergePulledDocument(initial,{...remote(),...change}),/ownership or identity changed/);
 }
 assert.throws(()=>mergePulledDocument({...initial,sha256:'a'.repeat(64)},{...remote(),sha256:'b'.repeat(64)}),/original changed/);
});
