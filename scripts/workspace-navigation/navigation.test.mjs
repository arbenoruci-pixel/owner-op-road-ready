import test from 'node:test';
import assert from 'node:assert/strict';
import {openWorkspace,returnWorkspace,recordLogDay,shipmentLogDay,driveStatusLabel,projectFiledDocument,projectDocumentFilings,canFileDocument,localFileRecord} from './navigation.js';
import {reconcileLoadFoldersV10974} from '../../source/src/modules/owneros/loadFolderReconciliationV10974.js';
import {catalog} from '../../source/src/modules/owneros/evidenceWorkspaceCoreV110453.js';
import {operationalCandidateContext,businessLoadRows} from '../../source/src/modules/loads/currentLoadV110473.js';
import {billingReadinessV102} from '../../source/src/modules/owneros/ownerOpsStoreV102.js';
import {serviceDates} from '../../source/src/modules/owneros/loadPresentationV110417.js';
const fixture=()=>({view:'logs',activeDriverId:'primary',teamDrivers:[{id:'primary',name:'Primary'},{id:'archived',name:'Saved driver'}],
 eventsByDay:{'2026-10-12':[{id:'drop',status:'ON',startMin:600,endMin:630,note:'Delivery / Unloading',loadNo:'BROKER-1'}]},
 signatureByDay:{'2026-10-12':{signed:true}},certifyStatus:{'2026-10-12':'Certified'},formByDay:{},routeLegsByDay:{},
 teamLogbooksByDriverId:{archived:{eventsByDay:{'2026-10-12':[{id:'other',status:'OFF',startMin:0,endMin:1440}]}}}});
test('Home tools return to their caller and independent origins do not overwrite each other',()=>{
 const original=fixture(),before=structuredClone(original);
 for(const view of ['dot','backup','wallet','driveMode']){
  const entered=openWorkspace(original,view),returned=returnWorkspace(entered,view);
  assert.equal(entered.view,view);assert.equal(returned.view,'logs');
  assert.equal(returned.eventsByDay,original.eventsByDay);assert.equal(returned.signatureByDay,original.signatureByDay);
 }
 const history=openWorkspace({...original,view:'day'},'dot');assert.equal(returnWorkspace(history,'dot').view,'day');
 const drive=openWorkspace({...original,activeDay:'2026-10-12'},'driveMode',{day:'2026-10-16'});assert.equal(drive.activeDay,'2026-10-16');assert.equal(drive.eventsByDay,original.eventsByDay);
 assert.equal(openWorkspace({...original,activeDay:'2026-10-12'},'driveMode').activeDay,'2026-10-12','restoring an inspected day keeps its selected date');
 const logbook=openWorkspace({...history,view:'logbook'},'backup');assert.equal(returnWorkspace(logbook,'backup').view,'logbook');
 assert.equal(returnWorkspace(logbook,'dot').view,'day');assert.deepEqual(original,before);
 assert.equal(returnWorkspace({...original,workspaceReturnViews:{dot:'https://example.invalid'}},'dot').view,'logs');
 assert.equal(openWorkspace(original,'unknown'),original);
});
test('a record link keeps its exact saved day and never switches the active driver',()=>{
 const state=fixture(),before=structuredClone(state);
 assert.equal(recordLogDay({day:'2026-10-12',driverId:'primary'},state),'2026-10-12');
 assert.equal(recordLogDay({day:'2026-10-12',driverId:'archived'},state),'');
 assert.equal(recordLogDay({day:'2026-10-11',driverId:'primary'},state),'');
 assert.equal(recordLogDay({day:'invalid',driverId:'primary'},state),'');
 assert.equal(recordLogDay({type:'click',nativeEvent:{}},state,'2026-10-16'),'2026-10-16','existing generic log buttons may pass a DOM event');
 const rows=catalog([],state);assert.equal(rows.filter(row=>row.kind==='log').length,2);
 assert.equal(rows.find(row=>row.source.driverId==='archived').source.events[0].id,'other');assert.deepEqual(state,before);
});
test('a shipment CTA opens its own recorded pickup rather than a stale form or guide',()=>{
 const state=fixture();state.eventsByDay['2026-10-14']=[{id:'pickup',status:'ON'}];state.eventsByDay['2026-10-18']=[{id:'future',status:'ON'}];
 state.routeLegsByDay={'2026-10-14':[{loadNo:'SHIP-2',pickupEventId:'pickup'}],'2026-10-18':[{loadNo:'SHIP-2',pickupEventId:'future'}]};
 assert.equal(shipmentLogDay(state,'ship-2','2026-10-16'),'2026-10-14');
 assert.equal(shipmentLogDay(state,'SHIP-UNKNOWN','2026-10-16'),'2026-10-16');
});
test('Drive uses all four actual duty statuses',()=>{
 assert.equal(driveStatusLabel('OFF'),'OFF DUTY');assert.equal(driveStatusLabel('SB'),'SLEEPER BERTH');
 assert.equal(driveStatusLabel('ON'),'ON DUTY');assert.equal(driveStatusLabel('D'),'DRIVING');
});
test('Files and load folders include the same legacy metadata and keep distinct originals separate',()=>{
 const a={id:'legacy-a',type:'rate_confirmation',loadNo:'BROKER-1',fileName:'Rate.pdf',documentDate:'2026-10-12',sha256:'a'.repeat(64)};
 const b={local_id:'local-b',client_document_id:'client-b',type:'bol',load_no:'BROKER-1',original_file_name:'BOL.pdf',document_date:'2026-10-12',sha256:'b'.repeat(64)};
 const store={loads:[{id:'broker',loadNo:'BROKER-1'}],documents:[a]},before=structuredClone({store,b});
 const model=reconcileLoadFoldersV10974({loads:store.loads,documents:[b],businessStore:store});
 const records=catalog(model.allDocuments,{}).filter(row=>row.kind==='document');
 assert.equal(records.length,2);assert.equal(model.folders[0].documents.length,2);
 assert.equal(canFileDocument(records.find(row=>row.name==='Rate.pdf').source,[b]),false);
 assert.equal(canFileDocument(records.find(row=>row.name==='BOL.pdf').source,[b]),true);
 assert.equal(canFileDocument({...b,local_id:'unrelated',client_document_id:'unrelated'},[b]),false,'a shared hash alone cannot authorize editing a different record');
 assert.deepEqual({store,b},before);
});
test('filing a local original under a load reaches both record search and load folders',()=>{
 const doc={local_id:'local',client_document_id:'client',type:'other',sha256:'c'.repeat(64),document_date:'',original_file_name:'Receipt.pdf',
  evidenceFilingV1:{version:1,confirmed:true,category:'repair',date:'2026-10-12',loadNo:'BROKER-1',merchant:'Example Garage',amount:'125.00'}};
 const before=structuredClone(doc),projected=projectFiledDocument(doc);
 assert.equal(projected.document_type,'maintenance');assert.equal(projected.load_no,'BROKER-1');assert.equal(projected.sha256,doc.sha256);
 const model=reconcileLoadFoldersV10974({documents:[doc],loads:[{loadNo:'BROKER-1'}]});
 assert.equal(model.folders[0].documents.length,1);assert.equal(catalog(model.allDocuments,{})[0].loadNo,'BROKER-1');assert.deepEqual(doc,before);
});
test('billing receives the same recorded delivery as Home and the business list without changing money',()=>{
 const state=fixture(),store={loads:[{id:'broker',loadNo:'BROKER-1',status:'booked',gross:4000}],documents:[]},before=structuredClone({state,store});
 const loads=businessLoadRows(store,operationalCandidateContext(state,store,{day:'2026-10-16',minute:100}));
 assert.equal(loads[0].status,'delivered');assert.equal(loads[0].gross,4000);
 const readiness=billingReadinessV102(loads[0],[],store);
 assert.equal(readiness.checklist.find(item=>item.id==='delivery').complete,true);
 const legacy={...loads[0],documentWorkflowStage:'booked',deliveryDate:'2026-10-12'};
 assert.equal(billingReadinessV102(legacy,[],store).checklist.find(item=>item.id==='delivery').complete,true);
 assert.equal(serviceDates(legacy).delivered,true);
 assert.equal(serviceDates({...legacy,documentWorkflowStage:'tonu'}).stage,'tonu');
 for(const originalStatus of ['tonu','cancelled','paid','invoiced','booked'])assert.equal(serviceDates({status:'archived',operationalStatus:'delivered',documentTransferEvidence:{originalStatus}}).stage,originalStatus,'archive workflow status remains authoritative');
 assert.equal(serviceDates({...legacy,status:'archived'}).stage,'booked');
 assert.equal(billingReadinessV102({...legacy,status:'archived'},[],store).checklist.find(item=>item.id==='delivery').complete,false,'a closed archive marker alone is not delivery evidence');
 for(const status of ['paid','invoiced'])assert.equal(serviceDates({...legacy,status}).stage,'booked','financial closeout alone cannot replace the filed service stage');
 const archiveStore={loads:[{id:'archive',loadNo:'ARCHIVE',status:'archived',operationalStatus:'closed',gross:4000}]};
 const archive=businessLoadRows(archiveStore,operationalCandidateContext(state,archiveStore,{day:'2026-10-16',minute:100}))[0];
 assert.equal(archive.status,'archived');assert.equal(archive.operationalStatus,'closed');assert.equal(archive.gross,4000);assert.deepEqual(archiveStore.loads[0],{id:'archive',loadNo:'ARCHIVE',status:'archived',operationalStatus:'closed',gross:4000});
 assert.deepEqual({state,store},before);
});
test('a newer explicit filing applies to mirrored metadata before grouping, without copying an original',()=>{
 const current={local_id:'device-row',client_document_id:'same-file',sha256:'d'.repeat(64),type:'bol',load_no:'OLD',updated_at:'2026-10-16T03:00:00Z',
  extracted:{loadNo:'OLD',evidenceFactsV1:{version:1,fields:{loadNo:'OLD'}}},evidenceFilingV1:{version:1,confirmed:true,category:'bol',loadNo:'NEW',date:'2026-10-12',updatedAt:'2026-10-16T03:00:00Z'}};
 const mirror={id:'business-row',clientDocumentId:'same-file',sha256:'d'.repeat(64),type:'bol',loadNo:'OLD',updatedAt:1},before=structuredClone([current,mirror]);
 const docs=projectDocumentFilings([current,mirror]);assert(docs.every(doc=>doc.load_no==='NEW'));
 assert.equal(docs[0].extracted.evidenceFactsV1.fields.loadNo,'OLD','original reviewed facts remain attributed to their prior load');
 const model=reconcileLoadFoldersV10974({loads:[{loadNo:'OLD'},{loadNo:'NEW'}],documents:[current],businessStore:{documents:[mirror]}});
 assert.equal(model.allDocuments.length,1);assert.equal(model.folders.find(folder=>folder.loadNo==='OLD').documents.length,0);assert.equal(model.folders.find(folder=>folder.loadNo==='NEW').documents.length,1);
 assert.equal(localFileRecord(model.allDocuments[0],[current]),current,'save targets the actual local ID rather than its business mirror ID');
 assert.equal(localFileRecord(mirror,[current,{...current,local_id:'conflicting-row'}]),null,'ambiguous stored identities cannot be edited silently');
 assert.deepEqual([current,mirror],before);
});
test('an explicit empty load filing cannot revive an older extracted shipment number',()=>{
 const doc={local_id:'receipt',load_no:'OLD',type:'bol',extracted:{loadNo:'OLD',canonicalLoadNo:'OLD'},evidenceFilingV1:{version:1,confirmed:true,category:'repair',loadNo:'',date:'2026-10-12'}};
 const model=reconcileLoadFoldersV10974({loads:[{loadNo:'OLD'}],documents:[doc]});
 assert.equal(model.folders[0].documents.length,0);assert.equal(catalog(model.allDocuments,{})[0].loadNo,'');assert.equal(model.reviewItems.length,1);
});
