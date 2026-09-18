import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,textObservation,resolveEvidence,confirmField} from '../src/index.js';
import {referenceDiscrepancies} from '../src/referenceDiscrepancies.js';
import {reviewQueue,savedReadingReview} from '../src/recovery.js';
import {rateInput,rateText} from './rate-confirmation-fixture.mjs';
function packet(){const input=rateInput(rateText.replace('SYNTHETIC-REFERENCE','SYNTHETIC-ABO12'));input.pages.push({id:'signature',observations:[textObservation('SIGNATURE PAGE\nDocument Ref: SYNTHETIC-AB012')]});return readDocument(input);}
const confirm=(result,value)=>{const group=result.documents[1],f=group.fields.documentReference;return confirmField(result,{documentId:result.documentId,groupId:group.id,field:'documentReference',rawValue:value,evidence:f.candidates[0].evidence[0],userConfirmed:true,expectedRawValues:f.candidates.map(c=>c.rawValue),expectedRevision:result.reviewRevision});};
test('letter O versus number 0 creates a review warning without normalizing either source',()=>{
 const result=packet(),before=JSON.stringify(result),w=referenceDiscrepancies(result);
 assert.equal(w.length,1);assert.equal(w[0].value,'SYNTHETIC-AB012');assert.equal(w[0].expected,'SYNTHETIC-ABO12');
 assert.ok(reviewQueue(result).some(q=>q.groupId==='document-2'&&q.key==='documentReference'));
 for(const e of [...w[0].primaryEvidence,...w[0].supportingEvidence])resolveEvidence(result,e);
 assert.equal(JSON.stringify(result),before);assert.equal(result.documents.length,2);assert.equal(result.documents[1].fields.documentReference.value,'SYNTHETIC-AB012');
});
test('an explicit corrected reference clears the derived warning using the current review',()=>{
 const corrected=confirm(packet(),'SYNTHETIC-ABO12');assert.equal(referenceDiscrepancies(corrected).length,0);
 assert.ok(!reviewQueue(corrected).some(q=>q.groupId==='document-2'&&q.key==='documentReference'));
 assert.equal(corrected.corrections[0].sourceQuote,'SYNTHETIC-AB012');
});
test('confirming an actually different reference retains an informational warning without re-queuing it',()=>{
 const corrected=confirm(packet(),'SYNTHETIC-AB012');assert.equal(referenceDiscrepancies(corrected)[0].status,'confirmed_difference');
 assert.ok(!reviewQueue(corrected).some(q=>q.groupId==='document-2'&&q.key==='documentReference'));
 assert.equal(savedReadingReview(corrected).referenceWarnings[0].value,'SYNTHETIC-AB012');
});
test('multiple primary documents never infer signature ownership from similar references',()=>{
 const input=rateInput(rateText.replace('SYNTHETIC-REFERENCE','SYNTHETIC-ABO12'));
 input.pages.push({id:'second-rate',observations:[textObservation(rateText)]},{id:'signature',observations:[textObservation('SIGNATURE PAGE\nDocument Ref: SYNTHETIC-AB012')]});
 assert.deepEqual(referenceDiscrepancies(readDocument(input)),[]);
});
test('unrelated identifiers and conflicting primary anchors have no similarity-based merge',()=>{
 const input=rateInput(rateText.replace('SYNTHETIC-REFERENCE','SYNTHETIC-ABO12'));
 input.pages.push({id:'signature',observations:[textObservation('SIGNATURE PAGE\nDocument Ref: OTHER-REFERENCE')]});
 assert.deepEqual(referenceDiscrepancies(readDocument(input)),[]);
 input.pages[0].observations.push(textObservation('Document Ref: SYNTHETIC-AB012',{id:'conflicting-reference'}));
 assert.deepEqual(referenceDiscrepancies(readDocument(input)),[]);
});


test('lowercase and mixed-case O/0 references queue a warning without changing source strings',()=>{
 for(const [expected,value]of [['synthetic-abo12','synthetic-ab012'],['Synthetic-AbO12','synthetic-ab012'],['synthetic-ab012','SYNTHETIC-ABo12']]){
  const input=rateInput(rateText.replace('SYNTHETIC-REFERENCE',expected));
  input.pages.push({id:'signature',observations:[textObservation('SIGNATURE PAGE\nDocument Ref: '+value)]});
  const result=readDocument(input),before=JSON.stringify(result),warnings=referenceDiscrepancies(result);
  assert.equal(warnings.length,1);assert.equal(warnings[0].value,value);assert.equal(warnings[0].expected,expected);
  assert.ok(reviewQueue(result).some(q=>q.groupId==='document-2'&&q.key==='documentReference'));
  for(const e of [...warnings[0].primaryEvidence,...warnings[0].supportingEvidence])resolveEvidence(result,e);
  assert.equal(JSON.stringify(result),before);
 }
});
test('case-only reference differences do not fabricate an O/0 warning',()=>{
 const input=rateInput(rateText.replace('SYNTHETIC-REFERENCE','synthetic-abo12'));
 input.pages.push({id:'signature',observations:[textObservation('SIGNATURE PAGE\nDocument Ref: SYNTHETIC-ABO12')]});
 const result=readDocument(input);
 assert.deepEqual(referenceDiscrepancies(result),[]);
 assert.equal(result.documents[1].fields.documentReference.value,'SYNTHETIC-ABO12');
});


test('case-only primary observations retain all raw anchors while detecting a supporting O/0 difference',()=>{
 const input=rateInput(rateText.replace('SYNTHETIC-REFERENCE','SYNTHETIC-ABO12'));
 input.pages[0].observations.push(textObservation('Document Ref: synthetic-abo12',{id:'lowercase-read'}));
 input.pages.push({id:'signature',observations:[textObservation('SIGNATURE PAGE\nDocument Ref: synthetic-ab012')]});
 const result=readDocument(input),before=JSON.stringify(result),warnings=referenceDiscrepancies(result);
 assert.equal(warnings.length,1);assert.equal(warnings[0].expected,'SYNTHETIC-ABO12');
 assert.deepEqual(warnings[0].expectedVariants,['SYNTHETIC-ABO12','synthetic-abo12']);
 assert.deepEqual(warnings[0].primaryEvidence.map(e=>e.quote),['SYNTHETIC-ABO12','synthetic-abo12']);
 for(const e of warnings[0].primaryEvidence)resolveEvidence(result,e);
 assert.ok(reviewQueue(result).some(q=>q.groupId==='document-2'&&q.key==='documentReference'));
 assert.equal(JSON.stringify(result),before);
});
test('folding primary anchor case never folds an actual O/0 conflict',()=>{
 const input=rateInput(rateText.replace('SYNTHETIC-REFERENCE','SYNTHETIC-ABO12'));
 input.pages[0].observations.push(textObservation('Document Ref: synthetic-ab012',{id:'different-read'}));
 input.pages.push({id:'signature',observations:[textObservation('SIGNATURE PAGE\nDocument Ref: synthetic-ab012')]});
 assert.deepEqual(referenceDiscrepancies(readDocument(input)),[]);
});
