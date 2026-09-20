import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument} from '../src/index.js';
import {reviewQueue,savedReadingReview} from '../src/recovery.js';
import {reviewSteps} from '../src/reviewSteps.js';
import {measurementReviewProposal,confirmMeasurementGroup} from '../src/measurementReview.js';
import {restoreConfirmedReading} from '../src/continuity.js';

function read(weights=['2,000.25','500.50','2,500.75']){
  return readDocument({documentId:'synthetic-review-steps',pages:[{id:'page',observations:[{id:'source',sourceImageId:'image',lines:[
    'BILL OF LADING','B/L NO: 0012345000','DATE: 08/19/2026','SHIPPER: EXAMPLE FOODS','CONSIGNEE: REGIONAL MARKET',
    ...['TOTAL NET WEIGHT: ','TOTAL TARE: ','TOTAL WEIGHT: '].map((label,i)=>label+weights[i])
  ].map(text=>({text,confidence:.96}))}]}]});
}

test('the main review reaches all three weights in one step, without changing its audit queue',()=>{
  const result=read(),before=structuredClone(result),steps=reviewSteps(result);
  assert.equal(steps.length,1);assert.equal(steps[0].kind,'weights');
  assert.deepEqual(new Set(steps[0].keys),new Set(['weight','netWeight','tareWeight']));
  assert.equal(reviewQueue(result).length,3);assert.equal(savedReadingReview(result).remaining,3);
  assert.deepEqual(result,before);
});

test('missing source images, conflicting numbers and skipped fields keep individual review available',()=>{
  const result=read(),group=result.documents[0];
  assert.equal(reviewSteps(result,{canGroup:()=>false}).length,3);
  assert.ok(reviewSteps(result,{canGroup:()=>false}).every(item=>item.kind==='field'));
  assert.ok(reviewSteps(read(['2,000.25','500.50','2,600.75'])).every(item=>item.kind==='field'));
  const visited=new Set([group.id+':weight']);
  assert.deepEqual(reviewSteps(result,{visited}).map(item=>item.key),['netWeight','tareWeight']);
});

test('skipping a grouped step ends this pass and leaves all three values unconfirmed',()=>{
  const result=read(),step=reviewSteps(result)[0],visited=new Set(step.keys.map(key=>step.groupId+':'+key));
  assert.deepEqual(reviewSteps(result,{visited}),[]);
  assert.equal(reviewQueue(result).length,3);assert.equal(result.corrections.length,0);
  assert.equal(reviewSteps(result).length,1,'opening review again offers the group again');
});

test('group confirmation clears the step and stays cleared after save and reread',()=>{
  for(const unit of ['LB','KG']){
    const result=read(),group=result.documents[0];
    const next=confirmMeasurementGroup(result,{documentId:result.documentId,groupId:group.id,unit,
      expectedRevision:result.reviewRevision,expectedSignature:measurementReviewProposal(group).signature,userConfirmed:true});
    assert.deepEqual(reviewSteps(next),[]);
    const restored=restoreConfirmedReading(read(),savedReadingReview(next));
    assert.deepEqual(reviewSteps(restored),[]);assert.equal(restored.restoredConfirmationCount,3);
    assert.equal(restored.documents[0].fields.weight.value,'2500.75 '+unit);
  }
});

test('unrelated fields keep their order before the grouped weights',()=>{
  const result=read(),group=result.documents[0];
  group.fields.consignee.status='needs_review';group.fields.consignee.issues=['weak_recognition'];
  const steps=reviewSteps(result);
  assert.equal(steps[0].key,'consignee');assert.equal(steps[1].kind,'weights');assert.equal(steps.length,2);
});
