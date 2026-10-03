'use client';

import { getOwnerOpDb } from '../../../../lib/local-db/dexie.js';
import { verifyDeviceSafetyArchive } from '../../../../lib/local-db/safetyArchive.js';

const ROAD_READY_PREFIXES = ['owner-op-', 'road-ready'];

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
    logbook:logbookReview(state),
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

export function decoratePortableArchiveV110429(archive = {}) {
  return {
    ...archive,
    portableFormat:'road_ready_everything_v1',
    portableReview:makePortableReviewV110429(archive),
  };
}

function base64ToBytes(base64='') {
  const binary=atob(String(base64||''));
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i+=1)bytes[i]=binary.charCodeAt(i);
  return bytes;
}

async function deserializeValue(value) {
  if(Array.isArray(value)){
    const out=[]; for(const row of value)out.push(await deserializeValue(row)); return out;
  }
  if(value && typeof value==='object'){
    if(value.__roadReadyBinary==='Blob'){
      const bytes=base64ToBytes(value.base64);
      return new Blob([bytes],{type:value.mimeType||'application/octet-stream'});
    }
    if(value.__roadReadyBinary==='ArrayBuffer'){
      const bytes=base64ToBytes(value.base64);
      return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    }
    const out={}; for(const [key,row] of Object.entries(value))out[key]=await deserializeValue(row); return out;
  }
  return value;
}

function roadReadyLocalStorageKeys(){
  const keys=[];
  if(typeof window==='undefined'||!window.localStorage)return keys;
  for(let i=0;i<localStorage.length;i+=1){
    const key=localStorage.key(i); if(!key)continue;
    const lower=key.toLowerCase();
    if(ROAD_READY_PREFIXES.some(prefix=>lower.startsWith(prefix)))keys.push(key);
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

export async function restorePortableArchiveV110429(archive,{onProgress=()=>{}}={}){
  const inspection=await inspectPortableArchiveV110429(archive);
  const db=getOwnerOpDb();
  if(!db)throw new Error('IndexedDB is not available on this device.');
  const payload=archive.payload||{};
  const restoredDexie={};
  const skippedTables=[];
  const archivedTables=payload.dexie||{};
  let completed=0;
  for(const table of db.tables){
    const encoded=archivedTables[table.name];
    if(!Array.isArray(encoded)){ skippedTables.push(table.name); continue; }
    onProgress(`Restoring ${table.name}…`);
    const rows=await deserializeValue(encoded);
    await db.transaction('rw',table,async()=>{
      await table.clear();
      if(rows.length)await table.bulkPut(rows);
    });
    restoredDexie[table.name]=rows.length;
    completed+=1;
  }
  for(const key of roadReadyLocalStorageKeys())localStorage.removeItem(key);
  for(const row of list(payload.localStorage)){
    if(!row?.key)continue;
    localStorage.setItem(String(row.key),String(row.value??''));
  }
  onProgress('Finalizing restored app state…');
  return {
    ok:true,
    completedTables:completed,
    restoredDexie,
    skippedTables,
    state:await deserializeValue(payload.state||{}),
    businessStore:await deserializeValue(payload.businessStore||{}),
    inspection,
  };
}
