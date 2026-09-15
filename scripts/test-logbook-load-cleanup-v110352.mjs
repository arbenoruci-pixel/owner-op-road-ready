import assert from 'node:assert/strict';
import {cleanupDeletedLogbookData,cleanRouteCacheAfterRemoval} from '../source/src/core/routes/logbookLoadCleanup.js';
const day='2026-09-13',other='2026-09-14';
const event={id:'only-event',status:'OFF',startMin:0,endMin:1440};
const target={id:'bad-route',day,pickupDay:day,fromCity:'Dates Delivery Dates',toCity:'Dates',loadNo:'38246703',status:'open'};
const keep={id:'other-route',day:other,pickupDay:other,loadNo:'38324346',status:'open'};
const make=()=>({activeDay:day,eventsByDay:{[day]:[event],[other]:[{id:'elsewhere',status:'OFF',startMin:0,endMin:1440}]},routeLegsByDay:{[other]:[target,keep]},loadInfo:{sourceEventId:event.id,sourceEventDay:day,loadNo:target.loadNo,bol:target.loadNo,po:'STALE',broker:'Own broker',routeLegsByDay:{[day]:[target]}},signatureByDay:{[day]:{signed:true,signatureDataUrl:'keep'}},dotWallet:{documents:{original:'keep'}},loadGuidesById:{one:{id:'keep'}},manualMilesByDay:{[day]:467.19,[other]:20}});
function run(before,ids=[event.id],clearDay=true){const after={...before,eventsByDay:{...before.eventsByDay,[day]:before.eventsByDay[day].filter(row=>!ids.includes(row.id))}};return cleanupDeletedLogbookData(before,after,{day,eventIds:ids,clearDay});}
const flat=s=>Object.values(s.routeLegsByDay).flat();
let passed=0;const test=(name,fn)=>{fn();passed++;console.log('PASS — '+name);};
test('last real event clears owned load/routes and mirrored stale BOL, preserving other days and original evidence',()=>{const before=make(),original=structuredClone(before),next=run(before);assert.deepEqual(before,original);assert.deepEqual(flat(next),[keep]);assert.deepEqual(next.loadInfo.routeLegsByDay[day],[]);assert.equal(next.loadInfo.loadNo,'');assert.equal(next.loadInfo.po,'');assert.ok(!Object.hasOwn(next.manualMilesByDay,day));assert.equal(next.manualMilesByDay[other],20);for(const key of ['signatureByDay','dotWallet','loadGuidesById'])assert.equal(next[key],before[key]);assert.equal(next.eventsByDay[other],before.eventsByDay[other]);});
test('partial event deletion leaves independent pending routes for that day',()=>{const before=make();before.eventsByDay[day].push({id:'remain',status:'ON'});const next=run(before);assert.equal(next.routeLegsByDay,before.routeLegsByDay);assert.equal(next.manualMilesByDay,before.manualMilesByDay);});
test('empty unrecorded/future days and stale or canceled requests never trigger cleanup',()=>{const before=make();assert.equal(cleanupDeletedLogbookData(before,before,{day,eventIds:[event.id],clearDay:true}),before);const future={...before,eventsByDay:{[day]:[]}};assert.equal(cleanupDeletedLogbookData(future,future,{day,eventIds:[],clearDay:true}),future);assert.equal(cleanupDeletedLogbookData(before,before,{day:'bad',eventIds:[event.id],clearDay:true}),before);});
test('exact pickup deletion clears all mirrored copies without deleting same-BOL neighbors',()=>{const before=make();before.eventsByDay[day].push({id:'remain',status:'OFF'});before.routeLegsByDay[other][0]={...target,pickupEventId:event.id};before.loadInfo.routeLegsByDay[day][0]={...target,pickupEventId:event.id};const sameBol={...keep,loadNo:target.loadNo};before.routeLegsByDay[other].push(sameBol);const next=run(before,[event.id],false);assert.deepEqual(flat(next),[keep,sameBol]);assert.deepEqual(next.loadInfo.routeLegsByDay[day],[]);});
test('other-day real delivery preserves shared route and excludes only the erased day',()=>{const before=make();const delivery={id:'delivered-elsewhere',status:'ON'};before.eventsByDay[other].push(delivery);const shared={...target,pickupEventId:event.id,deliveryEventId:delivery.id,deliveryDay:other,status:'delivered'};before.routeLegsByDay={[day]:[shared],[other]:[keep]};before.loadInfo.routeLegsByDay={[day]:[shared]};const next=run(before);assert.equal(next.routeLegsByDay[day].length,0);const retained=flat(next).find(row=>row.id===target.id);assert.equal(retained.deliveryEventId,delivery.id);assert.equal(retained.status,'delivered');assert.equal(retained.pickupEventId,'');assert.deepEqual(retained.logbookExcludedDaysV110352,[day]);assert.ok(flat(next).some(row=>row.id===keep.id));assert.equal(next.eventsByDay[other],before.eventsByDay[other]);});
test('deleting a delivery event reopens the actual pickup route and removes mirrored endpoint',()=>{const before=make();const shared={...target,day:other,pickupDay:other,pickupEventId:'elsewhere',deliveryDay:day,deliveryEventId:event.id,status:'delivered'};before.routeLegsByDay={[other]:[shared,keep]};before.loadInfo.routeLegsByDay={[other]:[shared]};const next=run(before);const row=flat(next).find(row=>row.id===target.id);assert.equal(row.pickupEventId,'elsewhere');assert.equal(row.deliveryEventId,'');assert.equal(row.status,'open');assert.deepEqual(row.logbookExcludedDaysV110352,[day]);});
test('reused event IDs with explicit other-day ownership remain untouched',()=>{const before=make();before.routeLegsByDay={[other]:[{...keep,pickupEventId:event.id}]};before.loadInfo={sourceEventId:event.id,sourceEventDay:other,loadNo:'keep'};before.eventsByDay[other].push({...event});const next=run(before);assert.equal(next.routeLegsByDay,before.routeLegsByDay);assert.equal(next.loadInfo,before.loadInfo);});
test('direct route cache cleanup requires provenance plus endpoints, never a bare shared BOL',()=>{const before=make();before.loadInfo={loadNo:target.loadNo,broker:'keep'};let after={...before,routeLegsByDay:{[other]:[keep]}};assert.equal(cleanRouteCacheAfterRemoval(before,after),after);before.loadInfo={...before.loadInfo,routeSource:'canonical_routeLegsByDay',pickupCity:target.fromCity,deliveryCity:target.toCity};after={...after,loadInfo:before.loadInfo};assert.equal(cleanRouteCacheAfterRemoval(before,after).loadInfo.loadNo,'');});
test('repeated cleanup is stable and excludes no extra dates',()=>{const before=make(),next=run(before);assert.deepEqual(cleanupDeletedLogbookData(before,next,{day,eventIds:[event.id],clearDay:true}),next);assert.equal(cleanupDeletedLogbookData(next,next,{day,eventIds:[event.id],clearDay:true}),next);});
console.log(passed+' day/load cleanup groups passed');

// Exercise actual materialized consumers, rather than only a parallel model.
const fs=await import('node:fs'),vm=await import('node:vm');
const {routeLegsForDayCanonical,routeLegsForDayMiles,normalizeLoadInfoFromRouteLegs}=await import('../source/src/core/routes/routeNormalization.js');
const {preserveRecordedDays}=await import('../source/src/modules/logbook/public-api.js');
const {rawStoredEventsForDay,isSyntheticEvent}=await import('../source/src/core/compliance/rawRodsChecks.js');
const {reconcileCertificationStatusesV1032,createCertificationRecord,certificationStatusV1032}=await import('../source/src/modules/logbook/certificationV110.js');
const {deleteRouteLegFromState}=await import('../source/src/core/routes/routeLegDeletion.js');
test('duplicate mirrored route IDs render once while different stops sharing a BOL remain visible',()=>{
 const s=make();s.routeLegsByDay[day]=[target];s.routeLegsByDay[other].push({...target,id:'same-bol-new-stop'});
 assert.equal(routeLegsForDayCanonical(s,day).filter(r=>r.id===target.id).length,1);
 assert.ok(routeLegsForDayCanonical(s,day).some(r=>r.id==='same-bol-new-stop'));
 assert.equal(routeLegsForDayMiles(s,day).filter(r=>r.id===target.id).length,1);
 const next=deleteRouteLegFromState(s,{id:target.id});
 assert.ok(!routeLegsForDayCanonical(next,day).some(r=>r.id===target.id));
});
test('shared-route exclusion survives normalization and reload without erasing its other-day evidence',()=>{
 const s=make();s.routeLegsByDay[other][0]={...target,pickupEventId:event.id,deliveryEventId:'elsewhere',deliveryDay:other,status:'delivered'};
 s.loadInfo.routeLegsByDay[day][0]={...s.routeLegsByDay[other][0]};
 const next=run(s),saved=JSON.parse(JSON.stringify(next));
 const restored=preserveRecordedDays(saved,normalizeLoadInfoFromRouteLegs(saved),'2026-09-15');
 assert.ok(!routeLegsForDayCanonical(restored,day).some(r=>r.id===target.id));
 assert.ok(routeLegsForDayCanonical(restored,other).some(r=>r.id===target.id));
 assert.ok(!routeLegsForDayMiles(restored,day).some(r=>r.id===target.id));
 assert.deepEqual(restored.eventsByDay[other],s.eventsByDay[other]);
});
test('synthetic carry rows cannot falsely keep an erased day and its load alive',()=>{
 const s=make();s.eventsByDay[day].push({id:'synthetic',status:'OFF',startMin:0,endMin:1440,carriedFromPreviousDay:true});
 const next=run(s);assert.ok(!flat(next).some(row=>row.id===target.id));
 assert.ok(next.eventsByDay[day].some(row=>row.id==='synthetic'));
});
test('actual App delete handler uses current state, cleans last-row load data and keeps other records exact',()=>{
 const source=fs.readFileSync('source/src/app/App.jsx','utf8');
 const start=source.indexOf('  function deleteEvent(id) {'),end=source.indexOf('\n  function applyShift(',start);
 let state=make();state.eventsByDay[day].push({id:'keep-first',status:'ON',startMin:0,endMin:15});
 const initial=structuredClone(state),expectedOther=state.eventsByDay[other],evidence=state.signatureByDay;
 const fn=vm.runInNewContext(source.slice(start,end)+'\ndeleteEvent',{
  setState:transform=>{state=transform(state);},continuousBaseForDay:(s,d)=>rawStoredEventsForDay(s.eventsByDay,d),
  isSyntheticEvent,cleanupDeletedLogbookData,reconcilePreTripInspections:s=>s,
  reconcileCertificationStatusesV1032,markRecert:s=>s,
 });
 fn('missing');assert.deepEqual(state,initial);
 fn('keep-first');assert.ok(flat(state).some(row=>row.id===target.id));
 fn(event.id);assert.deepEqual(state.eventsByDay[day],[]);assert.ok(!flat(state).some(row=>row.id===target.id));
 assert.equal(state.loadInfo.loadNo,'');assert.equal(state.loadInfo.po,'');
 assert.equal(state.eventsByDay[other],expectedOther);assert.equal(state.signatureByDay,evidence);
 const saved=JSON.parse(JSON.stringify(state));
 const restored=preserveRecordedDays(saved,normalizeLoadInfoFromRouteLegs(saved),'2026-09-15');
 assert.ok(!flat(restored).some(row=>row.id===target.id));
 assert.deepEqual(restored.eventsByDay[other],initial.eventsByDay[other]);
});
test('explicit last-row deletion invalidates only affected certification while retaining attestation evidence',()=>{
 const s=make();s.signatureByDay={};s.certifyStatus={};
 for(const d of [day,other]){s.signatureByDay[d]=createCertificationRecord(s,d,{now:10000});s.certifyStatus[d]='Certified';}
 const next=reconcileCertificationStatusesV1032(run(s));
 assert.equal(certificationStatusV1032(next,day).status,'Needs Recertification');
 assert.equal(certificationStatusV1032(next,other).status,'Certified');
 assert.equal(next.signatureByDay,s.signatureByDay);
});
console.log(passed+' total cleanup/consumer regression groups passed');
