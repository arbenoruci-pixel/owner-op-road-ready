import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewedReferenceAliases,deliveryStopCoverage,uniqueLoadRecordIds,safeDocumentAssignment} from '../../source/src/modules/owneros/linkageConsistencyV1.js';
import {freightReferenceCatalog,sameFreightReference} from '../../source/src/core/routes/teamPickupV110445.js';
import {archiveRefs,archiveLoadDays,projectArchiveState} from '../../source/src/modules/owneros/archiveEvidenceV1103.js';
import {buildEvidence} from '../../source/src/modules/owneros/evidenceCoreV110413.js';
import {normalizeBusinessStore,updateBusinessRecord,removeBusinessRecord} from '../../source/src/modules/business/businessStore.js';
import {loadView} from '../../source/src/modules/owneros/driverDocumentsV110415.js';
const sha='a'.repeat(64),fields={date:'2026-10-20',loadNo:'LOAD-1',poNumber:'PO-123',reference:'BOL-1',origin:'Alpha, IL',destination:'Beta, NJ',podSigned:true};
const doc=(kind='bol',f=fields,id='source')=>({id,loadNo:f.loadNo,type:kind,sha256:sha,extracted:{evidenceFactsV1:{version:1,source:'driver_review',sourceSha256:sha,reviewedAt:'2026-10-21T12:00:00Z',fields:f,components:[{kind,fields:f,reviewed:true,pages:[1]}]}}});
test('reviewed PO and BOL connect home and archive without changing saved events',()=>{
 const store={loads:[{loadNo:'LOAD-1',pickupDate:'2026-10-20'}],documents:[doc()]};
 const aliases=reviewedReferenceAliases(store),catalog=freightReferenceCatalog(store);
 assert.equal(aliases['PO-123'],'LOAD-1');assert.equal(aliases['BOL-1'],'LOAD-1');
 assert.ok(sameFreightReference({bol:'PO-123'},{loadNo:'LOAD-1'},{freightReferences:catalog},'2026-10-20'));
 const state={eventsByDay:{'2026-10-20':[{id:'pickup',status:'ON',startMin:100,endMin:120,bol:'PO-123'}]}};
 const before=JSON.stringify(state);assert.deepEqual(archiveRefs({bol:'PO-123'},aliases),['LOAD-1']);
 assert.deepEqual(archiveLoadDays(projectArchiveState(state,aliases),'LOAD-1'),['2026-10-20']);assert.equal(JSON.stringify(state),before);
});
test('unreviewed fields, stale checksum and shared PO cannot silently join loads',()=>{
 const base={loads:[{loadNo:'LOAD-1'},{loadNo:'LOAD-2'}]};
 const a=doc(),b=doc('bol',{...fields,loadNo:'LOAD-2'},'other');
 assert.equal(reviewedReferenceAliases({...base,documents:[a,b]})['PO-123'],undefined);
 b.extracted.evidenceFactsV1.sourceSha256='b'.repeat(64);assert.equal(reviewedReferenceAliases({...base,documents:[b]})['PO-123'],undefined);
 a.extracted.poNumber='OCR-GUESS';assert.equal(reviewedReferenceAliases({...base,documents:[a]})['OCR-GUESS'],undefined);
 a.extracted.evidenceFactsV1.reviewedAt='';assert.deepEqual(reviewedReferenceAliases({...base,documents:[a]}),{});
});
test('one receiver proof in two packets does not cover two delivery stops',()=>{
 const load={loadNo:'LOAD-1',pickupDate:'2026-10-20',deliveryDate:'2026-10-21',stops:[{type:'delivery',sequence:1},{type:'delivery',sequence:2}]};
 const a=doc('pod',{...fields,stopSequence:2}),b=doc('pod',{...fields,stopSequence:2},'copy');
 const store={loads:[load],documents:[a,b]};
 let model=buildEvidence({loads:[load],documents:[a,b],businessStore:store,today:'2026-10-22'});
 assert.equal(model.checks.find(c=>c.kind==='pod').status,'review');assert.match(model.checks.find(c=>c.kind==='pod').detail,/1 of 2/);
 b.extracted.evidenceFactsV1.components[0].fields={...fields,stopSequence:1};
 model=buildEvidence({loads:[load],documents:[a,b],businessStore:store,today:'2026-10-22'});
 assert.equal(model.checks.find(c=>c.kind==='pod').status,'ready');
});
test('legacy multistop route remains reviewable until stops and proof are mapped',()=>{
 const load={loadNo:'LOAD-1',status:'invoiced',origin:'Alpha, IL',destination:'Beta, NJ / Gamma, NY',pickupDate:'2026-10-20',deliveryDate:'2026-10-21'};
 const docs=[doc('pod')];const before=JSON.stringify(load);
 const view=loadView(load,docs,{loads:[load],documents:docs},'2026-10-22');
 assert.equal(view.rows.find(r=>r.kind==='pod').status,'review');assert.equal(view.service,'Delivery proof needs review');assert.doesNotMatch(view.cardDate,/Delivered/);assert.equal(JSON.stringify(load),before);
 assert.equal(deliveryStopCoverage({destination:'Beta, NJ'},[{fields:{}}]).complete,true);
});
test('duplicate load IDs are preserved as separate stable records and cannot fan out writes',()=>{
 const raw={loads:[{id:'same',loadNo:'A',status:'booked'},{id:'same',loadNo:'B',status:'booked'}]};
 const normalized=normalizeBusinessStore(raw),ids=normalized.loads.map(l=>l.id);
 assert.equal(new Set(ids).size,2);assert.equal(normalized.loads.length,2);assert.deepEqual(uniqueLoadRecordIds(normalized),normalized);
 assert.throws(()=>updateBusinessRecord(raw,'loads','same',{status:'paid'}),/ambiguous or stale/);
 assert.throws(()=>removeBusinessRecord(raw,'loads','same'),/ambiguous or stale/);
 const updated=updateBusinessRecord(normalized,'loads',ids[0],{status:'paid'});assert.deepEqual(updated.loads.map(l=>l.status),['paid','booked']);
 assert.equal(removeBusinessRecord(updated,'loads',ids[0]).loads[0].loadNo,'B');assert.equal(raw.loads[0].id,'same');
});
test('duplicate document IDs cannot apply an ID-only filing overlay to different loads',()=>{
 const docs=[{id:'same',loadNo:'A',sha256:sha},{id:'same',loadNo:'B'}];const a={documentId:'same',loadNo:'C'};
 assert.equal(safeDocumentAssignment(docs[0],a,docs,d=>d.id,d=>d.loadNo),null);
 assert.equal(safeDocumentAssignment(docs[0],a,[docs[0]],d=>d.id,d=>d.loadNo),a);
});
import {componentsAfterReview,reviewFieldNames} from '../../source/src/modules/owneros/linkageConsistencyV1.js';
import {canonicalArchiveLoad} from '../../source/src/modules/owneros/archiveEvidenceV1103.js';
import {hasReviewedEvidence} from '../../source/src/modules/owneros/evidenceCoreV110413.js';
test('archive resolution follows only requested references and safely stops cycles',()=>{
 let unrelatedReads=0;
 const aliases={A:'B',B:'C',LOOP:'BACK',BACK:'LOOP','178564':''};
 Object.defineProperty(aliases,'UNRELATED',{enumerable:true,get(){unrelatedReads++;return 'IGNORED';}});
 assert.equal(canonicalArchiveLoad('',aliases),'');assert.equal(canonicalArchiveLoad(' a ',aliases),'C');
 assert.equal(canonicalArchiveLoad('LOOP',aliases),'LOOP');assert.equal(canonicalArchiveLoad('178564',aliases),'178564');
 assert.equal(canonicalArchiveLoad('178564',{}),'424590-1');assert.equal(unrelatedReads,0);
});
test('Home can use reviewed BOL evidence despite an older workflow status',()=>{
 const bol={...doc(),status:'needs_review',reviewStatus:'needs_review'};
 assert.equal(hasReviewedEvidence(bol,['bol','pod'],'LOAD-1',{loads:[{loadNo:'LOAD-1'}]}),true);
 bol.extracted.evidenceFactsV1.sourceSha256='b'.repeat(64);
 assert.equal(hasReviewedEvidence(bol,['bol','pod'],'LOAD-1'),false);
});
test('correcting a single original updates its reviewed component while preserving packet page facts',()=>{
 const parts=[{kind:'bol',pages:[1],reviewed:true,fields:{poNumber:'OLD'}}];
 const result=componentsAfterReview(parts,'bol',{poNumber:'CORRECT'});
 assert.equal(result[0].fields.poNumber,'CORRECT');assert.deepEqual(result[0].pages,[1]);assert.equal(parts[0].fields.poNumber,'OLD');
 const packet=[...parts,{kind:'pod',pages:[2],reviewed:true,fields:{stopSequence:2}}];
 assert.equal(componentsAfterReview(packet,'bol',{poNumber:'CORRECT'}),packet);
 assert.ok(reviewFieldNames('bol',['loadNo']).includes('poNumber'));
});
test('an older mirror cannot revive the corrected reference of the same original',()=>{
 const old=doc(),latest=structuredClone(old);latest.extracted.evidenceFactsV1.reviewedAt='2026-10-22T12:00:00Z';latest.extracted.evidenceFactsV1.fields.poNumber='CORRECT-PO';latest.extracted.evidenceFactsV1.components[0].fields.poNumber='CORRECT-PO';
 const aliases=reviewedReferenceAliases({loads:[{loadNo:'LOAD-1'}],documents:[old]},[latest]);
 assert.equal(aliases['CORRECT-PO'],'LOAD-1');assert.equal(aliases['PO-123'],undefined);
});
