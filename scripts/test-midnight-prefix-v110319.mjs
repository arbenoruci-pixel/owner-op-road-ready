import assert from 'node:assert/strict';
import {dutyViewEvents} from '../source/src/modules/logbook/dutyViewV110212.js';
import {projectLogbookEvents,applyLogbookEditorEdit} from '../source/src/modules/logbook/eventEditingV110.js';
import {displayEventsForDayFromState} from '../source/src/core/timeline/displayTimeline.js';
import {rawCoverageIssues} from '../source/src/core/compliance/rawRodsChecks.js';
import {readArchiveLogbookDay} from '../source/src/modules/logbook/archiveDayV1103.js';
import {applyLiveStatusTransition} from '../source/src/core/timeline/liveDrivingSafety.js';
import {repairRoadReadyFoundationV105} from '../source/src/modules/documents/documentFoundationV105.js';
import {repairLogIntegrityV1051} from '../source/src/modules/logbook/logIntegrityV1051.js';
const day='2026-09-10',prior='2026-09-09',at=new Date('2026-09-10T12:21:00Z');
const row=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,source:'live_status',city:'Example City',state:'IL',...extra});
const tuples=rows=>rows.map(e=>[e.status,e.startMin,e.endMin]);
function fixture(status='SB'){return {activeDay:day,homeTerminalTimeZone:'America/New_York',currentStatus:'ON',eventsByDay:{[prior]:[row('rest',status,1321,1322)],[day]:[row('on','ON',489,490)]},signatureByDay:{[prior]:{marker:'preserve'}},logbookEditHistoryByDay:{}};}
function visible(s){const exact=projectLogbookEvents(s,day,at),continuous=displayEventsForDayFromState(s.eventsByDay,day,{today:day,nowMinute:501,currentStatus:s.currentStatus});return dutyViewEvents(exact,continuous,{eventsByDay:s.eventsByDay,day});}
for(const status of ['SB','OFF','ON']){
 const original=fixture(status),before=structuredClone(original);
 const ended=applyLogbookEditorEdit(original,{day,id:'on',patch:{endMin:501}},at);
 assert.equal(ended.ok,true,ended.error);assert.equal(ended.events[0].paperLogEndV110315,true);
 let s=ended.state;assert.deepEqual(tuples(visible(s)),[[status,0,489],['ON',489,501]]);
 assert.deepEqual(tuples(readArchiveLogbookDay(s,day,at)),tuples(visible(s)));
 assert.deepEqual(tuples(displayEventsForDayFromState(s.eventsByDay,day,{today:day,nowMinute:501})),tuples(visible(s)));
 s={...s,currentStatus:'D',eventsByDay:{...s.eventsByDay,[day]:applyLiveStatusTransition(s.eventsByDay[day],row('drive','D',501,502))}};
 assert.deepEqual(tuples(visible(s)),[[status,0,489],['ON',489,501],['D',501,501]]);
 assert.deepEqual(tuples(visible(JSON.parse(JSON.stringify(s)))),tuples(visible(s)));
 assert.equal(rawCoverageIssues(s.eventsByDay,day,{today:day,nowMinute:501,currentStatus:'D'}).issues.some(i=>i.code==='day_start_gap'),false);
 assert.equal(s.eventsByDay[day].length,2,'the prefix remains display-only');
 assert.deepEqual(s.eventsByDay[prior],original.eventsByDay[prior]);assert.deepEqual(s.signatureByDay,original.signatureByDay);assert.deepEqual(original,before);
}
for(const status of ['D','UNKNOWN',null]){const s=fixture(status);if(!status)delete s.eventsByDay[prior];s.eventsByDay[day][0].paperLogEndV110315=true;assert.equal(visible(s).some(e=>e.startMin===0),false,'No prefix is invented without prior non-driving status');}
for(const status of ['SB','OFF','ON']){
 const s=fixture(status);s.eventsByDay[prior][0].paperLogEndV110315=true;s.eventsByDay[day][0].paperLogEndV110315=true;
 assert.equal(visible(s).some(e=>e.startMin===0),false,'A manually ended prior status cannot carry into a new day');
 assert.equal(readArchiveLogbookDay(s,day,at).some(e=>e.startMin===0),false);
 assert.ok(rawCoverageIssues(s.eventsByDay,day,{today:day,nowMinute:501,currentStatus:'ON'}).issues.some(i=>i.code==='day_start_gap'));
}
const gap=fixture();gap.currentStatus='D';gap.eventsByDay[day]=[row('on','ON',489,495,{paperLogEndV110315:true}),row('drive','D',500,501)];
assert.deepEqual(tuples(visible(gap)),[['SB',0,489],['ON',489,495],['D',500,501]],'An explicit End and real internal gap remain exact');
assert.ok(rawCoverageIssues(gap.eventsByDay,day,{today:day,nowMinute:501,currentStatus:'D'}).issues.length);
console.log('PASS — midnight SB/OFF/ON survives explicit End, next Driving and reload; exact boundaries, real gaps and prior records are preserved');

// Exercise mount effects and Save on the actual editor. This catches the raw
// one-minute End overwriting the projected Now during React initialization.
import React from 'react';
import {register} from 'node:module';
register(new URL('./test-jsx-loader.mjs',import.meta.url));
const {default:Editor}=await import('../source/src/modules/editor/EditEventSheet.jsx');
const OriginalDate=Date;
globalThis.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:['2026-09-10T12:15:00Z']));}static now(){return new OriginalDate('2026-09-10T12:15:00Z').getTime();}};
globalThis.window={setInterval:()=>0,addEventListener(){},removeEventListener(){},localStorage:{getItem:()=>null}};
globalThis.document={hidden:false,addEventListener(){},removeEventListener(){}};
function mountEditor(s){
 const slots=[];let cursor=0,tree,effects=[],command;
 const same=(a,b)=>a?.length===b?.length&&a?.every((v,i)=>Object.is(v,b[i]));
 const cell=initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];};
 const dispatcher={useState:cell,useRef:v=>cell(()=>({current:v}))[0],useMemo:(fn,deps)=>{const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={deps,value:fn()};return slots[i].value;},useEffect:(fn,deps)=>{const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){slots[i]={deps};effects.push(fn);}}};
 const render=()=>{cursor=0;const internal=React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher,prior=internal.current;internal.current=dispatcher;try{tree=Editor({event:s.eventsByDay[day][0],events:s.eventsByDay[day],logbookContext:s,onSave:c=>{command=c;},onClose(){}});}finally{internal.current=prior;}return tree;};
 const all=()=>{const out=[];const walk=n=>{if(Array.isArray(n)){n.forEach(walk);return;}if(!n||typeof n!=='object')return;out.push(n);walk(n.props?.children);};walk(tree);return out;};
 const find=fn=>{const n=all().find(fn);assert.ok(n,'Production editor control exists');return n;};
 render();const mounted=effects;effects=[];mounted.forEach(fn=>fn());render();
 return {render,find,get command(){return command;}};
}
for(const startMin of [489,495]){
 const s=fixture();s.eventsByDay[day]=[row('on','ON',startMin,startMin+1,{note:'Pre-trip inspection'})];
 const ui=mountEditor(s),times=()=>ui.find(n=>n.type?.name==='EditorTimeControls');
 assert.equal(times().props.end,'08:15','Mount keeps the displayed End at Now');
 assert.equal(ui.find(n=>n.props?.className==='save-main').props.disabled,true,'Mount alone does not change the draft');
 ui.find(n=>n.props?.['aria-label']==='Delivery').props.onClick();ui.render();
 ui.find(n=>n.props?.placeholder==='BOL or load reference').props.onChange({target:{value:'76543210'}});ui.render();
 assert.equal(ui.find(n=>n.props?.className==='save-main').props.disabled,false);
 ui.find(n=>n.props?.className==='save-main').props.onClick();
 assert.ok(ui.command);assert.equal(Object.hasOwn(ui.command.patch,'endMin'),false);assert.equal(Object.hasOwn(ui.command.patch,'startMin'),false);
 const saved=applyLogbookEditorEdit(s,{...ui.command,id:'on'},new Date());assert.equal(saved.ok,true,saved.error);
 assert.equal(saved.events[0].paperLogEndV110315,undefined);assert.equal(saved.events[0].endMin,startMin+1);
 assert.equal(projectLogbookEvents(saved.state,day,at)[0].endMin,501,'Details leave the live timer open');
 assert.equal(visible(saved.state)[0].status,'SB');
 const normalized=repairLogIntegrityV1051(repairRoadReadyFoundationV105(JSON.parse(JSON.stringify(saved.state))));
 assert.deepEqual(normalized.eventsByDay,saved.state.eventsByDay,'Reload cleanup preserves explicitly chosen activities and BOL');
}
globalThis.Date=OriginalDate;
console.log('PASS — real React mount and Delivery/BOL Save preserve untouched live End at the first minute and after elapsed time');
