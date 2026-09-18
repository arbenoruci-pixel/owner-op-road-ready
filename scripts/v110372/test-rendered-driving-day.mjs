import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mock} from 'node:test';
import {register} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {graphX,graphY} from '../../source/src/modules/graph/graphGeometryV110.js';
import {projectLogbookEvents} from '../../source/src/modules/logbook/eventEditingV110.js';
import {dutyViewEvents} from '../../source/src/modules/logbook/dutyViewV110212.js';
register(new URL('../test-jsx-loader.mjs',import.meta.url));
const {default:DayLogScreen}=await import('../../source/src/modules/logbook/DayLogScreen.jsx');
const day='2026-09-17',next='2026-09-18';
const row=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,city:'Synthetic city',state:'OH',source:'manual',note:'',...extra});
function fixture() {
 return {view:'day',activeDay:day,homeTerminalTimeZone:'America/New_York',driver:{truck:'TEST',trailer:'TEST'},driverProfile:{name:'Synthetic Driver'},
 currentStatus:'D',currentReason:'Driving',currentLocation:{city:'Synthetic city',state:'OH'},selectedEventId:null,selectedIds:[],selectMode:false,
 eventsByDay:{[day]:[row('rest','OFF',0,1325),row('drive','D',1325,1326)],
 [next]:[row('bridge','D',0,1,{source:'manual_drive_midnight_continuation',crossMidnightContinuation:true,crossMidnightFromDay:day,crossMidnightFromEventId:'drive'})]},
 manualDrivingSession:{active:true,status:'D',eventId:'bridge',startDay:next},
 certifyStatus:{},signatureByDay:{},routeLegsByDay:{},inspectionByDay:{},formByDay:{},logbookEditHistoryByDay:{}};
}
mock.timers.enable({apis:['Date'],now:new Date('2026-09-18T04:42:00Z')});
function render(s,start,end,label) {
 const before=structuredClone(s),html=renderToStaticMarkup(React.createElement(DayLogScreen,{state:s,events:[],liveCurrent:{status:s.currentStatus}}));
 const svg=html.match(/<svg[^>]*log-graph-v110[\s\S]*?<\/svg>/)?.[0];assert.ok(svg,label+' graph');
 const path=`M ${graphX(start)} ${graphY('D')} H ${graphX(end)}`;
 assert.ok(svg.includes('d="'+path+'"'),label+' Driving path: '+path);
 assert.ok(svg.includes('>'+((end-start)/60).toFixed(2)+'</text>'),label+' exact Driving total');
 assert.deepEqual(s,before,label+' rendering does not mutate records');
 console.log('PASS — '+label);return html;
}
const first=fixture();
assert.match(render(first,1325,1440,'origin day reaches midnight using the recorded next-day link'),/1h 55m/);
render(JSON.parse(JSON.stringify(first)),1325,1440,'serialized reopen retains the same origin endpoint');
assert.equal(projectLogbookEvents(first,day).at(-1).endMin,1326,'raw Edit/Insert projection remains exact');
const selected=fixture();selected.selectMode=true;render(selected,1325,1326,'Select retains raw stored minutes');
const closed=fixture();delete closed.eventsByDay[next];delete closed.manualDrivingSession;
render(closed,1325,1326,'ordinary historical Driving does not gain inferred time');
const ended=fixture();ended.eventsByDay[day].at(-1).paperLogEndV110315=true;
render(ended,1325,1326,'explicitly corrected End remains authoritative');
const live=fixture();delete live.eventsByDay[next];live.manualDrivingSession={active:true,status:'D',eventId:'drive',startDay:day};
mock.timers.setTime(new Date('2026-09-18T03:42:00Z').getTime());
render(live,1325,1422,'current origin day still reaches home-terminal Now');
mock.timers.setTime(new Date('2026-09-18T03:43:00Z').getTime());
render(live,1325,1423,'current Driving advances one minute without changing its raw sentinel');
mock.timers.setTime(new Date('2026-09-18T04:42:00Z').getTime());
render(live,1325,1440,'pending midnight tick completes only its exact active origin');
const tomorrow=fixture();tomorrow.activeDay=next;
render(tomorrow,0,42,'next-day continuation independently reaches Now');
const exact=projectLogbookEvents(first,day),clock={day:next,minute:42};
const shown=dutyViewEvents(exact,[],{day,state:first,eventsByDay:first.eventsByDay,clock});
assert.equal(shown.at(-1).endMin,1440,'the shared view used by mileage gets the same endpoint');
const source=fs.readFileSync('source/src/modules/logbook/DayLogScreen.jsx','utf8');
assert.equal(source.split('dutyViewEvents(exactViewEventsV110, displayEvents, { eventsByDay:state.eventsByDay, day:state.activeDay, state, clock:clockV110 })').length-1,2,'both graph/list and mileage are wired to the same evidence');
console.log('PASS — 10 rendered and shared-view contracts; no raw events or signatures changed');
