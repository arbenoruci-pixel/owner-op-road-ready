import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,at,today} from './fixture.mjs';
import {captureInspection,assertInspectionUnchanged,assertInspectionComplete} from '../../lib/owner-op-cloud/inspectionSnapshot.js';
import {inspectionReadiness} from '../../source/src/modules/dot/inspectionReadiness.js';
const get=(pack,day)=>pack.snapshots.find(s=>s.sourceDay===day);
test('uses exact signed content, signature, equipment and miles, even after an unsigned draft edit',()=>{
  const state=fixture(),day='2026-10-30',signed=structuredClone(state.signatureByDay[day]);
  state.eventsByDay[day][0].status='D';state.eventsByDay[day][0].endMin=800;
  state.manualMilesByDay[day]=900;state.formByDay[day]={truck:'other',distance:900};state.driver.truck='new';
  const before=structuredClone(state),pack=captureInspection(state,at),snapshot=get(pack,day);
  assert.deepEqual(snapshot.inspectionView.events,signed.certifiedContent.events);
  assert.deepEqual(snapshot.dayData.events,signed.certifiedContent.events);
  assert.equal(snapshot.dayData.signature.signatureDataUrl,signed.signatureDataUrl);
  assert.equal(snapshot.dayData.signature.signedAt,signed.signedAt);
  assert.equal(snapshot.profileAtBackup.unit,'228');assert.equal(snapshot.dayData.manualMiles,63);
  assert.equal(snapshot.inspectionView.certified,true);assert.equal(snapshot.rawDayBuckets,undefined);
  assert.equal(inspectionReadiness(state,at).logsReady,true);assert.deepEqual(state,before);
});
test('current day ends exactly at ON DOT entry, with no advancing ON minutes or later entries',()=>{
  const state=fixture();state.eventsByDay[today].push({id:'later',status:'D',startMin:1180,endMin:1188});
  const pack=captureInspection(state,at),snapshot=get(pack,today);
  assert.equal(pack.snapshots.length,8);assert.equal(snapshot.inspectionView.cutoff,1162);
  assert.deepEqual(snapshot.inspectionView.events.map(e=>[e.id,e.startMin,e.endMin]),[['drive',0,1162],['dot',1162,1162]]);
  assert.deepEqual(snapshot.dayData.events,snapshot.inspectionView.events);assert.equal(snapshot.dayData.signature,undefined);
  assert.equal(get(captureInspection(state,new Date(+at+3600000)),today).inspectionView.cutoff,1162);
  assert.doesNotThrow(()=>assertInspectionComplete(pack));
});
test('most recent real DOT entry wins; future/deleted entries never cut the log',()=>{
  const state=fixture();state.eventsByDay[today].push({id:'old',status:'ON',startMin:500,note:'DOT Inspection'},{id:'future',status:'ON',startMin:1300,note:'DOT Inspection'},{id:'deleted',status:'ON',startMin:1165,note:'DOT Inspection',deleted:true});
  assert.equal(get(captureInspection(state,at),today).inspectionView.dotEvent.id,'dot');
  state.eventsByDay[today]=state.eventsByDay[today].filter(e=>e.id==='drive');
  assert.equal(get(captureInspection(state,at),today).inspectionView.cutoff,1170);
});
test('unsigned historical days are never stamped certified; signed source changes invalidate a share',()=>{
  const state=fixture(),pack=captureInspection(state,at);delete state.signatureByDay['2026-10-30'];
  assert.equal(get(captureInspection(state,at),'2026-10-30').inspectionView.certified,false);
  assert.throws(()=>assertInspectionComplete(captureInspection(state,at)),/Sign the log for 2026-10-30/);
  assert.throws(()=>assertInspectionUnchanged(pack,state),/changed/);
  const changed=fixture();changed.signatureByDay['2026-10-30'].certifiedContent.events[0].note='changed signed content';
  assert.throws(()=>assertInspectionUnchanged(pack,changed),/changed/);
  const switched=fixture();switched.activeDriverId='other';assert.throws(()=>assertInspectionUnchanged(pack,switched),/changed/);
});
