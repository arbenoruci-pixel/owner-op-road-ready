'use client';
import Dexie from 'dexie';
import {getOwnerOpDb} from '../../../../lib/local-db/dexie.js';
import {BUSINESS_STORE_KEY,BUSINESS_STORE_EVENT} from '../business/businessStore.js';
import {mergeTransfer,list,loadNo,identifyDocument,classifyDocument,typedReferences} from './transferCore.js';
import {hashValue,hashBlob,canonical} from './transferHash.js';
import {readRows} from './transferArchive.js';
const STATE_KEY='owner-op-road-ready-state-v1',OWNER_KEY='owner-op-account-data-owner-v1',JOURNAL='road-ready-smart-import-journal-v1';
const business=storage=>JSON.parse(storage.getItem(BUSINESS_STORE_KEY)||'{}');
const usable=b=>b instanceof Blob&&b.size>0;
async function canOpen(blob,mime){if(!usable(blob))return false;const h=new Uint8Array(await blob.slice(0,16).arrayBuffer()),s=new TextDecoder().decode(h);if(mime==='application/pdf')return s.startsWith('%PDF-');if(mime==='image/png')return h[0]===137&&s.slice(1,4)==='PNG';if(mime==='image/jpeg')return h[0]===255&&h[1]===216;return true;}
async function prepareDocuments(data,rows,summary,onProgress){
 const incoming=list(data.dexie?.documents_local),saved=list(rows.documents_local),writes=[],blobs=[],aliases=new Map(),conflicts=[],missing=[];
 const savedBlobs=list(rows.document_blobs),incomingBlobs=list(data.dexie?.document_blobs),hashes=new Map(),physical=new Map();
 for(const b of savedBlobs)if(usable(b.blob)){const sha=await hashBlob(b.blob);physical.set(b.client_document_id,sha);hashes.set(sha,b);}
 const loads=[...list(data.businessStore?.loads),...list(rows.__business?.loads)];
 for(const d of incoming){onProgress('Checking original '+(d.original_file_name||d.local_id)+'…');const src=incomingBlobs.find(b=>b.client_document_id===d.client_document_id);
 let sha=usable(src?.blob)?await hashBlob(src.blob):d.sha256||'';if(d.sha256&&usable(src?.blob)&&d.sha256!==sha)throw Error('Original checksum does not match '+(d.original_file_name||d.local_id));
 const direct=saved.find(r=>r.local_id===d.local_id||r.client_document_id&&r.client_document_id===d.client_document_id);
 const duplicate=saved.find(r=>physical.get(r.client_document_id)===sha&&sha)||saved.find(r=>r.sha256===sha&&sha);const old=direct||duplicate;
 if(old&&physical.has(old.client_document_id)&&sha&&physical.get(old.client_document_id)!==sha){conflicts.push({path:'document/'+d.local_id,saved:old,incoming:d,reason:'Original content changed'});continue;}
 const match=identifyDocument(d,loads.filter((l,i,a)=>a.findIndex(x=>loadNo(x)===loadNo(l)&&String(x.broker||'')===String(l.broker||''))===i));
 if(old){aliases.set(d.local_id,old.local_id);aliases.set(d.client_document_id,old.client_document_id);summary.duplicatesSkipped++;
 if(classifyDocument(d)!=='other'&&(old.document_type||old.type)&&classifyDocument(d)!==(old.document_type||old.type))conflicts.push({path:'document/type/'+old.local_id,saved:old,incoming:{...d,type:classifyDocument(d)},reason:'Document classification requires review'});
 if(loadNo(old)&&match.loadNo&&loadNo(old)!==match.loadNo)conflicts.push({path:'document/load/'+old.local_id,saved:old,incoming:d,reason:'Document belongs to a different load'});
 }else{
 const row={...d,...typedReferences(d),sha256:sha,brokerLoadNumber:match.loadNo,canonicalLoadNo:match.loadNo,loadNo:match.loadNo,load_no:match.loadNo,type:classifyDocument(d),document_type:classifyDocument(d),sync_state:'local_only',reviewStatus:match.loadNo&&classifyDocument(d)!=='other'?'verified':'needs_review',provenance:{...d.provenance,importedFrom:d.local_id,originalLoadReference:loadNo(d),matchBasis:match.basis}};
 row.extracted={...(d.extracted||{}),loadNo:match.loadNo,brokerLoadNumber:match.loadNo};
 if(!match.loadNo||row.type==='other')conflicts.push({path:'document/needs-review/'+row.local_id,saved:null,incoming:row,reason:'Needs Review: uncertain load or document type'});
 writes.push(row);saved.push(row);summary.documentsImported++;
 }
 const target=old||writes.at(-1);if(!target)continue;
 if(!physical.has(target.client_document_id)){
 if(!usable(src?.blob)){missing.push(d.local_id);continue;}
 if(!await canOpen(src.blob,target.mime_type||d.mime_type)){missing.push(d.local_id);continue;}
 // Same bytes may be shared by several legitimate metadata relationships.
 const identical=hashes.get(sha);const blob=identical?.blob||src.blob;
 const previous=savedBlobs.find(b=>b.client_document_id===target.client_document_id);
 blobs.push({...src,local_blob_id:previous?.local_blob_id||'transfer-blob-'+target.client_document_id,client_document_id:target.client_document_id,blob,sha256:sha});physical.set(target.client_document_id,sha);hashes.set(sha,{blob});
 }
 }
 summary.missingFiles=missing.length;return {writes,blobs,aliases,conflicts,missing};
}
function remap(value,aliases){if(value instanceof Blob||value instanceof ArrayBuffer||ArrayBuffer.isView(value))return value;if(typeof value==='string')return aliases.get(value)||value;if(Array.isArray(value))return value.map(x=>remap(x,aliases));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,remap(v,aliases)]));return value;}
export async function prepareTransferImport(bundle,state,{db=getOwnerOpDb(),storage=window.localStorage,onProgress=()=>{}}={}){
 if(!db)throw Error('Device storage is unavailable.');const sourceName=String(bundle.data.state.driverProfile?.name||bundle.data.state.teamDrivers?.find(d=>d.id===bundle.data.state.activeDriverId)?.name||'').trim().toLowerCase(),targetName=String(state.driverProfile?.name||state.teamDrivers?.find(d=>d.id===state.activeDriverId)?.name||'').trim().toLowerCase();if(sourceName&&targetName&&sourceName!==targetName&&(bundle.data.state.activeDriverId||'driver_primary')===(state.activeDriverId||'driver_primary'))throw Error('Driver names differ for the same driver identity. Review the source driver before importing.');const rows=await readRows(db),currentBusiness=business(storage);rows.__business=currentBusiness;
 let merge=mergeTransfer(state,bundle.data.state,currentBusiness,bundle.data.businessStore);const recordDuplicates=merge.summary.duplicatesSkipped;const docs=await prepareDocuments(bundle.data,rows,merge.summary,onProgress);const docSummary={documentsImported:merge.summary.documentsImported,missingFiles:merge.summary.missingFiles,duplicates:merge.summary.duplicatesSkipped-recordDuplicates};merge=mergeTransfer(state,remap(bundle.data.state,docs.aliases),currentBusiness,remap(bundle.data.businessStore,docs.aliases));merge.summary.documentsImported=docSummary.documentsImported;merge.summary.missingFiles=docSummary.missingFiles;merge.summary.duplicatesSkipped+=docSummary.duplicates;merge.conflicts.push(...docs.conflicts);merge.summary.conflicts=merge.conflicts.length;
 const token=hashValue({state,business:currentBusiness,rows:Object.fromEntries(Object.entries(rows).filter(([k])=>!['__business','app_snapshots','sync_meta'].includes(k)).map(([k,v])=>[k,k==='sync_meta'?[]:v.map(r=>{const o={...r};for(const key of Object.keys(o))if(o[key] instanceof Blob)o[key]={size:o[key].size};return o;})]))});
 return {bundle,merge,docs,token,owner:storage.getItem(OWNER_KEY)||'',stateToken:hashValue(state),businessToken:hashValue(currentBusiness),rows};
}
export async function recoverTransferProjection({db=getOwnerOpDb(),storage=window.localStorage}={}){
 const j=await db?.sync_meta.get(JOURNAL);if(!j?.value||j.value.status==='applied')return null;
 const v=j.value;if((storage.getItem(OWNER_KEY)||'')!==v.owner)throw Error('Reopen the account used for this import before recovery.');
 // Only project onto the same reviewed baseline; another tab's newer data wins.
 const raw=storage.getItem(BUSINESS_STORE_KEY)||'{}';if(hashValue(JSON.parse(raw))!==v.beforeBusiness&&hashValue(JSON.parse(raw))!==hashValue(v.businessStore))throw Error('Import committed locally. Business records changed; the recovery copy needs review.');
 storage.setItem(BUSINESS_STORE_KEY,JSON.stringify(v.businessStore));await db.sync_meta.put({...j,value:{...v,status:'applied'}});return v;
}
export async function commitTransferImport(review,{db=getOwnerOpDb(),storage=window.localStorage,getState,onProgress=()=>{},injectFailure}={}){
 if(!navigator.locks?.request)throw Error('Update Safari to coordinate safe imports on this device.');
 return navigator.locks.request('road-ready-smart-archive-import',async()=>{
 const state=getState();if(hashValue(state)!==review.stateToken||hashValue(business(storage))!==review.businessToken||(storage.getItem(OWNER_KEY)||'')!==review.owner)throw Error('Records changed after preview. Choose the file again.');
 const fresh=await prepareTransferImport(review.bundle,state,{db,storage,onProgress});if(fresh.token!==review.token)throw Error('Saved files changed after preview. Choose the file again.');
 const {merge,docs}=fresh;const now=new Date().toISOString(),archiveId=review.bundle.token;
 // Preserve the entire baseline once as a durable recovery snapshot. Blob
 // originals commit in the same Dexie transaction as every new evidence row.
 const tables=db.tables.filter(t=>!/^(mutation_queue|account_receive_staging)$/.test(t.name));
 await db.transaction('rw',tables,async()=>{
 if(hashValue(getState())!==review.stateToken||hashValue(business(storage))!==review.businessToken)throw Error('Records changed while checking originals. Review again.');
 const recoveryKey='transfer-before-'+archiveId;
 if(!await db.app_snapshots.get(recoveryKey))await db.app_snapshots.add({key:recoveryKey,state,updated_at:now});
 const sourceKey='transfer-source-'+archiveId;if(!await db.app_snapshots.get(sourceKey))await db.app_snapshots.add({key:sourceKey,state:review.bundle.data.state,updated_at:now,sourceBusiness:review.bundle.data.businessStore,sourceStorage:review.bundle.data.localStorage||[]});
 for(const row of docs.writes)await db.documents_local.add(row);
 for(const row of docs.blobs){const value=await Dexie.waitFor(detach(row));await db.document_blobs.put(value);const saved=await db.document_blobs.get(row.local_blob_id);if(!saved||await Dexie.waitFor(hashBlob(saved.blob))!==row.sha256)throw Error('Imported original failed read-back verification.');}
 const skipped=new Set(['app_snapshots','sync_meta','documents_local','document_blobs']);
 for(const [name,records]of Object.entries(review.bundle.data.dexie||{})){
 if(name==='app_snapshots'){for(const r of list(records)){if(r.key==='owner-op-road-ready-state-v1')continue;const key='import-history-'+archiveId+'-'+r.key;if(!await db.app_snapshots.get(key))await db.app_snapshots.add({...r,key});}continue;}
 if(skipped.has(name)||/queue|staging/.test(name))continue;const table=tables.find(t=>t.name===name);if(!table)throw Error('Update Road Ready before importing '+name);
 for(const original of list(records)){
 const row=remap(original,docs.aliases),key=table.schema.primKey.keyPath;if(typeof key!=='string'||row[key]==null)throw Error('Missing stable record identity in '+name);
 const old=await table.get(row[key]);if(old){if(await Dexie.waitFor(fingerprint(old))===await Dexie.waitFor(fingerprint(row)))merge.summary.duplicatesSkipped++;else merge.conflicts.push({path:name+'/'+row[key],saved:old,incoming:row});continue;}
 // Conflicting HOS days stay entirely in review, including local projections.
 if(/^(duty_events_local|log_days_local|inspections_local)$/.test(name)){
 const driver=row.driver_id||'driver_primary',book=driver===(state.activeDriverId||'driver_primary')?state:state.teamLogbooksByDriverId?.[driver];
 if(list(book?.eventsByDay?.[row.log_date]).length){merge.conflicts.push({path:name+'/'+row[key],saved:book.eventsByDay[row.log_date],incoming:row});continue;}
 }
 await table.add(await Dexie.waitFor(detach({...row,sync_state:'local_only'})));merge.summary.recordsImported++;
 }
 }
 if(injectFailure)await injectFailure();
 const conflicts=merge.conflicts.map(c=>({...c,id:c.id||hashValue(c)}));
 for(const c of conflicts)await db.sync_meta.put({key:'transfer-review-'+c.id,value:{...c,archiveId,requiresExplicitApproval:true},updated_at:now});
 merge.summary.conflicts=conflicts.length;
 await db.app_snapshots.put({key:STATE_KEY,state:merge.state,updated_at:now});
 await db.sync_meta.put({key:JOURNAL,value:{status:'committed',archiveId,owner:review.owner,beforeBusiness:review.businessToken,businessStore:merge.businessStore,summary:merge.summary},updated_at:now});
 });
 let pending=false;try{await recoverTransferProjection({db,storage});}catch{pending=true;}
 if(!pending){window.dispatchEvent(new CustomEvent(BUSINESS_STORE_EVENT,{detail:merge.businessStore}));window.dispatchEvent(new Event('road-ready-evidence-filed'));}
 return {...merge,projectionPending:pending,verification:docs.missing.length?'Incomplete: missing originals':'Passed: originals read back and SHA-256 verified'};
 });
}
async function detach(value){if(value instanceof Blob){const chunks=[];for(let n=0;n<value.size;n+=1048576)chunks.push(await value.slice(n,n+1048576).arrayBuffer());return new Blob(chunks,{type:value.type});}if(Array.isArray(value)){const a=[];for(const r of value)a.push(await detach(r));return a;}if(value&&typeof value==='object'&&!(value instanceof ArrayBuffer)&&!ArrayBuffer.isView(value)){const out={};for(const [k,v]of Object.entries(value))out[k]=await detach(v);return out;}return value;}

async function fingerprint(value){if(value instanceof Blob)return hashBlob(value);if(value instanceof ArrayBuffer||ArrayBuffer.isView(value))return hashBlob(new Blob([value]));if(Array.isArray(value)){const a=[];for(const v of value)a.push(await fingerprint(v));return hashValue(a);}if(value&&typeof value==='object'){const o={};for(const [k,v]of Object.entries(value))o[k]=await fingerprint(v);return hashValue(o);}return hashValue(value);}
