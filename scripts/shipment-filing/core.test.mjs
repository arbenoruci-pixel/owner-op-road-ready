import test from 'node:test';
import assert from 'node:assert/strict';
import {matchScanDocumentToLoadV11037 as match} from '../../source/src/modules/scan/scanLoadAssignmentV11037.js';
import {collectShipmentScanCandidates as collect,shipmentPickerDetails} from '../../source/src/modules/scan/shipmentFiling.js';
import {collectLoadCandidatesV105,migrateBusinessStoreV105,vaultFoldersV105} from '../../source/src/modules/documents/documentFoundationV105.js';
import {loadPickerCandidates} from '../../source/src/modules/scan/loadPickerV110472.js';
import {scanDestinationV11039} from '../../source/src/modules/scan/smartScanRoutingV11039.js';
import {archive,pickup,state,store,analysis} from './fixture.mjs';
const opts={state,businessStore:store,typeId:'bol',fields:analysis.fields,analysis};
test('numeric BOL on a stale current-load form cannot identify the archived load, including its injected stop',()=>{
 const rows=collectLoadCandidatesV105(state,store),old=rows.find(c=>c.loadNo===archive.loadNo);
 assert.ok(!old.aliases.some(a=>a.value===pickup.bol));assert.ok(!old.stops.some(s=>s.bolNumber===pickup.bol));
 const result=match({...opts,state:{...state,eventsByDay:{}}});assert.equal(result.matched,false);
});
test('the previous-day pickup remains available after a reference-free pretrip, with a distinct shipment identity',()=>{
 const before=JSON.stringify(state),result=match(opts);assert.equal(result.loadNo,pickup.bol);assert.equal(result.referenceOnly,true);assert.equal(result.broker,'');
 const rows=shipmentPickerDetails(loadPickerCandidates(collect(state,store),state,store,{current:{identity:'reference',shipmentReference:pickup.bol}}),analysis);
 const row=rows.find(c=>c.loadNo===pickup.bol);assert.equal(row.shipmentFiling,true);assert.equal(row.referenceOnly,true);assert.equal(row.company,'Example Receiver');
 assert.equal(row.pickupDate,'2026-10-27');assert.equal(JSON.stringify(state),before);
});
test('a bare route, a pretrip reference, deleted pickup, or unrelated OCR alone cannot create a shipment',()=>{
 for(const e of [{...pickup,note:'Pre-trip inspection'},{...pickup,deleted:true},null]){
  const s={...state,eventsByDay:{'2026-10-27':e?[e]:[]},routeLegsByDay:{'2026-10-27':[{loadNo:pickup.bol,status:'open'}]}};
  assert.equal(collect(s,store).some(c=>c.shipmentFiling),false);
 }
 const rows=shipmentPickerDetails(collect(state,store),{...analysis,text:'Other document',fields:{...analysis.fields,shipTo:'Invented Receiver'}});
 assert.ok(!rows.find(c=>c.shipmentFiling).company);
});
test('a proven canonical BOL alias selects its actual load; shared aliases require review',()=>{
 const current={id:'current-load',loadNo:'CURRENT-99001',broker:'Correct Broker',source:'rate_confirmation_v105',aliases:[{kind:'bol_number',value:pickup.bol}]};
 assert.equal(match({...opts,businessStore:{loads:[archive,current]}}).loadNo,current.loadNo);
 assert.equal(match({...opts,businessStore:{loads:[current,{...current,id:'duplicate',loadNo:'OTHER-99002'}]}}).matched,false);
});
test('the same BOL on distinct recorded pickups cannot silently choose an event',()=>{
 const s={...state,eventsByDay:{...state.eventsByDay,'2026-10-28':[{...pickup,id:'another-pickup',city:'Different city'}]}};
 assert.equal(match({...opts,state:s}).matched,false);assert.equal(collect(s,store).find(c=>c.shipmentFiling).shipmentEventId,'');
});
test('shipment filing survives migration without becoming a broker load, and has its own Vault destination',()=>{
 const doc={id:'saved-original',type:'bol',documentDate:'2026-10-27',status:'needs_review',loadNo:'',canonicalLoadNo:'',documentScope:'shipment',shipmentReference:pickup.bol,loadAssignmentStatusV11037:'shipment_reference',references:[{kind:'bol_number',value:pickup.bol}],extracted:analysis.fields};
 const migrated=migrateBusinessStoreV105({...store,documents:[doc]},state).documents[0];
 assert.equal(migrated.canonicalLoadNo,'');assert.equal(migrated.shipmentReference,pickup.bol);assert.equal(migrated.folder,'shipment:'+pickup.bol);
 assert.equal(vaultFoldersV105([migrated]).loads[0].kind,'shipment');assert.match(scanDestinationV11039(migrated).label,/Shipment \/ BOL/);
});
