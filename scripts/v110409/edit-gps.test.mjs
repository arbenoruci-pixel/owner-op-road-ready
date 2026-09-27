import assert from 'node:assert/strict';
import {previewBulkShift,applyBulkShift,shiftLabel} from '../../source/src/core/timeline/bulkShiftV110409.js';
import {getBestGpsPosition,resolveGpsPosition,getAccurateGpsLocation} from '../../source/src/core/gps/locationService.js';
import {gpsHasPlace,gpsFixMessage,gpsErrorMessage} from '../../source/src/core/gps/gpsFeedbackV110409.js';
let passed=0;
const test=async(name,fn)=>{await fn();passed++;console.log('PASS — '+name);};
const day='2026-09-25',today='2026-09-26';
const row=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,source:'manual',city:'Chicago',state:'IL',...extra});
const rows=()=>[row('off','OFF',0,300),row('on','ON',300,400),row('drive','D',400,500),row('sleep','SB',500,1440)];
const fixture=()=>({activeDay:day,activeDriverId:'a',currentStatus:'SB',eventsByDay:{[day]:rows(),[today]:[row('today','SB',0,1,{source:'live_status'})]},signatureByDay:{[day]:{signed:true,signatureDataUrl:'original'}},formByDay:{[day]:{driverName:'Original Driver'}},teamLogbooksByDriverId:{b:{eventsByDay:{[day]:[row('b','OFF',0,1440)]}}},logbookEditHistoryByDay:{},routeLegsByDay:{'2026-09-24':[{id:'leg',deliveryEventId:'drive',deliveryDay:day,deliveryMin:400,shippingDocs:'PRESERVE',status:'delivered'}]}});
const command=state=>({day,selectedIds:['on','drive'],delta:90,expectedRows:structuredClone(state.eventsByDay[day]),expectedDriverId:'a',today});
await test('multi-event preview is read-only and reports selected and neighbor changes',()=>{
 const before=rows(),original=structuredClone(before),r=previewBulkShift(before,['on','drive'],90);
 assert.equal(r.appliedDeltaMin,90);assert.deepEqual(before,original);
 assert.deepEqual(r.events.map(e=>[e.startMin,e.endMin]),[[0,390],[390,490],[490,590],[590,1440]]);
 assert.deepEqual(r.adjustedNeighborIds,['off','sleep']);assert.equal(shiftLabel(90),'1h 30m later');
});
await test('clamp reports the actual hours and minutes in both directions',()=>{
 const earlier=previewBulkShift(rows(),['on','drive'],-600),later=previewBulkShift(rows(),['on','drive'],1200);
 assert.equal(earlier.appliedDeltaMin,-299);assert.equal(shiftLabel(earlier.appliedDeltaMin),'4h 59m earlier');
 assert.equal(later.appliedDeltaMin,939);assert.equal(later.events.at(-1).endMin-later.events.at(-1).startMin,1);
});
await test('all-day boundaries keep midnight and each event identity',()=>{
 const input=rows(),r=previewBulkShift(input,input.map(e=>e.id),60);
 assert.equal(r.mode,'duty_changes');assert.equal(r.events[0].startMin,0);assert.equal(r.events.at(-1).endMin,1440);
 assert.deepEqual(r.events.map(e=>e.id),input.map(e=>e.id));
});
await test('all-day gaps and overlaps remain visible instead of being repaired',()=>{
 for(const delta of [-10,10]) {const input=rows();input[1].startMin+=delta;assert.match(previewBulkShift(input,input.map(e=>e.id),30).blockedReason,/gaps or overlaps/);}
});
await test('disjoint selections move by the same approved amount',()=>{
 const input=[row('a','OFF',0,100),row('b','ON',100,200),row('c','D',200,400),row('d','ON',400,500),row('e','SB',500,1440)];
 const r=previewBulkShift(input,['b','d'],30);assert.equal(r.appliedDeltaMin,30);for(const id of ['b','d']) {const old=input.find(e=>e.id===id),next=r.events.find(e=>e.id===id);assert.equal(next.startMin-old.startMin,30);assert.equal(next.endMin-old.endMin,30);}
});
await test('one commit keeps audit evidence, signatures, inactive driver and other days',()=>{
 const state=fixture(),before=structuredClone(state),r=applyBulkShift(state,command(state),new Date('2026-09-26T12:00:00Z'));
 assert(r.ok);assert.deepEqual(state,before);assert.deepEqual(r.state.signatureByDay,state.signatureByDay);assert.deepEqual(r.state.formByDay,state.formByDay);assert.deepEqual(r.state.teamLogbooksByDriverId,state.teamLogbooksByDriverId);assert.deepEqual(r.state.eventsByDay[today],state.eventsByDay[today]);
 const audit=r.state.logbookEditHistoryByDay[day];assert.equal(audit.length,1);assert.deepEqual(audit[0].beforeEvents,state.eventsByDay[day]);assert.deepEqual(audit[0].afterEvents,r.state.eventsByDay[day]);
 const route=r.state.routeLegsByDay['2026-09-24'][0];assert.equal(route.deliveryMin,490);assert.equal(route.shippingDocs,'PRESERVE');assert.equal(route.status,'delivered');
});
await test('stale day, driver, rows and repeated Apply are rejected',()=>{
 const state=fixture(),c=command(state);
 for(const changed of [{...state,activeDay:today},{...state,activeDriverId:'b'},{...state,eventsByDay:{...state.eventsByDay,[day]:[...rows(),row('extra','ON',1000,1100)]}}]) assert.equal(applyBulkShift(changed,c).ok,false);
 const once=applyBulkShift(state,c);assert.equal(applyBulkShift(once.state,c).ok,false);
 assert.equal(applyBulkShift(state,{...c,delta:-600}).ok,false,'Reapprove the actual clamped offset');
});
await test('invalid times, IDs and amounts never become edits',()=>{
 for(const delta of [NaN,Infinity,0.5,1440]) assert(previewBulkShift(rows(),['on'],delta).blockedReason);
 const input=rows();input[2].endMin=2000;assert(previewBulkShift(input,['on'],30).blockedReason);
 assert(previewBulkShift(rows(),['missing'],30).blockedReason);assert(previewBulkShift(rows(),[],30).blockedReason);
});
await test('voided and synthetic evidence is retained without joining selection',()=>{
 const extra=[row('void','ON',200,300,{voided:true}),row('display','OFF',700,900,{displayOnly:true})];
 const result=previewBulkShift([...rows(),...extra],['on'],30);
 assert.deepEqual(result.events.slice(-2),extra);assert(previewBulkShift([...rows(),...extra],['void'],30).blockedReason);
});
await test('ongoing status and driving sessions use Edit, completed days still move',()=>{
 for(const [source,session] of [['live_status',{}],['gps_drive',{gpsTrip:{status:'active',eventId:'sleep'}}],['manual_drive',{manualDrivingSession:{active:true,eventId:'sleep'}}]]) {
  const input=rows();input.at(-1).source=source;
  assert.match(previewBulkShift(input,['sleep'],10,{day,today:day,currentStatus:'SB',...session}).blockedReason,/ongoing/);
  assert.equal(previewBulkShift(input,['on'],10,{day,today:day,currentStatus:'SB',...session}).appliedDeltaMin,10);
 }
});
const position=(accuracy=8)=>({coords:{latitude:41.8781,longitude:-87.6298,accuracy},timestamp:1});
await test('synchronous GPS success releases its watch and requests fresh precision',async()=>{
 let cleared,settings;const fix=await getBestGpsPosition({geolocation:{watchPosition(ok,fail,options){settings=options;ok(position());return 42;},clearWatch(id){cleared=id;}}});
 assert.equal(cleared,42);assert.equal(settings.maximumAge,0);assert.equal(settings.enableHighAccuracy,true);assert.equal(fix.coords.accuracy,8);
});
await test('GPS cancellation rejects even after an approximate sample and clears watch',async()=>{
 let cleared=false;const controller=new AbortController();const pending=getBestGpsPosition({signal:controller.signal,geolocation:{watchPosition(ok){ok(position(90));return 7;},clearWatch(){cleared=true;}}});
 controller.abort();await assert.rejects(pending,{name:'AbortError'});assert(cleared);
});
await test('permission, unavailable and timeout give distinct retry instructions',async()=>{
 for(const code of [1,2,3]) {await assert.rejects(getBestGpsPosition({geolocation:{watchPosition(ok,fail){fail({code});return 1;},clearWatch(){}}}),error=>error.code===code);}
 assert.match(gpsErrorMessage({code:1}),/permission/);assert.match(gpsErrorMessage({code:2}),/position/);assert.match(gpsErrorMessage({code:3}),/too long/);
});
await test('one-shot devices finish promptly and weak fixes remain rejected',async()=>{
 const geolocation={getCurrentPosition(ok){ok(position(700));}};
 await assert.rejects(getAccurateGpsLocation({geolocation,rejectCoarseFix:true,maximumAcceptedAccuracy:250}),error=>error.code==='GPS_ACCURACY');
 assert.equal((await getBestGpsPosition({geolocation:{getCurrentPosition(ok){ok(position(30));}}})).coords.accuracy,30);
});
await test('invalid coordinates cannot be geocoded as zero or outside the earth',async()=>{
 for(const coords of [{latitude:null,longitude:null},{latitude:95,longitude:4},{latitude:4,longitude:Infinity}]) await assert.rejects(resolveGpsPosition({coords}),/Invalid/);
});
await test('reverse lookup gets longer than the six-second server budget',async()=>{
 let timeout;const set=globalThis.setTimeout,clear=globalThis.clearTimeout;
 globalThis.setTimeout=(fn,ms)=>{timeout=ms;return 99;};globalThis.clearTimeout=()=>{};
 try {const fix=await resolveGpsPosition(position(),{fetchImpl:async()=>({ok:true,json:async()=>({city:'Chicago',state:'IL',source:'us-census'})})});assert.equal(timeout,8000);assert.equal(fix.city,'Chicago');assert.match(gpsFixMessage(fix),/^GPS found/);} finally {globalThis.setTimeout=set;globalThis.clearTimeout=clear;}
});
await test('cancel during reverse lookup aborts fetch instead of applying fallback',async()=>{
 const controller=new AbortController();let aborted=false;
 const pending=resolveGpsPosition(position(),{signal:controller.signal,fetchImpl:async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new Error('aborted'));},{once:true}))});
 controller.abort();await assert.rejects(pending,{name:'AbortError'});assert(aborted);
});
await test('offline nearby cities and unresolved names are honestly labeled',async()=>{
 const fix=await resolveGpsPosition(position(),{fetchImpl:async()=>{throw new Error('offline');}});assert.match(gpsFixMessage(fix),/Nearby city/);
 assert.equal(gpsHasPlace({city:'GPS',state:'IL'}),false);assert.equal(gpsHasPlace({city:'Real City',state:'UN'}),false);assert.match(gpsFixMessage({city:'GPS',state:'IL'}),/Enter City/);
});
console.log(`${passed} event editing and GPS regression groups passed`);
