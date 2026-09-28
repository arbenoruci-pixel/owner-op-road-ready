import assert from 'node:assert/strict';
import {reviewedLoadAliases} from '../../source/src/modules/owneros/loadAliasesV110416.js';
import {reconcileLoadFoldersV10974 as reconcile} from '../../source/src/modules/owneros/loadFolderReconciliationV10974.js';
import {documentWeeks} from '../../source/src/modules/owneros/documentWeeksV110416.js';
import {selectTransfer,mergeRecords} from '../../source/src/modules/owneros/transferCoreV110412.js';
import {normalizeBusinessStore} from '../../source/src/modules/business/businessStore.js';

const hash='a'.repeat(64);
const renameDoc=(from,to)=>({local_id:'doc-'+from,client_document_id:'client-'+from,load_no:to,type:'bol',document_type:'bol',document_date:'2026-09-25',sha256:hash,
  extracted:{evidenceFactsV1:{source:'source_recovery',reviewedAt:'2026-09-27',sourceSha256:hash,fields:{loadNo:to}}},
  auditTrail:[{action:'evidence_review',source:'source_recovery',before:{loadNo:from},after:{loadNo:to}}]});
const store={loads:[
  {id:'transfer-load-BOL100',loadNo:'LOAD100',broker:'Example A',pickupDate:'2026-09-25',deliveryDate:'2026-09-28',documentWorkflowStage:'picked_up',documentTransferDays:['2026-09-25','2026-09-28']},
  {id:'transfer-load-BOL200',loadNo:'LOAD200',broker:'Example B',pickupDate:'2026-09-24',deliveryDate:'2026-09-25',documentWorkflowStage:'delivered',documentTransferDays:['2026-09-24','2026-09-25']},
  {id:'expected',loadNo:'EMPTY300',documentTransferDays:['2026-09-25']},
  {id:'cancelled',loadNo:'TONU400',documentWorkflowStage:'tonu',documentTransferDays:['2026-09-14']}
],documents:[],fuel:[],expenses:[]};
const documents=[renameDoc('BOL100','LOAD100'),renameDoc('BOL200','LOAD200'),{local_id:'cancelled-invoice',load_no:'TONU400',type:'invoice',document_date:'2026-09-25'}];
const state={eventsByDay:{'2026-09-25':[{id:'pickup',loadNo:'BOL100',status:'ON',note:'Pickup',startMin:600,endMin:620}]},routeLegsByDay:{'2026-09-25':[{id:'route-old-a',loadNo:'BOL100',date:'2026-09-25'}],'2026-09-24':[{id:'route-old-b',loadNo:'BOL200',date:'2026-09-24'}]}};
const initial=JSON.stringify({store,documents,state});
function model(business=store,docs=documents,logs=state){return reconcile({loads:business.loads,documents:docs,state:logs,businessStore:business});}
function weeks(m){return documentWeeks(m.folders,m.archiveState,{...m.evidenceStore,documents:m.allDocuments});}
const result=model();
assert.deepEqual(result.folders.map(f=>f.loadNo).sort(),['EMPTY300','LOAD100','LOAD200','TONU400'],'legacy BOL folders are merged only with the proven renamed load');
assert.deepEqual(weeks(result).map(w=>[w.id,w.items.map(f=>f.loadNo).sort()]),[['2026-09-21',['EMPTY300','LOAD100','LOAD200']],['2026-09-14',['TONU400']]]);
assert.equal(weeks(result)[1].documents[0].local_id,'cancelled-invoice','invoice stays with its service week');
assert.equal(result.folders.find(f=>f.loadNo==='EMPTY300').documents.length,0,'a real missing-document load stays visible');
assert.equal(JSON.stringify({store,documents,state}),initial,'projection never writes source records, aliases or logbook events');

// Missing aliases on an older export can be recovered from the explicit applied
// recovery history, even when a corrected business row still has its original ID.
const history={...store,evidenceRecoveryHistory:[{id:'reviewed',aliases:[{from:'BOL100',to:'LOAD100'},{from:'BOL200',to:'LOAD200'}]}]};
const reloaded=normalizeBusinessStore(JSON.parse(JSON.stringify(history)));
assert.equal(model(reloaded,[]).folders.length,4);
assert.deepEqual(reviewedLoadAliases({evidenceAliases:[{from:'X',to:'Y'},{from:'Y',to:'X'}]}),{});
assert.deepEqual(reviewedLoadAliases({evidenceRecoveryHistory:[{aliases:[{from:'X',to:'Y'},{from:'X',to:'Z'}]}]}),{});
assert.deepEqual(reviewedLoadAliases({evidenceAliases:[{from:'X',to:'Z'}],evidenceRecoveryHistory:[{aliases:[{from:'X',to:'Y'}]}]}),{X:'Z'});
assert.equal(reviewedLoadAliases(store,[{...documents[0],auditTrail:[]}]).BOL100,undefined,'no identity inference from route, current reference or ID alone');
const alreadyOrganized=structuredClone(documents[0]);alreadyOrganized.auditTrail=[];alreadyOrganized.extracted.evidenceFactsV1.fields.reference='BOL100';
assert.equal(reviewedLoadAliases(store,[alreadyOrganized]).BOL100,'LOAD100','a reviewed BOL reference plus original transfer ID also proves the recovered rename');
assert.equal(reviewedLoadAliases(store,[{...documents[0],sha256:'b'.repeat(64)}]).BOL100,undefined,'a changed source cannot establish a rename');
const regularMove=structuredClone(documents[0]);regularMove.auditTrail[0].source='driver_review';
assert.equal(reviewedLoadAliases(store,[regularMove]).BOL100,undefined,'moving one file never merges two loads');
assert.equal(reviewedLoadAliases({...store,loads:[...store.loads,{id:'separate',loadNo:'BOL100'}]},documents).BOL100,undefined,'independent old load requires review');

// An actual trip crossing Monday belongs to both service weeks. A scheduled
// delivery alone does not make a second folder; its schedule remains on the load.
const crossing=structuredClone(state);crossing.eventsByDay['2026-09-28']=[{id:'delivered',loadNo:'BOL100',status:'ON',deliveryCompleted:true,startMin:600,endMin:620}];
assert.deepEqual(weeks(model(store,documents,crossing)).map(w=>w.id),['2026-09-28','2026-09-21','2026-09-14']);
const documentOnly=model(store,documents,{});
assert.deepEqual(documentOnly.folders.find(f=>f.loadNo==='LOAD100').days,['2026-09-25'],'old transferred planned delivery is not actual activity');
for(const saved of [{status:'booked'},{serviceStatus:'picked_up'},{status:'archived',documentTransferEvidence:{originalStatus:'booked'}}]){
  const legacy=structuredClone(store);Object.assign(legacy.loads[0],saved);delete legacy.loads[0].documentWorkflowStage;
  assert.deepEqual(model(legacy,documents,{}).folders.find(f=>f.loadNo==='LOAD100').days,['2026-09-25'],'legacy service stage excludes a merely planned delivery week');
}

// Current canonical business fields must win if a stale source row is also saved.
const duplicate={...history,loads:[...store.loads,{id:'old',loadNo:'BOL100',broker:'Stale Broker'}]};
assert.equal(model(duplicate).folders.find(f=>f.loadNo==='LOAD100').broker,'Example A');

// Week/load transfer keeps the reviewed mapping on the load itself, so future
// imports cannot revive the BOL folders from unchanged logbook references.
const week=weeks(result)[0];
const selected=selectTransfer({scope:'week',week,folders:result.folders,allDocuments:result.allDocuments,businessStore:result.evidenceStore});
assert.deepEqual(selected.records.loads.find(l=>l.loadNo==='LOAD100').documentTransferAliases,[{from:'BOL100',to:'LOAD100'}]);
const imported=mergeRecords({},selected.records).next;
assert.deepEqual(model(normalizeBusinessStore(JSON.parse(JSON.stringify(imported))),[],state).folders.map(f=>f.loadNo).sort(),['EMPTY300','LOAD100','LOAD200']);
const existing={loads:[{id:'native',loadNo:'LOAD100',broker:'Locally edited'}]};
const merged=mergeRecords(existing,selected.records).next;
assert.equal(merged.loads.find(l=>l.loadNo==='LOAD100').broker,'Locally edited');
assert.equal(reviewedLoadAliases(merged).BOL100,'LOAD100','import keeps the identity mapping when the canonical load is already present');
assert.equal(existing.loads[0].documentTransferAliases,undefined,'import does not mutate the input store');
assert.equal(selected.documents.some(d=>d.load_no==='TONU400'),false,'week export excludes another service week');
console.log('PASS — reviewed aliases after reload/transfer, no ghost folders, service weeks, cross-week actual activity, legitimate empty loads, conflict guards and unchanged originals/logs');
