'use client';

import Dexie from 'dexie';
import { driverLogbookEntries } from '../../source/src/core/team/teamLogbook.js';
import { getOwnerOpDb } from '../../lib/local-db/dexie.js';
import { verifyDeviceSafetyArchive } from '../../lib/local-db/safetyArchive.js';

const ROAD_READY_PREFIXES = ['owner-op-', 'road-ready'];
// A device move keeps the receiving device's login and cloud-upload opt-in.
function portableStorageKey(key) {
  const lower=String(key||'').toLowerCase();
  return ROAD_READY_PREFIXES.some(prefix=>lower.startsWith(prefix)) &&
    !/(?:auth|session|token)/.test(lower) &&
    !lower.startsWith('owner-op-cloud-') && !lower.startsWith('owner-op-full-migration-') &&
    lower!=='owner-op-road-ready-last-device-safety-export-v1' &&
    lower!=='owner-op-road-ready-prepared-device-safety-v110429';
}

function list(value){ return Array.isArray(value) ? value.filter(Boolean) : []; }

function dayKeys(state = {}) {
  return [...new Set([
    ...Object.keys(state.eventsByDay || {}),
    ...Object.keys(state.signatureByDay || {}),
    ...Object.keys(state.inspectionByDay || {}),
    ...Object.keys(state.routeLegsByDay || {}),
    ...Object.keys(state.documentsByDay || {}),
    ...Object.keys(state.fuelReceiptsByDay || {}),
    ...Object.keys(state.certifyStatus || {}),
  ])].filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day)).sort();
}

function logbookReview(state = {}) {
  return dayKeys(state).map(day => {
    const events=list(state.eventsByDay?.[day]);
    const routes=list(state.routeLegsByDay?.[day]);
    const documents=list(state.documentsByDay?.[day]);
    return {
      day,
      events:events.map(row=>({
        status:String(row?.status||''),
        startMin:Number(row?.startMin||0),
        endMin:Number(row?.endMin||0),
        location:[row?.city,row?.state].filter(Boolean).join(', '),
        note:String(row?.note||row?.description||''),
        loadNo:String(row?.loadNo||row?.shippingDocs||''),
      })),
      signed:Boolean(state.signatureByDay?.[day]?.signed || state.signatureByDay?.[day]?.signatureDataUrl || state.signatureByDay?.[day]?.signatureRef),
      inspection:Boolean(state.inspectionByDay?.[day]?.complete || state.inspectionByDay?.[day]?.status === 'complete'),
      certifyStatus:String(state.certifyStatus?.[day]||''),
      routes:routes.map(row=>({
        loadNo:String(row?.loadNo||row?.shippingDocs||''),
        from:[row?.fromCity,row?.fromState].filter(Boolean).join(', '),
        to:[row?.toCity,row?.toState].filter(Boolean).join(', '),
        status:String(row?.status||''),
      })),
      documentCount:documents.length,
    };
  });
}

export function makePortableReviewV110429(archive = {}) {
  const state=archive?.payload?.state || {};
  const business=archive?.payload?.businessStore || {};
  const documents=list(archive?.payload?.dexie?.documents_local).map(row=>({
    type:String(row?.type||row?.document_type||'other'),
    loadNo:String(row?.load_no||row?.loadNo||row?.extracted?.loadNo||''),
    originalFileName:String(row?.original_file_name||''),
    createdAt:String(row?.created_at||''),
    stopSequence:Number(row?.stopSequence||row?.stop_sequence||0),
    clientDocumentId:String(row?.client_document_id||''),
  }));
  return {
    format:'road_ready_portable_review_v1',
    app:'Owner-Op Road Ready',
    createdAt:String(archive?.createdAt||new Date().toISOString()),
    appVersion:String(archive?.appVersion||''),
    summary:archive?.inventory || {},
    logbook:driverLogbookEntries(state).flatMap(([driverId,book])=>logbookReview(book).map(day=>({...day,driverId,driverName:String(state.teamDrivers?.find(driver=>driver.id===driverId)?.name||book.driverProfile?.name||'')}))),
    loads:list(business?.loads).map(row=>({
      loadNo:String(row?.loadNo||''),
      status:String(row?.status||''),
      origin:String(row?.origin||row?.pickup||''),
      destination:String(row?.destination||row?.delivery||''),
      gross:Number(row?.gross||0),
      pickupDate:String(row?.pickupDate||''),
      deliveryDate:String(row?.deliveryDate||''),
    })),
    documents,
    chatgptNote:'For review, start with portableReview. The payload contains the complete device backup, including original document binaries encoded as base64.',
  };
}

export async function decoratePortableArchiveV110429(archive = {}) {
  const payload={...archive.payload,localStorage:list(archive.payload?.localStorage).filter(row=>portableStorageKey(row?.key))};
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
  const payloadSha256=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  const portable={...archive,payload,payloadSha256};
  return {...portable,portableFormat:'road_ready_everything_v1',portableReview:makePortableReviewV110429(portable)};
}

function base64ToBytes(base64='') {
  const binary=atob(String(base64||''));
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i+=1)bytes[i]=binary.charCodeAt(i);
  return bytes;
}

async function deserializeValue(value, resolveZipFile) {
  if(Array.isArray(value)){
    const out=[]; for(const row of value)out.push(await deserializeValue(row, resolveZipFile)); return out;
  }
  if(value && typeof value==='object'){
    if(value.__roadReadyZipFile){
      if(!resolveZipFile)throw new Error('Choose the original ZIP file to restore this backup.');
      return resolveZipFile(value);
    }
    if(Object.hasOwn(value,'__roadReadyJsonString')){
      if(!resolveZipFile)throw new Error('Choose the original ZIP file to restore this backup.');
      return JSON.stringify(await deserializeValue(value.__roadReadyJsonString,resolveZipFile));
    }
    if(value.__roadReadyBinary==='Blob'){
      const bytes=base64ToBytes(value.base64);
      return new Blob([bytes],{type:value.mimeType||'application/octet-stream'});
    }
    if(value.__roadReadyBinary==='ArrayBuffer'){
      const bytes=base64ToBytes(value.base64);
      return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    }
    const out={}; for(const [key,row] of Object.entries(value))out[key]=await deserializeValue(row, resolveZipFile); return out;
  }
  return value;
}

function roadReadyLocalStorageKeys(){
  const keys=[];
  if(typeof window==='undefined'||!window.localStorage)return keys;
  for(let i=0;i<localStorage.length;i+=1){
    const key=localStorage.key(i); if(!key)continue;
    const lower=key.toLowerCase();
    if(portableStorageKey(lower))keys.push(key);
  }
  return keys;
}

export async function inspectPortableArchiveV110429(archive){
  const verification=await verifyDeviceSafetyArchive(archive);
  if(!verification.ok)throw new Error('Backup verification failed: '+verification.reason);
  const inventory=archive.inventory||{};
  return {
    verification,
    inventory,
    review:archive.portableReview||makePortableReviewV110429(archive),
  };
}

export async function restorePortableArchiveV110429(archive,{onProgress=()=>{},resolveZipFile,prepareRowForWrite}={}){
  const inspection=await inspectPortableArchiveV110429(archive);
  const db=getOwnerOpDb();
  if(!db)throw new Error('IndexedDB is not available on this device.');
  const payload=archive.payload||{}, archivedTables=payload.dexie||{};
  if(!payload.state || typeof payload.state!=='object' || Array.isArray(payload.state))throw new Error('Backup app state is missing.');
  const tableNames=new Set(db.tables.map(table=>table.name));
  if(Object.keys(archivedTables).some(name=>!tableNames.has(name)))throw new Error('Update Road Ready before importing this newer database backup.');
  // Transfer checkpoints belong to this device. Older archives may include them;
  // never import them or require them in a full backup of the user's records.
  const tables=db.tables.filter(table=>table.name!=='account_receive_staging');
  const rowsByTable={};
  // Decode and validate everything before replacing any record.
  for(const table of tables){
    if(!Array.isArray(archivedTables[table.name]))throw new Error('Backup is missing the '+table.name+' record group.');
    rowsByTable[table.name]=await deserializeValue(archivedTables[table.name],resolveZipFile);
  }
  const state=await deserializeValue(payload.state,resolveZipFile), businessStore=await deserializeValue(payload.businessStore||{},resolveZipFile);
  const currentKey='owner-op-road-ready-state-v1';
  rowsByTable.app_snapshots=rowsByTable.app_snapshots.filter(row=>row.key!==currentKey);
  rowsByTable.app_snapshots.push({key:currentKey,state:{...state,view:'home',sheet:null},updated_at:new Date().toISOString()});
  const beforeStorage=roadReadyLocalStorageKeys().map(key=>({key,value:localStorage.getItem(key)}));
  const nextStorage=list(await deserializeValue(payload.localStorage,resolveZipFile)).filter(row=>portableStorageKey(row?.key));
  let storageTouched=false;
  try {
    await db.transaction('rw',tables,async()=>{
      for(const table of tables){
        onProgress('Restoring '+table.name+'…');
        await table.clear();
        if(resolveZipFile){
          // Detach each document from the uploaded ZIP before Safari persists it;
          // storing slices directly can copy the entire ZIP once per document.
          // waitFor keeps the same atomic transaction alive during short Blob reads.
          for(const row of rowsByTable[table.name]){
            const ready=prepareRowForWrite?await Dexie.waitFor(prepareRowForWrite(row)):row;
            await table.put(ready);
          }
        }else if(rowsByTable[table.name].length)await table.bulkPut(rowsByTable[table.name]);
      }
      // Synchronous localStorage writes stay inside the database transaction so a
      // quota error aborts every table. Restore prior localStorage on any failure.
      storageTouched=true;
      for(const key of roadReadyLocalStorageKeys())localStorage.removeItem(key);
      for(const row of nextStorage)localStorage.setItem(String(row.key),String(row.value??''));
      localStorage.setItem('owner-op-road-ready-business-v1',JSON.stringify(businessStore));
    });
  } catch(error) {
    if(storageTouched){
      for(const key of roadReadyLocalStorageKeys())localStorage.removeItem(key);
      for(const row of beforeStorage)localStorage.setItem(row.key,row.value);
    }
    throw error;
  }
  onProgress('Import complete. Opening restored Road Ready data…');
  return {ok:true,completedTables:tables.length,restoredDexie:Object.fromEntries(Object.entries(rowsByTable).map(([name,rows])=>[name,rows.length])),skippedTables:[],state,businessStore,inspection};
}
