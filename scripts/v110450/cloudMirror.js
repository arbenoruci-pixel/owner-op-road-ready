'use client';
import {cloudClient,cloudSession} from './client.js';
import {getOwnerOpDb} from '../local-db/dexie.js';
import {BUSINESS_STORE_KEY} from '../../source/src/modules/business/businessStore.js';
import {buildLargeBackup,inspectLargeBackup} from '../../source/src/modules/backup/largeBackupV110431.js';
import {ChunkedZip,readStoredZip} from '../../source/src/modules/backup/chunkedZipV110431.js';
import {recordedDeviceInventory} from '../local-db/deviceInventory.js';
import {knownPieces,uploadEntries,downloadEntries,hashBytes,bounded} from './mirrorCoreV110450.js';

const PREFIX='owner-op-cloud-mirror-v1:',BUCKET='owner-op-private',EVENT='road-ready-cloud-mirror';
let active=null,current={phase:'idle',message:'Checking backup status…'};
export const mirrorStatus=()=>current;
function show(value){current={...current,...value};window.dispatchEvent(new CustomEvent(EVENT,{detail:current}));}
export const mirrorEvent=EVENT;
function deviceId(){let id=localStorage.getItem(PREFIX+'device');if(!id){id=crypto.randomUUID();localStorage.setItem(PREFIX+'device',id);}return id;}
export function mirrorPaused(){return localStorage.getItem(PREFIX+'paused')==='true';}
export function pauseMirror(paused){localStorage.setItem(PREFIX+'paused',String(paused));show({phase:paused?'paused':'idle',message:paused?'Cloud backup paused on this device.':'Cloud backup enabled.'});}
async function checked(query){const {data,error}=await bounded(query);if(error)throw error;return data;}
async function enabled(uid){const row=await checked(cloudClient().from('road_ready_backup_settings').select('enabled').eq('user_id',uid).maybeSingle());return row?.enabled===true;}
export async function latestMirror(){const session=await cloudSession();if(!session)return null;return checked(cloudClient().from('road_ready_backup_snapshots').select('*').eq('device_id',deviceId()).order('created_at',{ascending:false}).limit(1).maybeSingle());}
async function heartbeat(uid,status,details={}){await checked(cloudClient().from('road_ready_backup_devices').upsert({user_id:uid,device_id:deviceId(),status,details,app_version:'110.4.50',seen_at:new Date().toISOString()},{onConflict:'user_id,device_id'}));}
function rawLocalRows(){const rows=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(/^(owner-op-|road-ready)/i.test(key)&&!/(auth|session|token|password|secret)/i.test(key)&&!/^owner-op-(cloud-|full-migration-)/i.test(key))rows.push({key,value:localStorage.getItem(key)});}return rows;}
async function capture(){
 const db=getOwnerOpDb();if(!db)throw Error('Device storage is unavailable.');
 const before=localStorage.getItem(BUSINESS_STORE_KEY),rows=rawLocalRows(),tables={};
 await db.transaction('r',db.tables,async()=>{for(const table of db.tables)tables[table.name]=await table.toArray();});
 if(before!==localStorage.getItem(BUSINESS_STORE_KEY))throw Error('Records changed while preparing the copy. Backup will retry.');
 tables.sync_meta=(tables.sync_meta||[]).filter(r=>!/^cloud-mirror:/.test(r.key||'')&&!/(auth|session|token|password|secret)/i.test(r.key||''));
 const state=tables.app_snapshots?.find(r=>r.key==='owner-op-road-ready-state-v1')?.state;
 if(!state)throw Error('No saved app records were found on this device.');
 const business=before?JSON.parse(before):{};
 if(!business||typeof business!=='object'||Array.isArray(business))throw Error('Saved load records could not be read.');
 const fakeTable=name=>({name,toArray:async()=>tables[name],toCollection:()=>({offset:offset=>({limit:limit=>({toArray:async()=>tables[name].slice(offset,offset+limit)})})})});
 const frozenDb={tables:Object.keys(tables).map(fakeTable),table:fakeTable};
 const inventory={...recordedDeviceInventory(state,business),complete:true,dexieTables:Object.fromEntries(Object.entries(tables).map(([name,list])=>[name,{count:list.length}]))};
 return {state,businessStore:business,db:frozenDb,localRows:rows,inventory};
}
export function runMirror({force=false}={}){
 if(active)return active;
 const work=async()=>{
  let uid='';
  try{
   if(mirrorPaused()){show({phase:'paused',message:'Cloud backup paused on this device.'});return;}
   if(navigator.onLine===false){show({phase:'offline',message:'Offline · backup will retry when connected.'});return;}
   const session=await cloudSession();if(!session){show({phase:'signed_out',message:'Sign in to save a private cloud copy.'});return;}
   uid=session.user.id;if(!await enabled(uid)){show({phase:'disabled',message:'Temporary cloud backup is not enabled for this account.'});return;}
   const latest=await latestMirror();
   if(!force&&latest&&Date.now()-Date.parse(latest.created_at)<10*60*1000){show({phase:latest.missing_originals?'partial':'verified',message:latest.missing_originals?`${latest.missing_originals} originals need attention.`:'Latest complete device copy verified.',latest});return latest;}
   await heartbeat(uid,'preparing');show({phase:'running',message:'Preparing all records and original files…'});
   const frozen=await capture();
   const result=await buildLargeBackup({...frozen,appVersion:'110.4.50',onProgress:message=>show({message})});
   const entries=await readStoredZip(result.file),review=JSON.parse(await entries.get('Review/ChatGPT-Review.json').blob.text());
   const check=()=>{if(mirrorPaused())throw Error('Backup paused. Previous verified copies are retained.');if(navigator.onLine===false)throw Error('Connection lost. Backup will retry.');};
   const progress=message=>show({message});
   await heartbeat(uid,'uploading',{originals:result.originals,missingOriginals:result.missingOriginals,logDays:result.logDays,loads:result.loads});
   const files=await uploadEntries(entries,cloudClient().storage.from(BUCKET),uid,knownPieces(latest?.manifest),progress,check);
   check();const fresh=await cloudSession();if(fresh?.user?.id!==uid)throw Error('Account changed. Backup stopped.');
   const manifest={format:'road_ready_cloud_mirror_v1',filename:result.file.name,payloadSha256:result.archive.payloadSha256,files};
   const manifestSha=await hashBytes(new TextEncoder().encode(canonical(manifest)));
   const saved=await checked(cloudClient().rpc('road_ready_commit_backup_v1',{p_device:deviceId(),p_manifest:manifest,p_manifest_sha:manifestSha,p_review:review,p_missing:result.missingOriginals,p_version:'110.4.50'}));
   const receipt=await checked(cloudClient().from('road_ready_backup_snapshots').select('*').eq('id',saved.id).single());
   if(await hashBytes(new TextEncoder().encode(canonical(receipt.manifest)))!==manifestSha)throw Error('Cloud backup receipt did not match the file index.');
   await heartbeat(uid,result.missingOriginals?'partial':'verified',{snapshotId:receipt.id,originals:result.originals,missingOriginals:result.missingOriginals,logDays:result.logDays,loads:result.loads});
   show({phase:result.missingOriginals?'partial':'verified',latest:receipt,message:result.missingOriginals?`Copy saved · ${result.missingOriginals} originals are unavailable on this device.`:'Complete device copy saved and verified.'});return receipt;
  }catch(error){const message=error?.message||String(error),paused=mirrorPaused();show({phase:paused?'paused':'error',message});if(uid)await heartbeat(uid,'error',{message:message.slice(0,700),paused}).catch(()=>{});return {error:message};}
 };
 active=(navigator.locks?.request?navigator.locks.request('road-ready-cloud-mirror',{ifAvailable:true},lock=>lock?work():null):work()).finally(()=>{active=null;});return active;
}
function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
export async function downloadMirror(onProgress=()=>{}){
 const session=await cloudSession(),latest=await latestMirror();if(!session||!latest)throw Error('No cloud copy is available for this device yet.');
 const entries=await downloadEntries(latest.manifest,cloudClient().storage.from(BUCKET),session.user.id,onProgress),zip=new ChunkedZip();
 for(const entry of entries)zip.add(entry.name,entry.blob,{crc:entry.crc});
 const file=zip.file(latest.manifest.filename);await inspectLargeBackup(file,{onProgress});if((await cloudSession())?.user?.id!==session.user.id)throw Error('Account changed. Download stopped.');return file;
}
