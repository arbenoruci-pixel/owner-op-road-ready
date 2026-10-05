'use client';
import {getOwnerOpDb} from '../../../../lib/local-db/dexie.js';
import {validateFiling,filingOf,idOf} from './evidenceWorkspaceCoreV110453.js';
import {sha256} from '../backup/chunkedZipV110431.js';
const announce=()=>window.dispatchEvent(new Event('road-ready-evidence-filed'));
export async function readDocuments(){const db=getOwnerOpDb();if(!db)throw Error('Device storage is unavailable.');return db.documents_local.toArray();}
export async function saveFiling(doc,input){
 const next=validateFiling(input),db=getOwnerOpDb();if(!db)throw Error('Device storage is unavailable.');
 const at=new Date().toISOString();let saved;
 await db.transaction('rw',db.documents_local,async()=>{const current=await db.documents_local.get(idOf(doc));if(!current)throw Error('This record is no longer available.');
  if(JSON.stringify(current.evidenceFilingV1)!==JSON.stringify(doc.evidenceFilingV1))throw Error('Details changed. Reopen the file to keep the latest version.');
  saved={...current,evidenceFilingV1:{...next,updatedAt:at},evidenceFilingHistoryV1:[...(current.evidenceFilingHistoryV1||[]),{at,before:filingOf(current),after:next,action:'filed_by_driver'}],updated_at:at};await db.documents_local.put(saved);
 });announce();return saved;
}
export async function addOriginal(file,input){
 const f=validateFiling(input);if(!file?.size)throw Error('Choose a non-empty file.');if(file.size>50*1024*1024)throw Error('Choose a file under 50 MB.');
 if(!/^image\//.test(file.type)&&file.type!=='application/pdf'&&!/\.pdf$/i.test(file.name))throw Error('Choose a photo or PDF.');
 const db=getOwnerOpDb();if(!db)throw Error('Device storage is unavailable.');const hash=await sha256(await file.arrayBuffer()),at=new Date().toISOString();let result;
 await db.transaction('rw',db.documents_local,db.document_blobs,async()=>{
  const existing=(await db.documents_local.toArray()).find(d=>d.sha256===hash);
  if(existing){result={doc:existing,existing:true};return;}
  const id='evidence-'+crypto.randomUUID(),client='client-'+id;
  const types={fuel:'fuel_receipt',repair:'maintenance',tolls:'toll_receipt',expense:'other_expense',settlement:'carrier_settlement'};
  const type=types[f.category]||f.category;
  const doc={local_id:id,client_document_id:client,driver_id:'local-owner-op',type,document_type:type,title:file.name,original_file_name:file.name,mime_type:file.type||'application/pdf',file_size_bytes:file.size,sha256:hash,load_no:f.loadNo,document_date:f.date,status:'saved',reviewStatus:'needs_review',sync_state:'local_only',local_blob_state:'local',created_at:at,updated_at:at,extracted:{type,loadNo:f.loadNo,date:f.date},evidenceFilingV1:{...f,updatedAt:at},evidenceFilingHistoryV1:[{at,action:'original_added',after:f}],captureOnly:true};
  await db.documents_local.add(doc);await db.document_blobs.add({local_blob_id:'blob-'+id,client_document_id:client,blob:file,created_at:at});result={doc,existing:false};
 });announce();return result;
}
