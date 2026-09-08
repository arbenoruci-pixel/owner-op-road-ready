import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { mock } from 'node:test';
import { displayEventsForDayFromState } from '../source/src/core/timeline/displayTimeline.js';
import { rawCoverageIssues, rawStoredEventsForDay } from '../source/src/core/compliance/rawRodsChecks.js';
import { completedLogDays, signableLogDays } from '../source/src/modules/logbook/signing.js';
import { historicalContinuityDaysV11026, materializeCarriedDayForCertificationV11026 } from '../source/src/modules/logbook/continuityV11026.js';

const hash = path => crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const row=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,city:'Willowbrook',state:'IL',source:'manual',...extra});
const today='2026-09-07';
// Public signing helpers read the clock internally; share the fixture day.
mock.timers.enable({ apis:['Date'], now:new Date('2026-09-07T16:00:00Z') });

// Exact installed-phone case: the three edited OFF fragments are one visible
// continuous duty-status body, while raw audit rows stay available underneath.
const sep6=[
  row('off-a','OFF',0,998,{note:'Off Duty'}),
  row('off-b','OFF',998,1033,{note:'OFF DUTY'}),
  row('off-c','OFF',1033,1364,{note:'Off Duty'}),
];
const sep6Display=displayEventsForDayFromState({'2026-09-06':sep6},'2026-09-06',{today,nowMinute:1440});
assert.equal(sep6Display.length,1);assert.equal(sep6Display[0].status,'OFF');assert.equal(sep6Display[0].startMin,0);assert.equal(sep6Display[0].endMin,1440);
assert.equal(rawStoredEventsForDay({'2026-09-06':sep6},'2026-09-06').length,3);
console.log('PASS — three touching OFF edits render as one canonical 24-hour body without deleting raw audit rows');

const mixed=displayEventsForDayFromState({'2026-09-06':[row('off','OFF',0,600),row('on','ON',600,660),row('off2','OFF',660,1440)]},'2026-09-06',{today,nowMinute:1440});
assert.deepEqual(mixed.map(e=>[e.status,e.startMin,e.endMin]),[['OFF',0,600],['ON',600,660],['OFF',660,1440]]);
console.log('PASS — a real status change remains a separate event boundary');

// The carry lookup must cross more than fourteen empty dates.
const longGap={'2026-08-20':[row('anchor','OFF',1200,1440,{note:'Parked'})]};
const sep5=displayEventsForDayFromState(longGap,'2026-09-05',{today,nowMinute:1440});
assert.deepEqual(sep5.map(e=>[e.status,e.startMin,e.endMin]),[['OFF',0,1440]]);assert.equal(sep5[0].carriedFromPreviousDay,true);
console.log('PASS — last known status carries across more than fourteen empty dates');

for(const status of ['OFF','SB','ON']){
  const state={'2026-09-06':[row('prior-'+status,status,1200,1440)]};
  const current=displayEventsForDayFromState(state,today,{today,nowMinute:323,currentStatus:status,currentLocation:{city:'Willowbrook',state:'IL'}});
  assert.deepEqual(current.map(e=>[e.status,e.startMin,e.endMin]),[[status,0,323]]);
}
console.log('PASS — OFF/SB/ON continue from midnight through current Now');

const firstChange=displayEventsForDayFromState({'2026-09-06':[row('prior','OFF',1200,1440)],'2026-09-07':[row('on','ON',600,660)]},today,{today,nowMinute:700,currentStatus:'ON'});
assert.deepEqual(firstChange.map(e=>[e.status,e.startMin,e.endMin]),[['OFF',0,600],['ON',600,700]]);
console.log('PASS — carry ends at the exact first real new-day status transition');

const bareDrive=displayEventsForDayFromState({'2026-09-06':[row('drive','D',1200,1440)]},today,{today,nowMinute:300});
assert.equal(bareDrive[0].status,'OFF');
console.log('PASS — a bare historical Driving row still cannot invent next-day Driving');

const coverage=rawCoverageIssues(longGap,'2026-09-05',{today,nowMinute:1440,currentLocation:{city:'Willowbrook',state:'IL'}});
assert.equal(coverage.total,1440);assert.equal(coverage.issues.length,0);assert.equal(coverage.derivedCoverageEvent.status,'OFF');assert.equal(coverage.derivedCoverageEvent.carriedFromPreviousDay,true);
console.log('PASS — historical carried day is complete coverage for review instead of a false missing-log defect');

const continuityState={eventsByDay:{'2026-08-20':[row('anchor','OFF',0,1440)],'2026-09-06':sep6},certifyStatus:{},signatureByDay:{}};
const days=historicalContinuityDaysV11026(continuityState,today);
assert.ok(days.includes('2026-09-05'));assert.ok(days.includes('2026-09-06'));assert.deepEqual(completedLogDays(continuityState),days);assert.ok(signableLogDays(continuityState).includes('2026-09-05'));
console.log('PASS — carried completed dates are included in Needs signature / Sign all');

const before=structuredClone(continuityState);
const prepared=materializeCarriedDayForCertificationV11026(continuityState,'2026-09-05',today);
assert.deepEqual(continuityState,before);assert.equal(rawStoredEventsForDay(before.eventsByDay,'2026-09-05').length,0);
const certifiedRows=rawStoredEventsForDay(prepared.eventsByDay,'2026-09-05');
assert.equal(certifiedRows.length,1);assert.deepEqual([certifiedRows[0].status,certifiedRows[0].startMin,certifiedRows[0].endMin],['OFF',0,1440]);assert.equal(certifiedRows[0].source,'certified_carry_forward');
assert.deepEqual(prepared.eventsByDay['2026-09-06'],before.eventsByDay['2026-09-06']);
console.log('PASS — reading carry is immutable; explicit signing preparation creates exactly one concrete full-day row');

const daySource=fs.readFileSync('source/src/modules/logbook/DayLogScreen.jsx','utf8');
const listSource=fs.readFileSync('source/src/modules/logbook/EventList.jsx','utf8');
const appSource=fs.readFileSync('source/src/app/App.jsx','utf8');
const homeSource=fs.readFileSync('source/src/modules/home/HomeScreen.jsx','utf8');
const unsignedSource=fs.readFileSync('source/src/modules/logbook/UnsignedLogsScreen.jsx','utf8');
assert.match(daySource,/\? \(bulkPreviewEvents \|\| \[\]\)\.filter\(event => !event\.displayOnly/);assert.match(daySource,/: \(displayEvents \|\| \[\]\)/);
assert.match(listSource,/continuity-only-v11026/);assert.match(listSource,/continuityOnly \? undefined/);assert.match(listSource,/event-continuity-tag-v11026/);
assert.match(appSource,/materializeCarriedDayForCertificationV11026\(s, day\)/);assert.match(appSource,/preparedBatchV11026/);assert.match(appSource,/const raw = events\.find/);
assert.match(homeSource,/needsSignature \? 'Needs signature'/);assert.match(unsignedSource,/displayEventsForDayFromState/);
console.log('PASS — canonical list, non-editable carry row and explicit single/batch signing wiring are installed');

const meta=JSON.parse(fs.readFileSync('public/app-version.json','utf8'));assert.equal(meta.version,'110.2.6');assert.equal(meta.build,'v110206-canonical-day-continuity');assert.equal(meta.force,false);
const sw=fs.readFileSync('public/sw.js','utf8');assert.match(sw,/OWNER_OP_SW_VERSION = '110\.2\.6'/);assert.match(sw,/OWNER_OP_SW_BUILD = 'v110206-canonical-day-continuity'/);
const locks=JSON.parse(fs.readFileSync('module-locks.v1.json','utf8'));assert.equal(locks.release,'110.2.6');
for(const path of ['source/src/modules/logbook/signing.js','source/src/core/compliance/rawRodsChecks.js','source/src/modules/logbook/DayLogScreen.jsx'])assert.equal(locks.files[path],hash(path),`reviewed lock mismatch: ${path}`);
console.log('PASS — 110.2.6 release identity and reviewed stable-module locks match materialized runtime');
