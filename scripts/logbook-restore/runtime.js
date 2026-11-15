'use client';
import {cloudClient,cloudSession} from './client.js';
import {assertActiveDevice,deviceId,HANDOFF_KEY} from './deviceSessionV110463.js';
import {accountStatus} from './accountSyncV110455.js';
import {getOwnerOpDb} from '../local-db/dexie.js';
import {APP_STATE_KEY,flushAppSnapshots} from '../local-db/appState.js';
import {canonical} from './accountCoreV110455.js';
import {bounded} from './mirrorCoreV110450.js';
import {RECOVERY_KIND,chooseOriginals,recoveryPlan,validateRequest,dayValue,matchesOriginal,digest} from './authorizedLogbookRecoveryCore.js';

const CHECKPOINT='authorized-logbook-recovery:';
async function checked(query){const {data,error}=await bounded(query);if(error)throw error;return data;}
function available(){return navigator.onLine!==false&&document.visibilityState==='visible'&&accountStatus().phase!=='syncing'&&window.__rrAccountState?.()&&!window.__rrAccountState().sheet&&!document.activeElement?.matches('input,textarea,select,[contenteditable=true]');}
function today(state){return new Intl.DateTimeFormat('en-CA',{timeZone:state.homeTerminalTimeZone||'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
async function* retainedCopies(db,uid){
 const keys=(await db.sync_meta.toCollection().primaryKeys()).filter(k=>/^single-device-before-handoff:|^account-sync-v110455:(first-join|pending)$/.test(k)).reverse();
 for(const key of keys){const row=await db.sync_meta.get(key),v=row?.value;if(v?.uid===uid)yield {key,uid,state:v.state||v.oldState};}
 for(const key of ['owner-op-road-ready-pre-update-snapshot-v1','account-sync-before-first-join','owner-op-road-ready-pre-cloud-raw-v1']){
  const row=await db.app_snapshots.get(key);if(row?.state)yield {key,state:row.state};
 }
}
export async function restoreAuthorizedLogbook(request){
 if(!navigator.locks?.request||!available())return {deferred:true};
 return navigator.locks.request('road-ready-account-sync-v110455',{ifAvailable:true},accountLock=>accountLock?
 navigator.locks.request('road-ready-record-editor-v1',{ifAvailable:true},editLock=>editLock?
 navigator.locks.request('road-ready-recovery-storage',async()=>{
  if(!available())return {deferred:true};
  const lease=await assertActiveDevice(),uid=lease.uid,phone=deviceId(),db=getOwnerOpDb();
  const liveRequest=await checked(cloudClient().from('road_ready_corrections').select('*').eq('user_id',uid).eq('device_id',phone).eq('id',request.id).single());
  if(liveRequest.status!=='pending')return {status:liveRequest.status};
  request=liveRequest;
  const context={uid,deviceId:phone,today:today(window.__rrAccountState())};validateRequest(request,context);
  if(localStorage.getItem('owner-op-account-data-owner-v1')!==uid)throw Error('This phone has not finished opening the requested account.');
  const handoff=(await db.sync_meta.get(HANDOFF_KEY))?.value;
  if(handoff?.records===true||handoff?.uid&&handoff.uid!==uid)return {deferred:true};
  const key=CHECKPOINT+request.id,journal=await db.sync_meta.get(key);
  let result=journal?.value;
  if(result?.phase!=='applied'){
   const originals=await chooseOriginals(request,retainedCopies(db,uid));
   await flushAppSnapshots();
   const current=structuredClone(window.__rrAccountState()),saved=await db.app_snapshots.get(APP_STATE_KEY);
   const plan=await recoveryPlan(current,request,originals,context),fingerprint=canonical(current);
   const recheck=await assertActiveDevice();
   if(recheck.uid!==uid||recheck.generation!==lease.generation||!available())return {deferred:true};
   result={phase:'applied',days:plan.days,sources:plan.sources,deviceConfirmedAt:new Date().toISOString(),fingerprints:{}};
   for(const day of Object.keys(request.patch.days))result.fingerprints[day]=await digest(dayValue(plan.next,request.patch.driverId,day));
   await db.transaction('rw',db.app_snapshots,db.sync_meta,async()=>{
    const fresh=await db.app_snapshots.get(APP_STATE_KEY);
    if(canonical(fresh)!==canonical(saved)||canonical(window.__rrAccountState())!==fingerprint)throw Error('Records changed during recovery. Retrying without replacing current work.');
    // Save the exact pre-restore state and receipt in the same transaction.
    await db.app_snapshots.put({key:key+':before',state:current,updated_at:new Date().toISOString()});
    await db.app_snapshots.put({...fresh,key:APP_STATE_KEY,state:plan.next,updated_at:new Date().toISOString()});
    await db.sync_meta.put({key,value:result,updated_at:new Date().toISOString()});
    if(canonical(window.__rrAccountState())!==fingerprint)throw Error('Records changed during recovery. Retrying without replacing current work.');
   });
   window.dispatchEvent(new CustomEvent('road-ready-account-apply',{detail:plan.next}));
   await flushAppSnapshots();
  }
  const installed=(await db.app_snapshots.get(APP_STATE_KEY))?.state;
  for(const [day,proof]of Object.entries(request.patch.days)){
   const value=dayValue(installed,request.patch.driverId,day),live=dayValue(window.__rrAccountState(),request.patch.driverId,day);
   if(!await matchesOriginal(value,proof,request.patch.driverId,day)||canonical(value)!==canonical(live)||await digest(value)!==result.fingerprints[day])throw Error('Recovery receipt does not match the saved phone. No success was reported.');
  }
  const session=await cloudSession();if(session?.user?.id!==uid)throw Error('Account changed before recovery acknowledgement.');
  await checked(cloudClient().from('road_ready_corrections').update({status:'applied',result,applied_at:result.deviceConfirmedAt}).eq('user_id',uid).eq('device_id',phone).eq('id',request.id).eq('status','pending').select('id').single());
  window.dispatchEvent(new CustomEvent('road-ready-local-saved',{detail:{scope:'records',source:'authorized-logbook-restore'}}));
  return {status:'applied',days:result.days};
 }):{deferred:true}):{deferred:true});
}
export async function checkAuthorizedLogbookRecovery(){
 if(!available())return {deferred:true};
 const session=await cloudSession();if(!session)return {};
 const requests=await checked(cloudClient().from('road_ready_corrections').select('*').eq('user_id',session.user.id).eq('device_id',deviceId()).eq('kind',RECOVERY_KIND).eq('status','pending').order('created_at',{ascending:true}).limit(1));
 if(!requests?.length)return {};
 try{return await restoreAuthorizedLogbook(requests[0]);}
 catch(error){
  // Preserve the request and originals when evidence is missing or edits race.
  // The operator can diagnose this receipt without altering any day.
  await checked(cloudClient().from('road_ready_corrections').update({result:{phase:'waiting',message:String(error.message).slice(0,400),checkedAt:new Date().toISOString()}}).eq('user_id',session.user.id).eq('device_id',deviceId()).eq('id',requests[0].id).eq('status','pending')).catch(()=>{});
  return {error:error.message};
 }
}
