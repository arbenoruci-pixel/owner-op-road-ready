import test from 'node:test';
import assert from 'node:assert/strict';
import Dexie from 'dexie';
import {indexedDB,IDBKeyRange} from 'fake-indexeddb';
import {installBinaryStorage} from '../../lib/local-db/binaryStorageV110458.js';
import {saveLocalOriginal} from '../../lib/documents/saveLocalOriginal.js';
import {saveWalletOriginal} from '../../lib/documents/saveWalletOriginal.js';
async function database(t){
 const name='local-original-test-'+crypto.randomUUID();
 const db=new Dexie(name,{indexedDB,IDBKeyRange});
 db.version(1).stores({documents_local:'local_id,client_document_id',document_blobs:'local_blob_id,client_document_id',app_snapshots:'key'});
 installBinaryStorage(db,Dexie);await db.open();t.after(()=>db.delete());return db;
}
test('offline save commits exact bytes and metadata, survives reopen, deduplicates and never touches logs',async t=>{
 const db=await database(t),log={key:'signed-day',state:{events:[{start:0,end:1440,status:'OFF'}],signature:'original'}};await db.app_snapshots.put(log);
 const file=new File(['%PDF original\x00\xff'], 'BOL 123.pdf',{type:'application/pdf'});
 const input={file,type:'bol',metadata:{loadNo:'123'}},first=await saveLocalOriginal(db,input);
 assert.equal(first.cloud.status,'local_only');assert.equal(first.storage.localBlob,true);
 db.close();await db.open();const row=await db.document_blobs.get(first.localBlobId);
 assert.deepEqual(new Uint8Array(await row.blob.arrayBuffer()),new Uint8Array(await file.arrayBuffer()));
 const again=await saveLocalOriginal(db,input);assert.equal(again.localBlobId,first.localBlobId);assert.equal(await db.documents_local.count(),1);assert.equal(await db.document_blobs.count(),1);
 await saveLocalOriginal(db,{...input,metadata:{loadNo:'456'}});assert.equal(await db.documents_local.count(),2);
 assert.deepEqual(await db.app_snapshots.get(log.key),log);
});
test('metadata failure aborts the transaction; quota cannot purge a previously synced original',async t=>{
 const db=await database(t);await db.documents_local.put({local_id:'previous',client_document_id:'old',sync_state:'synced'});await db.document_blobs.put({local_blob_id:'previous',client_document_id:'old',blob:new Blob(['older original'])});
 db.documents_local.hook('creating',()=>{throw new DOMException('Storage full','QuotaExceededError');});
 await assert.rejects(saveLocalOriginal(db,{file:new File(['new'],'new.pdf')}),/Phone storage is full/);
 assert.equal(await db.documents_local.count(),1);assert.equal(await db.document_blobs.count(),1);assert.equal(await(await db.document_blobs.get('previous')).blob.text(),'older original');
});
test('a missing database or empty original is never acknowledged',async()=>{
 await assert.rejects(saveLocalOriginal(null,{file:new File(['x'],'x')}),/unavailable/);
 await assert.rejects(saveLocalOriginal({}, {file:new File([],'empty')}),/non-empty/);
});
const event=(target,detail)=>target.dispatchEvent(new CustomEvent('road-ready-wallet-saved',{detail}));
test('wallet waits for matching durable acknowledgement and readback before resolving',async()=>{
 const target=new EventTarget(),wallet={documents:{old:{attachmentDataUrl:'data:application/pdf;base64,b2xk'}}},before=structuredClone(wallet),doc={attachmentDataUrl:'data:application/pdf;base64,bmV3'};let applied,finished=false,saved;
 const work=saveWalletOriginal({wallet,id:'new',doc,target,fingerprint:JSON.stringify,readSaved:async()=>saved,onApply:next=>{applied=next;}}).then(()=>{finished=true;});
 event(target,{token:'unrelated'});await Promise.resolve();assert.equal(finished,false);
 saved=structuredClone(applied);event(target,{token:applied.lastImport.token});await work;assert.equal(finished,true);assert.deepEqual(wallet,before);
});
test('wallet quota, wrong readback and missing acknowledgement retain the draft and reject success',async()=>{
 for(const mode of ['quota','wrong','timeout']){
  const target=new EventTarget(),wallet={documents:{}},doc={attachmentDataUrl:'data:application/pdf;base64,bmV3'},before=structuredClone(doc);
  const work=saveWalletOriginal({wallet,id:'new',doc,target,timeout:10,fingerprint:JSON.stringify,readSaved:async()=>({documents:{}}),onApply:next=>{if(mode!=='timeout')queueMicrotask(()=>event(target,{token:next.lastImport.token,error:mode==='quota'}));}});
  await assert.rejects(work,/save|Saving|verified/);assert.deepEqual(doc,before);assert.deepEqual(wallet,{documents:{}});
 }
});
test('resuming a scan retains its identity and links; different bytes cannot overwrite the original',async t=>{
 const db=await database(t),file=new File(['original BOL'],'bol.pdf');
 const first=await saveLocalOriginal(db,{file,type:'bol',metadata:{loadNo:'123'}}),id=first.localDocument.local_id;
 await db.documents_local.update(id,{customLink:'keep'});
 const again=await saveLocalOriginal(db,{file,type:'bol',metadata:{resumeDocumentIdV110312:id,loadNo:'456'}});
 assert.equal(again.localDocument.local_id,id);assert.equal(again.localDocument.customLink,'keep');assert.equal(again.localDocument.load_no,'456');assert.equal(await db.documents_local.count(),1);
 await assert.rejects(saveLocalOriginal(db,{file:new File(['changed BOL'],'bol.pdf'),metadata:{resumeDocumentIdV110312:id}}),/original changed/);
 assert.equal(await(await db.document_blobs.get(first.localBlobId)).blob.text(),'original BOL');
});
