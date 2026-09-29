import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {nearestCensusPlace} from '../../source/src/core/gps/nearbyPlaceV110421.js';
import {censusPlace,reverseGpsLookup} from '../../source/src/core/gps/reverseLookupV110421.js';
import {resolveGpsPosition} from '../../source/src/core/gps/locationService.js';
import {gpsFixMessage} from '../../source/src/core/gps/gpsFeedbackV110409.js';
import {dutyActivities,parseRecordedActivities,composeRecordedActivities} from '../../source/src/shared/duty/dutyActivities.js';
import * as certification from '../../source/src/modules/logbook/certificationV110.js';
import {isPreTripActivity} from '../../source/src/core/compliance/preTripActivityV110421.js';
import {missingPreTripRequirementsForDay} from '../../source/src/core/compliance/preTripContinuity.js';
import {normalizeLogEvents} from '../../source/src/core/timeline/timelineEngine.js';
const {createCertificationRecord,certificationStatusV1032:status,reconcileCertificationStatusesV1032:reconcile}=certification;
const day='2026-09-27',other='2026-09-26';
const row=(id)=>({id,status:'OFF',startMin:0,endMin:1440,city:'Newark',state:'DE',note:'Off Duty'});
export function fixture(){
  const s={activeDay:day,eventsByDay:{[day]:[row('a')],[other]:[row('b')]},driver:{truck:'12',trailer:'TEST'},driverProfile:{name:'Fixture Driver'},carrierName:'Fixture Carrier',mainOfficeAddress:'Fixture Office',signatureByDay:{},certifyStatus:{},driverSignature:{dataUrl:'fixture-signature',driverName:'Fixture Driver'}};
  for(const d of [day,other]) {s.signatureByDay[d]=createCertificationRecord(s,d,{driverName:'Fixture Driver',now:100});s.certifyStatus[d]='Certified';}
  s.signatureByDay[day]={...s.signatureByDay[day],needsRecertification:true,changedAfterSignAt:200,integrityRepairReason:'prior repair',repairReason:'prior repair'};s.certifyStatus[day]='Needs Recertification';
  return s;
}
function handlers(initial,{confirm=true,blocked=''}={}) {
  const source=fs.readFileSync('source/src/app/App.jsx','utf8');
  const start=source.indexOf('  function signLogDay('),end=source.indexOf('  function saveInspection(',start);
  assert(start>=0 && end>start);
  const env={...certification,materializeCarriedDayForCertificationV11026:s=>s,signBlockMessage:()=>blocked,signConfirmMessage:()=>confirm?'':'Review warnings',window:{confirm:()=>confirm,alert:()=>{}}};
  return new Function('initial',...Object.keys(env),`let state=initial;const setState=fn=>{state=fn(state)};${source.slice(start,end)};return {signLogDay,signLogDays,getState:()=>state};`)(structuredClone(initial),...Object.values(env));
}
test('batch recertification clears stale flags, retains prior attestation and reloads as Certified',()=>{
  const before=fixture(),h=handlers(before);h.signLogDays([day]);const after=h.getState();
  assert.equal(after.certifyStatus[day],'Certified');assert.equal(status(after,day).status,'Certified');
  for(const key of ['needsRecertification','changedAfterSignAt','integrityRepairReason','repairReason'])assert.equal(after.signatureByDay[day][key],undefined);
  assert.equal(after.signatureByDay[day].certificationHistory.at(-1).needsRecertification,true);
  assert.equal(after.signatureByDay[day].certificationHistory.at(-1).signedAt,100);
  assert.deepEqual(after.eventsByDay,before.eventsByDay);assert.deepEqual(after.signatureByDay[other],before.signatureByDay[other]);
  assert.equal(reconcile(JSON.parse(JSON.stringify(after))).certifyStatus[day],'Certified');
});
test('single sign remains stable and real event/form/mileage edits still require recertification',()=>{
  const h=handlers(fixture());h.signLogDay(day);const signed=h.getState();assert.equal(status(signed,day).status,'Certified');
  for(const change of [s=>s.eventsByDay[day][0].city='Wilmington',s=>s.formByDay={[day]:{truck:'99'}},s=>s.manualMilesByDay={[day]:2}]) {
    const edited=structuredClone(signed);change(edited);assert.equal(status(edited,day).status,'Needs Recertification');
  }
});
test('bulk cancellation and validation blockers never create an attestation',()=>{
  for(const options of [{confirm:false},{blocked:'Review required'}]){const before=fixture(),h=handlers(before,options);h.signLogDays([day,other]);assert.deepEqual(h.getState(),before);}
});
test('nationwide nearest-place coverage includes highway stops and enforces authoritative state and distance',()=>{
  const nearby=nearestCensusPlace(39.661,-75.738,{state:'DE'});assert(nearby?.city);assert.equal(nearby.state,'DE');assert(nearby.distanceMiles<5);
  assert.equal(nearby.approximate,true);assert.match(gpsFixMessage(nearby),/Nearby city.*confirm location/);
  assert.equal(nearestCensusPlace(70,-150),null);assert.equal(nearestCensusPlace(39.661,-75.738,{state:'CA'}),null);
  assert.equal(nearestCensusPlace(NaN,0),null);
});
test('Census state-only response uses an actual nearby place, never the subdivision name',()=>{
  const result=censusPlace({result:{geographies:{States:[{STUSAB:'DE'}],'County Subdivisions':[{NAME:'Administrative District 999 township'}]}}},39.661,-75.738);
  assert(result.city);assert.notEqual(result.city,'Administrative District 999');assert.equal(result.state,'DE');assert.equal(result.approximate,true);
  assert.equal(censusPlace({result:{geographies:{}}},39.661,-75.738),null);
});
test('route bounds, missing parameters, municipality, timeout and upstream failure',async()=>{
  for(const [lat,lng] of [[null,null],['',''],['90','-75'],['39','0'],['NaN','-75']])assert.equal((await reverseGpsLookup(lat,lng,{fetchImpl:()=>assert.fail('invalid coordinates fetched')})).status,400);
  const exact=await reverseGpsLookup('39.6837','-75.7497',{fetchImpl:async url=>{assert(new URL(url).searchParams.get('layers').includes('Incorporated Places'));return {ok:true,json:async()=>({result:{geographies:{States:[{STUSAB:'DE'}],'Incorporated Places':[{BASENAME:'Newark',STUSAB:'DE'}]}}})};}});
  assert.deepEqual(exact.body,{city:'Newark',state:'DE',source:'us-census-geocoder',approximate:false});
  for(const fetchImpl of [async()=>{throw Error('offline')},async()=>({ok:false}),(_,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout')),{once:true}))]){
    const r=await reverseGpsLookup('39.661','-75.738',{fetchImpl,timeoutMs:5,warn:()=>{}});assert.equal(r.status,200);assert(r.body.city);assert.equal(r.body.approximate,true);
  }
});
test('client keeps accurate coordinates and nearby distance through success, state-only and offline',async()=>{
  const point={coords:{latitude:39.661,longitude:-75.738,accuracy:8},timestamp:12345};
  const nearby=nearestCensusPlace(39.661,-75.738,{state:'DE'});
  for(const fetchImpl of [async()=>({ok:true,json:async()=>nearby}),async()=>({ok:true,json:async()=>({city:'',state:'DE'})}),async()=>{throw Error('offline')}]){
    const fix=await resolveGpsPosition(point,{fetchImpl});assert(fix.city && fix.city!=='GPS');assert.equal(fix.lat,39.661);assert.equal(fix.lng,-75.738);assert.equal(fix.accuracy,8);assert.equal(fix.timestamp,12345);assert(Number.isFinite(fix.distanceMiles));assert.match(gpsFixMessage(fix),/confirm location/);
  }
});
test('DOT Inspection is an On Duty quick pick in trailer and intermodal forms and round-trips exactly',()=>{
  for(const mode of [false,true])assert(dutyActivities('ON',mode).includes('DOT Inspection'));
  for(const duty of ['OFF','SB','D'])assert(!dutyActivities(duty).includes('DOT Inspection'));
  const selected=parseRecordedActivities('DOT Inspection').selected;assert.deepEqual(selected,['DOT Inspection']);assert.equal(composeRecordedActivities(selected),'DOT Inspection');
});
test('DOT inspection never completes pre-trip or merges with an adjacent pre-trip',()=>{
  assert.equal(isPreTripActivity('DOT Inspection'),false);assert.equal(isPreTripActivity('Roadside inspection'),false);
  assert.equal(isPreTripActivity('Pre-trip inspection'),true);assert.equal(isPreTripActivity('Inspection'),true);
  assert.equal(isPreTripActivity('DOT Inspection · Pre-trip inspection'),true);
  const inspection={id:'dot',status:'ON',startMin:600,endMin:615,city:'Newark',state:'DE',note:'DOT Inspection'};
  const rows=[{...row('off'),endMin:600},inspection,{...inspection,id:'drive',status:'D',note:'Driving',startMin:615,endMin:660}];
  assert.equal(missingPreTripRequirementsForDay({[day]:rows},day).length,1);
  const checked=structuredClone(rows);checked[1].note='Pre-trip inspection';assert.equal(missingPreTripRequirementsForDay({[day]:checked},day).length,0);
  const adjacent=[{...inspection,note:'Pre-trip inspection'},{...inspection,id:'dot-next',startMin:615,endMin:630}];
  assert.equal(normalizeLogEvents(adjacent).length,2);
});
