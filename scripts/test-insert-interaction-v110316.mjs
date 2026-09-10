import assert from 'node:assert/strict';
import {insertPointerMinuteV110316 as pointer} from '../source/src/modules/editor/insertInteractionsV110316.js';
import {insertBoundaryV110314 as boundary} from '../source/src/modules/editor/insertTimeV110314.js';
import {applyLogbookEditorInsert as save,previewLogbookInsertOverride as preview} from '../source/src/modules/logbook/eventEditingV110.js';
import {traceGeometry} from '../source/src/modules/graph/graphGeometryV110.js';
const one={startMin:1425,endMin:1426};
for(const [edge,delta] of [['end',-80],['start',5]]) {
 const minute=pointer(edge,one[edge+'Min'],delta,390);
 const next=boundary(one,edge,minute,1440,true);
 assert.ok(edge==='end'?next.endMin<one.endMin:next.startMin>one.startMin);
 assert.equal(next.endMin-next.startMin,1);
}
console.log('PASS — one-minute Insert can move left and right past either original boundary');
const day='2026-09-09',at=new Date('2026-09-10T09:44:00Z');
for(const status of ['OFF','SB','ON']) {
 const state={activeDay:day,currentStatus:status,homeTerminalTimeZone:'America/New_York',eventsByDay:{[day]:[{id:'early',status:'D',startMin:0,endMin:1321,source:'gps_drive'},{id:'tail',status,startMin:1321,endMin:1322,source:'live_status'}]},signatureByDay:{older:{signed:true}}};
 const before=structuredClone(state),command={day,event:{id:'new',status:'ON',startMin:1395,endMin:1425}};
 const p=preview(state,command,at),r=save(state,command,at);
 assert.equal(r.ok,true,r.error);assert.deepEqual(p.events,r.events);assert.deepEqual(state,before);
 assert.deepEqual(r.events.map(e=>[e.status,e.startMin,e.endMin]),[['D',0,1321],[status,1321,1395],['ON',1395,1425],[status,1425,1440]]);
 assert.deepEqual(traceGeometry(r.events).discontinuities,[]);
 const reopened=JSON.parse(JSON.stringify(r.state));
 const second=save(reopened,{day,event:{id:'second',status:'OFF',startMin:1380,endMin:1400}},at);
 assert.equal(second.ok,true,second.error);assert.deepEqual(traceGeometry(second.events).discontinuities,[]);
 assert.deepEqual(second.state.signatureByDay,state.signatureByDay);
 const ended=structuredClone(state);ended.eventsByDay[day][1].paperLogEndV110315=true;
 assert.equal(save(ended,command,at).events.find(e=>e.id==='tail').endMin,1322);
 console.log(`PASS — yesterday's ${status} continues around Insert; Save/reopen and repeated Insert agree; explicit End remains exact`);
}
