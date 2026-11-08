import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPickerCandidates,podReadingMessage} from './loadPicker.js';
import {libraryScanCandidates} from '../v110434/libraryScan.js';
test('current load comes first and chronological open and completed groups retain their details',()=>{
 const base=[{loadNo:'OLD',status:'open',pickupDate:'2026-10-01'},{loadNo:'NEW',status:'open',pickupDate:'2026-10-14'},{loadNo:'ACTIVE',status:'open',pickupDate:'2026-10-12'}, {loadNo:'DONE',status:'completed',broker:'',origin:'',destination:'',deliveryDate:'2026-10-12'}];
 const state={loadInfo:{loadNo:'ACTIVE'}};
 const store={loads:[{loadNo:'DONE',broker:'Sample Bay Logistics',origin:'Lisbon, ME',destination:'Omaha, NE',deliveryDate:'2026-10-12',operationalStatus:'closed',status:'archived',documentLibrarySource:'saved-library'}, {loadNo:'DONE-OLDER',status:'completed',deliveryDate:'2026-10-02',updatedAt:Date.now()}]};
 const before=structuredClone({base,state,store});
 const rows=loadPickerCandidates(libraryScanCandidates(base,store),state,store);
 assert.deepEqual(rows.map(r=>r.loadNo),['ACTIVE','NEW','OLD','DONE','DONE-OLDER']);
 assert.equal(rows[3].company,'Sample Bay Logistics');assert.equal(rows[3].origin,'Lisbon, ME');assert.equal(rows[3].destination,'Omaha, NE');
 assert.deepEqual({base,state,store},before);
});
test('stored canonical folders absent from the initial list are selectable, deleted work is excluded',()=>{
 const rows=loadPickerCandidates([],{}, {loads:[{canonicalLoadNo:'SAVED-1',broker:'Saved Broker',status:'booked'},{loadNo:'REMOVED',status:'deleted'}]});
 assert.deepEqual(rows.map(r=>r.loadNo),['SAVED-1']);assert.equal(rows[0].company,'Saved Broker');
});
test('saved document metadata enriches the matching load without inventing or reassigning work',()=>{
 const rows=loadPickerCandidates([{loadNo:'KNOWN',status:'completed',broker:''}],{}, {documents:[{canonicalLoadNo:'KNOWN',extracted:{carrier:'Saved Carrier'}},{canonicalLoadNo:'UNRELATED',broker:'Other Broker'}]});
 assert.equal(rows.length,1);assert.equal(rows[0].company,'Saved Carrier');assert.equal(rows[0].status,'completed');
});
test('POD choice is described distinctly from uncertain or verified source evidence',()=>{
 assert.match(podReadingMessage('pod',{groups:[{kind:'bol'}]}),/You selected POD.*could not verify/);
 assert.match(podReadingMessage('pod',{groups:[{kind:'pod'}]}),/Delivery evidence was found/);
 assert.match(podReadingMessage('pod',{groups:[{kind:'unknown'}]}),/could not verify delivery evidence/);
 assert.equal(podReadingMessage('bol',{groups:[{kind:'bol'}]}),'');
});

test('the current shipment reference leads the picker and keeps its separate filing identity',()=>{
 const rows=loadPickerCandidates([
  {loadNo:'OLD-73001',status:'open',active:true},
  {loadNo:'SHIP-NEW-82002',shipmentFiling:true,shipmentReference:'SHIP-NEW-82002',status:'open',pickupDate:'2026-11-04',origin:'Example City, NY',destination:'Example Town, KY'}
 ],{loadInfo:{loadNo:'OLD-73001'}},{},{current:{identity:'reference',shipmentReference:'SHIP-NEW-82002',recorded:true},statuses:{'OLD-73001':'delivered'}});
 assert.equal(rows[0].loadNo,'SHIP-NEW-82002');assert.equal(rows[0].active,true);
 assert.equal(rows[1].status,'completed');assert.equal(rows[1].active,false);
 assert.equal(rows[0].shipmentReference,'SHIP-NEW-82002');
});
test('latest recorded pickup leads a stale form even without a route plan, and completed shipments stay closed',()=>{
 const rows=loadPickerCandidates([
  {loadNo:'STALE',status:'open'},
  {loadNo:'FIRST',shipmentFiling:true,status:'open',latestPickupAt:100},
  {loadNo:'CURRENT',shipmentFiling:true,status:'open',latestPickupAt:200},
  {loadNo:'DONE',shipmentFiling:true,status:'completed',latestPickupAt:300}
 ],{},{},{current:{identity:'load',loadNo:'STALE',recorded:false}});
 assert.equal(rows[0].loadNo,'CURRENT');assert.equal(rows.filter(row=>row.active).length,1);
 assert.equal(rows.find(row=>row.loadNo==='DONE').active,false);
});

test('a reviewed BOL alias uses canonical filing fields regardless of candidate order',()=>{
 const shipment={loadNo:'SH045061',shipmentReference:'SH045061',shipmentFiling:true,referenceOnly:true,status:'completed',shipmentEventId:'pickup'};
 const canonical={loadNo:'31450-11788',broker:'Vektor',status:'completed'};
 const store={loads:[canonical]},context={aliases:{SH045061:'31450-11788'},current:null};
 for(const base of [[shipment],[shipment,canonical],[canonical,shipment]]){
  const before=structuredClone({base,store,context});
  const rows=loadPickerCandidates(base,{},store,context);
  assert.equal(rows.length,1);assert.equal(rows[0].loadNo,'31450-11788');
  assert.equal(Boolean(rows[0].shipmentFiling),false,'the save path must use the displayed load identity');
  assert.equal(rows[0].referenceOnly,false);assert.equal(rows[0].status,'completed');
  assert.deepEqual({base,store,context},before);
 }
 const unreviewed=loadPickerCandidates([shipment],{},store,{current:null});
 assert.equal(unreviewed.find(r=>r.loadNo==='SH045061').shipmentFiling,true);
});
