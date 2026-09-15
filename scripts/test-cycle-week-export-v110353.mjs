import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('scripts/v110353/cycleWeekExport.js','utf8')
  .replaceAll('export function ','function ');
const api=vm.runInNewContext(source+'\n({latest34HourReset,buildCycleWeekExport,cycleWeekFileName})',{Date,console});
const event=(id,status,startMin,endMin)=>({id,status,startMin,endMin});
const state={
  activeDay:'2026-09-15',
  eventsByDay:{
    '2026-09-07':[event('off-a','OFF',1200,1440)],
    '2026-09-08':[event('off-b','OFF',0,1440)],
    '2026-09-09':[event('off-c','SB',0,360),event('drive','D',360,420)],
    '2026-09-10':[event('on','ON',0,60)],
    '2026-09-15':[event('today','OFF',0,600)],
  },
  routeLegsByDay:{
    '2026-09-09':[{id:'week-route',pickupDay:'2026-09-09',deliveryDay:'2026-09-10',shippingDocs:'KEEP'}],
    '2026-08-30':[{id:'old-route',pickupDay:'2026-08-30',shippingDocs:'DROP'}],
  },
  signatureByDay:{'2026-09-09':{signed:true},'2026-08-30':{signed:true}},
  loadInfo:{shippingDocs:'KEEP',routeLegsByDay:{'2026-09-09':[{id:'mirror',pickupDay:'2026-09-09'}],'2026-08-30':[{id:'old-mirror',pickupDay:'2026-08-30'}]}},
};
const reset=api.latest34HourReset(state,new Date('2026-09-15T14:00:00Z'));
assert.ok(reset,'34h reset must be detected');
assert.equal(reset.completedDay,'2026-09-09');
assert.equal(reset.completedMinute,120);
assert.equal(reset.weekEndDay,'2026-09-16');
assert.equal(reset.weekEndMinute,120);
const payload=api.buildCycleWeekExport(state,{now:new Date('2026-09-15T14:00:00Z'),appVersion:'test'});
assert.equal(payload.window.resetDetected,true);
assert.equal(payload.window.startDay,'2026-09-09');
assert.equal(payload.window.startMinute,120);
assert.ok(payload.state.eventsByDay['2026-09-09'].some(e=>e.id==='off-c'));
assert.ok(payload.state.eventsByDay['2026-09-09'].some(e=>e.id==='drive'));
assert.ok(payload.state.routeLegsByDay['2026-09-09'].some(r=>r.id==='week-route'));
assert.equal(payload.state.routeLegsByDay['2026-08-30'],undefined);
assert.equal(payload.state.signatureByDay['2026-08-30'],undefined);
assert.ok(payload.state.loadInfo.routeLegsByDay['2026-09-09']);
assert.equal(payload.state.loadInfo.routeLegsByDay['2026-08-30'],undefined);
assert.match(api.cycleWeekFileName(payload,new Date('2026-09-15T14:00:00Z')),/road-ready-one-week-2026-09-09/);

const noReset={eventsByDay:{'2026-09-01':[event('d1','D',0,100)],'2026-09-10':[event('d2','ON',0,100)]},routeLegsByDay:{}};
const fallback=api.buildCycleWeekExport(noReset,{now:new Date('2026-09-15T14:00:00Z')});
assert.equal(fallback.window.resetDetected,false);
assert.equal(fallback.window.source,'latest_recorded_7_days');
assert.equal(fallback.window.endDay,'2026-09-11');
assert.equal(fallback.window.startDay,'2026-09-04');
assert.ok(fallback.state.eventsByDay['2026-09-10']);
assert.equal(fallback.state.eventsByDay['2026-09-01'],undefined);
console.log('PASS — latest 34h reset detection, exact 7-day window, route/load mirror filtering and fallback');
