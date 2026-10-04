'use client';
import Dexie from 'dexie';
import {getOwnerOpDb} from '../../../../lib/local-db/dexie.js';
import {BUSINESS_STORE_KEY,BUSINESS_STORE_EVENT} from '../business/businessStore.js';
import {sha256} from '../backup/chunkedZipV110431.js';
import {canonical,copy,list,makeImportReview,mergeLibraryLoads,validateManifest,requireBrokerReview} from './libraryCoreV110434.js';
import {libraryIndexRecord,isQuotaError} from './libraryIndexV110434.js';

function readBusiness(storage){const raw=storage.getItem(BUSINESS_STORE_KEY);const value=raw?JSON.parse(raw):{};if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Saved load records could not be read.');return {raw,value};}
async function savedRows(db,onProgress=()=>{}){
 const rows=await db.documents_local.toArray(),blobs=await db.document_blobs.toArray();const hashes=new Map();
 for(let i=0;i<blobs.length;i++){const b=blobs[i];if(!b.blob?.size)continue;onProgress({phase:'Checking saved files',done:i,total:blobs.length});const hash=await Dexie.waitFor(b.blob.arrayBuffer().then(sha256));if(hashes.has(b.client_document_id)&&hashes.get(b.client_document_id)!==hash)throw Error('A document has conflicting saved originals.');hashes.set(b.client_document_id,hash);}
 return rows.map(r=>{const hash=hashes.get(r.client_document_id);if(hash&&r.sha256&&r.sha256!==hash)throw Error('A saved original does not match its checksum.');return {...r,...(hash?{sha256:hash}:{})};});
}
export async function previewLibrary(bundle,{db=getOwnerOpDb(),storage=window.localStorage,onProgress}={}){
 if(!db)throw Error('Device storage is unavailable.');
 const {value}=readBusiness(storage);const rows=await savedRows(db,onProgress);return makeImportReview(value,rows,bundle.manifest);
}
function documentRecord(d,p,old){
 const now=new Date().toISOString();const clientId=old?.client_document_id||d.id;
 const fields={loadNo:d.loadNo||'',date:d.date||'',notes:d.note||''};
 return {...old,local_id:old?.local_id||d.id,client_document_id:clientId,driver_id:old?.driver_id||'local-owner-op',load_no:d.loadNo||'',canonicalLoadNo:d.loadNo||'',document_type:d.type,type:d.type,
  original_file_name:old?.original_file_name||d.name,mime_type:d.mime,file_size_bytes:d.bytes,sha256:d.sha256,
  document_date:d.date||'',documentDate:d.date||'',created_at:old?.created_at||now,updated_at:now,sync_state:'local_only',local_blob_state:'local',
  linkToLogbook:false,evidenceOnlyV110413:true,reviewStatus:'needs_review',status:'saved',
  librarySource:{packageId:p.id,provenance:d.sources||[],previousAssignments:d.previousAssignments||[],note:d.note||''},
  extracted:{...old?.extracted,type:d.type,loadNo:d.loadNo||'',canonicalLoadNo:d.loadNo||'',date:d.date||'',evidenceFactsV1:{version:1,source:'imported_archive',sourceSha256:d.sha256,reviewedAt:null,fields,components:copy(d.components)}}};
}
function mirror(row){return {id:row.local_id,localDocumentId:row.local_id,clientDocumentId:row.client_document_id,type:row.type,loadNo:row.load_no,canonicalLoadNo:row.load_no,title:row.original_file_name,fileName:row.original_file_name,mimeType:row.mime_type,documentDate:row.document_date,sha256:row.sha256,fileSizeBytes:row.file_size_bytes,reviewStatus:row.reviewStatus,status:row.status,extracted:row.extracted,librarySource:row.librarySource,originalPreserved:true,evidenceOnlyV110413:true,linkToLogbook:false,updatedAt:Date.now()};}
export async function applyLibrary(bundle,review,{acceptDifferences=false,confirmedBrokerLoads=[],db=getOwnerOpDb(),storage=window.localStorage,onProgress=()=>{}}={}){
 const p=validateManifest(bundle.manifest);if(!db)throw Error('Device storage is unavailable.');
 const manifestHash=await sha256(new TextEncoder().encode(canonical(p)));
 const run=async()=>{
  const before=readBusiness(storage);let written=null;let result;let phase='database';
  try{await db.transaction('rw',db.documents_local,db.document_blobs,db.sync_meta,async()=>{
   const rows=await savedRows(db,onProgress),fresh=makeImportReview(before.value,rows,p);
   if(!review||fresh.manifestToken!==review.manifestToken||fresh.snapshotToken!==review.snapshotToken)throw Error('Saved records changed after the preview. Choose the file again to review the latest values.');
   if(fresh.differences.length&&!acceptDifferences)throw Error('Review the changed details before importing.');
   requireBrokerReview(fresh.brokerConflicts,confirmedBrokerLoads);
   const history=list(before.value.documentLibraryHistory).find(h=>h.id===p.id);
   if(history&&history.manifestHash!==manifestHash)throw Error('This package ID was already used for different contents.');
   const {next,audit}=history?{next:copy(before.value),audit:[]}:mergeLibraryLoads(before.value,p,{confirmedBrokerLoads});next.documents=list(next.documents);
   result={loads:p.loads.length,newLoads:fresh.newLoads,newDocuments:0,keptDocuments:0,restoredOriginals:0,already:!!history};const documentIds={};
   const beforeDocuments=[],businessIndexDocuments=[];
   for(let i=0;i<p.documents.length;i++){
    const d=p.documents[i],entry=bundle.entries.get(d.path);onProgress({phase:'Saving originals',done:i,total:p.documents.length});
    if(!entry||entry.blob.size!==d.bytes)throw Error('Original missing or damaged: '+d.name);
    const originalBytes=await Dexie.waitFor(entry.blob.arrayBuffer());if(await Dexie.waitFor(sha256(originalBytes))!==d.sha256)throw Error('Original missing or damaged: '+d.name);
    // Materialize one original at a time: WebKit must not persist a slice backed by the complete ZIP.
    const original=new Blob([originalBytes],{type:d.mime});
    const existing=fresh.matches[d.id].map(id=>rows.find(r=>r.local_id===id));const targets=existing.length?existing:[null];
    for(const old of targets){
     const row=history&&old?old:documentRecord(d,p,old);documentIds[d.id]??=row.client_document_id;
     const saved=await db.document_blobs.where('client_document_id').equals(row.client_document_id).first();
     if(!saved?.blob?.size){await db.document_blobs.put({local_blob_id:saved?.local_blob_id||'library-blob-'+row.client_document_id,client_document_id:row.client_document_id,blob:original,created_at:new Date().toISOString()});if(old)result.restoredOriginals++;}
     if(!history||!old){
      if(old)beforeDocuments.push(copy(old));
      const m=mirror(row),idx=next.documents.findIndex(x=>x.clientDocumentId===row.client_document_id||x.client_document_id===row.client_document_id||x.localDocumentId===row.local_id||x.id===row.local_id);
      const previous=idx>=0?next.documents[idx]:null,{next:index}=libraryIndexRecord(previous,m);
      if(previous?.sha256&&previous.sha256!==row.sha256)throw Error('A saved document index refers to a different original.');
      // Keep every full business-only field durably beside the document. Never
      // shrink the sole copy of a scan, its OCR, or its import provenance.
      if(previous)row.libraryBusinessMetadataV110437=copy(previous);
      await db.documents_local.put(row);
      if(previous)businessIndexDocuments.push(copy(previous));
      if(idx>=0)next.documents[idx]=index;else next.documents.push(index);
     }
     if(old)result.keptDocuments++;else result.newDocuments++;
    }
   }
   if(!history){
    next.documentLibraryCases=[...list(next.documentLibraryCases).filter(c=>!p.cases.some(incoming=>incoming.id===c.id)),...p.cases.map(c=>({...copy(c),packageId:p.id,documentIds:c.documentIds.map(id=>documentIds[id])}))];
    next.documentLibraryLinks=[...list(next.documentLibraryLinks).filter(l=>l.packageId!==p.id),...p.logbookLinks.map(l=>({...l,packageId:p.id}))];
    next.documentLibraryHistory=[...list(next.documentLibraryHistory),{id:p.id,manifestHash,at:new Date().toISOString(),loads:p.loads.length,files:p.documents.length,logDays:p.logbook.length}];
    await db.sync_meta.put({key:'document-library:'+p.id,value:{id:p.id,manifestHash,logbook:p.logbook,logbookLinks:p.logbookLinks,cases:next.documentLibraryCases.filter(c=>c.packageId===p.id),sourceNote:p.coverageNote||'',audit:{loads:audit,documents:beforeDocuments,businessIndexDocuments,differences:fresh.differences,brokerConfirmations:fresh.brokerConflicts.map(c=>({loadNo:c.loadNo,savedBroker:c.saved.broker,incomingBroker:c.incoming.broker,confirmedAt:new Date().toISOString()}))}},updated_at:new Date().toISOString()});
   }
   if(storage.getItem(BUSINESS_STORE_KEY)!==before.raw)throw Error('Another window changed the load records. Import stopped; try again.');
   phase='index';written=JSON.stringify({...next,updatedAt:Date.now()});storage.setItem(BUSINESS_STORE_KEY,written);phase='database';
  });}catch(error){if(written!==null&&storage.getItem(BUSINESS_STORE_KEY)===written){if(before.raw===null)storage.removeItem(BUSINESS_STORE_KEY);else storage.setItem(BUSINESS_STORE_KEY,before.raw);}if(isQuotaError(error))throw Error(phase==='index'?'The document list could not fit in device storage. Import was rolled back; your saved files are unchanged.':'There is not enough device storage for the originals. Import was rolled back; your saved files are unchanged. Free some device space, then try again.');throw error;}
  window.dispatchEvent(new CustomEvent(BUSINESS_STORE_EVENT));window.dispatchEvent(new Event('road-ready-repair-applied'));window.dispatchEvent(new Event('road-ready-library-imported'));return result;
 };
 return navigator.locks?.request?navigator.locks.request('road-ready-document-transfer',run):run();
}
export async function libraryHistory(){const db=getOwnerOpDb();if(!db)return [];return (await db.sync_meta.toArray()).filter(r=>r.key.startsWith('document-library:')).map(r=>r.value);}
