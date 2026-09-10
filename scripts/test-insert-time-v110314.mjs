import assert from 'node:assert/strict';
import { insertDayLimitV110314 as limit, initialInsertRangeV110314 as initial, quickInsertRangeV110314 as quick, durationInsertRangeV110314 as duration, insertBoundaryV110314 as boundary } from '../source/src/modules/editor/insertTimeV110314.js';
import { applyLogbookEditorInsert, previewLogbookInsertOverride } from '../source/src/modules/logbook/eventEditingV110.js';
const range=(startMin,endMin)=>({startMin,endMin});
const day='2026-09-09', at=new Date('2026-09-10T03:27:00Z'), now=1407;
assert.deepEqual(initial(now),range(1392,1407));
assert.deepEqual(initial(now,1407,1408),range(1392,1407));
assert.deepEqual(quick(now,0),range(1392,1407));
for(const ago of [10,15,30])assert.deepEqual(quick(now,ago),range(now-ago,now));
assert.deepEqual(duration(now,1406,30),range(1377,1407));
assert.deepEqual(boundary(range(1406,1407),'end',1408,now),range(1406,1407));
assert.deepEqual(boundary(range(1392,1407),'start',1406,now),range(1406,1407));
assert.deepEqual(boundary(range(1392,1407),'end',1380,now,true),range(1365,1380));
for(const n of [0,1,5,30,1360,1407,1439,1440]) {
 const choices=[initial(n),initial(n,n,n+1),... [0,10,15,30].map(a=>quick(n,a)),... [15,30,60,120].map(d=>duration(n,n-1,d))];
 for(const r of choices) {
  if(n===0){assert.deepEqual(r,range(0,0));continue;}
  for(const candidate of [r,...['start','end'].flatMap(edge=>[-500,0,1,n-1,n,1440,1500].flatMap(m=>[boundary(r,edge,m,n),boundary(r,edge,m,n,true)]))]) {
   assert.ok(candidate.startMin>=0&&candidate.endMin<=n&&candidate.startMin<candidate.endMin,JSON.stringify({n,candidate}));
  }
 }
}
for(const [selected,expected] of [['2026-09-08',1440],[day,now],['2026-09-10',0]])assert.equal(limit({activeDay:selected},{day,minute:now}),expected);
assert.deepEqual(initial(1440,900,930),range(900,930));
for(const status of ['OFF','SB','ON']) {
 const state={activeDay:day,homeTerminalTimeZone:'America/New_York',currentStatus:status,eventsByDay:{[day]:[{id:'earlier',status:'OFF',source:'manual',startMin:0,endMin:1320},{id:'target',status,source:'live_status',startMin:1320,endMin:1321}]}};
 for(const r of [initial(now),... [0,10,15,30].map(a=>quick(now,a)),duration(now,1406,30),range(1406,1407)]) {
  const command={day,event:{id:'inserted',status:'ON',source:'manual',...r},expectedRows:structuredClone(state.eventsByDay[day])};
  const preview=previewLogbookInsertOverride(state,command,at),saved=applyLogbookEditorInsert(state,command,at);
  assert.equal(preview.ok,true,preview.error);assert.equal(saved.ok,true,saved.error);assert.deepEqual(preview.events,saved.events);assert.equal(saved.state.currentStatus,status);
 }
 const invalid=applyLogbookEditorInsert(state,{day,event:{id:'future',status:'ON',startMin:1407,endMin:1408}},at);
 assert.equal(invalid.ok,false);assert.match(invalid.error,/at or before Now/);
}
console.log('PASS — 23:27 phone regression, all time controls, midnight/historical bounds, OFF/SB/ON preview and Save');
