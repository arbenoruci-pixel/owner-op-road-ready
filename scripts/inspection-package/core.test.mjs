import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,at,today} from '../inspection-signed/fixture.mjs';
import {historicalCertificationFixture} from '../recorded-coverage/legacySignatureFixture.mjs';
import {captureInspection,assertInspectionComplete,assertInspectionUnchanged} from '../../lib/owner-op-cloud/inspectionSnapshot.js';
import {inspectionReadiness} from '../../source/src/modules/dot/inspectionReadiness.js';
const sign=(s,day)=>{s.signatureByDay[day]=historicalCertificationFixture(s,day,{now:+at-86400000,driverName:'Test Driver',signatureDataUrl:'data:image/png;base64,dGVzdA=='});s.certifyStatus[day]='Certified';};
function leading(){const s=fixture();for(const[day,events]of Object.entries({
 '2026-10-27':[{status:'SB',startMin:1281,endMin:1440,city:'A',state:'OH'}],
 '2026-10-28':[{status:'ON',startMin:1025,endMin:1123},{status:'D',startMin:1123,endMin:1244},{status:'OFF',startMin:1244,endMin:1440,city:'B',state:'IL'}],
 '2026-10-29':[{status:'ON',startMin:499,endMin:514},{status:'D',startMin:514,endMin:1332},{status:'SB',startMin:1332,endMin:1440}],
})){s.eventsByDay[day]=events;sign(s,day);}return s;}
test('signed leading intervals use adjacent signed midnight evidence; original signed facts stay byte-for-byte equal',()=>{
 const s=leading(),before=structuredClone(s),pack=captureInspection(s,at);
 for(const [day,status,end]of [['2026-10-28','SB',1025],['2026-10-29','OFF',499]]){
  const row=pack.snapshots.find(r=>r.sourceDay===day);
  assert.deepEqual(row.dayData.events,s.signatureByDay[day].certifiedContent.events);
  assert.deepEqual(row.dayData.signature.certifiedContent,s.signatureByDay[day].certifiedContent);
  assert.deepEqual(row.inspectionView.events.slice(1),row.dayData.events);
  assert.equal(row.inspectionView.events[0].status,status);assert.equal(row.inspectionView.events[0].endMin,end);
 }
 assert.equal(inspectionReadiness(s,at).logsReady,true);assert.doesNotThrow(()=>assertInspectionComplete(pack));assert.deepEqual(s,before);
 s.signatureByDay['2026-10-27'].certifiedContent.events[0].status='OFF';assert.throws(()=>assertInspectionUnchanged(pack,s),/changed/);
});
test('missing evidence, Driving, an intervening day, interior gaps and signature tampering cannot silently become complete',()=>{
 for(const mutate of [s=>delete s.signatureByDay['2026-10-27'],s=>{s.eventsByDay['2026-10-27'][0].status='D';sign(s,'2026-10-27');},s=>{s.signatureByDay['2026-10-26']=s.signatureByDay['2026-10-27'];delete s.signatureByDay['2026-10-27'];},s=>{s.eventsByDay['2026-10-28'][1].startMin++;sign(s,'2026-10-28');},s=>s.signatureByDay['2026-10-30'].certifiedContent.events[0].note='changed']){
  const s=leading();mutate(s);assert.throws(()=>assertInspectionComplete(captureInspection(s,at)));
 }
});
test('phone draft edits do not replace signed days and actual DOT boundary remains frozen',()=>{
 const s=leading();s.eventsByDay['2026-10-28']=[{status:'D',startMin:0,endMin:1440}];
 const p=captureInspection(s,at);assert.equal(p.snapshots[0].dayData.events[0].startMin,1025);
 assert.equal(p.snapshots.at(-1).sourceDay,today);assert.equal(p.snapshots.at(-1).inspectionView.cutoff,1162);
 assert.equal(p.snapshots.at(-1).inspectionView.events.at(-1).endMin,1162);
 assert.doesNotThrow(()=>assertInspectionComplete(p));
});
