import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {register} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {fixture,day,prior,next,at,insert} from './fixture.mjs';
import {projectLogbookEvents,logbookClock,previewLogbookInsertOverride,applyLogbookEditorInsert} from '../../source/src/modules/logbook/eventEditingV110.js';
import {dutyViewEvents} from '../../source/src/modules/logbook/dutyViewV110212.js';
import {displayEventsForDayFromState} from '../../source/src/core/timeline/displayTimeline.js';
register(new URL('../test-jsx-loader.mjs',import.meta.url));
const {default:Insert}=await import('../../source/src/modules/editor/InsertEditEventSheet.jsx');
mock.timers.enable({apis:['Date'],now:at});
function visible(state) {
  const clock=logbookClock(state,at);
  return dutyViewEvents(projectLogbookEvents(state,day,at),displayEventsForDayFromState(state.eventsByDay,day,{today:clock.day,nowMinute:clock.minute,currentStatus:state.currentStatus}),{day,clock,state,eventsByDay:state.eventsByDay});
}
const tuples=rows=>rows.map(e=>[e.status,e.startMin,e.endMin]);
const state=fixture(),before=structuredClone(state);
assert.deepEqual(tuples(visible(state)),[['SB',0,610],['ON',610,627],['D',627,930],['OFF',930,1038],['ON',1038,1053],['D',1053,1440]]);
const html=renderToStaticMarkup(React.createElement(Insert,{events:visible(state),logbookContext:state,defaults:{startMin:1425,endMin:1440},onClose(){},onCreate(){}}));
assert.ok(!html.includes('data-kind="Gap"'),'Opening Insert preserves the midnight sleeper and linked Driving tail');
assert.ok(html.includes('>10.17</text>'),'Insert retains 10h10 of sleeper');
assert.ok(html.includes('>11.25</text>'),'Only the 15-minute insert is removed from Driving');
assert.deepEqual(state,before,'Rendering Insert never mutates records');
console.log('PASS actual Insert React graph retains screenshot sleeper and Driving continuity');
for(const [start,end] of [[1425,1440],[1200,1215],[600,615],[900,1100],[300,315]]) {
  const event=insert(start,end),command={day,event,expectedRows:state.eventsByDay[day]};
  const preview=previewLogbookInsertOverride(state,command,at),saved=applyLogbookEditorInsert(state,command,at);
  assert.equal(preview.ok,true,preview.error);assert.equal(saved.ok,true,saved.error);
  const result=visible(saved.state);
  for(let minute=0;minute<1440;minute++) {
    const actual=result.filter(e=>e.startMin<=minute&&e.endMin>minute);
    assert.equal(actual.length,1,`No missing/overlapping minute ${minute} after ${start}-${end}`);
    assert.equal(actual[0].status,minute>=start&&minute<end?'ON':visible(state).find(e=>e.startMin<=minute&&e.endMin>minute).status);
  }
  assert.deepEqual(tuples(visible(preview.state)),tuples(result),'Preview matches committed timeline');
  assert.deepEqual(tuples(visible(JSON.parse(JSON.stringify(saved.state)))) ,tuples(result),'Reload retains the same timeline');
  for(const key of ['signatureByDay','dotWallet','loadGuidesById'])assert.deepEqual(saved.state[key],before[key]);
  for(const date of [prior,next])assert.deepEqual(saved.state.eventsByDay[date],before.eventsByDay[date]);
  assert.deepEqual(state,before,'Preview/Save leave the input snapshot unchanged');
}
console.log('PASS insert at midnight, within Driving, across statuses and within carried sleeper preserves every outside minute');
for(const change of [
  s=>delete s.eventsByDay[next],
  s=>s.eventsByDay[next][0].crossMidnightFromEventId='unrelated',
  s=>s.eventsByDay[day].at(-1).paperLogEndV110315=true,
  s=>s.logbookEditHistoryByDay[day]=[{kind:'edit',targetId:'drive-pm',beforeEvents:[{...s.eventsByDay[day].at(-1),endMin:1440}],afterEvents:[s.eventsByDay[day].at(-1)]}],
]) {
  const s=fixture();change(s);const r=applyLogbookEditorInsert(s,{day,event:insert()},at);assert.equal(r.ok,true,r.error);
  assert.equal(r.events.find(e=>e.id==='drive-pm').endMin,1054,'Unproven Driving and explicit Ends remain exact');
}
const gap=fixture();gap.eventsByDay[day][2].startMin=940;
const g=applyLogbookEditorInsert(gap,{day,event:insert()},at);
assert.ok(!visible(g.state).some(e=>e.startMin<=935&&e.endMin>935),'Real gaps remain visible');
const stale=previewLogbookInsertOverride(state,{day,event:insert(),expectedRows:[]},at);assert.equal(stale.ok,false);
console.log('PASS absent/mismatched evidence, explicit Ends, real gaps and stale snapshot guards');
for(const status of ['SB','OFF','ON','D']) {
  const today='2026-10-11',s=fixture();s.activeDay=today;s.currentStatus=status;
  s.eventsByDay[today]=[{id:'live',status,startMin:0,endMin:1,source:'live_status'}];
  const now=logbookClock(s,at).minute,command={day:today,event:insert(now-30,now-15)};
  const r=applyLogbookEditorInsert(s,command,at);assert.equal(r.ok,true,r.error);
  const projected=projectLogbookEvents(r.state,today,at);
  assert.equal(projected.at(-1).endMin,now);assert.equal(projected.at(-1).status,status);
  assert.equal(r.state.currentStatus,status);
  assert.equal(projected.reduce((sum,row)=>sum+row.endMin-row.startMin,0),now);
}
console.log('PASS current-day OFF/SB/ON/Driving Insert retains the live status and Now endpoint');
mock.timers.setTime(new Date('2026-10-11T03:55:00Z').getTime());
const future=fixture();future.activeDay=next;future.currentStatus='D';
future.eventsByDay[next]=[{id:'current-drive',status:'D',startMin:0,endMin:1,source:'live_status'}];
const slots=[];let cursor=0,tree;
const cell=initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];};
const dispatcher={useState:cell,useRef:value=>cell(()=>({current:value}))[0],useMemo:fn=>fn(),useCallback:fn=>fn,useEffect(){},useLayoutEffect(){}};
function renderFuture(){cursor=0;const ref=React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher,previous=ref.current;ref.current=dispatcher;try{tree=Insert({events:future.eventsByDay[next],logbookContext:future,defaults:{startMin:1430,endMin:1440},onClose(){},onCreate(){}});}finally{ref.current=previous;}}
function findNode(predicate,node){if(Array.isArray(node)){for(const child of node){const result=findNode(predicate,child);if(result)return result;}return;}if(!node||typeof node!=='object')return;if(predicate(node))return node;return findNode(predicate,node.props?.children);}
renderFuture();
const times=()=>findNode(node=>node.type?.name==='EditorTimeControls',tree);
assert.equal(times().props.end,'23:55','Initial range ends at Now');
// EditorTimeControls translates the visible 12:00 AM choice to 24:00.
times().props.onEndChange('24:00');renderFuture();
assert.equal(times().props.end,'24:00','Explicit midnight input is retained');
const previewGraph=findNode(node=>node.type?.name==='CompactGraphPanelV111',tree);
assert.ok(previewGraph,'Actual Insert renders the graph component');
assert.equal(previewGraph.props.events.find(row=>row.id===previewGraph.props.selectedId).endMin,1440,'Graph and handle must retain the manually chosen midnight End');
console.log('PASS active Driving Insert keeps an explicit midnight End in the graph and handle');
mock.timers.reset();
