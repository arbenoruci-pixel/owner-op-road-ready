import assert from 'node:assert/strict';
import {projectReviewedCopies,preferredSourceCopy,confirmedSource,selectReviewRecord} from '../../source/src/modules/owneros/sourceCopiesV110419.js';
import {reconcileLoadFoldersV10974 as reconcile} from '../../source/src/modules/owneros/loadFolderReconciliationV10974.js';
import {buildEvidence} from '../../source/src/modules/owneros/evidenceCoreV110413.js';
import {loadView} from '../../source/src/modules/owneros/driverDocumentsV110415.js';
import {documentWeeks} from '../../source/src/modules/owneros/documentWeeksV110416.js';
import {selectTransfer} from '../../source/src/modules/owneros/transferCoreV110412.js';

const fields={loadNo:'LOAD300',reference:'BOL55',date:'2026-09-25',origin:'Alpha, NJ',destination:'Beta, IL'};
const hash='a'.repeat(64);
const old={local_id:'old-local',client_document_id:'old-client',load_no:'LOAD100',type:'bol',sha256:hash,document_date:'2026-09-25',updated_at:'2026-09-28T01:00:00Z',extracted:{loadNo:'BOL55',origin:'to be not'}};
const checked={local_id:'checked-local',client_document_id:'checked-client',load_no:'LOAD300',type:'bol',sha256:hash,document_date:'2026-09-25',extracted:{evidenceFactsV1:{version:1,source:'source_recovery',sourceSha256:hash,reviewedAt:'2026-09-27T10:00:00Z',fields,components:[]}}};
const loads=[{loadNo:'LOAD100',pickupDate:'2026-09-23',deliveryDate:'2026-09-24',notes:'Route discrepancy: confirm actual locations.'},{loadNo:'LOAD300',pickupDate:'2026-09-25',deliveryDate:'2026-09-28',documentWorkflowStage:'picked_up'},{loadNo:'PRIOR500',pickupDate:'2026-09-14'}];
const businessStore={loads,documents:[{id:'mirror',clientDocumentId:old.client_document_id,loadNo:'LOAD100',sha256:hash,type:'bol'}]};
const state={eventsByDay:{'2026-09-23':[{id:'event-1',status:'D',start:600,end:660}]},routeLegsByDay:{}};
const before=JSON.stringify({old,checked,businessStore,state});
const docs=projectReviewedCopies([old,checked]);
assert.equal(docs[0].load_no,'LOAD300');
assert.equal(docs[0].client_document_id,old.client_document_id,'projection preserves original identity');
assert.equal(docs[0].extracted.origin,fields.origin);
assert.equal(preferredSourceCopy(docs[0],checked),checked,'a later sync timestamp never beats the real review');
for(const documents of [[old,checked],[checked,old]]){
  const model=reconcile({loads,documents,businessStore,state});
  assert.equal(model.allDocuments.length,1);
  assert.equal(model.allDocuments[0].client_document_id,'checked-client');
  const wrong=loadView(model.folders.find(f=>f.loadNo==='LOAD100'),model.allDocuments,model.evidenceStore,'2026-09-27');
  assert.equal(wrong.files.length,0,'foreign BOL no longer inflates another load');
  assert.match(wrong.routeNote,/discrepancy/,'real route discrepancy stays visible');
  const right=loadView(model.folders.find(f=>f.loadNo==='LOAD300'),model.allDocuments,model.evidenceStore,'2026-09-27');
  assert.equal(right.files.length,1);assert.equal(right.rows.find(r=>r.kind==='bol').status,'ready');
  assert.equal(right.rows.find(r=>r.kind==='pod').status,'not_due');
  const weeks=documentWeeks(model.folders,model.archiveState,model.evidenceStore);
  assert.deepEqual(weeks.map(w=>w.id),['2026-09-21','2026-09-14'],'service weeks stay separate');
  for(const target of ['LOAD100','LOAD300']){
    const result=selectTransfer({scope:'load',folder:model.folders.find(f=>f.loadNo===target),folders:model.folders,documents,allDocuments:model.allDocuments,businessStore:model.evidenceStore});
    assert.equal(result.documents.length,target==='LOAD100'?0:2,'export retains distinct original identities only in their confirmed load');
    assert.ok(result.documents.every(d=>d.load_no===target));
  }
  const weekExport=selectTransfer({scope:'week',week:weeks[0],folders:model.folders,documents,allDocuments:model.allDocuments,businessStore:model.evidenceStore});
  assert.equal(weekExport.documents.length,2);assert.deepEqual(weekExport.documents.map(d=>d.sha256),[hash,hash]);
}
assert.equal(buildEvidence({documents:[old,checked],loads,businessStore,loadNo:'LOAD100',today:'2026-09-27'}).docs.length,0,'other evidence checklists do not reuse a stale foreign BOL');
// Exact local/client identity can join a compact mirror without a checksum.
const mirror={localDocumentId:checked.local_id,clientDocumentId:checked.client_document_id,loadNo:'LOAD100',type:'bol'};
assert.equal(projectReviewedCopies([mirror,checked])[0].load_no,'LOAD300');
for(const change of [
  d=>d.sha256='b'.repeat(64),
  d=>d.contentHash='b'.repeat(64),
  d=>d.owner_user_id='another-owner',
  d=>d.repairOverlayApplied=true,
  d=>d.type='supporting_packet',
  d=>d.stopSequence=2,
  d=>d.auditTrail=[{action:'document_reassigned',at:'2026-09-28T01:00:00Z'}],
  d=>d.extracted.evidenceFactsV1={...checked.extracted.evidenceFactsV1,sourceSha256:'b'.repeat(64)},
]){const d=structuredClone(old);change(d);assert.equal(projectReviewedCopies([d,checked])[0],d,'changed sources, owner, packet/stop, organizer and later assignments remain visible');}
const unrelated={...old,sha256:'b'.repeat(64),original_file_name:'same-name.pdf'};
assert.equal(projectReviewedCopies([unrelated,{...checked,original_file_name:'same-name.pdf'}])[0],unrelated,'filename/reference similarity alone never files a document');
const conflicting=structuredClone(checked);conflicting.client_document_id='third-client';conflicting.local_id='third-local';conflicting.load_no='LOAD900';conflicting.extracted.evidenceFactsV1.fields.loadNo='LOAD900';
assert.equal(projectReviewedCopies([old,checked,conflicting])[0],old,'different verified owners of an identical packet require review');
const changedAssignment={...checked,load_no:'LOAD900'};
assert.equal(confirmedSource(changedAssignment),false);assert.equal(projectReviewedCopies([changedAssignment,checked])[0],changedAssignment);
assert.ok(buildEvidence({documents:[checked,changedAssignment],loads:[{loadNo:'LOAD900'}],loadNo:'LOAD900',today:'2026-09-27'}).issues.some(i=>i.id.endsWith(':identity')),'an explicit contradictory filing stays visible even when another copy is verified');
const mixed=structuredClone(checked);mixed.extracted.evidenceFactsV1.components=[{kind:'bol',fields:{loadNo:'LOAD900'},reviewed:true}];
assert.equal(projectReviewedCopies([old,mixed])[0],old,'mixed-load pages never authorize an automatic filing');
const revision=structuredClone(checked);revision.extracted.evidenceFactsV1.reviewedAt='2026-09-28T01:00:00Z';revision.extracted.evidenceFactsV1.fields.loadNo=revision.load_no='LOAD400';
assert.equal(projectReviewedCopies([checked,revision])[0].load_no,'LOAD400','a newer review of the same saved original supersedes its mirror');
const ownerCopy={...old,client_document_id:checked.client_document_id,owner_user_id:'different'};
assert.equal(projectReviewedCopies([ownerCopy,{...checked,owner_user_id:'owner'}])[0],ownerCopy);
const oldLocal={...old,client_document_id:checked.client_document_id};
assert.equal(selectReviewRecord([oldLocal,checked],checked,hash),checked,'the exact local row remains editable when an older client-id copy exists');
assert.throws(()=>selectReviewRecord([checked,revision],checked,hash),/disagree/,'a newer review on another row stops a stale save');
assert.throws(()=>selectReviewRecord([{...oldLocal,sha256:'b'.repeat(64)},checked],checked,hash),/disagree/);
assert.throws(()=>selectReviewRecord([oldLocal,checked],{...checked,local_id:'missing'},hash),/disagree/);
assert.equal(JSON.stringify({old,checked,businessStore,state}),before,'projection never writes source records, business loads or logs');
console.log('PASS — stale source copies, compact mirrors, weekly/load filing, export identities, current reviews and conflict/source guards');
