import {getOwnerOpDb} from '../../lib/local-db/dexie.js';
import {makePortableReviewV110429,restorePortableArchiveV110429} from '../v110429/portableBackup.js';
import {CHUNK_BYTES,ChunkedZip,checkAbort,inspectBlob,readStoredZip,sha256} from './chunkedZip.js';
const KIND='owner_op_road_ready_zip_backup',enc=new TextEncoder();
const safe=value=>String(value||'document').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^\.+/,'').slice(0,90)||'document';
const ext=mime=>({'application/pdf':'.pdf','image/jpeg':'.jpg','image/png':'.png','image/heic':'.heic','image/webp':'.webp','text/plain':'.txt'})[mime]||'.bin';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const portableKey=key=>/^(owner-op-|road-ready)/i.test(key)&&!/(auth|session|token|password|secret)/i.test(key)&&!/^owner-op-(cloud-|full-migration-)/i.test(key)&&!/^owner-op-road-ready-(last-device-safety-export|prepared-device-safety)/i.test(key);
function storageRows(){const rows=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(portableKey(key))rows.push({key,value:localStorage.getItem(key)});}return rows;}
async function dataUrlBlob(value,signal){
 const comma=value.indexOf(','),prefix=value.slice(0,comma+1),mime=prefix.slice(5).split(';')[0],parts=[];
 // Decode small, base64-aligned slices, never the full image string at once.
 for(let i=comma+1;i<value.length;i+=131072){checkAbort(signal);const raw=atob(value.slice(i,i+131072));parts.push(new Blob([Uint8Array.from(raw,c=>c.charCodeAt(0))]));await new Promise(resolve=>setTimeout(resolve,0));}
 return {blob:new Blob(parts,{type:mime}),prefix};
}
export async function buildLargeBackup({state={},businessStore={},inventory={},appVersion='',onProgress=()=>{},signal,db=getOwnerOpDb(),localRows}={}){
 if(!db)throw new Error('The document database is unavailable.');
 const zip=new ChunkedZip(),dedup=new Map(),manifest=[],originalPaths=new Set(),documentIds=new Set();let readBytes=0;
 const documents=await db.table('documents_local').toArray(),byClient=new Map(documents.filter(d=>d.client_document_id).map(d=>[d.client_document_id,d]));
 async function saveBlob(blob,kind,meta={},prefix=''){
  const name=meta.name||'document',isOriginal=meta.original===true;
  onProgress(`Preparing ${name} · ${Math.round(readBytes/1048576)} MB read…`);
  const info=await inspectBlob(blob,{signal,onChunk:done=>onProgress(`Preparing ${name} · ${Math.round((readBytes+done)/1048576)} MB read…`)});readBytes+=blob.size;
  const fingerprint=`${info.size}:${info.hashes.join(':')}`;let path=dedup.get(fingerprint);
  if(!path){
   const folder=isOriginal?`Documents/Load-${safe(meta.load||'Unassigned')}`:kind==='Text'?'Records':'Saved-assets';
   path=`${folder}/${String(manifest.length+1).padStart(6,'0')}-${safe(name).replace(/\.[a-z0-9]{2,5}$/i,'')}${ext(blob.type)}`;
   zip.add(path,blob,info);dedup.set(fingerprint,path);manifest.push({path,size:blob.size,mimeType:blob.type,chunkHashes:info.hashes,category:isOriginal?'original':'saved-asset'});
  }
  if(isOriginal&&blob.size){originalPaths.add(path);if(meta.id)documentIds.add(meta.id);}
  return {__roadReadyZipFile:kind,path,size:blob.size,mimeType:blob.type,chunkSize:CHUNK_BYTES,chunkHashes:info.hashes,...(prefix?{prefix}:{})};
 }
 async function serialize(value,meta={}){
  checkAbort(signal);
  if(value instanceof Blob)return saveBlob(value,'Blob',meta);
  if(value instanceof ArrayBuffer||ArrayBuffer.isView(value))return saveBlob(new Blob([value],{type:'application/octet-stream'}),'ArrayBuffer',meta);
  if(typeof value==='string'){
   if(/^data:[^,]*;base64,/i.test(value)){const {blob,prefix}=await dataUrlBlob(value,signal);return saveBlob(blob,'DataURL',meta,prefix);}
   if(value.length>65536)return saveBlob(new Blob([value],{type:'text/plain'}),'Text',meta);
   return value;
  }
  if(Array.isArray(value)){const out=[];for(const item of value)out.push(await serialize(item,meta));return out;}
  if(value&&typeof value==='object'){
   const doc=byClient.get(value.client_document_id)||{};
   const next={...meta,id:value.client_document_id||meta.id,name:doc.original_file_name||value.original_file_name||value.fileName||meta.name,load:doc.load_no||value.loadNo||value.load_no||meta.load};
   const out={};for(const [key,item] of Object.entries(value))out[key]=await serialize(item,{...next,original:meta.original||/^(attachmentDataUrl|originalDataUrl|fileDataUrl|documentDataUrl)$/.test(key)});return out;
  }
  return value;
 }
 const payload={dexie:{},state:null,businessStore:null,localStorage:[]};
 // Read only a few rows at a time; original Blob handles remain file-backed.
 const tables=[...db.tables].sort((a,b)=>(a.name==='document_blobs'?-1:0)-(b.name==='document_blobs'?-1:0));
 for(const table of tables){
  payload.dexie[table.name]=[];onProgress(`Reading saved ${table.name==='document_blobs'?'documents':'records'}…`);
  for(let offset=0;;offset+=8){checkAbort(signal);const rows=await table.toCollection().offset(offset).limit(8).toArray();if(!rows.length)break;
   for(const row of rows)payload.dexie[table.name].push(await serialize(row,{original:table.name==='document_blobs'}));
  }
 }
 payload.state=await serialize(state);payload.businessStore=await serialize(businessStore);
 for(const row of (localRows||storageRows()).filter(row=>portableKey(row.key))){
  let value=row.value;
  if(value?.length>65536){let parsed;try{parsed=JSON.parse(value);}catch{}
   value=parsed&&typeof parsed==='object'?{__roadReadyJsonString:await serialize(parsed)}:await serialize(value,{name:row.key});
  }
  payload.localStorage.push({key:row.key,value});
 }
 if(!payload.dexie.app_snapshots?.length)payload.dexie.app_snapshots=[{key:'owner-op-road-ready-state-v1',state:payload.state,updated_at:new Date().toISOString()}];
 checkAbort(signal);onProgress('Finishing your backup — documents are ready…');
 const createdAt=new Date().toISOString(),payloadSha256=await sha256(enc.encode(JSON.stringify(payload)));
 const archive={kind:KIND,schemaVersion:1,app:'Owner-Op Road Ready',appVersion,createdAt,inventory,payloadSha256,payload};
 const review=makePortableReviewV110429({...archive,payload:{...payload,state,businessStore}});
 review.chatgptNote='Review the saved logbook and load records here. Original documents are separate files in the ZIP. Import the original ZIP directly in Road Ready.';
 const missing=documents.filter(d=>!documentIds.has(d.client_document_id)).map(d=>({id:d.client_document_id,filename:d.original_file_name||'',reason:'Original is unavailable on this device.'}));
 await zip.text('Road-Ready-Backup.roadready.json',JSON.stringify(archive),{signal});
 await zip.text('Review/ChatGPT-Review.json',JSON.stringify(review,null,2),{signal});
 await zip.text('Logbook/Logbook.json',JSON.stringify(review.logbook,null,2),{signal});
 const clock=m=>`${String(Math.floor((m||0)/60)).padStart(2,'0')}:${String((m||0)%60).padStart(2,'0')}`;
 const days=review.logbook.map(day=>`<section><h2>${escape(day.day)} · ${escape(day.driverName||day.driverId)}</h2><p>${day.signed?'Saved signature on record':'No saved signature'} · ${escape(day.certifyStatus)}</p><table><tr><th>Status</th><th>Start</th><th>End</th><th>Location</th><th>Load</th><th>Notes</th></tr>${day.events.map(e=>`<tr>${[e.status,clock(e.startMin),clock(e.endMin),e.location,e.loadNo,e.note].map(v=>`<td>${escape(v)}</td>`).join('')}</tr>`).join('')}</table></section>`).join('');
 await zip.text('Logbook/Logbook.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Saved logbook</title><style>body{font:16px system-ui;margin:20px;color:#172439}section{overflow:auto;margin:28px 0}td,th{border:1px solid #ccd5df;padding:8px;text-align:left}table{border-collapse:collapse;width:100%}@media print{section{break-before:page}}</style><h1>Road Ready — saved logbook</h1><p>${escape(createdAt)}. Saved records; this copy does not recalculate or certify logs.</p>${days}</html>`,{signal});
 await zip.text('Documents/Manifest.json',JSON.stringify(manifest,null,2),{signal});
 await zip.text('Documents/Unavailable-originals.json',JSON.stringify(missing,null,2),{signal});
 await zip.text('README.txt',`Road Ready — Everything\n\n${originalPaths.size} original files; ${missing.length} document originals unavailable on this device.\nDocuments/: original PDFs and photos.\nLogbook/: readable logbook and all-driver records.\nReview/: smaller ChatGPT review file.\nSaved-assets/: saved scanner pages, images and signatures.\n\nRESTORE OR MOVE DEVICE\nIn Road Ready, choose Import Everything and select this ORIGINAL ZIP file. Do not select the JSON index by itself; its document files live inside the ZIP.\n`,{signal});
 checkAbort(signal);const file=zip.file(`road-ready-everything-${createdAt.slice(0,19).replace(/[:T]/g,'-')}.zip`);
 return {file,archive,originals:originalPaths.size,missingOriginals:missing.length,logDays:review.logbook.length,loads:review.loads.length};
}
export async function inspectLargeBackup(file,{onProgress=()=>{},signal}={}){
 const files=await readStoredZip(file),index=files.get('Road-Ready-Backup.roadready.json');
 if(!index||index.size>64*1024*1024)throw new Error('This file is not a supported complete Road Ready ZIP.');
 const archive=JSON.parse(await index.blob.text());
 if(archive.kind!==KIND||archive.schemaVersion!==1)throw new Error('Choose the ZIP exported by the latest Road Ready app.');
 if(await sha256(enc.encode(JSON.stringify(archive.payload)))!==archive.payloadSha256)throw new Error('Backup verification failed: checksum mismatch.');
 const refs=[];
 function collect(value){if(!value||typeof value!=='object')return;if(value.__roadReadyZipFile){refs.push(value);return;}for(const child of Object.values(value))collect(child);}
 collect(archive.payload);const checked=new Map();
 for(let i=0;i<refs.length;i++){
  const ref=refs[i],entry=files.get(ref.path);
  if(!['Blob','ArrayBuffer','DataURL','Text'].includes(ref.__roadReadyZipFile)||!entry||entry.size!==ref.size||ref.chunkSize!==CHUNK_BYTES||!Array.isArray(ref.chunkHashes)||ref.chunkHashes.length!==Math.ceil(ref.size/CHUNK_BYTES))throw new Error('A required document is missing or incomplete in this ZIP.');
  if(ref.__roadReadyZipFile==='DataURL'&&!/^data:[^,]*;base64,$/i.test(ref.prefix||''))throw new Error('Invalid saved image reference.');
  const expected=JSON.stringify(ref.chunkHashes);
  if(checked.has(ref.path)){if(checked.get(ref.path)!==expected)throw new Error('Conflicting document checksums.');continue;}
  const info=await inspectBlob(entry.blob,{signal,onChunk:done=>onProgress(`Checking file ${i+1} of ${refs.length} · ${Math.round(done/1048576)} MB…`)});
  if(info.crc!==entry.crc||JSON.stringify(info.hashes)!==expected)throw new Error('Backup verification failed: document checksum mismatch.');checked.set(ref.path,expected);
 }
 async function resolveZipFile(ref){
  const blob=files.get(ref.path).blob.slice(0,ref.size,ref.mimeType||'application/octet-stream');
  if(ref.__roadReadyZipFile==='Blob')return blob;
  if(ref.__roadReadyZipFile==='Text')return blob.text();
  if(ref.__roadReadyZipFile==='ArrayBuffer')return blob.arrayBuffer();
  const parts=[];for(let offset=0;offset<blob.size;offset+=786432){const bytes=new Uint8Array(await blob.slice(offset,offset+786432).arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=32768)raw+=String.fromCharCode(...bytes.subarray(i,i+32768));parts.push(btoa(raw));}
  return ref.prefix+parts.join('');
 }
 return {archive,verification:{ok:true,sha256:archive.payloadSha256,bytes:file.size},resolveZipFile};
}
export async function restoreLargeBackup(checked,{onProgress=()=>{}}={}){
 // Reuse the proven all-table transaction and rollback, with Blob slices instead
 // of rebuilding a base64 JSON document in memory.
 return restorePortableArchiveV110429({...checked.archive,kind:'owner_op_road_ready_device_safety_archive',schemaVersion:1},{onProgress,resolveZipFile:checked.resolveZipFile});
}
