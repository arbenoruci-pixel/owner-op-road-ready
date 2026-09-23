import test from 'node:test';
import assert from 'node:assert/strict';
import {documentGroups,documentKind,documentDescription,visibleWeeks,documentCount} from './documentBrowser.js';
test('explicit imported POD remains POD even when its file name says BOL',()=>{
 const pod={id:'pod',document_type:'pod',type:'bol',title:'Signed bill of lading',stopSequence:2,document_date:'2026-07-23'};
 const pickup={id:'bol',type:'bol',title:'Received by (blank delivery form)'};
 assert.equal(documentKind(pod),'pod');assert.equal(documentKind(pickup),'bol');
 assert.deepEqual(documentGroups([pod,pickup]).map(x=>x.id),['bol','pod']);
 assert.equal(documentDescription(pod),'Stop 2 · 2026-07-23');
});
test('distinct POD files and stops remain visible; duplicate records and saved exports do not inflate document count',()=>{
 const docs=[{id:'p1',type:'pod',stopSequence:2},{id:'p2',type:'pod',stopSequence:1},{id:'p1',type:'pod',stopSequence:2},{id:'snapshot',type:'logbook_snapshot'},{id:'miles',type:'mileage_snapshot'}];
 const before=JSON.stringify(docs);assert.equal(documentCount({documents:docs}),2);
 assert.deepEqual(documentGroups(docs)[0].documents.map(x=>x.id),['p2','p1']);
 assert.deepEqual(documentGroups(docs,true).map(x=>x.id),['logbook_snapshot','miles_snapshot']);assert.equal(JSON.stringify(docs),before);
});
test('hide weeks containing only operational records; retain empty-load weeks with receipts and Amazon loads',()=>{
 const weeks=[{start:'2026-09-21',items:[],documents:[{id:'log',type:'logbook_snapshot'}],days:[{day:'2026-09-21'}]},{start:'2026-09-14',items:[],documents:[{id:'fuel',type:'fuel_receipt'}]},{start:'2026-09-07',items:[{isAmazon:true}],documents:[]}];
 const before=JSON.stringify(weeks);assert.deepEqual(visibleWeeks(weeks).map(x=>x.start),['2026-09-14','2026-09-07']);assert.equal(JSON.stringify(weeks),before);
});
test('unsupported types remain accessible; dates never fall back to import timestamps',()=>{
 assert.equal(documentGroups([{id:'bill',type:'bill_of_sale',title:'Trailer sale'}])[0].documents.length,1);
 assert.equal(documentDescription({created_at:'2026-09-23T01:00:00Z'}),'');
 assert.equal(documentDescription({document_date:'2026-02-30'}),'');
});
