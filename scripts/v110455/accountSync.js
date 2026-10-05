'use client';
import {cloudClient,cloudSession} from './client.js';
import {getOwnerOpDb} from '../local-db/dexie.js';
import {APP_STATE_KEY,flushAppSnapshots} from '../local-db/appState.js';
import {BUSINESS_STORE_KEY,BUSINESS_STORE_EVENT} from '../../source/src/modules/business/businessStore.js';
import {bounded} from './mirrorCoreV110450.js';
import {FORMAT,TABLE_KEYS,LOCAL_KEYS,recordsFrom,bundleFrom,mergeRecords,hasData,validatePayload,same,canonical} from './accountCoreV110455.js';
import {encode,decode,piecesOf,snapshotBundle} from './accountFilesV110455.js';
export const ACCOUNT_EVENT='road-ready-account-sync',APPLY_EVENT='road-ready-account-apply';
const OWNER_KEY='owner-op-account-data-owner-v1',BASE_KEY='account-sync-v110455:base';
let mutationEpoch=0;const tableEpoch=new Map();
let active=null,status={phase:'idle',message:'Checking account data…'},conflictReview=null;
export const accountStatus=()=>status;
function show(v){status={...status,...v};window.dispatchEvent(new CustomEvent(ACCOUNT_EVENT,{detail:status}));}
async function checked(q){const r=await bounded(q);if(r.error)throw r.error;return r.data;}
function device(){const k='owner-op-cloud-mirror-v1:device';let v=localStorage.getItem(k);if(!v){v=crypto.randomUUID();localStorage.setItem(k,v);}return v;}
const readLocal=k=>{const s=localStorage.getItem(k);if(s===null)return undefined;try{return JSON.parse(s);}catch{return s;}};
async function capture(){
 await flushAppSnapshots();const epoch=mutationEpoch,db=getOwnerOpDb(),tables={},row=await db.app_snapshots.get(APP_STATE_KEY),live=window.__rrAccountState?.();
 if(window.__OWNER_OP_BUSINESS_STORE_VOLATILE_V10963__)throw Error('Save pending load changes before syncing.');
 await db.transaction('r',Object.keys(TABLE_KEYS).map(k=>db.table(k)),async()=>{for(const k of Object.keys(TABLE_KEYS))tables[k]=await db.table(k).toArray();});
 if(epoch!==mutationEpoch)throw Error('Documents changed during sync. Retrying shortly.');
 return {epoch,state:live||row?.state||{},business:readLocal(BUSINESS_STORE_KEY)||{},tables,locals:Object.fromEntries(LOCAL_KEYS.map(k=>[k,readLocal(k)]).filter(([,v])=>v!==undefined)),savedState:row?.state,live};
}
function rawShape(v){if(v instanceof Blob)return {blob:v.size,mime:v.type};if(v instanceof ArrayBuffer)return {bytes:v.byteLength};if(Array.isArray(v))return v.map(rawShape);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,rawShape(x)]));return v;}
const encodeCache=new Map(),dirty=new Set();let hooks=false;
function installHooks(db){if(hooks)return;hooks=true;for(const name of Object.keys(TABLE_KEYS)){const mark=()=>{mutationEpoch++;tableEpoch.set(name,mutationEpoch);dirty.add(name);};for(const hook of ['creating','updating','deleting'])db.table(name).hook(hook,mark);}}
async function encodedRecords(bundle,opts){
 const out={};for(const [key,value] of Object.entries(recordsFrom(bundle))){const parts=JSON.parse(key),sig=canonical(rawShape(value)),cached=encodeCache.get(key),changedTable=parts[0]==='table'&&cached?.epoch!==(tableEpoch.get(parts[1])||0);
  if(cached&&cached.sig===sig&&!changedTable)out[key]=cached.value;
  else{out[key]=await encode(value,opts);encodeCache.set(key,{sig,value:out[key],epoch:tableEpoch.get(parts[1])||0});}
 }dirty.clear();return out;
}
async function install(records,local,base,uid,check){
 show({message:'Saving account data for offline use…'});
 const opts={storage:cloudClient().storage.from('owner-op-private'),uid,check},decoded={},cache=new Map(),rawRecords=recordsFrom(local);let done=0;
 for(const [k,v] of Object.entries(records)){decoded[k]=same(v,local.encoded?.[k])?rawRecords[k]:await decode(v,opts,cache);if(++done%20===0)show({message:`Receiving saved records · ${done} / ${Object.keys(records).length}`});}
 const next=bundleFrom(decoded,local.state),db=getOwnerOpDb();await check();await flushAppSnapshots();
 const unchanged=()=>{if(mutationEpoch!==local.epoch||!same(window.__rrAccountState?.()||local.state,local.live||local.state)||!same(readLocal(BUSINESS_STORE_KEY)||{},local.business)||LOCAL_KEYS.some(k=>!same(readLocal(k),local.locals[k])))throw Error('Records changed during sync. Retrying shortly.');if(window.__rrAccountState?.()?.sheet||document.activeElement?.matches('input,textarea,select,[contenteditable=true]'))throw Error('Finish your open edit to receive the latest changes.');};
 unchanged();
 const previousLocals=new Map(),installedLocals=new Map(),now=new Date().toISOString();
 try{
  // Journal both the old working copy and incoming manifest before replacing anything.
  await db.sync_meta.put({key:'account-sync-v110455:pending',value:{uid,base,oldState:local.state,oldBusiness:local.business,oldLocals:local.locals},updated_at:now});
  unchanged();
  for(const [key,value] of [[BUSINESS_STORE_KEY,next.business],...Object.entries(next.locals)]){previousLocals.set(key,localStorage.getItem(key));const serialized=typeof value==='string'?value:JSON.stringify(value);localStorage.setItem(key,serialized);installedLocals.set(key,serialized);}
  await db.transaction('rw',[db.app_snapshots,db.sync_meta,...Object.keys(TABLE_KEYS).map(k=>db.table(k))],async()=>{
   if([...installedLocals].some(([k,v])=>localStorage.getItem(k)!==v))throw Error('Another tab changed records. Retry sync.');
   const row=await db.app_snapshots.get(APP_STATE_KEY);if(mutationEpoch!==local.epoch||!same(window.__rrAccountState?.()||local.state,local.live||local.state)||!same(row?.state,local.savedState))throw Error('Records changed during sync. Retrying shortly.');
   if(!await db.sync_meta.get('account-sync-v110455:first-join'))await db.sync_meta.put({key:'account-sync-v110455:first-join',value:{uid,state:local.state,business:local.business,locals:local.locals},updated_at:now});
   const checkpoint=await db.app_snapshots.get('account-sync-before-first-join');if(!checkpoint)await db.app_snapshots.put({key:'account-sync-before-first-join',state:local.state,updated_at:now});
   // Retain raw document rows for recovery; delete only identities removed relative to our common baseline.
   for(const [name,pk] of Object.entries(TABLE_KEYS)){
    const changes=next.tables[name].filter(row=>{const k=JSON.stringify(['table',name,String(row[pk])]);return !same(local.encoded?.[k],records[k]);});
    if(changes.length)await db.table(name).bulkPut(changes);
    const incoming=new Set(next.tables[name].map(r=>String(r[pk])));
    const removed=(local.tables[name]||[]).filter(r=>!incoming.has(String(r[pk])));
    for(const row of removed){await db.sync_meta.put({key:'account-sync-retained:'+name+':'+row[pk],value:row,updated_at:now});await db.table(name).delete(row[pk]);}
   }
   await db.app_snapshots.put({key:APP_STATE_KEY,state:next.state,updated_at:now});
   await db.sync_meta.put({key:BASE_KEY,value:{...base,uid,records},updated_at:now});
   await db.sync_meta.delete('account-sync-v110455:pending');
  });
 }catch(e){for(const [k,v] of previousLocals){if(localStorage.getItem(k)!==installedLocals.get(k))continue;if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}await db.sync_meta.delete('account-sync-v110455:pending');throw e;}
 localStorage.setItem(OWNER_KEY,uid);
 // Startup's legacy fallback must never outrank the newly verified IndexedDB state.
 for(const k of [APP_STATE_KEY,'owner-op-road-ready-local-fallback-v1:'+APP_STATE_KEY])localStorage.removeItem(k);
 window.dispatchEvent(new CustomEvent(APPLY_EVENT,{detail:next.state}));
 window.dispatchEvent(new CustomEvent('owner-op-operator-profile-updated'));
 window.dispatchEvent(new CustomEvent(BUSINESS_STORE_EVENT));window.dispatchEvent(new CustomEvent('road-ready-owner-ops-updated-v102'));
 for(const [key,value] of Object.entries(records)){const raw=decoded[key],parts=JSON.parse(key);encodeCache.set(key,{sig:canonical(rawShape(raw)),value,epoch:tableEpoch.get(parts[1])||0});}
}
export function syncAccount({initial=false,choices=null}={}){
 if(active)return active;
 const run=async()=>{
  try{
   const session=await cloudSession();if(!session)return {signedOut:true};const uid=session.user.id,db=getOwnerOpDb();if(!db)throw Error('Device storage is unavailable.');
   const priorOwners=(await db.sync_meta.toArray()).map(r=>r.key?.match(/^owner-op-record-sync-v1:([a-f0-9-]{36}):/i)?.[1]).filter(Boolean);
   const bound=localStorage.getItem(OWNER_KEY)||priorOwners[0];if((bound&&bound!==uid)||priorOwners.some(id=>id!==uid)){show({phase:'account_mismatch',message:'This device has another account’s offline data. Sign in with that account to open it.'});return {blocked:true};}
   installHooks(db);
   const pending=await db.sync_meta.get('account-sync-v110455:pending');
   if(pending?.value?.uid===uid){const p=pending.value;localStorage.setItem(BUSINESS_STORE_KEY,JSON.stringify(p.oldBusiness));for(const k of LOCAL_KEYS){const v=p.oldLocals[k];if(v===undefined)localStorage.removeItem(k);else localStorage.setItem(k,typeof v==='string'?v:JSON.stringify(v));}await db.sync_meta.delete('account-sync-v110455:pending');}
   const check=async()=>{if(localStorage.getItem('owner-op-record-sync-v1:paused')==='true')throw Error('Cloud work is paused on this device.');if((await cloudSession())?.user?.id!==uid)throw Error('Account changed. Synchronization stopped.');if(!navigator.onLine)throw Error('Offline · changes stay on this device until connected.');};
   if(localStorage.getItem('owner-op-record-sync-v1:paused')==='true'){show({phase:'paused',message:'Cloud work is paused on this device.'});return {paused:true};}
   if(!navigator.onLine){show({phase:'offline',message:'Offline · changes saved on this device.'});return {offline:true};}
   await check();show({phase:'syncing',message:initial?'Opening your account data…':'Syncing changes…',conflicts:[]});
   const setting=await checked(cloudClient().from('road_ready_backup_settings').select('record_sync_enabled').eq('user_id',uid).maybeSingle());
   if(!setting?.record_sync_enabled){show({phase:'disabled',message:'Account synchronization is disabled.'});return {disabled:true};}
   let remote=await checked(cloudClient().from('road_ready_account_workspaces').select('*').eq('user_id',uid).maybeSingle());
   let seed=null;
   if(!remote){
    const candidates=await checked(cloudClient().from('road_ready_backup_snapshots').select('id,device_id,created_at,summary:review->summary').eq('user_id',uid).eq('missing_originals',0).order('created_at',{ascending:false}).limit(50));
    const selected=candidates?.find(r=>Number(r.summary?.events||0)>0||Number(r.summary?.businessLoads||0)>0||Number(r.summary?.walletDocuments||0)>0)||candidates?.[0];
    if(selected)seed=await checked(cloudClient().from('road_ready_backup_snapshots').select('*').eq('user_id',uid).eq('id',selected.id).single());
    if(seed){show({message:'Opening saved phone records…'});const source=await snapshotBundle(seed,{storage:cloudClient().storage.from('owner-op-private'),uid,check});const payload={format:FORMAT,records:recordsFrom(source),seed_snapshot:seed.id,seed_device:seed.device_id};
     const receipt=await checked(cloudClient().rpc('road_ready_account_commit_v1',{p_device:device(),p_expected:0,p_payload:payload}));
     remote=receipt.conflict?await checked(cloudClient().from('road_ready_account_workspaces').select('*').eq('user_id',uid).single()):{revision:receipt.revision,payload};
    }
   }
   if(remote)validatePayload(remote.payload);
   const local=await capture(),saved=(await db.sync_meta.get(BASE_KEY))?.value;
   if(saved&&saved.uid!==uid)throw Error('Offline synchronization belongs to another account.');
   const meaningful=hasData(local),opts={storage:cloudClient().storage.from('owner-op-private'),uid,known:piecesOf(remote?.payload?.records||{}),check,onProgress:message=>show({message})};
   if(!remote&&!meaningful){localStorage.setItem(OWNER_KEY,uid);show({phase:'current',message:'Ready for your first records.'});return {empty:true};}
   local.encoded=await encodedRecords(local,opts);
   let base=saved?.records;
   if(!base&&remote?.payload?.seed_device===device()){
    // The original phone compares its newer local work against its own immutable seed, not another device.
    const history=await checked(cloudClient().from('road_ready_account_history').select('payload').eq('user_id',uid).eq('revision',1).single());base=history.payload.records;
   }
   let merge=base?mergeRecords(base,local.encoded,remote?.payload?.records||{}):!meaningful&&remote?{records:remote.payload.records,conflicts:[]}:mergeRecords({},local.encoded,remote?.payload?.records||{});
   if(choices&&conflictReview&&same(conflictReview.local,local.encoded)&&same(conflictReview.remote,remote?.payload?.records)){
    merge.records={...merge.records};merge.conflicts=merge.conflicts.filter(c=>{if(!['local','remote'].includes(choices[c.key]))return true;const v=c[choices[c.key]];if(v===undefined)delete merge.records[c.key];else merge.records[c.key]=v;return false;});
   }
   if(merge.conflicts.length){conflictReview={local:local.encoded,remote:remote?.payload?.records};await db.sync_meta.put({key:'account-sync-v110455:conflicts',value:{uid,revision:remote?.revision,conflicts:merge.conflicts},updated_at:new Date().toISOString()});show({phase:'conflict',message:'Changes on two devices need review. Both versions are kept.',conflicts:merge.conflicts});return {conflicts:merge.conflicts};}
   if(local.epoch!==mutationEpoch||!same(window.__rrAccountState?.()||local.state,local.live||local.state)||!same(readLocal(BUSINESS_STORE_KEY)||{},local.business))throw Error('Records changed during sync. Retrying shortly.');
   const payload={...(remote?.payload||{}),format:FORMAT,records:merge.records};let revision=remote?.revision||0;
   await check();
   if(!same(payload.records,remote?.payload?.records)){
    const receipt=await checked(cloudClient().rpc('road_ready_account_commit_v1',{p_device:device(),p_expected:revision,p_payload:payload}));if(receipt.conflict)throw Error('Another device saved changes. Retrying shortly.');revision=receipt.revision;
   }
   const changed=!same(local.encoded,merge.records);
   if(changed)await install(merge.records,local,{revision},uid,check);
   else{await db.sync_meta.put({key:BASE_KEY,value:{uid,revision,records:merge.records},updated_at:new Date().toISOString()});localStorage.setItem(OWNER_KEY,uid);}
   const resolved=await db.sync_meta.get('account-sync-v110455:conflicts');if(resolved)await db.sync_meta.put({...resolved,key:'account-sync-v110455:resolved:'+Date.now()});
   await db.sync_meta.delete('account-sync-v110455:conflicts');conflictReview=null;
   show({phase:'current',message:'Account data is up to date.',revision,completedAt:new Date().toISOString(),conflicts:[]});return {revision,changed};
  }catch(e){const message=e?.message||String(e);show({phase:localStorage.getItem('owner-op-record-sync-v1:paused')==='true'?'paused':navigator.onLine?'error':'offline',message});return {error:message};}
 };
 active=(navigator.locks?.request?navigator.locks.request('road-ready-account-sync-v110455',{ifAvailable:true},lock=>lock?run():{busy:true}):run()).finally(()=>{active=null;});return active;
}
