import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { graphX,graphY,traceGeometry } from '../source/src/modules/graph/graphGeometryV110.js';
register(new URL('./test-jsx-loader.mjs',import.meta.url));
const {default:DayLogScreen}=await import('../source/src/modules/logbook/DayLogScreen.jsx');

mock.timers.enable({apis:['Date'],now:new Date('2026-09-08T09:12:00Z')});
const yesterday='2026-09-07',today='2026-09-08';
const stateFor=(day,status='OFF')=>({
  view:'day',activeDay:day,homeTerminalTimeZone:'America/New_York',
  driver:{truck:'TEST',trailer:'TEST'},driverProfile:{name:'Synthetic Driver'},
  currentStatus:status,currentReason:status==='OFF'?'Off Duty':status==='SB'?'Sleeper':'On Duty',
  currentLocation:{city:'Downers Grove',state:'IL'},
  selectedEventId:null,selectedIds:[],selectMode:false,
  eventsByDay:{[yesterday]:[{id:'phone-off',status,startMin:0,endMin:1202,city:'Downers Grove',state:'IL',source:'manual'}]},
  certifyStatus:{},signatureByDay:{},routeLegsByDay:{},inspectionByDay:{},formByDay:{},
  logbookEditHistoryByDay:{[yesterday]:[{kind:'edit',targetId:'phone-off',marker:'retain'}]},
});
function render(state,minutes){
  const before=structuredClone(state);
  const html=renderToStaticMarkup(React.createElement(DayLogScreen,{state,events:[],liveCurrent:{status:state.currentStatus}}));
  const svg=html.match(/<svg[^>]*log-graph-v110[\s\S]*?<\/svg>/)?.[0];
  assert.ok(svg,'real DayLogScreen rendered its graph');
  const paths=[...svg.matchAll(/class="duty-trace-v110"[^>]* d="([^"]+)"/g)].map(m=>m[1]);
  const expected='M '+graphX(0)+' '+graphY(state.currentStatus)+' H '+graphX(minutes);
  assert.deepEqual(paths,[expected],state.activeDay+' graph must reach the same endpoint as its event row');
  assert.ok(svg.includes('>'+(minutes/60).toFixed(2)+'</text>'),'graph total matches duty duration');
  assert.deepEqual(state,before,'React rendering never writes events/history/signatures');
  return html;
}
let count=0;
for(const status of ['OFF','SB','ON']){
  const past=stateFor(yesterday,status),current=stateFor(today,status);
  assert.match(render(past,1440),/24h/);
  assert.match(render(current,312),/5h 12m/);
  assert.match(render(JSON.parse(JSON.stringify(current)),312),/5h 12m/);
  mock.timers.setTime(new Date('2026-09-08T09:13:00Z').getTime());
  assert.match(render(current,313),/5h 13m/);
  mock.timers.setTime(new Date('2026-09-08T09:12:00Z').getTime());
  count++;console.log('PASS — rendered '+status+' graph/list: yesterday 24h, today 5h12, serialized reopen, later Now');
}
const selected=stateFor(yesterday);selected.selectMode=true;
render(selected,1202);
console.log('PASS — Select still renders exact raw event boundaries');
const irregular=stateFor(yesterday);
irregular.eventsByDay[yesterday]=[
  {id:'off',status:'OFF',startMin:0,endMin:480},
  {id:'sleeper',status:'SB',startMin:480,endMin:900},
  {id:'short',status:'ON',startMin:915,endMin:916},
  {id:'drive',status:'D',startMin:916,endMin:1000},
  {id:'finish',status:'ON',startMin:1000,endMin:1010},
  {id:'rest',status:'OFF',startMin:1008,endMin:1440},
];
const untouched=structuredClone(irregular);
const html=renderToStaticMarkup(React.createElement(DayLogScreen,{state:irregular,events:[],liveCurrent:{status:'OFF'}}));
assert.match(html,/data-kind="Gap"/);assert.match(html,/data-kind="Overlap"/);
for(const segment of traceGeometry(irregular.eventsByDay[yesterday]).segments)assert.ok(html.includes('d="'+segment.path+'"'));
assert.match(html,/1m/,'one-minute event remains visible');
assert.deepEqual(irregular,untouched);
console.log('PASS — rendered graph retains real Gap, Overlap and one-minute raw evidence');
const driving=stateFor(yesterday,'D');
render(driving,1202);
console.log('PASS — closed Driving does not gain invented time');
console.log((count+3)+' full React tree rendering regression groups passed');
