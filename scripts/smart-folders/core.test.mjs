import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSmartFolders,folderChecklist,folderSummary,documentLabel,savedTime,requestedScanFolder} from './core.js';
const doc=(id,type,load='',extra={})=>({id,type,loadNo:load,createdAt:1793813639097,...extra});
test('a recorded shipment keeps its POD and folder after completion, without a fabricated broker ID',()=>{
 const documents=[doc('pod','pod','',{documentScope:'shipment',shipmentReference:'39047434'})];
 const candidates=[{shipmentFiling:true,shipmentReference:'39047434',status:'completed',shipmentEventId:'pickup',origin:'Stow, OH',destination:'Marcy, NY'}];
 const original=structuredClone({documents,candidates});
 const result=buildSmartFolders({documents,candidates});
 assert.equal(result.folders.length,1);assert.equal(result.folders[0].completed,true);assert.equal(result.folders[0].loadNo,'');assert.equal(result.folders[0].documents[0].id,'pod');
 assert.deepEqual({documents,candidates},original);
 assert.match(folderSummary(folderChecklist(result.folders[0])),/Ratecon/);
});
test('a new load gets a folder before any documents; fuel remains optional',()=>{
 const f=buildSmartFolders({folders:[{loadNo:'NEW',status:'booked'}]}).folders[0];
 const checks=folderChecklist(f);assert.equal(checks.length,3);assert.equal(checks[0].status,'missing');assert.equal(checks[2].status,'later');assert.ok(!checks.some(r=>r.kind==='fuel_receipt'));
});
test('confirmed aliases combine shipment documents into one canonical folder and conflicting aliases do not',()=>{
 const documents=[doc('pod','pod','',{shipmentReference:'BOL-1'})];
 const candidate={loadNo:'LOAD-1',aliases:[{value:'BOL-1',source:'rate_confirmation'}]};
 let result=buildSmartFolders({candidates:[candidate,{shipmentFiling:true,shipmentReference:'BOL-1',status:'completed'}],documents});
 assert.equal(result.folders.length,1);assert.equal(result.folders[0].documents.length,1);assert.equal(result.folders[0].completed,true);
 result=buildSmartFolders({candidates:[candidate,{...candidate,loadNo:'LOAD-2'}],documents});
 assert.equal(result.folders.find(f=>f.shipment).documents.length,1);
 assert.equal(result.folders.filter(f=>!f.shipment).flatMap(f=>f.documents).length,0);
});
test('unfiled fuel is not attached by date, explicit fuel stays with its load, duplicate bytes show once',()=>{
 const result=buildSmartFolders({folders:[{loadNo:'A'}],documents:[doc('fuel','fuel_receipt'),doc('linked','fuel_receipt','A',{sha256:'hash'}),doc('copy','fuel_receipt','A',{sha256:'hash'})]});
 assert.equal(result.unfiled.length,1);assert.equal(result.folders[0].documents.length,1);
});
test('trip logbooks include intermediate days, keep missing days visible, and never change signed records',()=>{
 const state={activeDriverId:'d1',eventsByDay:{'2026-11-01':[{loadNo:'A',status:'ON'}],'2026-11-03':[{loadNo:'A',status:'ON'}]},signatureByDay:{'2026-11-01':{value:'signed'}},teamLogbooksByDriverId:{d2:{eventsByDay:{'2026-11-02':[{loadNo:'B'}]}}}};
 const before=structuredClone(state),f=buildSmartFolders({folders:[{loadNo:'A'}],state}).folders[0];
 assert.deepEqual(f.logs.map(l=>l.day),['2026-11-01','2026-11-02','2026-11-03']);assert.equal(f.logs[0].signed,true);assert.equal(f.logs[1].available,false);assert.deepEqual(state,before);
});
test('recent undated scans keep their saved order and readable POD reference',()=>{
 const fresh=doc('p','pod','',{shipmentReference:'39047434'}),older=doc('o','pod','',{createdAt:1,documentDate:'2030-01-01'});
 assert.ok(savedTime(fresh)>savedTime(older));assert.equal(documentLabel(fresh),'POD · 39047434');
});
test('reviewed missing multi-stop evidence remains partial even when a POD exists',()=>{
 const d=doc('p','pod','A'),folder=buildSmartFolders({folders:[{loadNo:'A',status:'delivered'}],documents:[d]}).folders[0];
 const rows=folderChecklist(folder,[{kind:'pod',status:'missing',sources:[{doc:d,pages:[1]}]}]);
 assert.equal(rows.find(r=>r.kind==='pod').status,'partial');assert.match(folderSummary(rows),/POD/);
});
test('adding POD or fuel inside a chosen folder carries that explicit choice; ratecon identity stays source-backed',()=>{
 const candidates=[{loadNo:'BOL1',shipmentFiling:true}];
 assert.equal(requestedScanFolder({loadNo:'BOL1'},'pod',candidates),'BOL1');
 assert.equal(requestedScanFolder({loadNo:'BOL1'},'fuel_receipt',candidates),'BOL1');
 assert.equal(requestedScanFolder({loadNo:'BOL1'},'rate_confirmation',candidates),'');
 assert.equal(requestedScanFolder({loadNo:'BOL1'},'pod',[{...candidates[0],shipmentAmbiguous:true}]),'');
 assert.equal(requestedScanFolder(null,'fuel_receipt',candidates),'');
});
test('duplicate bytes cannot hide explicit filing and stay deduplicated within each destination',()=>{
 const documents=[doc('unfiled','pod','',{sha256:'same'}),doc('filed-a','pod','A',{sha256:'same'}),doc('copy-a','pod','A',{sha256:'same'}),doc('filed-b','pod','B',{sha256:'same'})];
 const before=structuredClone(documents);
 for(const ordered of [documents,[...documents].reverse()]){
  const result=buildSmartFolders({folders:[{loadNo:'A'},{loadNo:'B'}],documents:ordered});
  assert.equal(result.unfiled.length,1);
  assert.equal(result.unfiled[0].id,'unfiled');
  for(const f of result.folders){assert.equal(f.documents.length,1);assert.equal(f.documents[0].loadNo,f.reference);}
 }
 assert.deepEqual(documents,before);
});
test('form-only logbooks remain available without changing driver selection or saved signatures',()=>{
 const state={activeDriverId:'d1',formByDay:{'2026-11-01':{loadNo:'A'}},signatureByDay:{'2026-10-31':{value:'signed'}},teamLogbooksByDriverId:{d2:{formByDay:{'2026-11-02':{loadNo:'A'}},signatureByDay:{'2026-11-02':{value:'other-signed'}}}}};
 const before=structuredClone(state),folder=buildSmartFolders({folders:[{loadNo:'A'}],state}).folders[0];
 const own=folder.logs.find(l=>l.driverId==='d1'),other=folder.logs.find(l=>l.driverId==='d2');
 assert.equal(own.day,'2026-11-01');assert.equal(own.available,true);assert.equal(own.canOpen,true);assert.equal(own.signed,false);
 assert.equal(other.available,true);assert.equal(other.canOpen,false);assert.equal(other.signed,true);
 assert.deepEqual(state,before);
});
test('shipment originals without evaluated evidence remain reviewable, never falsely complete',()=>{
 const input={candidates:[{shipmentFiling:true,shipmentReference:'SHIP-44',status:'completed'}],documents:[doc('unsigned','pod','',{shipmentReference:'SHIP-44',podSigned:false,needs_review:true})]};
 const before=structuredClone(input),folder=buildSmartFolders(input).folders[0],pod=folderChecklist(folder).find(r=>r.kind==='pod');
 assert.equal(pod.status,'review');assert.equal(pod.detail,'Saved · check details');assert.equal(pod.files[0].id,'unsigned');assert.deepEqual(input,before);
});
