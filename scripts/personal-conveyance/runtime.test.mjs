import test from 'node:test';
import assert from 'node:assert/strict';
import {applyLogbookEditorEdit,applyLogbookEditorInsert} from '../../source/src/modules/logbook/eventEditingV110.js';
import {createCertificationRecord,certificationStatusV1032} from '../../source/src/modules/logbook/certificationV110.js';
import {buildDayBackupPayload,applyDayBackupToState} from '../../source/src/core/backup/dayTransfer.js';
import {readLogbookReportDay} from '../../source/src/modules/logbook/reportDayV110391.js';
import {choosePersonalConveyance,PC_MODE} from './mode.js';
const day='2026-09-18',at=new Date('2026-09-19T18:00:00Z');
function fixture(){
  const state={activeDay:day,homeTerminalTimeZone:'America/New_York',currentStatus:'OFF',currentReason:'Off Duty',
    driver:{name:'Test Driver',truck:'TEST'},driverProfile:{name:'Test Driver'},
    eventsByDay:{[day]:[
      {id:'rest',status:'SB',startMin:0,endMin:480,city:'Origin',state:'IN',note:'Sleeper Berth'},
      {id:'work',status:'D',specialMode:'none',startMin:480,endMin:620,city:'Origin',state:'IN',note:'Driving',manualMiles:140},
      {id:'drop',status:'ON',specialMode:'none',startMin:620,endMin:650,city:'Drop lot',state:'IN',note:'Drop Load / Trailer',droppedTrailer:'TEST'},
      {id:'personal',status:'D',specialMode:'none',startMin:650,endMin:760,city:'Drop lot',state:'IN',note:'Driving',manualMiles:70},
      {id:'home',status:'OFF',specialMode:'none',startMin:760,endMin:1440,city:'Home',state:'IL',note:'Off Duty'},
    ]},manualMilesByDay:{[day]:210},routeLegsByDay:{},signatureByDay:{},certifyStatus:{},inspectionByDay:{},formByDay:{}};
  state.signatureByDay[day]=createCertificationRecord(state,day,{driverName:'Test Driver',now:+at});
  state.certifyStatus[day]='Certified';return state;
}
function edit(state,patch){const event=state.eventsByDay[day].find(e=>e.id==='personal');return applyLogbookEditorEdit(state,{day,id:event.id,expected:structuredClone(event),expectedRows:structuredClone(state.eventsByDay[day]),patch},at);}
test('Driving to explicit OFF/PC changes only the chosen interval and retains miles and signed history',()=>{
  const state=fixture(),before=structuredClone(state),event=state.eventsByDay[day][3];
  const patch=choosePersonalConveyance({...event,note:'Bobtail home; work complete'},true),result=edit(state,patch);
  assert.equal(result.ok,true);assert.equal(result.changed,true);
  const next=result.state,row=next.eventsByDay[day][3];
  assert.equal(row.status,'OFF');assert.equal(row.specialMode,PC_MODE);
  assert.equal(row.startMin,650);assert.equal(row.endMin,760);assert.equal(row.manualMiles,70);
  assert.deepEqual(next.eventsByDay[day].filter(e=>e.id!=='personal'),state.eventsByDay[day].filter(e=>e.id!=='personal'));
  assert.deepEqual(next.manualMilesByDay,state.manualMilesByDay);
  assert.deepEqual(next.signatureByDay,state.signatureByDay);
  assert.equal(certificationStatusV1032(next,day).status,'Needs Recertification');
  assert.deepEqual(next.logbookEditHistoryByDay[day][0].beforeEvents,state.eventsByDay[day]);
  const report=readLogbookReportDay(next,day,at);
  assert.equal(report.filter(e=>e.status==='D').reduce((sum,e)=>sum+e.endMin-e.startMin,0),140);
  assert.equal(report.find(e=>e.id==='personal').specialMode,PC_MODE);
  assert.deepEqual(state,before);
});
test('OFF metadata-only correction invalidates certification and survives export/import/reload',()=>{
  const state=fixture();state.eventsByDay[day][3].status='OFF';
  state.signatureByDay[day]=createCertificationRecord(state,day,{driverName:'Test Driver',now:+at});
  const next=edit(state,choosePersonalConveyance(state.eventsByDay[day][3],true)).state;
  assert.equal(certificationStatusV1032(next,day).status,'Needs Recertification');
  const payload=JSON.parse(JSON.stringify(buildDayBackupPayload(next,day,'test')));
  const restored=applyDayBackupToState(state,payload,day);
  const event=restored.eventsByDay[day].find(e=>e.id==='personal');
  assert.equal(event.status,'OFF');assert.equal(event.specialMode,PC_MODE);assert.equal(event.manualMiles,70);
  assert.equal(certificationStatusV1032(restored,day).status,'Needs Recertification');
  assert.deepEqual(restored.signatureByDay[day],state.signatureByDay[day]);
});
test('moving back to Driving clears PC; stale edits and invalid PC combinations are refused',()=>{
  const state=fixture(),next=edit(state,choosePersonalConveyance(state.eventsByDay[day][3],true)).state;
  assert.equal(edit(next,{status:'D'}).state.eventsByDay[day][3].specialMode,'none');
  assert.equal(edit(state,{status:'D',specialMode:PC_MODE}).ok,false);
  assert.equal(applyLogbookEditorEdit(next,{day,id:'personal',expected:state.eventsByDay[day][3],patch:{note:'stale'}},at).ok,false);
});
test('insert supports OFF/PC and rejects D/PC without replacing existing rows',()=>{
  const state=fixture(),before=structuredClone(state);
  const event={id:'new-pc',status:'OFF',specialMode:PC_MODE,startMin:800,endMin:820,city:'Home',state:'IL',note:'Personal Conveyance'};
  const result=applyLogbookEditorInsert(state,{day,event,expectedRows:state.eventsByDay[day]},at);
  assert.equal(result.ok,true);assert.equal(result.state.eventsByDay[day].find(e=>e.id==='new-pc').specialMode,PC_MODE);
  assert.equal(applyLogbookEditorInsert(state,{day,event:{...event,status:'D'}},at).ok,false);
  assert.deepEqual(state,before);
});
