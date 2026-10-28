import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
function patch(p,b,a){const s=read(p);if(s.includes(a))return;assert.equal(s.split(b).length,2,'Linkage anchor: '+p+' '+b.slice(0,60));fs.writeFileSync(p,s.replace(b,()=>a));}
const owner='source/src/modules/owneros/', core=owner+'linkageConsistencyV1.js';
fs.copyFileSync('scripts/linkage-consistency/core.js',core);
const aliases=owner+'loadAliasesV110416.js';
patch(aliases,'// Read-only folder identity.',"import {reviewedReferenceAliases} from './linkageConsistencyV1.js';\n// Read-only folder identity.");
if(!read(aliases).includes('export function reviewedFreightAliases'))fs.appendFileSync(aliases,'\nexport function reviewedFreightAliases(store={},documents=[],overlay={}) { return reviewedReferenceAliases(store,documents,reviewedLoadAliases(store,documents,overlay)); }\n');
const team='source/src/core/routes/teamPickupV110445.js';
patch(team,"import {reviewedLoadAliases}","import {reviewedFreightAliases}");
patch(team,'Object.entries(reviewedLoadAliases(store))','Object.entries(reviewedFreightAliases(store))');
for(const p of [owner+'archiveEvidenceV1103.js']){
  const b="'pickedUpLoadNo','deliveredLoadNo'",a=b+",'bol','bolNo','bolNumber','po','poNumber'";
  let s=read(p);if(!s.includes(a)){assert.equal(s.split(b).length,3);fs.writeFileSync(p,s.replaceAll(b,a));}
}
patch(owner+'loadFolderEngineV10969.js','x.deliveredLoadNo,x.canonicalLoadNo]','x.deliveredLoadNo,x.canonicalLoadNo,x.bol,x.bolNo,x.bolNumber,x.po,x.poNumber]');
const rec=owner+'loadFolderReconciliationV10974.js';
patch(rec,"import {reviewedLoadAliases}","import {safeDocumentAssignment} from './linkageConsistencyV1.js';\nimport {reviewedFreightAliases}");
patch(rec,'reviewedLoadAliases(businessStore,documents,overlay)','reviewedFreightAliases(businessStore,documents,overlay)');
patch(rec,'  const repairedDocs=[];','  const repairedDocs=[];\n  const assignmentSources=[...(documents||[]),...(businessStore.documents||[]).map(normalizeBusinessDoc)];');
patch(rec,'const assignment=assignments.get(docId(rawDoc));','const assignment=safeDocumentAssignment(rawDoc,assignments.get(docId(rawDoc)),assignmentSources,docId,loadOf);');
const evidence=owner+'evidenceCoreV110413.js';
patch(evidence,'// One read-only evidence model',"import {deliveryStopCoverage} from './linkageConsistencyV1.js';\n// One read-only evidence model");
patch(evidence,"notes:'Notes',deliveryAuthorization:","notes:'Notes',poNumber:'PO number',bolNumber:'BOL number',pickupNumber:'Pickup reference',stopId:'Delivery stop ID',stopSequence:'Delivery stop number',deliveryAuthorization:");
patch(evidence,'const verified=matching.some(d=>rule.kinds.some(kind=>coverage(d,kind,ref,resolve)));',`const stopProof=rule.id==='pod'?deliveryStopCoverage(load,matching.flatMap(d=>reviewedEvidenceComponents(d,rule.kinds,ref,businessStore))):null;
      const verified=matching.some(d=>rule.kinds.some(kind=>coverage(d,kind,ref,resolve)))&&(!stopProof?.required||stopProof.complete);`);
patch(evidence,"detail:later?`Expected ${due}`:verified?'Reviewed source on file'","detail:stopProof?.required?stopProof.detail:later?`Expected ${due}`:verified?'Reviewed source on file'");
patch(evidence,"    if(doc.sourceCopyConflictV110419)issue(","    if(all.some(other=>other!==doc&&idOf(other)===id&&loadOf(other)!==loadOf(doc)))issue(id+':record-identity','Document ID has multiple load assignments','Compare the original and its checksum before changing the filing.','load',doc);\n    if(doc.sourceCopyConflictV110419)issue(");
const view=owner+'driverDocumentsV110415.js';
patch(view,"import {supportingFileChecks}","import {deliveryStopCoverage} from './linkageConsistencyV1.js';\nimport {supportingFileChecks}");
patch(view,"  const stage=serviceStage(load);",`  const stopProof=deliveryStopCoverage(load,files.flatMap(d=>reviewedEvidenceComponents(d,['pod','delivery_evidence'],ref,businessStore)));
  const incompleteStops=stopProof.required&&!stopProof.complete;
  const stage=serviceStage(load);`);
patch(view,"const delivered=serviceDates(load).delivered||rows.some(r=>r.kind==='pod'&&r.status==='ready');","const delivered=!incompleteStops&&(serviceDates(load).delivered||rows.some(r=>r.kind==='pod'&&r.status==='ready'));");
patch(view,'cardDate:service.cardDate,','cardDate:incompleteStops?`Pickup ${shortDay(load.pickupDate)||"date not set"} · Delivery proof needs review`:service.cardDate,');
patch(view,"service:load.operationalStatus==='closed'?","service:incompleteStops?'Delivery proof needs review':load.operationalStatus==='closed'?");
const business='source/src/modules/business/businessStore.js';
patch(business,"import {repairBusinessIdentityV110326}","import {uniqueLoadRecordIds,assertUniqueBusinessTarget} from '../owneros/linkageConsistencyV1.js';\nimport {repairBusinessIdentityV110326}");
patch(business,'return repairBusinessIdentityV110326(normalizeBusinessStoreBaseV110326(value));','return uniqueLoadRecordIds(repairBusinessIdentityV110326(normalizeBusinessStoreBaseV110326(value)));');
for(const name of ['updateBusinessRecord','removeBusinessRecord']){
 const sig=name==='updateBusinessRecord'?'store, bucket, id, patch = {}':'store, bucket, id';
 patch(business,`export function ${name}(${sig}) {\n  const current = normalizeBusinessStore(store);`,`export function ${name}(${sig}) {\n  const current = normalizeBusinessStore(store);\n  assertUniqueBusinessTarget(current,bucket,id);`);
}
patch(business,'  const nextRecord = cleanRecord({','  if(record.id && current[bucket]?.some(r=>r.id===record.id))throw Error("This record ID already exists. Choose the existing record or import a distinct original.");\n  const nextRecord = cleanRecord({');
console.log('PASS — reviewed freight references, per-stop proof and unique mutation targets installed');
// The archive resolves millions of references while opening a long logbook.
// Do not copy the entire alias table for each blank field or event reference.
patch(owner+'archiveEvidenceV1103.js',"  const mapping = { '178564':'424590-1', ...aliases };\n  while (mapping[ref] && !seen.has(ref)) { seen.add(ref); ref = text(mapping[ref]).toUpperCase(); }", "  if(!ref)return '';\n  const next = key => Object.hasOwn(aliases,key) ? aliases[key] : key==='178564' ? '424590-1' : null;\n  for(let target=next(ref);target&&!seen.has(ref);target=next(ref)){seen.add(ref);ref=text(target).toUpperCase();}");
const home='source/src/modules/home/AdaptiveHomeV1038.jsx';
patch(home,"import {loadDocumentSummaryV105}","import {hasReviewedEvidence} from '../owneros/evidenceCoreV110413.js';\nimport {loadDocumentSummaryV105}");
patch(home,"documentSummary:currentLoad.identity==='load'?loadDocumentSummaryV105(checklistStore,currentLoad.loadNo):{}", "documentSummary:currentLoad.identity==='load'?{...loadDocumentSummaryV105(checklistStore,currentLoad.loadNo),bolPresent:(checklistStore.documents||[]).some(doc=>hasReviewedEvidence(doc,['bol','pod'],currentLoad.loadNo,checklistStore))}:{}");
const center=owner+'EvidenceCenterV110413.jsx';
patch(center,"import {saveReviewedFacts,", "import {reviewFieldNames} from './linkageConsistencyV1.js';\nimport {saveReviewedFacts,");
patch(center,'CATALOG[kind].fields.map(name=>','reviewFieldNames(kind,CATALOG[kind].fields).map(name=>');
const storage=owner+'evidenceStorageV110413.js';
patch(storage,"import {selectReviewRecord}","import {componentsAfterReview} from './linkageConsistencyV1.js';\nimport {selectReviewRecord}");
patch(storage,"list(current.extracted?.evidenceFactsV1?.components):[];","componentsAfterReview(list(current.extracted?.evidenceFactsV1?.components),kind,fields):[];");
const folders=owner+'LoadFoldersV10969.jsx';
patch(folders,"import {loadView}","import {safeDocumentAssignment} from './linkageConsistencyV1.js';\nimport {loadView}");
patch(folders,"    applyRepairPlanV10975({source:'document_organizer'", "    if(!safeDocumentAssignment(editing.doc,{documentId:id},[...allDocuments,...(businessStore.documents||[])],documentId,documentLoad))throw Error('This document ID has multiple originals or load assignments. Review each source before organizing it.');\n    applyRepairPlanV10975({source:'document_organizer'");
patch(storage,'  const previous=index<0?{}:rows[index];',"  if(rows.filter(d=>idOf(d)===key||d.localDocumentId===doc.local_id||d.id===doc.local_id).length>1)throw Error('Multiple document records share this identity. Review their originals before changing details.');\n  const previous=index<0?{}:rows[index];");
