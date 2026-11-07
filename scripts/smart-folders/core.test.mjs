import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSmartFolders,folderChecklist,folderSummary,documentLabel,savedTime,requestedScanFolder,explicitFolderScanCandidates} from './core.js';
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
 assert.equal(requestedScanFolder({loadNo:'BOL1',shipmentReference:'BOL1'},'pod',candidates),'BOL1');
 assert.equal(requestedScanFolder({loadNo:'BOL1',shipmentReference:'BOL1'},'fuel_receipt',candidates),'BOL1');
 assert.equal(requestedScanFolder({loadNo:'BOL1',shipmentReference:'BOL1'},'rate_confirmation',candidates),'');
 assert.equal(requestedScanFolder({loadNo:'BOL1',shipmentReference:'BOL1'},'pod',[{...candidates[0],shipmentAmbiguous:true}]),'');
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

test('explicit saved folder is available for evidence only without granting dispatch authority',()=>{
 const store={loads:[{id:'manual-a',loadNo:'MANUAL-1',status:'booked',broker:'Saved broker',origin:'A, IL',destination:'B, OH',stops:[{type:'delivery',city:'B'}],instructionGuide:{secret:'must not copy'}}]};
 const before=structuredClone(store),base=[{loadNo:'SOURCE-1',sourceKinds:['guide']}];
 for(const type of ['bol','pod','fuel_receipt','invoice']){
  const candidates=explicitFolderScanCandidates({loadNo:'MANUAL-1'},type,base,store);
  assert.equal(candidates.length,2);assert.equal(requestedScanFolder({loadNo:'MANUAL-1'},type,candidates),'MANUAL-1');
  const saved=candidates[1];assert.equal(saved.id,'manual-a');assert.equal(saved.broker,'Saved broker');assert.equal(saved.active,false);
  assert.deepEqual(saved.sourceKinds,['explicit_saved_folder']);assert.equal(saved.instructionGuide,undefined);assert.equal(saved.source,undefined);
  assert.notEqual(saved.stops,store.loads[0].stops);assert.deepEqual(base,[{loadNo:'SOURCE-1',sourceKinds:['guide']}]);
 }
 for(const type of ['rate_confirmation','load_tender','other','driver_license'])assert.equal(explicitFolderScanCandidates({loadNo:'MANUAL-1'},type,base,store),base);
 assert.equal(explicitFolderScanCandidates(null,'pod',base,store),base);
 assert.equal(explicitFolderScanCandidates({loadNo:'DOES-NOT-EXIST'},'pod',base,store),base);
 assert.equal(explicitFolderScanCandidates({loadNo:'MANUAL-1',shipmentReference:'MANUAL-1'},'pod',base,store),base);
 assert.deepEqual(store,before);
});
test('explicit filing refuses duplicate saved identities, deleted rows, and ambiguous shipment candidates',()=>{
 const context={loadNo:'ABC-123'},base=[];
 for(const loads of [[{loadNo:'ABC-123'},{loadNo:'ABC123'}],[{loadNo:'ABC-123',deletedAt:123}],[{loadNo:'ABC-123',shipmentAmbiguous:true}],[{loadNo:'ABC-123',status:'removed'}]])assert.equal(explicitFolderScanCandidates(context,'pod',base,{loads}),base);
 const ambiguous=[{loadNo:'ABC-123',shipmentFiling:true,shipmentAmbiguous:true}];
 assert.equal(explicitFolderScanCandidates(context,'pod',ambiguous,{loads:[{loadNo:'ABC-123'}]}),ambiguous);
 assert.equal(requestedScanFolder(context,'pod',ambiguous),'');
 assert.equal(requestedScanFolder(context,'pod',[{loadNo:'ABC-123'},{loadNo:'ABC123'}]),'');
 const established=[{loadNo:'ABC-123',id:'real-source',sourceKinds:['guide']}];
 assert.equal(explicitFolderScanCandidates(context,'pod',established,{loads:[{loadNo:'ABC-123'}]}),established);
});
test('completed saved folders remain completed in the explicit evidence picker',()=>{
 const [candidate]=explicitFolderScanCandidates({loadNo:'DONE'},'fuel_receipt',[],{loads:[{loadNo:'DONE',status:'paid'}]});
 assert.equal(candidate.status,'completed');assert.equal(candidate.active,false);assert.equal(requestedScanFolder({loadNo:'DONE'},'fuel_receipt',[candidate]),'DONE');
});

test('save-time revalidation rejects a removed, renamed, duplicated, or replaced explicit folder',()=>{
 const context={loadNo:'MANUAL-1'},load={id:'original-folder',loadNo:'MANUAL-1'};
 const [selected]=explicitFolderScanCandidates(context,'pod',[],{loads:[load]});
 const stillSame=loads=>explicitFolderScanCandidates(context,'pod',[],{loads}).some(c=>c.loadNo===selected.loadNo&&c.id===selected.id);
 assert.equal(stillSame([{...load,status:'delivered'}]),true);
 assert.equal(stillSame([]),false);assert.equal(stillSame([{...load,loadNo:'MANUAL-2'}]),false);
 assert.equal(stillSame([load,{...load,id:'duplicate'}]),false);
 assert.equal(stillSame([{...load,id:'replacement-folder'}]),false);
});

test('explicit evidence choices reject competing source aliases and canonical/shipment mismatches',()=>{
 const context={loadNo:'MANUAL-1'},store={loads:[{loadNo:'MANUAL-1'}]},base=[{loadNo:'SOURCE-1',aliases:[{value:'MANUAL-1',source:'rate_confirmation'}]}];
 assert.equal(explicitFolderScanCandidates(context,'pod',base,store),base);
 assert.equal(requestedScanFolder(context,'pod',[...base,{loadNo:'MANUAL-1'}]),'');
 assert.equal(requestedScanFolder({loadNo:'REF1',shipmentReference:'REF1'},'pod',[{loadNo:'REF1'}]),'');
 assert.equal(requestedScanFolder({loadNo:'REF1'},'pod',[{loadNo:'REF1',shipmentFiling:true,shipmentReference:'REF1'}]),'');
 assert.equal(requestedScanFolder({loadNo:'REF1',shipmentReference:'OTHER'},'pod',[{loadNo:'REF1',shipmentFiling:true,shipmentReference:'REF1'}]),'');
 assert.equal(requestedScanFolder({loadNo:'REF1',shipmentReference:'REF1'},'pod',[{loadNo:'REF1',shipmentFiling:true,shipmentReference:'REF1'}]),'REF1');
});

test('save revalidation rejects new source ambiguity while allowing newly established same-load authority',()=>{
 const context={loadNo:'MANUAL-1'},store={loads:[{id:'saved',loadNo:'MANUAL-1'}]};
 const [currentFolder]=explicitFolderScanCandidates(context,'pod',[],store);
 const revalidate=fresh=>requestedScanFolder(context,'pod',fresh.some(c=>c.loadNo===currentFolder.loadNo)?fresh:[currentFolder,...fresh]);
 assert.equal(revalidate([]),'MANUAL-1');
 assert.equal(revalidate([{loadNo:'OTHER',aliases:[{value:'MANUAL-1',source:'rate_confirmation'}]}]),'');
 assert.equal(revalidate([{loadNo:'MANUAL-1',sourceKinds:['guide']}]),'MANUAL-1');
 assert.equal(revalidate([{loadNo:'MANUAL-1'},{loadNo:'MANUAL1'}]),'');
 assert.equal(revalidate([{loadNo:'MANUAL-1',shipmentFiling:true}]),'');
});
