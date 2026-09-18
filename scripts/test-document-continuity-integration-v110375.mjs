import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {reviewScanAnalysis} from '../source/src/modules/scan/ownedReaderAdapter.js';
import {confirmField,resolveEvidence} from '../packages/smart-reader-core/src/index.js';
import {restoreConfirmedReading} from '../packages/smart-reader-core/src/continuity.js';
import {savedReadingReview,reviewQueue} from '../packages/smart-reader-core/src/recovery.js';
import {referenceDiscrepancies} from '../packages/smart-reader-core/src/referenceDiscrepancies.js';
import {rateText} from '../packages/smart-reader-core/test/rate-confirmation-fixture.mjs';

const texts=[rateText.replace('SYNTHETIC-REFERENCE','SYNTHETIC-ABO12'),'SIGNATURE PAGE\nDocument Ref: SYNTHETIC-AB012'];
const analysis={text:texts.map((text,i)=>`[[PAGE:${i+1}]]\n${text}`).join('\n'),pageCount:2,pages:texts.map((text,i)=>({page:i+1,text}))};
function read(documentId){return reviewScanAnalysis(analysis,{documentId,originalSources:{'page-1':`${documentId}:page-1:original`,'page-2':`${documentId}:page-2:original`}});}
function confirmedSummary(value){
  const result=read('previous'),group=result.documents.find(d=>d.kind==='signature_page'),field=group.fields.documentReference;
  return savedReadingReview(confirmField(result,{documentId:result.documentId,groupId:group.id,field:'documentReference',rawValue:value,
    evidence:field.candidates[0].evidence[0],userConfirmed:true,expectedRawValues:field.candidates.map(c=>c.rawValue),expectedRevision:result.reviewRevision}));
}

test('restored reference keeps the new original source and clears only the confirmed discrepancy',()=>{
  const next=read('reread'),before=structuredClone(next);
  assert.equal(referenceDiscrepancies(next).length,1);
  const restored=restoreConfirmedReading(next,confirmedSummary('SYNTHETIC-ABO12'));
  const group=restored.documents.find(d=>d.kind==='signature_page'),field=group.fields.documentReference;
  assert.equal(field.value,'SYNTHETIC-ABO12');assert.equal(field.correction.confirmed,true);
  assert.equal(field.correction.evidence.sourceImageId,'previous:page-2:original');
  assert.equal(referenceDiscrepancies(restored).length,0);
  assert.ok(!reviewQueue(restored).some(item=>item.groupId===group.id&&item.key==='documentReference'));
  assert.deepEqual(field.candidates,before.documents.find(d=>d.kind==='signature_page').fields.documentReference.candidates);
  for(const evidence of field.candidates.flatMap(candidate=>candidate.evidence)){
    assert.equal(evidence.sourceImageId,'reread:page-2:original');assert.equal(evidence.box,null);resolveEvidence(restored,evidence);
  }
  assert.equal(restored.documents.length,2);assert.equal(group.canAutoFile,false);assert.deepEqual(next,before);
});
test('a retained genuinely different reference remains explicit and never joins document pages',()=>{
  const restored=restoreConfirmedReading(read('reread'),confirmedSummary('SYNTHETIC-AB012'));
  assert.equal(referenceDiscrepancies(restored)[0].status,'confirmed_difference');
  assert.equal(savedReadingReview(restored).referenceWarnings[0].value,'SYNTHETIC-AB012');
  assert.equal(restored.documents.length,2);assert.ok(restored.documents.every(d=>!d.canAutoFile));
});
test('compiled-source wiring retains original binding, discrepancy review and saved confirmations together',()=>{
  const source=fs.readFileSync('source/src/modules/scan/OwnedReaderPreview.jsx','utf8');
  assert.ok(source.includes('retainedReviewPageSources(analysis)'));
  assert.ok(source.includes('previousReadings.reduce((value,previous)=>restoreConfirmedReading(value,previous),reviewScanAnalysis(analysis,{documentId,dimensions,originalSources}))'));
  assert.ok(source.includes('const referenceWarnings=referenceDiscrepancies(result)'));
  assert.ok(source.includes('Review saved value'));
  const meta=JSON.parse(fs.readFileSync('public/app-version.json','utf8'));
  assert.equal(meta.version,'110.3.75');assert.equal(meta.build,'v110375-document-continuity-integrated');
});
