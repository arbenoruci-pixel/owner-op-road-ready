import assert from 'node:assert/strict';
import fs from 'node:fs';
import { displayEventsForDayFromState } from '../source/src/core/timeline/displayTimeline.js';
import { projectLogbookEvents, logbookClock } from '../source/src/modules/logbook/eventEditingV110.js';
import { traceGeometry } from '../source/src/modules/graph/graphGeometryV110.js';
import { dutyViewEvents } from '../source/src/modules/logbook/dutyViewV110212.js';

const today='2026-09-08', yesterday='2026-09-07', at=new Date('2026-09-08T09:12:00Z');
const row=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,city:'Downers Grove',state:'IL',source:'manual',...extra});
const stateFor=status=>({
  activeDay:today,homeTerminalTimeZone:'America/New_York',currentStatus:status,
  currentLocation:{city:'Downers Grove',state:'IL'},
  eventsByDay:{[yesterday]:[row('phone-off',status,0,1202)]},
  logbookEditHistoryByDay:{[yesterday]:[{kind:'edit',targetId:'phone-off',marker:'retain-me'}]},
  signatureByDay:{[yesterday]:{signed:false,marker:'retain-signature'}},
});
function display(state,day,instant=at){
  const clock=logbookClock(state,instant);
  return displayEventsForDayFromState(state.eventsByDay,day,{
    today:clock.day,nowMinute:clock.minute,currentStatus:state.currentStatus,
    currentLocation:state.currentLocation,
  });
}
let count=0;
function test(label,run){run();count++;console.log('PASS — '+label);}
for(const status of ['OFF','SB','ON']){
  test(status+' continues through yesterday, midnight, Now and later clock ticks without writes',()=>{
    const state=stateFor(status),before=structuredClone(state);
    for(const [day,instant,end] of [[yesterday,at,1440],[today,at,312],[today,new Date('2026-09-08T09:13:00Z'),313]]){
      const rows=display(state,day,instant),geometry=traceGeometry(rows);
      assert.deepEqual(rows.map(e=>[e.status,e.startMin,e.endMin]),[[status,0,end]]);
      assert.equal(geometry.segments.length,1);
      assert.equal(geometry.segments.reduce((n,s)=>n+s.event.endMin-s.event.startMin,0),end);
      assert.deepEqual(geometry.discontinuities,[]);
    }
    assert.deepEqual(state,before);
    assert.deepEqual(display(JSON.parse(JSON.stringify(state)),today).map(e=>[e.status,e.startMin,e.endMin]),[[status,0,312]]);
    assert.deepEqual(projectLogbookEvents(state,yesterday,at).map(e=>[e.status,e.startMin,e.endMin]),[[status,0,1202]],'editor still uses stored minutes');
    assert.deepEqual(projectLogbookEvents(state,today,at),[],'display continuation never becomes an editable raw event');
  });
}
test('consecutive empty completed days carry the last non-driving status',()=>{
  const state=stateFor('OFF');state.eventsByDay={'2026-08-20':[row('anchor','OFF',1200,1440)]};
  for(const day of ['2026-09-05','2026-09-06',yesterday]){
    assert.deepEqual(display(state,day).map(e=>[e.status,e.startMin,e.endMin]),[['OFF',0,1440]]);
  }
});
test('first real status transition ends the midnight carry exactly',()=>{
  const state=stateFor('OFF');
  state.currentStatus='ON';state.eventsByDay[today]=[row('on','ON',300,301,{source:'live_status'})];
  assert.deepEqual(display(state,today).map(e=>[e.status,e.startMin,e.endMin]),[['OFF',0,300],['ON',300,312]]);
});
test('an old Driving row cannot invent next-day Driving',()=>{
  const state=stateFor('D');
  assert.equal(display(state,today)[0].status,'OFF');
  assert.deepEqual(projectLogbookEvents(state,yesterday,at).map(e=>[e.status,e.startMin,e.endMin]),[['D',0,1202]]);
});
test('future empty days are not pre-filled',()=>{
  assert.deepEqual(display(stateFor('OFF'),'2026-09-09'),[]);
});
test('real gaps and overlaps remain visible in both graph and list',()=>{
  for(const rows of [
    [row('a','OFF',0,120),row('b','ON',121,180)],
    [row('a','OFF',0,120),row('b','ON',119,180)],
    [row('a','ON',10,60)],
  ]){
    const continuous=[row('fake','OFF',0,1440)],before=structuredClone(rows);
    assert.equal(dutyViewEvents(rows,continuous),rows);
    assert.deepEqual(rows,before);
  }
});
test('closed and active Driving use exact projected minutes, never a display extension',()=>{
  const state=stateFor('D');
  const exact=projectLogbookEvents(state,yesterday,at);
  assert.equal(dutyViewEvents(exact,display(state,yesterday)),exact);
  state.eventsByDay[today]=[row('drive','D',0,1,{source:'live_status'})];
  const live=projectLogbookEvents(state,today,at);
  assert.equal(live[0].endMin,312);
  assert.equal(dutyViewEvents(live,display(state,today)),live);
});
test('graph and list share the view while editor and selection remain exact',()=>{
  const day=fs.readFileSync('source/src/modules/logbook/DayLogScreen.jsx','utf8');
  assert.match(day,/<LogGraph\s+events=\{eventListEvents\}/);
  assert.match(day,/<EventList events=\{eventListEvents\}/);
  assert.match(day,/state\.selectMode \|\| isMoving \|\| bulkMoveDelta/);
  assert.match(day,/const exactViewEventsV110 = useMemo\(\(\) => projectLogbookEvents/);
  assert.ok(day.includes('if (visibleEvent?.displayOnly || visibleEvent?.carriedFromPreviousDay || visibleEvent?.syntheticCoverage) return;'));
});
test('release identity is non-forced and consistent',()=>{
  for(const path of ['public/app-version.json','release-version.json']){
    const meta=JSON.parse(fs.readFileSync(path,'utf8'));
    assert.equal(meta.version,'110.2.12');assert.equal(meta.build,'v110212-duty-graph-continuity');assert.equal(meta.force,false);
  }
});
console.log(count+' continuous duty graph regression groups passed');
