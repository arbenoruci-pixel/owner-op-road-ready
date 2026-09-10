import assert from 'node:assert/strict';
import { rawCoverageIssues, buildCoverageFixGroup } from '../source/src/core/compliance/rawRodsChecks.js';
import { displayEventsForDayFromState } from '../source/src/core/timeline/displayTimeline.js';
import { dutyViewEvents } from '../source/src/modules/logbook/dutyViewV110212.js';
import { validateLogForSigning } from '../source/src/modules/logbook/signing.js';
import { buildDotOfficerCheck } from '../source/src/core/dot/dotOfficerCheckEngine.js';
import { certificationFingerprintV1032 } from '../source/src/modules/logbook/certificationV110.js';
import { coverageFixture, day } from './v110317/coverageFixture.mjs';
const NativeDate=Date;
globalThis.Date=class extends NativeDate { constructor(...args){super(...(args.length?args:['2026-09-10T10:41:47Z']));} static now(){return new NativeDate('2026-09-10T10:41:47Z').getTime();} };
const options={today:'2026-09-10',nowMinute:401,currentStatus:'SB'};
const coverage=s=>rawCoverageIssues(s.eventsByDay,day,options);
let count=0;const test=(name,run)=>{run();count++;console.log('PASS — '+name);};
for(const status of ['SB','OFF','ON'])test(status+' open tail: Log, signing, DOT and reload agree on 24h',()=>{
  const s=coverageFixture();s.eventsByDay[day].at(-1).status=status;
  // Today's status/session can differ from yesterday's final status.
  s.currentStatus='D';s.manualDrivingSession={active:true,eventId:'unrelated-today'};
  const original=structuredClone(s),fingerprint=certificationFingerprintV1032(s,day);
  const result=coverage(s);
  assert.equal(result.total,1440);assert.deepEqual(result.issues,[]);assert.equal(buildCoverageFixGroup(result,day),null);
  const display=displayEventsForDayFromState(s.eventsByDay,day,options);
  assert.equal(dutyViewEvents(s.eventsByDay[day],display,{eventsByDay:s.eventsByDay,day}).at(-1).endMin,1440);
  assert.equal(buildDotOfficerCheck(s,day).coverageGroup,null);
  assert.equal(validateLogForSigning(s,day).some(i=>i.where==='Log coverage'),false);
  assert.equal(coverage(JSON.parse(JSON.stringify(s))).total,1440);
  assert.equal(certificationFingerprintV1032(s,day),fingerprint);assert.deepEqual(s,original);
});
test('the same SB rows remain covered before and after home-terminal midnight',()=>{
  const s=coverageFixture();
  for(const [today,nowMinute,total] of [[day,1439,1439],['2026-09-10',0,1440],['2026-09-15',500,1440]]) {
    const result=rawCoverageIssues(s.eventsByDay,day,{today,nowMinute,currentStatus:'SB'});
    assert.equal(result.total,total);assert.equal(buildCoverageFixGroup(result,day),null);
  }
});
test('explicit End, manually bounded tail and Driving retain their stored end',()=>{
  for(const patch of [{paperLogEndV110315:true},{source:'manual'},{status:'D'}]) {
    const s=coverageFixture();Object.assign(s.eventsByDay[day].at(-1),patch);
    const group=buildCoverageFixGroup(coverage(s),day);
    assert.deepEqual(group.missingBlocks.map(b=>[b.startMin,b.endMin]),[[1322,1440]]);
  }
});
test('an actual internal gap and overlap remain visible',()=>{
  for(const endMin of [1200,1230]) {
    const s=coverageFixture();s.eventsByDay[day][3].endMin=endMin;
    const issues=coverage(s).issues;
    assert.ok(issues.some(i=>i.code.startsWith(endMin===1200?'gap_':'overlap_')));
    assert.ok(!issues.some(i=>i.code==='day_end_gap'));
  }
});
test('finished midnight row and the inserted 30-minute break keep exact times',()=>{
  const s=coverageFixture();s.eventsByDay[day].at(-1).endMin=1440;
  const original=structuredClone(s);assert.equal(coverage(s).total,1440);
  assert.deepEqual(s.eventsByDay[day][4],original.eventsByDay[day][4]);assert.deepEqual(s,original);
});
globalThis.Date=NativeDate;
console.log(count+' Wizard midnight regression groups passed');
