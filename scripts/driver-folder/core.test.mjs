import test from 'node:test';
import assert from 'node:assert/strict';
import {routeStops,podReview,recordedPodReview,originalState,sendStatus,verifyBillingPod} from './folderReview.js';
const sha='a'.repeat(64), other='b'.repeat(64);
const load={id:'test',loadNo:'DEMO-410',notes:'BOL has shipper signature only; receiver-signed POD is still missing. Pickup date differs.'};
const signed={type:'pod',sha256:sha,podSigned:true,loadNo:load.loadNo};
test('an outstanding receiver note blocks packet planning until the matching original is explicitly checked',()=>{
  assert.equal(podReview(load,[signed]).blocked,true);
  assert.throws(()=>verifyBillingPod(load,[signed]),/Receiver signature/);
  const record=recordedPodReview(load,signed,true,0,104);
  const ok={...load,driverFolderPodReviews:{[sha]:record}};
  assert.equal(podReview(ok,[signed]).blocked,false);verifyBillingPod(ok,[signed]);
  assert.throws(()=>verifyBillingPod(ok,[{...signed,sha256:other}]));
  assert.throws(()=>verifyBillingPod({...ok,notes:'Receiver signature is missing.'},[signed]));
  assert.throws(()=>verifyBillingPod({...ok,driverFolderPodReviews:{[sha]:{...record,signed:false}}},[signed]));
  assert.throws(()=>verifyBillingPod({...ok,loadNo:'OTHER-123'},[signed]));
  assert.doesNotThrow(()=>verifyBillingPod({...load,documentWorkflowStage:'tonu'},[]));
});
test('each delivery requires stop-specific evidence; an unassigned copy or a duplicate cannot fill the other stop',()=>{
  const trip={loadNo:'DEMO-411',origin:'Pickup, OH',stops:[{type:'delivery',cityState:'A, PA'},{type:'delivery',city:'B',state:'NY'}]};
  assert.equal(routeStops(trip)[1].name,'A, PA');assert.equal(routeStops(trip)[2].sequence,2);
  const first={...signed,stopSequence:1},second={...signed,sha256:other,stopSequence:2};
  assert.equal(podReview(trip,[first,first]).missingStops[0].sequence,2);assert.throws(()=>verifyBillingPod(trip,[first,first]),/stop 2/);
  assert.throws(()=>verifyBillingPod(trip,[{...first,stopSequence:0},second]),/stop 1/);
  assert.doesNotThrow(()=>verifyBillingPod(trip,[first,second]));
});
test('upload and factoring state each require their own evidence',()=>{
  assert.match(originalState({sync_state:'synced'}),/unconfirmed/);
  assert.equal(originalState({sync_state:'synced',storage_path:'owner/file'}),'Uploaded');
  assert.match(originalState({sync_state:'local_only',localBlobConfirmed:true}),/Saved on device/);
  assert.match(originalState({sync_state:'pending'}),/pending/);
  assert.equal(sendStatus(null,[],load.loadNo),'No recorded submission');
  assert.match(sendStatus({loadNo:load.loadNo,status:'unknown'},[],load.loadNo),/unconfirmed/);
  assert.match(sendStatus(null,[{loadNo:load.loadNo,acceptedAt:31}],load.loadNo),/Outlook accepted/);
  assert.match(sendStatus(null,[{loadNo:'OTHER',acceptedAt:31}],load.loadNo),/No recorded/);
});
test('one PDF may prove two different stops and later review may reject one of those pages', async()=>{
  const {storeStopReview}=await import('./folderReview.js');
  const trip={loadNo:'DEMO-412',stops:[{type:'delivery'},{type:'delivery'}]};
  const first=recordedPodReview(trip,signed,true,1,1),second=recordedPodReview(trip,signed,true,2,2);
  const reviewed={...trip,driverFolderPodReviews:{[sha]:storeStopReview(first,second)}};
  assert.equal(podReview(reviewed,[signed]).blocked,false);
  reviewed.driverFolderPodReviews[sha]=storeStopReview(reviewed.driverFolderPodReviews[sha],{...second,signed:false});
  assert.deepEqual(podReview(reviewed,[signed]).missingStops.map(s=>s.sequence),[2]);
  const accepted=()=>[{kind:'delivery_evidence',fields:{stopSequence:1}},{kind:'delivery_evidence',fields:{stopSequence:2}}];
  assert.doesNotThrow(()=>verifyBillingPod({...trip,notes:'Receiver signature is missing.'},[{...signed,type:'supporting_packet'}],accepted));
  assert.throws(()=>verifyBillingPod(trip,[{...signed,type:'supporting_packet'}],()=>[accepted()[0]]),/stop 2/);
});
