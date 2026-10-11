'use client';
import {cloudClient,cloudSession} from './client.js';
import {getOwnerOpDb} from '../local-db/dexie.js';
import {bounded} from './mirrorCoreV110450.js';

export const DEVICE_EVENT='road-ready-device-session';
export const HANDOFF_KEY='road-ready-device-handoff-v1';
const REQUEST='road-ready-device-login-v1';
let current=null,pending=null;
export function deviceId(){const key='owner-op-cloud-mirror-v1:device';let id=localStorage.getItem(key);if(!id){id=crypto.randomUUID();localStorage.setItem(key,id);}return id;}
export function sessionId(session){try{return JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).session_id||null;}catch{return null;}}
export function requestDeviceActivation(session){const sid=sessionId(session);if(sid)localStorage.setItem(REQUEST,sid);}
export function deviceSessionStatus(){return current;}
export async function verifyDeviceSession(){
 if(pending)return pending;
 pending=(async()=>{
  const session=await bounded(cloudSession(),10000),sid=sessionId(session);
  if(!session||!sid)throw Error('Sign in again to open this device.');
  if(!navigator.onLine)throw Error('Connect to the internet to verify the active device. Your saved work stays here.');
  const takeover=localStorage.getItem(REQUEST)===sid;
  const {data,error}=await bounded(cloudClient().rpc('road_ready_active_device_v1',{p_device:deviceId(),p_takeover:takeover}),10000);
  if(error)throw error;
  if(!data||typeof data.active!=='boolean')throw Error('Could not verify the active device.');
  if(data.active){
   // Persist receive intent before allowing any child to mount or any write.
   // The server repeats receive=true until this generation is acknowledged.
   const db=getOwnerOpDb();if(!db)throw Error('Device storage is unavailable.');
   const handoff=await db.sync_meta.get(HANDOFF_KEY);
   if(data.receive&&handoff?.value?.generation!==data.generation){
    await db.sync_meta.put({key:HANDOFF_KEY,value:{uid:session.user.id,generation:data.generation,records:true,archive:true},updated_at:new Date().toISOString()});
   }
   if(takeover)localStorage.removeItem(REQUEST);
  }
  current={...data,uid:session.user.id,sid,checkedAt:Date.now()};
  window.dispatchEvent(new CustomEvent(DEVICE_EVENT,{detail:current}));
  if(!data.active)throw Object.assign(Error('This account was opened on another device. Sign in again to use this one. Your local work is retained.'),{deviceRevoked:true});
  return current;
 })().finally(()=>{pending=null;});
 return pending;
}
export async function assertActiveDevice(){
 const session=await cloudSession();
 if(!navigator.onLine||!current?.active||current.sid!==sessionId(session)||Date.now()-current.checkedAt>4000)return verifyDeviceSession();
 return current;
}
export async function acknowledgeHandoff(generation){
 const {data,error}=await bounded(cloudClient().rpc('road_ready_ack_device_v1',{p_device:deviceId(),p_generation:generation}),10000);
 if(error)throw error;if(!data?.active)throw Object.assign(Error('This account was opened on another device.'),{deviceRevoked:true});
}
