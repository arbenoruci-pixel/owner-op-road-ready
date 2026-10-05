'use client';
import {cloudClient,cloudSession,sha256} from './client.js';
import {getOwnerOpDb} from '../local-db/dexie.js';
import {BUSINESS_STORE_KEY,BUSINESS_STORE_EVENT} from '../../source/src/modules/business/businessStore.js';
import {bounded} from './mirrorCoreV110450.js';
import {canonical,projectRecords,prepareCorrection,idOf} from './recordsCoreV110451.js';
export const EDIT_LOCK='road-ready-record-editor-v1',SYNC_EVENT='road-ready-record-sync',PREFIX='owner-op-record-sync-v1:';
let active=null,status={phase:'idle',message:'Checking record synchronization…'};
export const recordSyncStatus=()=>status;
function show(value){status={...status,...value};window.dispatchEvent(new CustomEvent(SYNC_EVENT,{detail:status}));}
export function recordDeviceId(){const key='owner-op-cloud-mirror-v1:device';let id=localStorage.getItem(key);if(!id){id=crypto.randomUUID();localStorage.setItem(key,id);}return id;}
export const recordSyncPaused=()=>localStorage.getItem(PREFIX+'paused')==='true';
export function pauseRecordSync(paused){localStorage.setItem(PREFIX+'paused',String(paused));show({phase:paused?'paused':'idle',message:paused?'Record synchronization paused. Local records remain available.':'Record synchronization enabled.'});}
async function checked(query){const {data,error}=await bounded(query);if(error)throw error;return data;}
async function account(){const s=await cloudSession();if(!s)throw Error('Sign in to synchronize records.');return s.user.id;}
async function enabled(uid){return (await checked(cloudClient().from('road_ready_backup_settings').select('record_sync_enabled').eq('user_id',uid).maybeSingle()))?.record_sync_enabled===true;}
async function capture(){
 const db=getOwnerOpDb();if(!db)throw Error('Device storage is unavailable.');
 if(window.__OWNER_OP_BUSINESS_STORE_VOLATILE_V10963__)throw Error('Some load changes are not saved yet. Resolve device storage before synchronizing.');
 const raw=localStorage.getItem(BUSINESS_STORE_KEY),tables={},localRows=[];
 for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(/^(owner-op-|road-ready)/.test(key)&&key!==BUSINESS_STORE_KEY&&!/(auth|session|token|password|secret|cloud-|record-sync)/i.test(key))localRows.push({key,value:localStorage.getItem(key)});}
 await db.transaction('r',db.tables,async()=>{for(const table of db.tables)tables[table.name]=await table.toArray();});
 if(raw!==localStorage.getItem(BUSINESS_STORE_KEY))throw Error('Records changed during the scan. Synchronization will retry.');
 const state=tables.app_snapshots?.find(r=>r.key==='owner-op-road-ready-state-v1')?.state;if(!state)throw Error('Open your saved logbook before synchronizing this device.');
 return {state,business:raw?JSON.parse(raw):{},tables,localRows};
}
export function syncRecords({force=false}={}){
 if(active)return active;
 const run=async()=>{
  let uid,runId,started=false;
  try{
   if(recordSyncPaused()){show({phase:'paused',message:'Record synchronization paused.'});return;}
   if(!navigator.onLine){show({phase:'offline',message:'Offline · local changes will synchronize when connected.'});return;}
   uid=await account();if(!await enabled(uid)){show({phase:'disabled',message:'Record synchronization is not enabled for this account.'});return;}
   const db=getOwnerOpDb(),cacheKey=PREFIX+uid+':'+recordDeviceId(),cache=(await db.sync_meta.get(cacheKey))?.value||{};
   if(!force&&cache.completedAt&&Date.now()-cache.completedAt<60000){const pending=await listCorrections();show({phase:'current',message:'Saved records synchronized.',pending:pending.filter(r=>r.status==='pending').length,completedAt:new Date(cache.completedAt).toISOString()});return;}
   show({phase:'running',message:'Reading saved records…'});
   const bundle=await capture(),records=projectRecords(bundle),hashes={},items=[],summary={};
   for(const record of records){const payload_hash=await sha256(new TextEncoder().encode(canonical(record)));hashes[record.record_key]=payload_hash;summary[record.kind]=(summary[record.kind]||0)+1;items.push(cache.hashes?.[record.record_key]===payload_hash?{record_key:record.record_key,payload_hash}:{...record,payload_hash});}
   runId=crypto.randomUUID();const rpc=(action,args={})=>checked(cloudClient().rpc('road_ready_record_sync_v1',{p_device:recordDeviceId(),p_run:runId,p_action:action,p_version:'110.4.52',...args}));
   const begin=await rpc('begin');if(begin?.busy){show({phase:'waiting',message:'Another record sync is finishing. This device will retry.'});return;}started=true;
   let batch=[],bytes=0,done=0;
   const send=async()=>{if(!batch.length)return;if(recordSyncPaused())throw Error('Record synchronization paused.');if(await account()!==uid)throw Error('Account changed. Synchronization stopped.');await rpc('batch',{p_records:batch});done+=batch.length;show({message:`Synchronizing records · ${done} / ${records.length}`});batch=[];bytes=0;};
   for(const item of items){const size=new TextEncoder().encode(JSON.stringify(item)).length;if(batch.length>=100||bytes+size>600000)await send();batch.push(item);bytes+=size;}await send();
   if(recordSyncPaused())throw Error('Record synchronization paused.');
   await rpc('finish',{p_count:records.length,p_summary:summary});
   await db.sync_meta.put({key:cacheKey,value:{hashes,completedAt:Date.now()},updated_at:new Date().toISOString()});
   const pending=await listCorrections();show({phase:'current',message:`${records.length} saved records synchronized.`,summary,pending:pending.filter(r=>r.status==='pending').length,completedAt:new Date().toISOString()});return {records:records.length,summary};
  }catch(error){
   const message=error?.message||String(error);show({phase:'error',message});
   if(uid&&/Cached record/.test(message))await getOwnerOpDb()?.sync_meta.delete(PREFIX+uid+':'+recordDeviceId()).catch(()=>{});
   if(started)await checked(cloudClient().rpc('road_ready_record_sync_v1',{p_device:recordDeviceId(),p_run:runId,p_action:'error',p_summary:{message:message.slice(0,700)}})).catch(()=>{});
   return {error:message};
  }
 };
 active=(navigator.locks?.request?navigator.locks.request('road-ready-record-sync-v1',{ifAvailable:true},lock=>lock?run():null):run()).finally(()=>{active=null;});return active;
}
export async function listCorrections(){const uid=await account();return checked(cloudClient().from('road_ready_corrections').select('*').eq('user_id',uid).eq('device_id',recordDeviceId()).order('created_at',{ascending:false}).limit(50));}
export async function listRecords(kind='',search=''){
 const uid=await account();let q=cloudClient().from('road_ready_records').select('*').eq('user_id',uid).eq('device_id',recordDeviceId()).eq('deleted',false);
 if(kind)q=q.eq('kind',kind);const term=search.replace(/[^a-zA-Z0-9 -]/g,'').slice(0,80);if(term)q=q.or('load_no.ilike.%'+term+'%,record_key.ilike.%'+term+'%');
 return checked(q.order('record_key').limit(60));
}
export async function applyCorrection(change){
 if(!navigator.locks?.request)throw Error('This browser cannot safely lock records. Apply corrections from a browser with Web Locks support.');
 return navigator.locks.request(EDIT_LOCK,{mode:'exclusive',ifAvailable:true},async lock=>{
  if(!lock)throw Error('Close other Road Ready editing tabs before applying this correction.');
  const uid=await account();if(change.user_id!==uid||change.device_id!==recordDeviceId())throw Error('This correction belongs to a different device.');
  if(recordSyncPaused()||!await enabled(uid))throw Error('Enable record synchronization before applying a correction.');
  const live=await checked(cloudClient().from('road_ready_corrections').select('*').eq('user_id',uid).eq('id',change.id).single());
  if(live.status!=='pending')return {status:live.status};change=live;
  const db=getOwnerOpDb(),record={kind:change.kind,origin:'device',locator:change.locator},key=PREFIX+'correction:'+change.id;
  let outcome='applied',message='Correction saved on this device.';
  try{
   const journal=await db.sync_meta.get(key);
   if(journal?.value?.phase!=='applied'){
    const l=change.locator,businessRaw=localStorage.getItem(BUSINESS_STORE_KEY),business=businessRaw?JSON.parse(businessRaw):{};
    const stateRow=await db.app_snapshots.get('owner-op-road-ready-state-v1'),document=l.store==='db'?await db.documents_local.get(l.id):null;
    const bundle={state:stateRow?.state||{},business,tables:{documents_local:document?[document]:[]}},plan=prepareCorrection(bundle,record,change);
    if(!plan.alreadyApplied){
     if(await account()!==uid)throw Error('Account changed. Correction stopped.');
     await db.sync_meta.put({key,value:{phase:'prepared',before:plan.raw,after:plan.next,correctionId:change.id},updated_at:new Date().toISOString()});
     if(l.store==='business'){
      if(localStorage.getItem(BUSINESS_STORE_KEY)!==businessRaw)throw Error('Conflict: load records changed during correction.');
      const current=prepareCorrection({state:{},business:JSON.parse(businessRaw||'{}'),tables:{}},record,change);if(!current.alreadyApplied){business[l.bucket]=business[l.bucket].map(row=>String(idOf(row))===l.id?current.next:row);localStorage.setItem(BUSINESS_STORE_KEY,JSON.stringify(business));window.dispatchEvent(new CustomEvent(BUSINESS_STORE_EVENT,{detail:business}));}
     }else await db.transaction('rw',db.app_snapshots,db.documents_local,db.sync_meta,async()=>{
      const row=await db.app_snapshots.get('owner-op-road-ready-state-v1'),doc=l.store==='db'?await db.documents_local.get(l.id):null;
      const fresh={state:row?.state||{},business:{},tables:{documents_local:doc?[doc]:[]}},p=prepareCorrection(fresh,record,change);
      if(!p.alreadyApplied){if(l.store==='db')await db.documents_local.put(p.next);else{if(l.store==='state-route')fresh.state.routeLegsByDay[l.day]=fresh.state.routeLegsByDay[l.day].map(r=>r.id===l.id?p.next:r);else if(l.store==='wallet')fresh.state.dotWallet.documents[l.key]=p.next;else throw Error('Unsupported correction target.');await db.app_snapshots.put({...row,state:fresh.state,updated_at:new Date().toISOString()});}}
      await db.sync_meta.put({key,value:{phase:'applied',before:plan.raw,after:plan.next,correctionId:change.id},updated_at:new Date().toISOString()});
     });
    }
    await db.sync_meta.put({key,value:{phase:'applied',before:plan.raw,after:plan.next||plan.raw,correctionId:change.id},updated_at:new Date().toISOString()});
   }
  }catch(error){if(!String(error.message).startsWith('Conflict:'))throw error;outcome='conflict';message=error.message;}
  await checked(cloudClient().from('road_ready_corrections').update({status:outcome,result:{message,deviceConfirmedAt:new Date().toISOString()},applied_at:outcome==='applied'?new Date().toISOString():null}).eq('user_id',uid).eq('id',change.id).eq('status','pending'));
  return {status:outcome,message};
 });
}
