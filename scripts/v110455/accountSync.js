'use client';
import Dexie from 'dexie';
import {cloudClient,cloudSession} from './client.js';
import {getOwnerOpDb} from '../local-db/dexie.js';
import {APP_STATE_KEY,flushAppSnapshots} from '../local-db/appState.js';
import {BUSINESS_STORE_KEY,BUSINESS_STORE_EVENT} from '../../source/src/modules/business/businessStore.js';
import {bounded,hashBytes} from './mirrorCoreV110450.js';
import {FORMAT,TABLE_KEYS,LOCAL_KEYS,recordsFrom,bundleFrom,mergeRecords,hasData,validatePayload,same,canonical,equivalentRecords,resolveConflict,repairChecklistState} from './accountCoreV110455.js';
import {encode,decode,piecesOf,snapshotBundle} from './accountFilesV110455.js';
export const ACCOUNT_EVENT='road-ready-account-sync',APPLY_EVENT='road-ready-account-apply';
const FILE_TABLES=new Set(['document_blobs','capture_asset_blobs']);
const OWNER_KEY='owner-op-account-data-owner-v1',BASE_KEY='account-sync-v110455:base';
let mutationEpoch=0;const tableEpoch=new Map();
let tabBase; // Keep this tab's last observed revision; another tab may advance shared IndexedDB.
let active=null,status={phase:'idle',message:'Checking account data…'},conflictReview=null;
export const accountStatus=()=>status;
function show(v){status={...status,...v};window.dispatchEvent(new CustomEvent(ACCOUNT_EVENT,{detail:status}));}
async function checked(q){const r=await bounded(q);if(r.error)throw r.error;return r.data;}
function device(){const k='owner-op-cloud-mirror-v1:device';let v=localStorage.getItem(k);if(!v){v=crypto.randomUUID();localStorage.setItem(k,v);}return v;}
const readLocal=k=>{const s=localStorage.getItem(k);if(s===null)return undefined;try{return JSON.parse(s);}catch{return s;}};
async function capture(){
 await flushAppSnapshots();const epoch=mutationEpoch,db=getOwnerOpDb(),tables={},row=await db.app_snapshots.get(APP_STATE_KEY),live=window.__rrAccountState?.();
 if(window.__OWNER_OP_BUSINESS_STORE_VOLATILE_V10963__)throw Error('Save pending load changes before syncing.');
 await db.transaction('r',Object.keys(TABLE_KEYS).map(k=>db.table(k)),async()=>{for(const k of Object.keys(TABLE_KEYS))tables[k]=FILE_TABLES.has(k)?(await db.table(k).toCollection().primaryKeys()).map(id=>({[TABLE_KEYS[k]]:id})):await db.table(k).toArray();});
 if(epoch!==mutationEpoch)throw Error('Documents changed during sync. Retrying shortly.');
 return {epoch,state:live||row?.state||{},business:readLocal(BUSINESS_STORE_KEY)||{},tables,locals:Object.fromEntries(LOCAL_KEYS.map(k=>[k,readLocal(k)]).filter(([,v])=>v!==undefined)),savedState:row?.state,live};
}
function rawShape(v){if(v instanceof Blob)return {blob:v.size,mime:v.type};if(v instanceof ArrayBuffer)return {bytes:v.byteLength};if(Array.isArray(v))return v.map(rawShape);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,rawShape(x)]));return v;}
const encodeCache=new Map(),dirty=new Set();let hooks=false;
function installHooks(db){
 if(hooks)return;hooks=true;
 const mark=name=>{mutationEpoch++;tableEpoch.set(name,mutationEpoch);dirty.add(name);};
 for(const name of Object.keys(TABLE_KEYS))for(const hook of ['creating','updating','deleting'])db.table(name).hook(hook,()=>mark(name));
 // Dexie forwards committed mutations from other tabs as well. A cached file
 // must not hide replacement bytes written by another window on this device.
 Dexie.on('storagemutated',parts=>{const keys=Object.keys(parts);for(const name of Object.keys(TABLE_KEYS))if(parts.all||keys.some(k=>k.startsWith('idb://'+db.name+'/'+name+'/')))mark(name);});
}
async function encodedRecords(bundle,opts){
 const out={};
 async function add(key,value){const parts=JSON.parse(key),sig=canonical(rawShape(value)),cached=encodeCache.get(key),changedTable=parts[0]==='table'&&cached?.epoch!==(tableEpoch.get(parts[1])||0);
  if(cached&&cached.sig===sig&&!changedTable)out[key]=cached.value;
  else{out[key]=await encode(value,opts);encodeCache.set(key,{sig,value:out[key],epoch:tableEpoch.get(parts[1])||0});}
 }
 for(const [key,value] of Object.entries(recordsFrom(bundle))){const parts=JSON.parse(key);if(parts[0]==='table'&&FILE_TABLES.has(parts[1]))continue;await add(key,value);}
 // Read one original at a time. ArrayBuffer-backed rows must never be loaded
 // together with getAll() during background synchronization.
 const db=getOwnerOpDb();
 for(const name of FILE_TABLES)for(const stub of bundle.tables[name]||[]){
  const id=stub[TABLE_KEYS[name]],key=JSON.stringify(['table',name,String(id)]),cached=encodeCache.get(key);
  if(cached&&cached.epoch===(tableEpoch.get(name)||0)){out[key]=cached.value;continue;}
  const row=await db.table(name).get(id);if(!row)throw Error('A saved document changed during sync. Retrying shortly.');await add(key,row);
 }
 if(bundle.epoch!==mutationEpoch)throw Error('Documents changed during sync. Retrying shortly.');
 dirty.clear();return out;
}
async function install(records,local,base,uid,check){
 show({message:'Saving account data for offline use…'});
 const opts={storage:cloudClient().storage.from('owner-op-private'),uid,check},decoded={},rawRecords=recordsFrom(local),db=getOwnerOpDb(),staged=new Map(),signatures=new Map();let done=0;
 // Persist each verified table row before receiving the next. Never retain the
 // entire archive in RAM; interrupted transfers reuse their verified rows.
 for(const [k,v] of Object.entries(records)){
  const parts=JSON.parse(k),unchanged=same(v,local.encoded?.[k]);
  if(parts[0]==='table'){
   if(!unchanged){
    const stageKey=uid+':'+await hashBytes(new TextEncoder().encode(k+canonical(v)));
    let row=await db.account_receive_staging.get(stageKey);
    if(!row||!same(row.encoded,v)){
     await check();const value=await decode(v,opts,new Map());
     row={key:stageKey,user_id:uid,encoded:v,decoded:value,updated_at:new Date().toISOString()};
     await db.account_receive_staging.put(row);
    }
    signatures.set(k,canonical(rawShape(row.decoded)));staged.set(k,stageKey);
   }
  }else decoded[k]=unchanged?rawRecords[k]:await decode(v,opts,new Map());
  if(++done%5===0)show({message:`Receiving saved records · ${done} / ${Object.keys(records).length}`});
 }
 const next=bundleFrom(decoded,local.state);await check();await flushAppSnapshots();
 const unchanged=()=>{if(mutationEpoch!==local.epoch||!same(window.__rrAccountState?.()||local.state,local.live||local.state)||!same(readLocal(BUSINESS_STORE_KEY)||{},local.business)||LOCAL_KEYS.some(k=>!same(readLocal(k),local.locals[k])))throw Error('Records changed during sync. Retrying shortly.');if(window.__rrAccountState?.()?.sheet||document.activeElement?.matches('input,textarea,select,[contenteditable=true]'))throw Error('Finish your open edit to receive the latest changes.');};
 unchanged();
 const previousLocals=new Map(),installedLocals=new Map(),now=new Date().toISOString();
 try{
  // Journal both the old working copy and incoming manifest before replacing anything.
  await db.sync_meta.put({key:'account-sync-v110455:pending',value:{uid,base,oldState:local.state,oldBusiness:local.business,oldLocals:local.locals},updated_at:now});
  unchanged();
  for(const [key,value] of [[BUSINESS_STORE_KEY,next.business],...Object.entries(next.locals)]){previousLocals.set(key,localStorage.getItem(key));const serialized=typeof value==='string'?value:JSON.stringify(value);localStorage.setItem(key,serialized);installedLocals.set(key,serialized);}
  await db.transaction('rw',[db.app_snapshots,db.sync_meta,db.account_receive_staging,...Object.keys(TABLE_KEYS).map(k=>db.table(k))],async()=>{
   if([...installedLocals].some(([k,v])=>localStorage.getItem(k)!==v))throw Error('Another tab changed records. Retry sync.');
   const row=await db.app_snapshots.get(APP_STATE_KEY);if(mutationEpoch!==local.epoch||!same(window.__rrAccountState?.()||local.state,local.live||local.state)||!same(row?.state,local.savedState))throw Error('Records changed during sync. Retrying shortly.');
   if(!await db.sync_meta.get('account-sync-v110455:first-join'))await db.sync_meta.put({key:'account-sync-v110455:first-join',value:{uid,state:local.state,business:local.business,locals:local.locals},updated_at:now});
   const checkpoint=await db.app_snapshots.get('account-sync-before-first-join');if(!checkpoint)await db.app_snapshots.put({key:'account-sync-before-first-join',state:local.state,updated_at:now});
   // Retain raw document rows for recovery; delete only identities removed relative to our common baseline.
   for(const [name,pk] of Object.entries(TABLE_KEYS)){
    const incoming=new Set();
    for(const [k,v] of Object.entries(records)){
     const parts=JSON.parse(k);if(parts[0]!=='table'||parts[1]!==name)continue;
     incoming.add(parts[2]);const stageKey=staged.get(k);if(!stageKey)continue;
     const row=await db.account_receive_staging.get(stageKey);
     if(!row||!same(row.encoded,v))throw Error('Received file checkpoint is missing. Retry sync.');
     await db.table(name).put(row.decoded);
     await db.account_receive_staging.delete(stageKey);
    }
    const removed=(local.tables[name]||[]).filter(r=>!incoming.has(String(r[pk])));
    for(const row of removed){const original=FILE_TABLES.has(name)?await db.table(name).get(row[pk]):row;await db.sync_meta.put({key:'account-sync-retained:'+name+':'+row[pk],value:original,updated_at:now});await db.table(name).delete(row[pk]);}
   }
   // The install and cleanup commit together. An aborted receive keeps every
   // checkpoint; success also releases old hashes/rows absent from this manifest.
   await db.account_receive_staging.where('user_id').equals(uid).delete();
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
 for(const [key,value] of Object.entries(records)){const parts=JSON.parse(key),sig=signatures.get(key)||(parts[0]==='table'?encodeCache.get(key)?.sig:canonical(rawShape(decoded[key])));if(sig)encodeCache.set(key,{sig,value,epoch:tableEpoch.get(parts[1])||0});}
}
async function remoteWorkspace(uid,cached){
 const client=cloudClient(),info=await checked(client.from('road_ready_account_workspaces').select('revision,device_id,updated_at').eq('user_id',uid).maybeSingle());
 if(!info)return null;
 if(cached?.uid===uid){
  let payload={...(cached.meta||{}),format:FORMAT,records:cached.records},revision=cached.revision;
  if(revision===info.revision)return {...info,payload};
  if(revision<info.revision){
   const history=await checked(client.from('road_ready_account_history').select('revision,payload').eq('user_id',uid).gt('revision',revision).lte('revision',info.revision).order('revision').limit(100));
   for(const row of history||[]){if(row.revision!==revision+1)break;const change=row.payload;if(change.format==='road_ready_account_delta_v1'){const records={...payload.records,...change.set};for(const k of change.remove||[])delete records[k];payload={...payload,...change.meta,records};}else payload=validatePayload(change);revision=row.revision;}
   if(revision===info.revision)return {...info,payload};
  }
 }
 return checked(client.from('road_ready_account_workspaces').select('*').eq('user_id',uid).single());
}
export function syncAccount({initial=false,choices=null}={}){
 if(active)return active;
 const run=async()=>{
  let canOpenLocal=false;
  try{
   const session=await cloudSession();if(!session)return {signedOut:true};const uid=session.user.id,db=getOwnerOpDb();if(!db)throw Error('Device storage is unavailable.');
   const priorOwners=(await db.sync_meta.toArray()).map(r=>r.key?.match(/^owner-op-record-sync-v1:([a-f0-9-]{36}):/i)?.[1]).filter(Boolean);
   const bound=localStorage.getItem(OWNER_KEY)||priorOwners[0];if((bound&&bound!==uid)||priorOwners.some(id=>id!==uid)){show({phase:'account_mismatch',message:'This device has another account’s offline data. Sign in with that account to open it.'});return {blocked:true};}
   if(tabBase===undefined)tabBase=(await db.sync_meta.get(BASE_KEY))?.value||null;
   installHooks(db);
   const pending=await db.sync_meta.get('account-sync-v110455:pending');
   if(pending?.value?.uid===uid){const p=pending.value;localStorage.setItem(BUSINESS_STORE_KEY,JSON.stringify(p.oldBusiness));for(const k of LOCAL_KEYS){const v=p.oldLocals[k];if(v===undefined)localStorage.removeItem(k);else localStorage.setItem(k,typeof v==='string'?v:JSON.stringify(v));}await db.sync_meta.delete('account-sync-v110455:pending');}
   const check=async()=>{if(localStorage.getItem('owner-op-record-sync-v1:paused')==='true')throw Error('Cloud work is paused on this device.');if((await cloudSession())?.user?.id!==uid)throw Error('Account changed. Synchronization stopped.');if(!navigator.onLine)throw Error('Offline · changes stay on this device until connected.');};
   if(localStorage.getItem('owner-op-record-sync-v1:paused')==='true'){show({phase:'paused',message:'Cloud work is paused on this device.'});return {paused:true};}
   if(!navigator.onLine){show({phase:'offline',message:'Offline · changes saved on this device.'});return {offline:true};}
   // Establish the owned offline copy before settings/workspace/snapshot reads
   // (or a session recheck) can fail and leave the startup gate closed.
   const local=await capture(),saved=tabBase;
   if(saved&&saved.uid!==uid)throw Error('Offline synchronization belongs to another account.');
   const meaningful=hasData(local);canOpenLocal=meaningful;
   await check();show({phase:'syncing',message:initial?'Opening your account data…':'Syncing changes…',conflicts:[]});
   const setting=await checked(cloudClient().from('road_ready_backup_settings').select('record_sync_enabled').eq('user_id',uid).maybeSingle());
   if(!setting?.record_sync_enabled){show({phase:'disabled',message:'Account synchronization is disabled.'});return {disabled:true};}
   const cached=tabBase;
   let remote=await remoteWorkspace(uid,cached);
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
   const opts={storage:cloudClient().storage.from('owner-op-private'),uid,known:piecesOf(remote?.payload?.records||{}),check,onProgress:message=>show({message})};
   if(!remote&&!meaningful){localStorage.setItem(OWNER_KEY,uid);show({phase:'current',message:'Ready for your first records.'});return {empty:true};}
   local.encoded=await encodedRecords(local,opts);
   let base=saved?.records;
   if(!base&&remote?.payload?.seed_device===device()){
    // The original phone compares its newer local work against its own immutable seed, not another device.
    const history=await checked(cloudClient().from('road_ready_account_history').select('payload').eq('user_id',uid).eq('revision',1).single());base=history.payload.records;
   }
   let merge=base?mergeRecords(base,local.encoded,remote?.payload?.records||{}):!meaningful&&remote?{records:remote.payload.records,conflicts:[]}:mergeRecords({},local.encoded,remote?.payload?.records||{});
   if(choices&&conflictReview&&same(conflictReview.local,local.encoded)&&same(conflictReview.remote,remote?.payload?.records)){
    merge.records={...merge.records};merge.conflicts=merge.conflicts.filter(c=>{if(!['local','remote'].includes(choices[c.key]))return true;resolveConflict(merge.records,c,choices[c.key]);return false;});
   }
   if(merge.conflicts.length){conflictReview={local:local.encoded,remote:remote?.payload?.records};await db.sync_meta.put({key:'account-sync-v110455:conflicts',value:{uid,revision:remote?.revision,conflicts:merge.conflicts},updated_at:new Date().toISOString()});show({phase:'conflict',message:'Changes on two devices need review. Both versions are kept.',conflicts:merge.conflicts});return {conflicts:merge.conflicts};}
   if(local.epoch!==mutationEpoch||!same(window.__rrAccountState?.()||local.state,local.live||local.state)||!same(readLocal(BUSINESS_STORE_KEY)||{},local.business))throw Error('Records changed during sync. Retrying shortly.');
   const payload={...(remote?.payload||{}),format:FORMAT,records:merge.records};let revision=remote?.revision||0;
   await check();
   if(!same(payload.records,remote?.payload?.records)){
    const patch=Object.fromEntries(Object.entries(payload.records).filter(([k,v])=>!same(v,remote?.payload?.records[k]))),removed=Object.keys(remote?.payload?.records||{}).filter(k=>!(k in payload.records));
    const receipt=await checked(revision?cloudClient().rpc('road_ready_account_patch_v1',{p_device:device(),p_expected:revision,p_patch:patch,p_deleted:removed}):cloudClient().rpc('road_ready_account_commit_v1',{p_device:device(),p_expected:revision,p_payload:payload}));if(receipt.conflict)throw Error('Another device saved changes. Retrying shortly.');revision=receipt.revision;
   }
   const changed=!equivalentRecords(local.encoded,merge.records)||repairChecklistState(local.state)!==local.state;
   const meta=Object.fromEntries(Object.entries(payload).filter(([k])=>k!=='records'));
   if(changed)await install(merge.records,local,{revision,meta},uid,check);
   else{if(saved?.revision!==revision)await db.sync_meta.put({key:BASE_KEY,value:{uid,revision,meta,records:merge.records},updated_at:new Date().toISOString()});localStorage.setItem(OWNER_KEY,uid);}
   tabBase={uid,revision,meta,records:merge.records};
   const resolved=await db.sync_meta.get('account-sync-v110455:conflicts');if(resolved)await db.sync_meta.put({...resolved,key:'account-sync-v110455:resolved:'+Date.now()});
   await db.sync_meta.delete('account-sync-v110455:conflicts');conflictReview=null;
   show({phase:'current',message:'Account data is up to date.',revision,completedAt:new Date().toISOString(),conflicts:[]});return {revision,changed};
  }catch(e){const message=e?.message||String(e);show({phase:localStorage.getItem('owner-op-record-sync-v1:paused')==='true'?'paused':navigator.onLine?'error':'offline',message});return {error:message,canOpenLocal};}
 };
 active=(navigator.locks?.request?navigator.locks.request('road-ready-account-sync-v110455',initial?{}:{ifAvailable:true},lock=>lock?run():{busy:true}):run()).finally(()=>{active=null;});return active;
}
