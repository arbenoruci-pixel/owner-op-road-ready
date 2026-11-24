import test from 'node:test';
import assert from 'node:assert/strict';
import {previewLogbookEditorOverride,applyLogbookEditorEdit} from '../../source/src/modules/logbook/eventEditingV110.js';

const day='2026-10-21', prior='2026-10-20', at=new Date('2026-10-21T16:30:00Z');
const expected={id:'pickup',source:'live_status',status:'ON',startMin:720,endMin:721,city:'Example City',state:'IL',note:'Pickup / Loading',reasons:['Pickup / Loading'],shippingDocs:'',loadNo:'',bol:'',destination:'',destinationState:'',loadDetailsExplicit:true};
const change={bol:'0042',shippingDocs:'0042',destination:'Dayton, OH',destinationState:'OH',loadDetailsExplicit:true};
function fixture(){
  const pickup={...expected,endMin:729};
  return {activeDay:day,homeTerminalTimeZone:'America/New_York',currentStatus:'ON',currentReason:'Pickup / Loading',
    liveNonDrivingDuty:{day,eventId:pickup.id,status:'ON'},certifyStatus:{[day]:'Active day / Not certified yet',[prior]:'Certified'},signatureByDay:{[prior]:'synthetic-signature'},
    eventsByDay:{[prior]:[{id:'prior',status:'OFF',startMin:0,endMin:1440,city:'Example City',state:'IL'}],[day]:[{id:'rest',status:'OFF',startMin:0,endMin:720,city:'Example City',state:'IL'},pickup]},
    routeLegsByDay:{[day]:[{id:'linked',day,pickupDay:day,pickupEventId:'pickup',pickupMin:720,source:'pickup_event',status:'open',shippingDocs:'',bol:'',toCity:'',toState:''},{id:'unrelated',day,pickupDay:day,pickupEventId:'other',source:'pickup_event',status:'open',bol:'KEEP'}]},
    inspectionByDay:{},manualMilesByDay:{[day]:123},loadInfo:{}};
}
const command=patch=>({day,id:'pickup',expected,patch});
test('clock movement while form is open does not disable metadata preview',()=>{
  const state=fixture(),before=structuredClone(state);
  const result=previewLogbookEditorOverride(state,command({}),at);
  assert.equal(result.ok,true);assert.equal(result.changed,false);assert.deepEqual(state,before);
});
test('save and reopen BOL and destination on exact pickup without changing any minute',()=>{
  const state=fixture(),before=structuredClone(state);
  const result=applyLogbookEditorEdit(state,command(change),at);
  assert.equal(result.ok,true,result.error);
  const saved=JSON.parse(JSON.stringify(result.state));
  const row=saved.eventsByDay[day].find(e=>e.id==='pickup');
  assert.equal(row.bol,'0042');assert.equal(row.destination,'Dayton, OH');assert.equal(row.destinationState,'OH');
  assert.equal(row.startMin,720);assert.equal(row.endMin,729);assert.equal(row.status,'ON');
  assert.deepEqual(saved.eventsByDay[day][0],before.eventsByDay[day][0]);
  assert.deepEqual(saved.eventsByDay[prior],before.eventsByDay[prior]);assert.deepEqual(saved.signatureByDay,before.signatureByDay);
  assert.deepEqual(saved.manualMilesByDay,before.manualMilesByDay);assert.deepEqual(saved.liveNonDrivingDuty,before.liveNonDrivingDuty);
  assert.deepEqual(saved.routeLegsByDay[day][1],before.routeLegsByDay[day][1]);
  assert.equal(saved.routeLegsByDay[day][0].bol,'0042');assert.equal(saved.routeLegsByDay[day][0].toCity,'Dayton');
  assert.deepEqual(state,before);
});
for(const [name,alter,patch] of [
  ['new BOL from another edit',s=>{s.eventsByDay[day][1].bol='OTHER';},change],
  ['changed start',s=>{s.eventsByDay[day][1].startMin=719;},change],
  ['changed location',s=>{s.eventsByDay[day][1].city='Other City';},change],
  ['changed status',s=>{s.currentStatus='D';},change],
  ['different live session',s=>{s.liveNonDrivingDuty.eventId='other';},change],
  ['signed day',s=>{s.signatureByDay[day]='signed';},change],
  ['clock reversed',s=>{s.eventsByDay[day][1].endMin=720;},change],
  ['explicit timing patch',s=>{}, {...change,startMin:719}],
  ['explicit notes patch',s=>{}, {...change,note:'Changed'}],
  ['end later than clock',s=>{s.eventsByDay[day][1].endMin=740;},change]
])test('still rejects '+name,()=>{
  const state=fixture(),before=structuredClone(state);
  assert.equal(applyLogbookEditorEdit(state,command(patch),at).ok,false);
  assert.deepEqual(state,before);
});
