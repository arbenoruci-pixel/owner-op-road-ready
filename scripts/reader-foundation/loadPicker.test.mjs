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
