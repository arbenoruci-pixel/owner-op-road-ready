'use client';
import {cloudClient,cloudSession} from './client.js';
import {getOwnerOpDb} from '../local-db/dexie.js';

export const DEVICE_EVENT='road-ready-device-session';
export const HANDOFF_KEY='road-ready-device-handoff-v1';
const REQUEST='road-ready-device-login-v1';
let current=null,pending=null,connectionEpoch=0;
function interrupted(){return Object.assign(Error('Checking the current connection…'),{deviceCheckInterrupted:true});}
export function invalidateDeviceSession(){
 connectionEpoch++;current=null;pending?.controller.abort();
}
if(typeof window!=='undefined'){
 window.addEventListener('offline',invalidateDeviceSession);
 window.addEventListener('pagehide',invalidateDeviceSession);
 if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden')invalidateDeviceSession();
 });
}
export function deviceId(){const key='owner-op-cloud-mirror-v1:device';let id=localStorage.getItem(key);if(!id){id=crypto.randomUUID();localStorage.setItem(key,id);}return id;}
export function sessionId(session){try{return JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).session_id||null;}catch{return null;}}
export function requestDeviceActivation(session){const sid=sessionId(session);if(sid)localStorage.setItem(REQUEST,sid);}
export function deviceSessionStatus(){return current;}
async function checkedWait(request,job,milliseconds,phase){
 const signal=job.controller.signal;
 if(signal.aborted)throw interrupted();
 let timer,cancel;
 const aborted=new Promise((_,reject)=>{cancel=()=>reject(interrupted());signal.addEventListener('abort',cancel,{once:true});});
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{
  reject(Object.assign(Error(phase+' timed out. Retrying the connection keeps your saved work on this device.'),{deviceCheckTimeout:true,phase}));
  job.controller.abort();
 },milliseconds);});
 try{return await Promise.race([typeof request?.abortSignal==='function'?request.abortSignal(signal):request,aborted,deadline]);}
 finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
}
export function verifyDeviceSession(){
 if(pending?.epoch===connectionEpoch)return pending.promise;
 const job={epoch:connectionEpoch,controller:new AbortController()};pending=job;
 const connected=()=>{
  if(job.epoch!==connectionEpoch||job.controller.signal.aborted)throw interrupted();
  if(!navigator.onLine)throw Error('Offline. Reconnect to verify this device. Your saved work stays here.');
 };
 job.promise=(async()=>{
  connected();
  const session=await checkedWait(cloudSession(),job,15000,'Secure session check'),sid=sessionId(session);
  connected();
  if(!session||!sid)throw Error('Sign in again to open this device.');
  const takeover=localStorage.getItem(REQUEST)===sid;
  const {data,error}=await checkedWait(cloudClient().rpc('road_ready_active_device_v1',{p_device:deviceId(),p_takeover:takeover}),job,30000,'Device connection check');
  connected();if(error)throw error;
  if(!data||typeof data.active!=='boolean'||data.active&&(!Number.isInteger(data.generation)||data.generation<1))throw Error('Could not verify the active device.');
  const latest=await checkedWait(cloudSession(),job,10000,'Secure session recheck');
  connected();if(sessionId(latest)!==sid)throw Error('Account session changed. Checking the new sign-in…');
  if(data.active){
   const db=getOwnerOpDb();if(!db)throw Error('Device storage is unavailable.');
   const handoff=await checkedWait(db.sync_meta.get(HANDOFF_KEY),job,10000,'Saved device check');
   connected();
   if(handoff?.value?.uid===session.user.id&&Number(handoff.value.generation)>data.generation)throw Error('The saved device handoff changed. Reconnect to check its latest version.');
   // Never downgrade a newer receive generation after a suspended request.
   if(data.receive&&(!handoff?.value||handoff.value.uid!==session.user.id||Number(handoff.value.generation)<data.generation)){
    await checkedWait(db.sync_meta.put({key:HANDOFF_KEY,value:{uid:session.user.id,generation:data.generation,records:true,archive:true},updated_at:new Date().toISOString()}),job,10000,'Saved device handoff');
   }
   connected();if(takeover)localStorage.removeItem(REQUEST);
  }
  current={...data,uid:session.user.id,sid,checkedAt:Date.now()};
  window.dispatchEvent(new CustomEvent(DEVICE_EVENT,{detail:current}));
  if(!data.active)throw Object.assign(Error('This account was opened on another device. Sign in again to use this one. Your local work is retained.'),{deviceRevoked:true,sid});
  return current;
 })().finally(()=>{if(pending===job)pending=null;});
 return job.promise;
}
export async function assertActiveDevice(){
 const session=await checkedWait(cloudSession(),{controller:new AbortController()},15000,'Secure session check');
 if(!navigator.onLine||!current?.active||current.sid!==sessionId(session)||Date.now()-current.checkedAt>4000)return verifyDeviceSession();
 return current;
}
export async function acknowledgeHandoff(generation){
 // Use a separate cancellable request; it does not extend cached permission.
 const job={controller:new AbortController()};
 const {data,error}=await checkedWait(cloudClient().rpc('road_ready_ack_device_v1',{p_device:deviceId(),p_generation:generation}),job,30000,'Device handoff confirmation');
 if(error)throw error;if(!data?.active)throw Object.assign(Error('This account was opened on another device.'),{deviceRevoked:true});
}
