import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {chromium} from 'playwright';
const server=http.createServer((req,res)=>{if(req.url==='/'){res.end('<!doctype html><title>Binary storage regression</title>');return;}const path=req.url==='/dexie.mjs'?'node_modules/dexie/dist/dexie.mjs':'scripts/v110458/binaryStorage.js';res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
 const result=await page.evaluate(async()=>{
  const {default:Dexie}=await import('/dexie.mjs'),{installBinaryStorage,containsBlob}=await import('/binary.js');
  const db=new Dexie('binary-regression');db.version(1).stores({documents_local:'&id',document_blobs:'&id',capture_asset_blobs:'&id, current',account_receive_staging:'&id'});installBinaryStorage(db,Dexie);await db.open();
  const original=new Blob([Uint8Array.from({length:14*1024*1024},(_,i)=>i%251)],{type:'application/pdf'}),hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');
  // An existing native Blob row remains readable after deploying the adapter.
  await new Promise((resolve,reject)=>{const tx=db.backendDB().transaction('document_blobs','readwrite');tx.objectStore('document_blobs').put({id:'legacy',blob:original});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
  const nativePut=IDBObjectStore.prototype.put;let rejected=0;
  for(const method of ['put','add']){const native=IDBObjectStore.prototype[method];IDBObjectStore.prototype[method]=function(value,...args){if(containsBlob(value)){rejected++;throw new DOMException('Error preparing Blob/File data to be stored in object store','UnknownError');}return native.call(this,value,...args);};}
  let incident='';try{await new Promise((resolve,reject)=>{const tx=db.backendDB().transaction('document_blobs','readwrite');try{tx.objectStore('document_blobs').put({id:'broken',blob:original});}catch(e){reject(e);return;}tx.oncomplete=resolve;});}catch(e){incident=e.name+': '+e.message;}
  const before=rejected;
  await db.account_receive_staging.put({id:'checkpoint',decoded:{blob:original,nested:[new File(['photo bytes'],'pod.jpg',{type:'image/jpeg',lastModified:1234})]}});
  try{await db.transaction('rw',db.document_blobs,db.account_receive_staging,async()=>{const row=await db.account_receive_staging.get('checkpoint');await db.document_blobs.put({id:'abort',...row.decoded});await db.account_receive_staging.delete('checkpoint');throw Error('Synthetic transaction abort');});}catch{}
  if(await db.document_blobs.get('abort')||!await db.account_receive_staging.get('checkpoint'))throw Error('Atomic rollback lost its checkpoint');
  await db.transaction('rw',db.document_blobs,db.capture_asset_blobs,db.account_receive_staging,async()=>{const row=await db.account_receive_staging.get('checkpoint');await db.document_blobs.put({id:'original',...row.decoded});await db.capture_asset_blobs.bulkPut([{id:'p1',current:1,blob:row.decoded.nested[0]},{id:'p2',current:1,blob:row.decoded.blob}]);await db.account_receive_staging.delete('checkpoint');});
  await db.capture_asset_blobs.where('current').equals(1).modify({current:0});await db.document_blobs.update('original',{label:'POD'});db.close();await db.open();
  const saved=await db.document_blobs.get('original'),legacy=await db.document_blobs.get('legacy'),photo=await db.capture_asset_blobs.get('p1'),raw=await db.document_blobs.toCollection().raw().toArray();
  const url=URL.createObjectURL(saved.blob),opened=await(await fetch(url)).blob();URL.revokeObjectURL(url);
  return {incident,additionalBlobFailures:rejected-before,hash:await hash(original),savedHash:await hash(saved.blob),openedHash:await hash(opened),legacyHash:await hash(legacy.blob),mime:saved.blob.type,label:saved.label,file:{name:photo.blob.name,type:photo.blob.type,lastModified:photo.blob.lastModified},rawNewContainsBlob:containsBlob(raw.find(r=>r.id==='original')),checkpointCount:await db.account_receive_staging.count()};
 });
 assert.match(result.incident,/UnknownError: Error preparing Blob\/File/);assert.equal(result.additionalBlobFailures,0);assert.equal(result.savedHash,result.hash);assert.equal(result.openedHash,result.hash);assert.equal(result.legacyHash,result.hash);assert.equal(result.mime,'application/pdf');assert.equal(result.rawNewContainsBlob,false);assert.equal(result.checkpointCount,0);assert.equal(result.label,'POD');assert.deepEqual(result.file,{name:'pod.jpg',type:'image/jpeg',lastModified:1234});assert.deepEqual(errors,[]);console.log('PASS injected Safari Blob failure: 14 MB original, checkpoint retry, atomic rollback, bulk capture, metadata updates, reload, PDF opening and legacy rows preserve exact hashes');
}finally{await browser.close();await new Promise(r=>server.close(r));}
