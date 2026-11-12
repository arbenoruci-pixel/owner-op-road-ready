import test from 'node:test';
import assert from 'node:assert/strict';
import {readRangeRows,selectedRowDatabase,controlledRead,selectionMetadata} from './rangeRows.js';
import {selectRange} from './core.js';

const from='2026-11-03',to='2026-11-10';
const state={activeDriverId:'driver',homeTerminalTimeZone:'America/New_York',
 eventsByDay:{'2026-10-25':[{id:'anchor',status:'SB',startMin:0,endMin:1440}],
 '2026-11-06':[{id:'signed-event',status:'SB',startMin:0,endMin:1383}],
 '2026-11-11':[{id:'later',status:'D',startMin:0,endMin:42}]},
 signatureByDay:{'2026-11-06':{signed:true,signatureDataUrl:'original-signature',certifiedContent:{original:true}}},
 certifyStatus:{'2026-11-06':'Certified'}};
const businessStore={loads:[{id:'load',loadNo:'ACTIVE',pickupDate:'2026-11-02',deliveryDate:'2026-11-05'}]};
function database(rows,{beforeRead=()=>{}}={}) {
 const reads=[],gets=[],scans=[];
 const tables=Object.entries(rows).map(([name,records])=>({name,schema:{primKey:{keyPath:'id'}},
  toArray(){throw Error('Unbounded store read: '+name);},
  count:async()=>records.length,
  get:async id=>{gets.push({name,id});return records.find(row=>row.id===id);},
  toCollection(){assert(!/^(app_snapshots|sync_meta|mutation_queue|account_receive_staging)$/.test(name),'Excluded store was read: '+name);
   return {raw:()=>({each:async visit=>{
    scans.push(name);
    for(const row of records){reads.push({name});beforeRead({name});visit(row);}
   }})};}
 }));
 return {tables,reads,gets,scans};
}
function fixture(){return {
 app_snapshots:new Array(1000),sync_meta:new Array(1000),mutation_queue:[],account_receive_staging:[],
 // An original is encountered before the metadata that links it to the load.
 document_blobs:[{id:'blob',client_document_id:'late-client',blob:new Blob(['original PDF'])},
  {id:'linked-blob',client_document_id:'sibling-client',blob:new Blob(['linked original'])},
  ...Array.from({length:25},(_,i)=>({id:'unrelated-blob-'+i,client_document_id:'unrelated-'+i,blob:new Blob(['outside selected dates'])}))],
 capture_asset_blobs:[{id:'pixels',source_id:'next-source',client_document_id:'sibling-client',blob:new Blob(['saved pixels'])}],
 document_links_local:[{id:'link',document_id:'late-doc',source_id:'next-source'}],
 documents_local:[{id:'sibling',local_id:'sibling-doc',client_document_id:'sibling-client',document_date:'2026-12-01'},
  ...Array.from({length:25},(_,i)=>({id:'other-'+i,client_document_id:'unrelated-'+i,document_date:'2026-12-01'})),
  {id:'late',local_id:'late-doc',client_document_id:'late-client',load_no:'ACTIVE',document_date:'2026-11-20'}],
 duty_events_local:[{id:'history',log_date:'2026-10-25',status:'SB'}, {id:'selected',log_date:'2026-11-06',status:'SB'}, {id:'later',log_date:'2026-11-11'}],
 log_days_local:[],inspections_local:[]};}
const comparable=value=>({...value,rows:Object.fromEntries(Object.entries(value.rows).sort().map(([key,rows])=>[key,[...rows].sort((a,b)=>a.id.localeCompare(b.id))]))});
test('bounded selection matches the complete original relationship graph in either table order',async()=>{
 for(const reversed of [false,true]) {
  const rows=fixture(),db=database(reversed?Object.fromEntries(Object.entries(rows).reverse()):rows);
  const before=structuredClone({state,businessStore});
  const result=await readRangeRows({db,state,businessStore,from,to});
  assert.deepEqual(comparable(result),comparable(selectRange(state,businessStore,rows,from,to)));
  assert.equal(result.rows.documents_local.length,2);assert.equal(result.rows.document_blobs.length,2);
  assert.equal(await result.rows.document_blobs.find(row=>row.id==='blob').blob.text(),'original PDF');
  assert.deepEqual(result.state.signatureByDay,state.signatureByDay);
  assert.equal(result.state.eventsByDay['2026-11-06'][0].endMin,1383);
  assert.deepEqual(result.hosContext.days,['2026-10-25']);
  assert.deepEqual({state,businessStore},before);
  assert(db.reads.length>10);assert.equal(new Set(db.scans).size,db.scans.length,'Each store is scanned exactly once');
  assert(db.gets.every(({name,id})=>result.rows[name].some(row=>row.id===id)),'Only selected originals are fetched');
 }
});
test('cancellation stops selection before the next storage page',async()=>{
 const controller=new AbortController();
 const db=database(fixture(),{beforeRead:()=>controller.abort()});
 await assert.rejects(()=>readRangeRows({db,state,businessStore,from,to,signal:controller.signal}),{name:'AbortError'});
 assert.equal(db.reads.length,1);
});
test('storage failures propagate and leave source records unchanged',async()=>{
 const rows=fixture(),db=database(rows,{beforeRead:()=>{throw Error('Storage unavailable');}}),before=structuredClone(rows);
 await assert.rejects(()=>readRangeRows({db,state,businessStore,from,to}),/Storage unavailable/);
 assert.deepEqual(rows,before);
});

test('metadata selection never decodes originals, and lazy archive reads fetch selected keys only',async()=>{
 const rows=fixture(),db=database(rows);
 const selected=await readRangeRows({db,state,businessStore,from,to,metadataOnly:true});
 assert.equal(db.gets.length,0);
 assert.equal(selected.rows.document_blobs.find(row=>row.id==='blob').blob,null);
 const adapter=selectedRowDatabase(db,selected.rows);
 const files=await adapter.tables.find(t=>t.name==='document_blobs').toCollection().offset(0).limit(8).toArray();
 assert.equal(files.length,2);assert.equal(await files.find(r=>r.id==='blob').blob.text(),'original PDF');
 assert.deepEqual(db.gets.map(r=>r.id).sort(),['blob','linked-blob']);
});
test('binary metadata is removed without traversing typed-array bytes or decoding stored wrappers',()=>{
 assert.deepEqual(selectionMetadata({id:'x',a:new Uint8Array(1000000),b:new ArrayBuffer(1000000),c:{__roadReadyStoredBinaryV110458:1,bytes:new Uint8Array(1000000)}}),{id:'x',a:null,b:null,c:null});
});
test('cancel and inactivity timeout settle an unresponsive storage request',async()=>{
 const controller=new AbortController(),read=controlledRead(()=>new Promise(()=>{}),{signal:controller.signal,timeoutMs:1000});
 controller.abort();await assert.rejects(read,{name:'AbortError'});
 await assert.rejects(controlledRead(()=>new Promise(()=>{}),{timeoutMs:10,label:'original files'}),/original files stopped responding/);
});
test('a deleted selected original fails instead of silently creating an incomplete backup',async()=>{
 const db=database({document_blobs:[]}),adapter=selectedRowDatabase(db,{document_blobs:[{id:'missing'}]});
 await assert.rejects(adapter.tables[0].toCollection().offset(0).limit(8).toArray(),/selected record changed/);
});
