import {DAY_FIELDS,LOG_FIELDS,canonical} from '../v110455/accountCore.js';
import {visible} from '../v110451/recordsCore.js';

export const RECOVERY_KIND='authorized_logbook_restore_v2';
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v||{},k);
export function dayValue(state,driver,day){
 const active=state.activeDriverId||state.teamDrivers?.[0]?.id||'driver_primary';
 const book=active===driver?state:state.teamLogbooksByDriverId?.[driver]||{};
 return Object.fromEntries(DAY_FIELDS.filter(f=>own(book[f],day)).map(f=>[f,book[f][day]]));
}
export function dayHeader(value,driver,day){return visible({day,driverId:driver,events:value.eventsByDay?.length||0,certifyStatus:value.certifyStatus||'',signature:value.signatureByDay||null,inspection:value.inspectionByDay||null,form:value.formByDay||null});}
export async function digest(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function matchesOriginal(value,proof,driver,day){
 if(await digest(dayHeader(value,driver,day))!==proof.header)return false;
 const events=value.eventsByDay||[];
 if(events.length!==proof.count)return false;
 for(let i=0;i<events.length;i++){
  const hash=await digest(visible(events[i]));
  if(!proof.events.some(e=>e.index===i&&e.id===events[i].id&&e.hash===hash))return false;
 }
 // The diagnostic index contains placeholders. Only a retained original image
 // is eligible; never synthesize a signature from a profile or cloud thumbnail.
 if(value.signatureByDay?.signed&&!/^data:image\/[^,]+;base64,.+/.test(value.signatureByDay.signatureDataUrl||''))return false;
 return true;
}
export function validateRequest(request,{uid,deviceId,today}){
 const p=request.patch;
 if(request.kind!==RECOVERY_KIND||request.user_id!==uid||request.device_id!==deviceId||p?.version!==1||p.authorization!=='restore-original-retained-days')throw Error('Recovery authorization does not match this account and phone.');
 if(!p.driverId||!p.days||Array.isArray(p.days)||!Object.keys(p.days).length||Object.keys(p.days).length>14)throw Error('Invalid recovery dates.');
 for(const [day,proof]of Object.entries(p.days)){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||day>=today)throw Error('Recovery cannot change today or a future day.');
  if(!/^[a-f0-9]{64}$/.test(proof.header)||!Number.isInteger(proof.count)||proof.count<1||!Array.isArray(proof.events)||proof.events.some(e=>!Number.isInteger(e.index)||!e.id||!/^[a-f0-9]{64}$/.test(e.hash)))throw Error('Original record evidence is incomplete.');
 }
 for(const [day,proof]of Object.entries(p.routes||{}))if(!own(p.days,day)||!/^[a-f0-9]{64}$/.test(proof.hash)||!Number.isInteger(proof.count)||proof.count<0)throw Error('Invalid original route evidence.');
 return p;
}
async function verifiedIndexedValue(entry,request){
 if(!entry||entry.source?.userId!==request.user_id||entry.source?.deviceId!==request.device_id)return false;
 const raw=canonical(entry.value);
 if(!raw||raw!==canonical(visible(entry.value))||/"(?:embeddedFile|originalInBackup|fileBytes|__proto__|constructor|prototype)"/.test(raw))return false;
 return /^[a-f0-9]{64}$/.test(entry.sha256||'')&&await digest(entry.value)===entry.sha256;
}
export async function chooseOriginals(request,candidates){
 const p=request.patch,chosen={},routeBuckets={},candidatesSeen=[];
 for await(const candidate of candidates){
  if(!candidate.state||candidate.uid&&candidate.uid!==request.user_id)continue;
  const diagnostic={source:candidate.key,days:{}};
  for(const [day,proof]of Object.entries(p.days)){
   if(chosen[day])continue;
   const value=dayValue(candidate.state,p.driverId,day);
   diagnostic.days[day]={count:value.eventsByDay?.length||0,header:await digest(dayHeader(value,p.driverId,day))};
   if(await matchesOriginal(value,proof,p.driverId,day))chosen[day]={value:structuredClone(value),source:candidate.key};
  }
  if(Object.values(diagnostic.days).some(d=>d.count>0)&&candidatesSeen.length<24)candidatesSeen.push(diagnostic);
  for(const [day,proof]of Object.entries(p.routes||{})){
   if(routeBuckets[day])continue;
   const value=candidate.state.routeLegsByDay?.[day]||[];
   if(!Array.isArray(value)||value.some(route=>!own(p.days,route.pickupDay||route.day||day)||route.deliveryDay&&!own(p.days,route.deliveryDay)))continue;
   if(Array.isArray(value)&&value.length===proof.count&&await digest(visible(value))===proof.hash)routeBuckets[day]={value:structuredClone(value),source:candidate.key};
  }
  if(Object.keys(chosen).length===Object.keys(p.days).length&&Object.keys(routeBuckets).length===Object.keys(p.routes||{}).length)break;
 }
 // Only unsigned complete originals may come from the phone's pre-loss index.
 // Signed days still require their actual retained signature bytes on this phone.
 for(const [day,proof]of Object.entries(p.days)){
  if(chosen[day])continue;
  const entry=p.indexedUnsignedDays?.[day],value=entry?.value;
  if(!value||Array.isArray(value)||own(value,'signatureByDay')||!['Active','Active day / Not certified yet','Needs signature',''].includes(value.certifyStatus||'')||Object.keys(value).some(f=>!['eventsByDay','certifyStatus','inspectionByDay','formByDay','manualMilesByDay','dutySafetyBackupByDay'].includes(f)))continue;
  if(await verifiedIndexedValue(entry,request)&&await matchesOriginal(value,proof,p.driverId,day))chosen[day]={value:structuredClone(value),source:'verified-device-index:'+day};
 }
 for(const [day,proof]of Object.entries(p.routes||{})){
  if(routeBuckets[day])continue;
  const entry=p.indexedRouteBuckets?.[day],value=entry?.value;
  if(!Array.isArray(value)||value.length!==proof.count||value.some(route=>!own(p.days,route.pickupDay||route.day||day)||route.deliveryDay&&!own(p.days,route.deliveryDay)))continue;
  if(await verifiedIndexedValue(entry,request)&&await digest(visible(value))===proof.hash)routeBuckets[day]={value:structuredClone(value),source:'verified-device-index:'+day};
 }
 const missing=Object.keys(p.days).filter(day=>!chosen[day]);
 if(missing.length)throw Object.assign(Error('Original phone copy not yet found for '+missing.join(', ')+'. No days were changed.'),{recoveryCandidates:candidatesSeen});
 if(Object.keys(routeBuckets).length!==Object.keys(p.routes||{}).length)throw Error('Original route context is incomplete. No days were changed.');
 return {...chosen,routeBuckets};
}
function emptyRecordedDay(value){
 return !(value.eventsByDay?.length||value.signatureByDay||value.inspectionByDay||value.formByDay||value.certifyStatus==='Certified')&&
 Object.entries(value).every(([field,v])=>['eventsByDay','certifyStatus'].includes(field)||v==null||v===0||Array.isArray(v)&&!v.length||typeof v==='object'&&!Object.keys(v).length);
}
export async function recoveryPlan(current,request,chosen,context){
 const p=validateRequest(request,context),replacements={},sources={};
 for(const [day,proof]of Object.entries(p.days)){
  const before=dayValue(current,p.driverId,day);
  if(await matchesOriginal(before,proof,p.driverId,day))continue;
  const allowed=request.before_data?.[day];
  const exact=allowed?.hash===await digest(visible(before));
  if(!exact&&!(allowed?.empty===true&&emptyRecordedDay(before)))throw Error('Conflict: '+day+' has changed since the missing-log review. No days were changed.');
  if(!chosen[day]||!await matchesOriginal(chosen[day].value,proof,p.driverId,day))throw Error('Original evidence changed. No days were changed.');
  replacements[day]=chosen[day].value;sources[day]=chosen[day].source;
 }
 const next=structuredClone(current),active=current.activeDriverId||current.teamDrivers?.[0]?.id||'driver_primary';
 const book={...(next.teamLogbooksByDriverId?.[p.driverId]||{}),...(active===p.driverId?Object.fromEntries(LOG_FIELDS.filter(field=>own(next,field)).map(field=>[field,next[field]])):{})};
 for(const target of [book,...(active===p.driverId?[next]:[])])for(const [day,value]of Object.entries(replacements))for(const field of DAY_FIELDS){
  if(own(value,field))target[field]={...(target[field]||{}),[day]:structuredClone(value[field])};
  else if(own(target[field],day)){target[field]={...target[field]};delete target[field][day];}
 }
 if(Object.keys(replacements).length)next.teamLogbooksByDriverId={...next.teamLogbooksByDriverId,[p.driverId]:book};
 const routeSources={};
 for(const [day,proof]of Object.entries(p.routes||{})){
  const before=current.routeLegsByDay?.[day]||[],beforeHash=await digest(visible(before));
  if(beforeHash===proof.hash)continue;
  if(beforeHash!==request.before_data?.routeBuckets?.[day])throw Error('Conflict: original routes changed for '+day+'. No days were changed.');
  const original=chosen.routeBuckets?.[day];
  if(!original||await digest(visible(original.value))!==proof.hash)throw Error('Original route evidence changed. No days were changed.');
  next.routeLegsByDay={...next.routeLegsByDay,[day]:structuredClone(original.value)};routeSources[day]=original.source;
 }
 return {next,days:Object.keys(replacements),sources,routeSources};
}
