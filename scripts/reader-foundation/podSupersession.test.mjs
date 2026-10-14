import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {evaluatePodSupersession,createVerifiedPodReceipt,podRecordSnapshot,prepareSameOriginalPodPromotion,planPodSupersession,projectPodPrimaryDocuments,stageReviewedPodPromotion,pendingPodDisplay} from './podSupersession.js';
import {verifyPendingPodCheckpoint} from './podCheckpoint.js';
const bytes = new TextEncoder().encode('synthetic signed original').buffer;
const hashBytes = async value => createHash('sha256').update(Buffer.from(value)).digest('hex');
const sha = await hashBytes(bytes), later = '2026-10-14T03:30:00.000Z';
const clone = value => structuredClone(value);
const base = () => ({local_id:'local-one',client_document_id:'doc-one',owner_user_id:'owner-one',type:'bol',document_type:'bol',load_no:'load-A',page_count:2,
  sha256:sha,file_size_bytes:bytes.byteLength,mime_type:'application/pdf',status:'active',extracted:{type:'bol',loadNo:'load-A'},customMetadata:{keep:'yes'}});
const promotion = () => prepareSameOriginalPodPromotion({bol:base(),fields:{loadNo:'LOAD-A',reference:'BOL-42',podSigned:true},reviewedAt:'2026-10-14T03:20:00.000Z',verificationId:'review-one',receiverSignatureConfirmed:true});
const ref = doc => ({version:1,ownerId:'owner-one',sha256:doc.sha256,bytes:doc.file_size_bytes,objectKey:'account_file:original'});
async function fixture({different=false} = {}) {
  const prepared = promotion(), bol = prepared.original, pod = prepared.candidate, lineage = prepared.lineage;
  if (different) {
    pod.local_id = 'local-two';pod.client_document_id = 'doc-two';
    lineage.targetDocumentId = 'doc-two';lineage.relation = 'signed_version_of';lineage.targetSnapshot = podRecordSnapshot(pod);
  }
  const receipt = await createVerifiedPodReceipt({bol,pod,lineage,ownerId:'owner-one',revision:5,hashBytes,now:() => later,
    readBack:async ({documentId,previousVersion}) => ({ownerId:'owner-one',revision:5,document:previousVersion||documentId==='doc-one'&&different?bol:pod,original:bytes,contentReference:ref(pod)})});
  return {bol,pod,lineage,receipt};
}
test('same-original promotion stages one identity and no new upload', () => {
  const before = base(), saved = clone(before), p = promotion();
  assert.equal(p.operation,'metadata_only');assert.equal(p.uploadRequired,false);assert.equal(p.applyAfterVerification,true);
  assert.equal(p.candidate.client_document_id,p.original.client_document_id);assert.equal(p.candidate.sha256,p.original.sha256);
  assert.deepEqual(p.previousVersion,base());assert.deepEqual(before,saved);
});
test('verified persisted same-original promotion retains BOL metadata in history',async () => {
  const f = await fixture(), before = clone(f), plan = planPodSupersession(f);
  assert.equal(plan.eligible,true);assert.equal(plan.records.length,1);assert.equal(plan.deleteOriginal,false);assert.equal(plan.uploadRequired,false);
  assert.deepEqual(plan.previousVersion.customMetadata,{keep:'yes'});assert.deepEqual(f,before);
  const shown = projectPodPrimaryDocuments(plan.records);assert.equal(shown.primaryDocuments.length,1);assert.equal(shown.previousVersions.length,1);assert.equal(shown.conflicts.length,0);
});
test('different saved scan needs explicit lineage, not byte equality or number',async () => {
  const f = await fixture({different:true}), plan = planPodSupersession(f), shown = projectPodPrimaryDocuments(plan.records);
  assert.equal(shown.primaryDocuments.length,1);assert.equal(shown.primaryDocuments[0].client_document_id,'doc-two');
  assert.equal(shown.allDocuments.length,2);assert.equal(shown.previousVersions[0].document.client_document_id,'doc-one');
});
const cases = [
  ['missing receipt',f=>delete f.receipt,'verified_persisted_sync_receipt_required'],
  ['same load and BOL reference are insufficient',f=>delete f.lineage,'explicit_verified_lineage_required'],
  ['OCR confidence is not driver lineage',f=>f.lineage.verifiedBy='ai','explicit_verified_lineage_required'],
  ['unsigned delivery acknowledgement',f=>f.pod.extracted.evidenceFactsV1.fields.podSigned=false,'verified_receiver_signature_required'],
  ['pickup/carrier signature is not receiver signature',f=>{delete f.pod.extracted.evidenceFactsV1.fields.podSigned;f.pod.signaturePresent=true;},'verified_receiver_signature_required'],
  ['classification is not source review',f=>f.pod.extracted.evidenceFactsV1.source='ai','verified_receiver_signature_required'],
  ['changed source checksum',f=>f.bol.sha256='a'.repeat(64),'stale_or_mismatched_lineage'],
  ['conflicting hash aliases',f=>f.pod.content_hash='f'.repeat(64),'verified_original_fingerprint_required'],
  ['missing page count',f=>delete f.pod.page_count,'complete_page_count_required'],
  ['extra signed page',f=>f.pod.page_count=3,'complete_one_to_one_page_lineage_required'],
  ['omitted page',f=>f.lineage.pageMap.pop(),'complete_one_to_one_page_lineage_required'],
  ['duplicate source page',f=>f.lineage.pageMap[1].sourcePage=1,'complete_one_to_one_page_lineage_required'],
  ['duplicate target page',f=>f.lineage.pageMap[1].targetPage=1,'complete_one_to_one_page_lineage_required'],
  ['different load association',f=>f.pod.load_no='load-B','association_mismatch'],
  ['different stop on same load',f=>f.pod.stopSequence=2,'association_mismatch'],
  ['different event association',f=>f.pod.linkedEventId='delivery-other','association_mismatch'],
  ['multi-load packet',f=>f.pod.extracted.evidenceFactsV1.components=[{kind:'bol',fields:{loadNo:'OTHER'}}],'packet_requires_component_review'],
  ['different owner',f=>f.pod.owner_user_id='owner-two','owner_mismatch'],
  ['deleted target',f=>f.pod.deleted=true,'document_unavailable'],
  ['changed review after sync',f=>f.pod.extracted.evidenceFactsV1.fields.reference='changed','stale_or_mismatched_receipt'],
  ['stale verification',f=>f.receipt.verifiedAt='2020-01-01T00:00:00Z','verified_persisted_sync_receipt_required'],
  ['no archive revision',f=>f.receipt.revision=0,'verified_persisted_sync_receipt_required'],
  ['foreign content reference',f=>f.receipt.targetContent.ownerId='other','recoverable_owned_originals_required'],
  ['same bytes uploaded again instead of reusing original',f=>f.receipt.targetContent.objectKey='account_file:duplicate','reuse_existing_content_required'],
];
for (const [label,mutate,reason] of cases) test('fails closed: '+label,async () => {const f=await fixture();mutate(f);const result=evaluatePodSupersession(f);assert.equal(result.eligible,false);assert.ok(result.reasons.includes(reason),JSON.stringify(result));assert.equal(planPodSupersession(f).records,null);});
test('sync_state alone never permits hiding',async () => {const f=await fixture();delete f.receipt;f.pod.sync_state='synced';assert.equal(evaluatePodSupersession(f).eligible,false);});
test('projection keeps BOL visible when target is missing, ambiguous, or changed',async () => {
  const f=await fixture({different:true}),plan=planPodSupersession(f),[old,pod]=plan.records;
  assert.equal(projectPodPrimaryDocuments([old]).primaryDocuments.length,1);
  assert.equal(projectPodPrimaryDocuments([old,pod,clone(pod)]).primaryDocuments.length,3);
  const changed=clone(pod);changed.extracted.evidenceFactsV1.fields.reference='edited';assert.equal(projectPodPrimaryDocuments([old,changed]).primaryDocuments.length,2);
});
test('distinct documents on the same load stay visible',async () => {
  const f=await fixture({different:true}), plan=planPodSupersession(f), third={...base(),local_id:'local-three',client_document_id:'doc-three'};
  const shown=projectPodPrimaryDocuments([...plan.records,third]);assert.equal(shown.primaryDocuments.length,2);assert.ok(shown.primaryDocuments.includes(third));
});
test('a staged review keeps BOL visible before verification',() => {
  const p=promotion(),staged=stageReviewedPodPromotion(p.original,p.candidate);
  assert.equal(staged.podLifecycleV1.state,'pending_sync');const shown=projectPodPrimaryDocuments([staged]);
  assert.equal(shown.primaryDocuments[0].type,'bol');assert.equal(shown.primaryDocuments[0].podPendingV1.candidate.type,'pod');
});
test('load aliases normalize but conflicting references do not',() => {
  const p=promotion();p.candidate.loadNo='LOAD-A';p.candidate.canonicalLoadNo='LOAD-A';p.candidate.extracted.canonicalLoadNo='LOAD-A';
  assert.equal(stageReviewedPodPromotion(p.original,p.candidate).podLifecycleV1.state,'pending_sync');
  p.candidate.extracted.loadNo='OTHER';assert.equal(stageReviewedPodPromotion(p.original,p.candidate).podLifecycleV1.state,'review_required');
});
async function checkpoint() {
  const p=promotion(),document=stageReviewedPodPromotion(p.original,p.candidate),encoded={__rrAccountFile:1,kind:'Blob',size:bytes.byteLength,mime:'application/pdf',chunks:[{sha256:sha,bytes:bytes.byteLength}]};
  const records={ [JSON.stringify(['table','documents_local',document.local_id])]:clone(document), [JSON.stringify(['table','document_blobs','blob-one'])]:{local_blob_id:'blob-one',client_document_id:'doc-one',blob:encoded} };
  return {document,records,ownerId:'owner-one',revision:7,readFile:async()=>new Blob([bytes]),hashBytes,now:()=>later};
}
test('real account checkpoint adapter verifies remote metadata and bytes without upload',async () => {
  const f=await checkpoint(),saved=clone(f.records);let reads=0;f.readFile=async()=>{reads++;return new Blob([bytes]);};
  const plan=await verifyPendingPodCheckpoint(f);assert.equal(plan.eligible,true);assert.equal(reads,1);assert.deepEqual(saved,f.records);assert.equal(plan.records.length,1);
});
test('account records-only checkpoint cannot finalize a POD',async () => {const f=await checkpoint();f.records={};await assert.rejects(verifyPendingPodCheckpoint(f),/have not synchronized/);});
test('checkpoint missing retained BOL cannot finalize',async () => {const f=await checkpoint();delete Object.values(f.records)[0].podLifecycleV1.previousVersions;await assert.rejects(verifyPendingPodCheckpoint(f),/have not synchronized/);});
test('checkpoint original with corrupted bytes cannot finalize',async () => {const f=await checkpoint();f.readFile=async()=>new Blob(['damaged']);await assert.rejects(verifyPendingPodCheckpoint(f),/failed cloud verification/);});
test('duplicate cloud blob identity cannot finalize',async () => {const f=await checkpoint();f.records[JSON.stringify(['table','document_blobs','blob-two'])]=Object.values(f.records)[1];await assert.rejects(verifyPendingPodCheckpoint(f),/uniquely/);});
test('partial cloud file cannot finalize',async () => {const f=await checkpoint();Object.values(f.records)[1].blob.chunks[0].bytes--;await assert.rejects(verifyPendingPodCheckpoint(f),/complete original/);});
test('failed download keeps staged original unchanged',async () => {const f=await checkpoint(),saved=clone(f.document);f.readFile=async()=>{throw Error('offline');};await assert.rejects(verifyPendingPodCheckpoint(f),/offline/);assert.deepEqual(f.document,saved);assert.equal(pendingPodDisplay(f.document).type,'bol');});
test('a signed new scan can have different bytes only with bound business/page lineage',async()=>{
 const p=promotion(),bol=p.original,pod={...p.candidate,local_id:'local-new',client_document_id:'doc-new'},newBytes=new TextEncoder().encode('a genuinely different signed scan').buffer;
 pod.sha256=await hashBytes(newBytes);pod.file_size_bytes=newBytes.byteLength;pod.extracted=clone(pod.extracted);pod.extracted.evidenceFactsV1.sourceSha256=pod.sha256;pod.extracted.evidenceFactsV1.receiverAcknowledgement.sourceSha256=pod.sha256;
 const lineage={...p.lineage,relation:'signed_version_of',targetDocumentId:'doc-new',targetSha256:pod.sha256,targetSnapshot:podRecordSnapshot(pod)};
 const receipt=await createVerifiedPodReceipt({bol,pod,lineage,ownerId:'owner-one',revision:5,hashBytes,now:()=>later,readBack:async({documentId})=>{
  const source=documentId===bol.client_document_id,document=source?bol:pod;
  return {ownerId:'owner-one',revision:5,document,original:source?bytes:newBytes,contentReference:{...ref(document),objectKey:source?'old-content':'signed-content'}};
 }});
 const plan=planPodSupersession({bol,pod,lineage,receipt});assert.equal(plan.eligible,true);assert.notEqual(bol.sha256,pod.sha256);
 assert.equal(projectPodPrimaryDocuments(plan.records).primaryDocuments.length,1);assert.equal(plan.records.length,2);
});
test('conflicting owner aliases or client identities never establish lineage',async()=>{
 const f=await fixture();f.pod.user_id='owner-two';assert.equal(evaluatePodSupersession(f).eligible,false);
 delete f.pod.user_id;f.pod.clientDocumentId='wrong-id';assert.ok(evaluatePodSupersession(f).reasons.includes('stable_identity_required'));
});
test('pending unsigned review can become signed without losing original BOL history',()=>{
 const p=promotion(),unsigned=clone(p.candidate);unsigned.extracted.evidenceFactsV1.fields.podSigned=false;
 const pending=stageReviewedPodPromotion(p.original,unsigned);assert.equal(pending.podLifecycleV1.state,'review_required');
 const signed=stageReviewedPodPromotion(pending,p.candidate);assert.equal(signed.podLifecycleV1.state,'pending_sync');assert.deepEqual(signed.podLifecycleV1.previousVersions[0],p.original);
});
test('inherited AI podSigned value is not a fresh receiver acknowledgement',()=>{
 const p=promotion(),candidate=clone(p.candidate);delete candidate.extracted.evidenceFactsV1.receiverAcknowledgement;
 const next=stageReviewedPodPromotion(p.original,candidate);assert.equal(next.podLifecycleV1.state,'review_required');
 assert.ok(next.podLifecycleV1.reasons.includes('verified_receiver_signature_required'));assert.equal(projectPodPrimaryDocuments([next]).primaryDocuments[0].type,'bol');
});
test('source signature acknowledgement must bind this original and review timestamp',async()=>{
 const f=await fixture();f.pod.extracted.evidenceFactsV1.receiverAcknowledgement.sourceSha256='f'.repeat(64);
 assert.ok(evaluatePodSupersession(f).reasons.includes('verified_receiver_signature_required'));
 f.pod.extracted.evidenceFactsV1.receiverAcknowledgement.sourceSha256=sha;f.pod.extracted.evidenceFactsV1.receiverAcknowledgement.reviewedAt='2020-01-01T00:00:00Z';
 assert.ok(evaluatePodSupersession(f).reasons.includes('verified_receiver_signature_required'));
});
test('preparing a metadata-only promotion requires explicit fresh receiver confirmation',()=>{
 assert.throws(()=>prepareSameOriginalPodPromotion({bol:base(),fields:{loadNo:'LOAD-A',podSigned:true},reviewedAt:later,verificationId:'unchecked'}),/receiver signature/);
});
