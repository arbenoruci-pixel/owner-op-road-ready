import assert from 'node:assert/strict';
import {buildEvidence,evidenceFieldLabel} from '../../source/src/modules/owneros/evidenceCoreV110413.js';
import {loadView} from '../../source/src/modules/owneros/driverDocumentsV110415.js';
import {reconcileLoadFoldersV10974 as reconcile} from '../../source/src/modules/owneros/loadFolderReconciliationV10974.js';
import {documentWeeks} from '../../source/src/modules/owneros/documentWeeksV110416.js';

const hash='a'.repeat(64),fields={loadNo:'LOAD300',reference:'BOL55',date:'2026-09-25',origin:'Alpha, NJ',destination:'Beta, IL'};
const doc={local_id:'bol-local',client_document_id:'bol-client',load_no:'LOAD300',loadNo:'BOL55',canonicalLoadNo:'LOAD300',type:'bol',sha256:hash,extracted:{loadNo:'BOL55',canonicalLoadNo:'OLD100',evidenceFactsV1:{version:1,source:'source_recovery',sourceSha256:hash,reviewedAt:'2026-09-27T10:00:00Z',fields,components:[]}}};
const load={id:'native',loadNo:'LOAD300',pickupDate:'2026-09-25',deliveryDate:'2026-09-28',documentWorkflowStage:'picked_up'};
const store={loads:[load],documents:[]};
const build=(d=doc,businessStore=store)=>buildEvidence({documents:[d],loads:businessStore.loads,businessStore,loadNo:d.load_no,today:'2026-09-27'});
const identity=d=>build(d).issues.find(i=>i.id.endsWith(':identity'));
const before=JSON.stringify({doc,store});
assert.equal(identity(doc),undefined,'a reviewed broker assignment supersedes old OCR and mirror numbers');
assert.equal(build().checks.find(c=>c.kind==='bol').status,'ready');
assert.equal(build().checks.find(c=>c.kind==='pod').status,'not_due','a pickup BOL never becomes delivery proof');
for(const source of ['driver_review','source_recovery']) {
  const d=structuredClone(doc);d.extracted.evidenceFactsV1.source=source;
  assert.equal(identity(d),undefined,source+' uses the reviewed source');
}
for(const change of [
  d=>delete d.extracted.evidenceFactsV1,
  d=>d.extracted.evidenceFactsV1.reviewedAt=null,
  d=>d.extracted.evidenceFactsV1.source='ocr_guess',
  d=>d.sha256='b'.repeat(64),
  d=>d.contentHash='b'.repeat(64),
]) {const d=structuredClone(doc);change(d);assert.ok(identity(d),'unreviewed, guessed or changed originals still need review');}
const reassigned=structuredClone(doc);reassigned.load_no=reassigned.loadNo=reassigned.canonicalLoadNo='OTHER900';reassigned.extracted.loadNo=reassigned.extracted.canonicalLoadNo='OTHER900';
assert.match(identity(reassigned).detail,/OTHER900.*LOAD300/,'a later reassignment cannot inherit an old review');
const mixed=structuredClone(doc);mixed.type='supporting_packet';mixed.extracted.evidenceFactsV1.components=[{kind:'bol',reviewed:true,fields},{kind:'bol',reviewed:true,fields:{...fields,loadNo:'OTHER900'}}];
assert.equal(identity(mixed).label,'Document covers more than one load');
const alias=structuredClone(doc);alias.load_no='BOL55';
assert.equal(build(alias,{...store,evidenceAliases:[{from:'BOL55',to:'LOAD300'}]}).issues.some(i=>i.id.endsWith(':identity')),false,'explicit reviewed aliases remain valid');
const separate={...store,loads:[load,{id:'independent',loadNo:'BOL55',pickupDate:'2026-09-14'}]};
const model=reconcile({loads:separate.loads,documents:[doc],businessStore:separate});
assert.deepEqual(model.folders.map(f=>f.loadNo).sort(),['BOL55','LOAD300'],'one document review never merges business loads');
assert.deepEqual(documentWeeks(model.folders,model.archiveState,model.evidenceStore).map(w=>[w.id,w.items.map(f=>f.loadNo)]),[['2026-09-21',['LOAD300']],['2026-09-14',['BOL55']]],'weekly filing remains unchanged');
assert.equal(loadView(model.folders.find(f=>f.loadNo==='LOAD300'),model.allDocuments,model.evidenceStore,'2026-09-27').open.some(i=>i.id.endsWith(':identity')),false,'load cards and evidence use the same decision');
assert.equal(evidenceFieldLabel('bol','reference'),'BOL reference');
assert.equal(evidenceFieldLabel('pod','reference'),'BOL / delivery reference');
assert.equal(evidenceFieldLabel('invoice','reference'),'Invoice number');
assert.equal(evidenceFieldLabel('fuel_receipt','reference'),'Receipt / invoice reference');
assert.equal(JSON.stringify({doc,store}),before,'no source, load or logbook writes');
console.log('PASS — reviewed broker/BOL identity, stale OCR mirrors, changed-source and reassignment guards, mixed packets, independent loads and weekly filing');
