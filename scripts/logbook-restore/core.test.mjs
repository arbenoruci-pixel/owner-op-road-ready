import test from 'node:test';import assert from 'node:assert/strict';
import {RECOVERY_KIND,dayValue,dayHeader,digest,matchesOriginal,chooseOriginals,recoveryPlan,validateRequest} from './core.js';
import {visible} from '../v110451/recordsCore.js';
import {fixture} from './fixture.mjs';
test('restores only approved complete days with original signature bytes and preserves today and other drivers',async()=>{
 const f=await fixture(),before=structuredClone(f.current),source=structuredClone(f.original);
 const chosen=await chooseOriginals(f.request,[{key:'retained',uid:f.context.uid,state:f.original}]);
 const {next,days}=await recoveryPlan(f.current,f.request,chosen,f.context);
 for(const day of f.days)assert.deepEqual(dayValue(next,'driver_primary',day),dayValue(f.original,'driver_primary',day));
 for(const field of ['currentStatus','gpsTrip','dotWallet','view'])assert.deepEqual(next[field],before[field]);
 assert.deepEqual(next.routeLegsByDay.today,before.routeLegsByDay.today);assert.deepEqual(next.routeLegsByDay[f.days[0]],f.original.routeLegsByDay[f.days[0]]);
 assert.deepEqual(next.eventsByDay['2026-11-15'],before.eventsByDay['2026-11-15']);assert.deepEqual(next.teamLogbooksByDriverId.other,before.teamLogbooksByDriverId.other);
 assert.deepEqual(next.teamLogbooksByDriverId.driver_primary.eventsByDay['2026-11-15'],before.eventsByDay['2026-11-15']);assert.equal(next.teamLogbooksByDriverId.driver_primary.currentStatus,before.currentStatus);
 assert.deepEqual(f.current,before);assert.deepEqual(f.original,source);assert.deepEqual(days,f.days);
 assert.deepEqual((await recoveryPlan(next,f.request,chosen,f.context)).days,[]);
});
test('redacted signatures, missing copies, wrong owner and changed signed content never produce recovery',async()=>{
 const f=await fixture(),redacted=visible(f.original);
 await assert.rejects(chooseOriginals(f.request,[{key:'redacted',state:redacted}]),/not yet found/);
 await assert.rejects(chooseOriginals(f.request,[{key:'foreign',uid:'other',state:f.original}]),/not yet found/);
 const tampered=structuredClone(f.original);tampered.signatureByDay[f.days[0]].certifiedContent.events[0].endMin++;
 await assert.rejects(chooseOriginals(f.request,[{key:'changed',state:tampered}]),/not yet found/);
});
test('all dates validate before mutation; later manual work and today cannot be overwritten',async()=>{
 const f=await fixture(),chosen=await chooseOriginals(f.request,[{key:'before',state:f.original}]);
 f.current.eventsByDay[f.days[1]]=[{id:'new-work'}];const before=structuredClone(f.current);
 await assert.rejects(recoveryPlan(f.current,f.request,chosen,f.context),/Conflict/);assert.deepEqual(f.current,before);
 const copy=structuredClone(f.request);copy.patch.days['2026-11-15']=copy.patch.days[f.days[0]];
 assert.throws(()=>validateRequest(copy,f.context),/today/);
 assert.throws(()=>validateRequest(f.request,{...f.context,uid:'other'}),/authorization/);
 assert.throws(()=>validateRequest(f.request,{...f.context,deviceId:'other'}),/authorization/);
});
test('exact reviewed damaged day may be replaced; extra mileage prevents empty-day fallback',async()=>{
 const f=await fixture(),chosen=await chooseOriginals(f.request,[{key:'original',state:f.original}]),day=f.days[0];
 f.current.eventsByDay[day]=[{id:'damaged',status:'ON',startMin:4,endMin:10}];
 f.request.before_data[day]={hash:await digest(visible(dayValue(f.current,'driver_primary',day)))};
 assert.equal((await recoveryPlan(f.current,f.request,chosen,f.context)).days.length,2);
 f.current.manualMilesByDay[f.days[1]]=400;
 await assert.rejects(recoveryPlan(f.current,f.request,chosen,f.context),/Conflict/);
});
test('a known event cannot be substituted at a different position or with changed raw fields',async()=>{
 const f=await fixture(),day=f.days[0],value=dayValue(f.original,'driver_primary',day),proof=f.request.patch.days[day];
 value.eventsByDay.reverse();assert.equal(await matchesOriginal(value,proof,'driver_primary',day),false);
});
test('route restoration rejects later edits and never crosses outside the approved days',async()=>{
 const f=await fixture(),chosen=await chooseOriginals(f.request,[{key:'retained',state:f.original}]);
 f.current.routeLegsByDay[f.days[0]]=[{id:'later-manual-route'}];
 await assert.rejects(recoveryPlan(f.current,f.request,chosen,f.context),/routes changed/);
 const foreign=structuredClone(f.original);foreign.routeLegsByDay[f.days[0]][0].deliveryDay='2026-11-16';
 f.request.patch.routes[f.days[0]].hash=await digest(foreign.routeLegsByDay[f.days[0]]);
 await assert.rejects(chooseOriginals(f.request,[{key:'crosses-scope',state:foreign}]),/route context is incomplete/);
});
async function indexedFixture(){
 const f=await fixture(),unsigned=f.days[1],value=dayValue(f.original,'driver_primary',unsigned);
 f.request.patch.indexedUnsignedDays={[unsigned]:{value,sha256:await digest(value),source:{userId:f.context.uid,deviceId:f.context.deviceId}}};
 f.request.patch.indexedRouteBuckets={};
 for(const day of f.days){const value=f.original.routeLegsByDay[day]||[];f.request.patch.indexedRouteBuckets[day]={value,sha256:await digest(value),source:{userId:f.context.uid,deviceId:f.context.deviceId}};}
 f.retained=structuredClone(f.original);delete f.retained.eventsByDay[unsigned];delete f.retained.routeLegsByDay;
 return f;
}
test('combines retained signed originals with exact unsigned indexed originals and original routes',async()=>{
 const f=await indexedFixture(),chosen=await chooseOriginals(f.request,[{key:'retained',state:f.retained}]);
 const {next}=await recoveryPlan(f.current,f.request,chosen,f.context);
 for(const day of f.days)assert.deepEqual(dayValue(next,'driver_primary',day),dayValue(f.original,'driver_primary',day));
 assert.equal(chosen[f.days[0]].source,'retained');assert.equal(chosen[f.days[1]].source,'verified-device-index:'+f.days[1]);
 assert.deepEqual(next.routeLegsByDay[f.days[0]],f.original.routeLegsByDay[f.days[0]]);
});
test('indexed fallback rejects signed days, other phones, altered events, redactions and unapproved fields',async()=>{
 for(const mutation of ['signed','foreign','event','redacted','unknown']){
  const f=await indexedFixture(),entry=f.request.patch.indexedUnsignedDays[f.days[1]];
  if(mutation==='signed'){entry.value.signatureByDay=f.original.signatureByDay[f.days[0]];entry.value.certifyStatus='Certified';}
  if(mutation==='foreign')entry.source.deviceId='other-phone';
  if(mutation==='event')entry.value.eventsByDay[0].endMin++;
  if(mutation==='redacted')entry.value.dutySafetyBackupByDay={embeddedFile:true,originalInBackup:true};
  if(mutation==='unknown')entry.value.currentStatus='OFF';
  entry.sha256=await digest(entry.value);
  await assert.rejects(chooseOriginals(f.request,[{key:'retained',state:f.retained}]),/not yet found/,mutation);
 }
});
