import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareOnDutyHandoffUpdate as prepare, toggleHandoffActivity as toggle, recordOnDutyHandoffUpdate as audit, handoffPreview} from '../../source/src/core/timeline/ongoingOnDutyV110379.js';
const day='2026-09-18',at=new Date('2026-09-18T14:57:00Z');
const old={id:'drop',status:'ON',source:'live_status',startMin:646,endMin:647,city:'Onalaska',state:'WI',note:'Pre-trip inspection · Drop Off',reasons:['Pre-trip inspection','Drop Off'],description:'Gate instruction',droppedTrailer:'511865',lat:43.8,lng:-91.2,gpsAccuracy:8,locationSource:'gps'};
const state={currentStatus:'ON',homeTerminalTimeZone:'America/New_York',eventsByDay:{[day]:[{id:'rest',status:'SB',startMin:0,endMin:646},old]},routeLegsByDay:{},inspectionByDay:{[day]:{complete:true,sourceEventId:'drop'}},signatureByDay:{prior:{signed:true}},manualMilesByDay:{[day]:251}};
const incoming={...old,id:'new',startMin:657,endMin:658,note:'Pre-trip inspection · Drop & Hook',reasons:['Pre-trip inspection','Drop & Hook'],description:'Updated instruction',droppedTrailer:'NO TRAILER',lat:0,lng:0};
const frozen=structuredClone(state),update=prepare(state,day,incoming,{at});
assert.ok(update);assert.equal(update.events.length,2);assert.equal(update.event.id,'drop');assert.equal(update.event.startMin,646);assert.equal(update.event.endMin,658);assert.equal(update.event.droppedTrailer,'511865');assert.deepEqual(update.event.reasons,incoming.reasons);assert.ok(!update.event.note.includes('Drop Off'));assert.equal(update.event.lat,old.lat);assert.equal(update.event.description,'Updated instruction');assert.deepEqual(state,frozen);
assert.deepEqual(toggle(old.reasons,'Drop & Hook'),['Pre-trip inspection','Drop & Hook']);assert.deepEqual(toggle(incoming.reasons,'Drop Off'),old.reasons);
const after=audit(state,{...state,eventsByDay:{[day]:update.events}},day,update,at),entry=after.logbookEditHistoryByDay[day][0];assert.deepEqual(entry.beforeEvents,state.eventsByDay[day]);assert.deepEqual(entry.afterEvents,update.events);assert.deepEqual(after.signatureByDay,state.signatureByDay);assert.deepEqual(after.manualMilesByDay,state.manualMilesByDay);
let checks=0;
function rejected(changeState={},changeOld={},changeNew={},options={}){const s={...structuredClone(state),...changeState};s.eventsByDay[day]=s.eventsByDay[day].map(e=>e.id==='drop'?{...e,...changeOld}:e);assert.equal(prepare(s,day,{...incoming,...changeNew},{at,...options}),null);checks++;}
for(const field of ['shippingDocs','loadNo','bol','po','destination','destinationState','pickedUpLoadNo','deliveredLoadNo']){rejected({}, {[field]:'RECORDED'});rejected({}, {},{[field]:'NEW PICKUP'});}
for(const field of ['hookedTrailer','hookedContainer','hookedChassis']){rejected({}, {[field]:'RECORDED'});rejected({}, {},{[field]:'NEW PICKUP'});}
rejected({}, {},{loadDetailsExplicit:true});
for(const value of ['Pickup / Loading','Delivery / Unloading','Hook / Pickup Trailer','Hook Empty / Reposition'])rejected({}, {},{note:'Drop Off',reasons:['Drop Off',value]});
rejected({}, {loadDetailsExplicit:true});rejected({}, {integrityRepairedAt:1});rejected({}, {description:'Load ORIGINAL · To Milwaukee, WI'});rejected({}, {source:'manual'});rejected({}, {paperLogEndV110315:true});rejected({}, {endMin:1440});rejected({currentStatus:'D'});rejected({}, {},{city:'Milwaukee'});rejected({}, {},{droppedTrailer:'DIFFERENT'});rejected({}, {},{status:'OFF'});rejected({}, {},{note:'Fuel',reasons:['Fuel']});rejected({}, {},{}, {backdateMinutes:15});rejected({}, {},{}, {at:new Date('2026-09-19T14:57:00Z')});
rejected({routeLegsByDay:{prior:[{pickupEventId:'drop'}]}});rejected({routeLegsByDay:{[day]:[{deliveryEventId:'drop'}]}});rejected({loadInfo:{sourceEventId:'drop'}});
const legacy=structuredClone(state);legacy.eventsByDay[day][1].reasons=[];assert.ok(prepare(legacy,day,incoming,{at}));
assert.ok(handoffPreview(state,{...incoming,reason:incoming.note,backdateMinutes:0},at));
const app=fs.readFileSync('source/src/app/App.jsx','utf8');assert.ok(app.includes('handoffUpdate ? handoffUpdate.events : applyLiveStatusTransition(existing, ev)'));assert.ok(app.includes("reasons:status === 'ON' ? reasons : []"));
console.log(`PASS — ON-duty update retains start/identity/GPS/PTI/audit and rejects ${checks} unrelated or recorded-pickup transitions`);
