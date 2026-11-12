import test from 'node:test';
import assert from 'node:assert/strict';
import {readRangeRows} from './rangeRows.js';
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
 const reads=[];
 const tables=Object.entries(rows).map(([name,records])=>({name,schema:{primKey:{keyPath:'id'}},
  toArray(){throw Error('Unbounded store read: '+name);},
  toCollection(){assert(!/^(app_snapshots|sync_meta|mutation_queue|account_receive_staging)$/.test(name),'Excluded store was read: '+name);
   return {offset:offset=>({limit:limit=>({toArray:async()=>{
    assert(limit<=8,'Read must remain bounded');reads.push({name,offset,limit});beforeRead({name,offset});
    return records.slice(offset,offset+limit);
   }})})};}
 }));
 return {tables,reads};
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
  assert(db.reads.length>10);
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
