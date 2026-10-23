import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {analyzeLinkedHos,violationRangesForDay} from '../../source/src/core/hos/hosEngine.js';
import {buildDotOfficerCheck} from '../../source/src/core/dot/dotOfficerCheckEngine.js';
import {projectLogbookEvents,projectEditorLogbookEvents,applyLogbookEditorEdit} from '../../source/src/modules/logbook/public-api.js';
import {day,today,at,fixture} from './fixture.mjs';

mock.timers.enable({apis:['Date'],now:at});
let count=0;
const test=(name,fn)=>{fn();count++;console.log('PASS — '+name);};
test('a 10h14m reset followed by 6h55m ordinary rest has no blanket seven-hour review',()=>{
  const state=fixture(),before=structuredClone(state);
  const ranges=violationRangesForDay(state.eventsByDay,day);
  assert.ok(!ranges.some(range=>range.type==='split7watch'));
  assert.ok(!analyzeLinkedHos(state.eventsByDay,day,state.certifyStatus).warnings.some(w=>/Sleeper under 7h/i.test(w.text)));
  const report=buildDotOfficerCheck(state,day);
  assert.ok(!JSON.stringify(report).includes('Sleeper under 7h'));
  assert.deepEqual(state,before);
});
test('a legal short sleeper paired with a long sleeper retains no under-seven warning',()=>{
  const state=fixture({nextDayRest:120});
  state.eventsByDay[day]=[
    {id:'reset',status:'SB',startMin:0,endMin:600},
    {id:'drive1',status:'D',startMin:600,endMin:840},
    {id:'long',status:'SB',startMin:840,endMin:1320},
    {id:'drive2',status:'D',startMin:1320,endMin:1440},
  ];
  state.eventsByDay[today]=[
    {id:'short',status:'SB',startMin:0,endMin:120},
    {id:'work',status:'ON',startMin:120,endMin:150},
  ];
  const ranges=violationRangesForDay(state.eventsByDay,today);
  assert.ok(!ranges.some(range=>range.type==='split7watch'));
});
test('an actual fourteen-hour Driving violation stays actionable',()=>{
  const state=fixture();
  state.eventsByDay[day]=[
    {id:'reset',status:'SB',startMin:0,endMin:600},
    {id:'long-work',status:'ON',startMin:600,endMin:1440},
  ];
  state.eventsByDay[today]=[{id:'illegal-drive',status:'D',startMin:0,endMin:400,source:'manual',city:'Example City',state:'OH',note:'Driving'}];
  assert.ok(violationRangesForDay(state.eventsByDay,today).some(r=>r.type==='window14'&&r.eventId==='illegal-drive'));
});
test('the editor opens the historical live sleeper through midnight while the raw projection stays exact',()=>{
  const state=fixture({sentinel:true}),before=structuredClone(state);
  assert.equal(projectLogbookEvents(state,day,at).at(-1).endMin,1304);
  assert.equal(projectEditorLogbookEvents(state,day,at).at(-1).endMin,1440);
  assert.deepEqual(state,before);
});
test('a note-only save retains raw times, signature evidence and every other day',()=>{
  const state=fixture({sentinel:true}),before=structuredClone(state);
  const result=applyLogbookEditorEdit(state,{day,id:'evening-rest',patch:{note:'Resting'},expected:state.eventsByDay[day].at(-1),expectedRows:state.eventsByDay[day]},at);
  assert.equal(result.ok,true,result.error);
  assert.equal(result.state.eventsByDay[day].at(-1).endMin,1304);
  assert.deepEqual(result.state.signatureByDay,before.signatureByDay);
  assert.deepEqual(result.state.eventsByDay[today],before.eventsByDay[today]);
  assert.deepEqual(state,before);
});
test('a Start correction uses the visible midnight end and preserves continuous coverage',()=>{
  const state=fixture({sentinel:true});
  const result=applyLogbookEditorEdit(state,{day,id:'evening-rest',patch:{startMin:1310},expectedRows:state.eventsByDay[day]},at);
  assert.equal(result.ok,true,result.error);
  assert.equal(result.events.at(-1).startMin,1310);
  assert.equal(result.events.at(-1).endMin,1440);
  assert.equal(result.events.at(-2).endMin,1310);
});
test('an explicitly chosen End persists after save, projection and reload',()=>{
  const state=fixture({sentinel:true});
  const result=applyLogbookEditorEdit(state,{day,id:'evening-rest',patch:{endMin:1380},expectedRows:state.eventsByDay[day]},at);
  assert.equal(result.ok,true,result.error);
  assert.equal(result.events.at(-1).paperLogEndV110315,true);
  assert.equal(projectEditorLogbookEvents(JSON.parse(JSON.stringify(result.state)),day,at).at(-1).endMin,1380);
});
test('explicit manual End, manual rows and Driving are never extended by the editor',()=>{
  for(const patch of [{paperLogEndV110315:true},{source:'manual'},{status:'D'}]){
    const state=fixture({sentinel:true});Object.assign(state.eventsByDay[day].at(-1),patch);
    assert.equal(projectEditorLogbookEvents(state,day,at).at(-1).endMin,1304);
  }
});
test('the home-terminal date determines whether an event ends at Now or historical midnight',()=>{
  const state=fixture({sentinel:true});state.homeTerminalTimeZone='America/Chicago';state.currentStatus='SB';
  assert.equal(projectEditorLogbookEvents(state,day,new Date('2026-10-23T04:45:00Z')).at(-1).endMin,1425);
  assert.equal(projectEditorLogbookEvents(state,day,new Date('2026-10-23T05:00:00Z')).at(-1).endMin,1440);
});
console.log(`${count} HOS rest review and historical editor regression groups passed`);
mock.timers.reset();
