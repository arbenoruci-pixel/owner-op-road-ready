import assert from 'node:assert/strict';
import {register} from 'node:module';
import {mock} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
register(new URL('../test-jsx-loader.mjs',import.meta.url));
const {default:Clocks}=await import('../../source/src/modules/drive/HosCompactClocks.jsx');

const day='2026-11-06';
const event=(status,startMin,endMin,index)=>({id:'fixture-'+index,status,startMin,endMin,
  city:'Example City',state:'IL',source:'live_status',note:status});
const rows=[['SB',0,421],['ON',421,437],['D',437,466],['ON',466,529],
  ['D',529,602],['SB',602,756],['ON',756,771],['D',771,978],
  ['OFF',978,1008],['D',1008,1353],['SB',1353,1383]]
  .map((row,index)=>event(...row,index));
const state={homeTerminalTimeZone:'America/New_York',activeDay:day,currentStatus:'SB',
  eventsByDay:{[day]:rows},signatureByDay:{[day]:{signed:true,signature:'fixture-only'}},
  certifyStatus:{[day]:'Certified'}};
const snapshot=structuredClone(state);
mock.timers.enable({apis:['Date'],now:new Date('2026-11-07T04:59:00Z')});

for(const instant of ['2026-11-07T04:59:00Z','2026-11-07T05:01:00Z']) {
  mock.timers.setTime(new Date(instant).getTime());
  const html=renderToStaticMarkup(React.createElement(Clocks,{state}));
  assert.match(html,/data-hos-guidance="pending"/,'a provisional clock must show its pending condition');
  assert.match(html,/Split sleeper pending/);
  assert.match(html,/still required/,'the requirement must be visible without opening another screen');
  assert.doesNotMatch(html,/data-hos-guidance="limit"/,'midnight alone must not create a limit alert');
}
assert.deepEqual(state,snapshot,'rendering must preserve stored rows, certification and signatures');

const nextDay='2026-11-07';
mock.timers.setTime(new Date('2026-11-07T05:30:00Z').getTime());
const violation={...state,activeDay:nextDay,currentStatus:'D',eventsByDay:{
  [day]:[event('SB',0,600,'reset'),event('ON',600,1440,'work')],
  [nextDay]:[event('D',0,30,'over-limit')],
}};
const violationBefore=structuredClone(violation);
const high=renderToStaticMarkup(React.createElement(Clocks,{state:violation}));
assert.match(high,/data-hos-guidance="limit"/,'an actual driving limit must stay visible');
assert.match(high,/role="alert"/);
assert.match(high,/HOS warning/);
assert.deepEqual(violation,violationBefore);
mock.timers.reset();
console.log('PASS — compact HOS shows pending across midnight, exposes actual limits and preserves records');
