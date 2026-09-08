import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dutyViewEvents } from '../source/src/modules/logbook/dutyViewV110212.js';
import { projectLogbookEvents } from '../source/src/modules/logbook/eventEditingV110.js';
import { readArchiveLogbookDay } from '../source/src/modules/logbook/archiveDayV1103.js';
import { displayEventsForDayFromState } from '../source/src/core/timeline/displayTimeline.js';
import { rawCoverageIssues } from '../source/src/core/compliance/rawRodsChecks.js';
import { applyLiveStatusTransition } from '../source/src/core/timeline/liveDrivingSafety.js';
import { traceGeometry } from '../source/src/modules/graph/graphGeometryV110.js';

const day='2026-09-08',prior='2026-09-07',at=new Date('2026-09-08T18:25:00Z');
const row=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,source:'live_status',city:'Chicago',state:'IL',...extra});
const tuples=rows=>rows.map(e=>[e.status,e.startMin,e.endMin]);
const options={today:day,nowMinute:865,currentStatus:'ON'};
function stateFor(status='OFF',previousDay=prior) {return {
  homeTerminalTimeZone:'America/New_York',activeDay:day,currentStatus:'ON',
  eventsByDay:{[previousDay]:[row('previous',status,0,1202)],[day]:[row('on','ON',850,851,{note:'Pre-trip inspection'})]},
  signatureByDay:{[previousDay]:{marker:'preserve'}},logbookEditHistoryByDay:{[previousDay]:[{marker:'preserve'}]},routeLegsByDay:{},
};}
function visible(s){return dutyViewEvents(projectLogbookEvents(s,day,at),displayEventsForDayFromState(s.eventsByDay,day,options),{eventsByDay:s.eventsByDay,day});}
let count=0;const test=(name,run)=>{run();count++;console.log('PASS — '+name);};
for(const status of ['OFF','SB','ON'])test(status+' carries 00:00–14:10 after the first ON status and reload',()=>{
  const s=stateFor(status),before=structuredClone(s),expected=[[status,0,850],['ON',850,865]];
  assert.deepEqual(tuples(visible(s)),expected);
  assert.deepEqual(tuples(readArchiveLogbookDay(s,day,at)),expected);
  assert.deepEqual(tuples(visible(JSON.parse(JSON.stringify(s)))),expected);
  assert.deepEqual(rawCoverageIssues(s.eventsByDay,day,options).issues,[]);
  assert.equal(rawCoverageIssues(s.eventsByDay,day,options).total,865);
  assert.deepEqual(traceGeometry(visible(s)).discontinuities,[]);
  assert.ok(visible(s)[0].displayOnly && visible(s)[0].syntheticCoverage);
  assert.deepEqual(tuples(projectLogbookEvents(s,day,at)),[['ON',850,865]]);
  assert.deepEqual(s,before,'all read paths preserve raw records, signatures and history');
});
test('a later real status change retains the morning and pre-trip',()=>{
  const s=stateFor();s.eventsByDay[day]=applyLiveStatusTransition(s.eventsByDay[day],row('driving','D',860,861));s.currentStatus='D';
  assert.deepEqual(tuples(visible(s)),[['OFF',0,850],['ON',850,860],['D',860,865]]);
});
test('multiple empty dates do not lose known prior status',()=>{
  assert.deepEqual(tuples(visible(stateFor('SB','2026-08-20'))),[['SB',0,850],['ON',850,865]]);
});
test('prior Driving and missing evidence keep the real start gap',()=>{
  for(const s of [stateFor('D'),{...stateFor(),eventsByDay:{[day]:[row('on','ON',850,851)]}}]) {
    assert.deepEqual(tuples(visible(s)),[['ON',850,865]]);
    assert.ok(rawCoverageIssues(s.eventsByDay,day,options).issues.some(e=>e.code==='day_start_gap'));
  }
});
test('real internal gaps and overlaps remain visible with known midnight carry',()=>{
  for(const end of [859,861]) {
    const s=stateFor();s.eventsByDay[day]=[row('a','ON',850,end,{source:'manual'}),row('b','ON',860,861)];
    assert.deepEqual(tuples(visible(s)),[['OFF',0,850],['ON',850,end],['ON',860,865]]);
    assert.ok(traceGeometry(visible(s)).discontinuities.length);
  }
});
test('closed Driving boundaries are never extended by the display helper',()=>{
  const s=stateFor();s.eventsByDay[day]=[row('closed','D',850,855,{source:'manual'})];s.currentStatus='OFF';
  assert.deepEqual(tuples(visible(s)),[['OFF',0,850],['D',850,855]]);
});
test('voided, synthetic and malformed prior records cannot supply carry',()=>{
  for(const patch of [{voided:true},{synthetic:true},{displayOnly:true},{source:'carryover'},{endMin:0},{status:'UNKNOWN'}]) {
    const s=stateFor();Object.assign(s.eventsByDay[prior][0],patch);
    assert.deepEqual(tuples(visible(s)),[['ON',850,865]]);
  }
});
test('real events starting at midnight keep their exact recorded start',()=>{
  const s=stateFor();s.eventsByDay[day][0].startMin=0;
  assert.deepEqual(tuples(visible(s)),[['ON',0,865]]);
});
test('the final Day Log passes prior-day context to the graph/list selector',()=>{
  assert.ok(fs.readFileSync('source/src/modules/logbook/DayLogScreen.jsx','utf8').includes('dutyViewEvents(exactViewEventsV110, displayEvents, { eventsByDay:state.eventsByDay, day:state.activeDay })'));
});
console.log(count+' status-change midnight regression groups passed');
