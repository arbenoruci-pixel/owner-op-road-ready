import test from 'node:test';
import assert from 'node:assert/strict';
import {captureInspection,assertArchiveCoverage,assertInspectionUnchanged} from '../../lib/owner-op-cloud/inspectionSnapshot.js';
import {dailyModel} from '../../lib/owner-op-cloud/core.js';
const at=new Date('2026-10-28T14:39:00Z');
const e=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,source:'live_status',...extra});
const fixture=()=>({activeDay:'2026-10-28',homeTerminalTimeZone:'America/New_York',currentStatus:'ON',driver:{truck:'228'},carrierDot:'1234567',eventsByDay:{
 '2026-10-22':[e('a','D',0,230),e('b','SB',230,869),e('c','ON',869,899),e('d','D',899,1328),e('e','SB',1328,1329)],
 '2026-10-26':[e('f','SB',1245,1391)],'2026-10-27':[e('g','ON',453,470),e('g2','SB',1300,1315)],
 '2026-10-28':[e('h','ON',544,545)]}});
const day=(p,d)=>p.snapshots.find(s=>s.sourceDay===d);
test('eight-day frozen view agrees with app tails and known midnight status, preserving raw evidence',()=>{
 const s=fixture(),before=JSON.stringify(s),p=captureInspection(s,at);
 assert.equal(p.snapshots.length,8);assert.equal(p.endDay,'2026-10-28');
 assert.equal(day(p,'2026-10-22').dayData.events.at(-1).endMin,1329);
 const m=dailyModel(day(p,'2026-10-22'));assert.equal(m.rows.at(-1).end,1440);assert.equal(m.warnings.length,0);
 assert.equal(dailyModel(day(p,'2026-10-27')).rows[0].status,'SB');assert.equal(dailyModel(day(p,'2026-10-27')).rows[0].end,453);
 assert.equal(dailyModel(day(p,'2026-10-28'),1200).rows.at(-1).end,639);
 assert.equal(day(p,'2026-10-28').inspectionView.cutoff,639);assert.equal(JSON.stringify(s),before);
 assert.equal(p.profile.usdot,'1234567');
});
test('unknown intervals and explicit End remain incomplete; no invented OFF or Driving',()=>{
 const s=fixture();s.eventsByDay={'2026-10-27':[e('closed','D',60,120,{paperLogEndV110315:true})]};
 const p=captureInspection(s,at),m=dailyModel(day(p,'2026-10-27'));
 assert.equal(m.rows.length,1);assert.equal(m.rows[0].end,120);assert.equal(m.totals.OFF,0);assert.equal(m.warnings.length,2);
 assert.equal(dailyModel(day(p,'2026-10-28')).rows.length,0);
 s.eventsByDay={'2026-10-27':[e('closed','SB',60,120,{paperLogEndV110315:true})]};
 const ended=captureInspection(s,at);assert.equal(dailyModel(day(ended,'2026-10-27')).rows[0].end,120);assert.equal(dailyModel(day(ended,'2026-10-28')).rows.length,0);
});
test('archived records absent on a stale device block sharing instead of full-day OFF',()=>{
 const full=captureInspection(fixture(),at),s=fixture();delete s.eventsByDay['2026-10-27'];const stale=captureInspection(s,at);
 assert.throws(()=>assertArchiveCoverage(stale,[day(full,'2026-10-27')]),/missing saved records for 2026-10-27/);
 assert.doesNotThrow(()=>assertArchiveCoverage(full,[day(full,'2026-10-27')]));
});
test('captured state cannot drift during upload, including edits, signatures and driver switches',()=>{
 const s=fixture(),p=captureInspection(s,at);
 assert.doesNotThrow(()=>assertInspectionUnchanged(p,{...s,view:'dot'}));
 for(const change of [v=>{v.eventsByDay['2026-10-28'][0].note='New remark';},v=>{v.signatureByDay={'2026-10-27':{signed:true}};},v=>{v.activeDriverId='different';}]){
  const edited=structuredClone(s);change(edited);assert.throws(()=>assertInspectionUnchanged(p,edited),/changed while preparing/);
 }
});
test('capture date and current cutoff use terminal timezone at midnight',()=>{
 const p=captureInspection(fixture(),new Date('2026-10-28T03:30:00Z'));assert.equal(p.endDay,'2026-10-27');assert.equal(day(p,'2026-10-27').inspectionView.cutoff,1410);
});
test('later edits never mutate an earlier snapshot; invalid view cannot silently fall back',()=>{
 const s=fixture(),p=captureInspection(s,at);s.eventsByDay['2026-10-28'][0].startMin=600;
 assert.equal(day(p,'2026-10-28').dayData.events[0].startMin,544);
 assert.throws(()=>dailyModel({...day(p,'2026-10-28'),inspectionView:{version:9}}),/Invalid inspection/);
});
