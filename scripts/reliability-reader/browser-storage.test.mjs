import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
process.env.PLAYWRIGHT_BROWSERS_PATH||='/tmp/road-ready-test-browsers';
const browserName=process.env.READER_TEST_BROWSER||process.argv[2]||'chromium';
if(!['chromium','webkit'].includes(browserName))throw Error('Choose chromium or webkit for the isolated test.');
if(browserName==='webkit')process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS||='1'; // Test-only libraries are extracted under /tmp.
const browserType=createRequire(import.meta.url)('playwright')[browserName];
const root=path.resolve(new URL('../..',import.meta.url).pathname);
const sources=new Map([
 ['/dexie.mjs',()=>fs.readFileSync(path.join(root,'node_modules/dexie/dist/dexie.mjs'),'utf8')],
 ['/binary.js',()=>fs.readFileSync(path.join(root,'scripts/v110458/binaryStorage.js'),'utf8')],
 ['/chunked.js',()=>fs.readFileSync(path.join(root,'scripts/v110431/chunkedZip.js'),'utf8')],
 ['/workspace-core.js',()=>fs.readFileSync(path.join(root,'scripts/v110453/core.js'),'utf8')],
 ['/packet.js',()=>fs.readFileSync(path.join(root,'scripts/v110453/packet.js'),'utf8').replace("'../backup/chunkedZipV110431.js'","'/chunked.js'").replace("'./transferStorageV110412.js'","'/unused-transfer.js'").replace("'./evidenceWorkspaceCoreV110453.js'","'/workspace-core.js'")],
 ['/unused-transfer.js',()=>"export const readTransferOriginal=()=>{throw Error('A test reader is required')};"],
 ['/accountFiles.js',()=>fs.readFileSync(path.join(root,'scripts/v110455/accountFiles.js'),'utf8').replace("'./mirrorCoreV110450.js'","'/mirrorCore.js'")],
 ['/mirrorCore.js',()=>fs.readFileSync(path.join(root,'scripts/v110450/mirrorCore.js'),'utf8')],
]);
for(const file of ['originalStore','documentSave','cloudOriginal','filingContext','transferContent'])sources.set('/'+file+'.js',()=>fs.readFileSync(path.join(root,'scripts/reliability-reader/'+file+'.js'),'utf8'));
const server=http.createServer((req,res)=>{
 if(req.url==='/'){res.end('<!doctype html><title>Isolated document reliability tests</title>');return;}
 const source=sources.get(req.url);if(!source){res.statusCode=404;res.end();return;}res.setHeader('Content-Type','text/javascript');res.end(source());
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await browserType.launch({headless:true});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:'+server.address().port);
 const result=await page.evaluate(async()=>{
  const {default:Dexie}=await import('/dexie.mjs'),{installBinaryStorage}=await import('/binary.js');
  const {saveDocument}=await import('/documentSave.js'),originals=await import('/originalStore.js'),{uploadDocumentOriginal}=await import('/cloudOriginal.js');
  const {preparePacket}=await import('/packet.js'),{readStoredZip}=await import('/chunked.js'),{encode,decode}=await import('/accountFiles.js');
  const {compactTransferOriginals,expandTransferOriginals}=await import('/transferContent.js');
  const create=async name=>{const db=new Dexie(name);db.version(1).stores({documents_local:'&local_id,client_document_id,type,load_no',document_blobs:'&local_blob_id,client_document_id'});installBinaryStorage(db,Dexie);await db.open();return db;};
  const db=await create('synthetic-document-reliability'),deps={db,waitFor:promise=>Dexie.waitFor(promise)};
  const content='%PDF-1.4\nSYNTHETIC MULTIPAGE ORIGINAL\nPAGE 1: RATE + LOAD TEST-90210\nPAGE 2: TERMS\nUNSIGNED\n%%EOF';
  const file=new File([content],'rate.pdf',{type:'application/pdf'}),hash=await originals.sha256Original(file);
  const fields={type:'rate_confirmation',loadNo:'TEST-90210',pickupDate:'2026-10-16',deliveryDate:'2026-10-18',pickupAppointment:'08:00 - 16:00',readerAnalysisV1:{version:1,pages:[{id:'p1'},{id:'p2'}],pending:['pickupAddress']}};
  const first=await saveDocument({file,type:'rate_confirmation',metadata:{loadNo:'TEST-90210'},extracted:fields},deps);
  const duplicate=await saveDocument({file:new File([file],'renamed-rate.pdf',{type:file.type}),type:'rate_confirmation',metadata:{loadNo:'TEST-90210'},extracted:fields},{...deps,now:()=>new Date(Date.now()+10*86400000).toISOString()});
  const bol=await saveDocument({file,type:'bol',metadata:{loadNo:'TEST-90210'},extracted:{type:'bol',loadNo:'TEST-90210'}},deps);
  const differentLoad=await saveDocument({file,type:'bol',metadata:{loadNo:'OTHER-111'},extracted:{type:'bol',loadNo:'OTHER-111'}},deps);
  const signedFile=new File([content.replace('UNSIGNED','SIGNED  ')],'rate.pdf',{type:'application/pdf'});
  const pod=await saveDocument({file:signedFile,type:'pod',metadata:{loadNo:'TEST-90210'},extracted:{type:'pod',loadNo:'TEST-90210'}},deps);
  const before=JSON.stringify(await db.documents_local.get(first.localDocument.local_id));
  const nativePut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,...args){if(this.name==='documents_local'&&value.extracted?.testFailure)throw new DOMException('Synthetic quota error','QuotaExceededError');return nativePut.call(this,value,...args);};
  let quota='';try{await saveDocument({file,type:'rate_confirmation',metadata:{loadNo:'TEST-90210'},extracted:{testFailure:true}},deps);}catch(error){quota=error.name;}finally{IDBObjectStore.prototype.put=nativePut;}
  const unchanged=before===JSON.stringify(await db.documents_local.get(first.localDocument.local_id));
  db.close();await db.open();
  const reopened=await Promise.all([first,bol,differentLoad,pod].map(async saved=>{const row=await originals.readOriginalRow(db,saved.localDocument.client_document_id);return {id:saved.localDocument.local_id,hash:await originals.sha256Original(row.blob)};}));
  const records=await db.documents_local.toArray(),blobs=await db.document_blobs.toArray();originals.validateOriginalReferences(blobs);
  const packetRows=records.map(row=>({id:row.local_id,kind:'document',name:row.original_file_name,category:row.type,date:row.document_date||'',loadNo:row.load_no,source:row}));
  const packet=await preparePacket(packetRows,{scenario:'all'},{readOriginal:async row=>(await originals.readOriginalRow(db,row.source.client_document_id))?.blob});
  const zip=await readStoredZip(packet.file),manifest=JSON.parse(await zip.get('manifest.json').blob.text());
  const cloudBytes=new Map(),storage={upload:async(key,bytes)=>{if(!cloudBytes.has(key))cloudBytes.set(key,new Blob([bytes]));return {error:null};},download:async key=>({data:cloudBytes.get(key),error:null})};
  const opts={storage,uid:'00000000-0000-0000-0000-000000000001',known:new Set()};
  const encoded=await encode({documents_local:records,document_blobs:blobs},opts),decoded=await decode(encoded,opts);
  originals.validateOriginalReferences(decoded.document_blobs);
  const second=await create('synthetic-second-device');await second.transaction('rw',second.documents_local,second.document_blobs,async()=>{await second.documents_local.bulkPut(decoded.documents_local);await second.document_blobs.bulkPut(decoded.document_blobs);});
  const secondHashes=await Promise.all(records.map(async row=>originals.sha256Original((await originals.readOriginalRow(second,row.client_document_id)).blob)));
  const ownerBlob=decoded.document_blobs.find(row=>row.blob?.size&&row.sha256===hash);await second.document_blobs.delete(ownerBlob.local_blob_id);
  const recovered=await saveDocument({file,type:'bol',metadata:{loadNo:'OTHER-111'},extracted:{type:'bol',loadNo:'OTHER-111'}},{db:second,waitFor:promise=>Dexie.waitFor(promise)});
  originals.validateOriginalReferences(await second.document_blobs.toArray());
  const recoveredHashes=await Promise.all(records.map(async row=>originals.sha256Original((await originals.readOriginalRow(second,row.client_document_id)).blob)));
  const base64=bytes=>btoa(String.fromCharCode(...bytes)),entries=[];
  for(const row of records){const blob=(await originals.readOriginalRow(db,row.client_document_id)).blob;entries.push({record:row,original:{base64:base64(new Uint8Array(await blob.arrayBuffer())),sha256:await originals.sha256Original(blob),size:blob.size,type:blob.type}});}
  const compact=compactTransferOriginals({format:'road-ready-document-transfer',version:1,documents:entries}),expanded=expandTransferOriginals(compact);
  const invalid=structuredClone(decoded.document_blobs);invalid.find(row=>row.original_blob_id).original_blob_id='missing';let missing='';try{originals.validateOriginalReferences(invalid);}catch(error){missing=error.message;}
  // Real request order through a fake, account-scoped endpoint. No network
  // request leaves this test process and no production token is requested.
  const third=await create('synthetic-cloud-retry'),thirdDeps={db:third,waitFor:promise=>Dexie.waitFor(promise)};
  let puts=0,creates=0,commits=0,failCommit=true;const paths=[];
  const response=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
  const fetcher=async(url,request)=>{
   if(request.method==='PUT'){puts++;return response(200,{});}
   const body=JSON.parse(request.body);
   if(url.endsWith('/create-upload')){creates++;return response(200,{storage_path:'test-owner/original-'+body.document_id,signed_upload:{signedUrl:'/synthetic-put'}});}
   commits++;paths.push(body.storage_path);if(failCommit){failCommit=false;return response(503,{error:'Synthetic commit outage'});}return response(200,{document:{...body,id:body.document_id,type:['bol','pod'].includes(body.type)?body.type:'other',notes:'[[ROAD_READY_INTELLIGENCE_V1040]]'+JSON.stringify(body.intelligence)}});
  };
  const upload=args=>uploadDocumentOriginal(args,{fetcher,getToken:async()=>'synthetic-token',online:true});
  const firstCloud=await saveDocument({file,type:'bol',metadata:{loadNo:'X'},extracted:{type:'bol'}},{...thirdDeps,upload});
  const retry=await saveDocument({file:new File([file],'again.pdf',{type:file.type}),type:'bol',metadata:{loadNo:'X'},extracted:{type:'bol'}},{...thirdDeps,upload});
  const link=await saveDocument({file,type:'pod',metadata:{loadNo:'X'},extracted:{type:'pod'}},{...thirdDeps,upload});
  const out={ids:[first.localDocument.local_id,duplicate.localDocument.local_id],renamedReused:duplicate.storage.reused,types:records.map(row=>row.type).sort(),loads:records.map(row=>row.load_no).sort(),count:records.length,binaryCopies:blobs.filter(row=>row.blob?.size).length,links:blobs.filter(row=>row.original_blob_id).length,hash,podHash:await originals.sha256Original(signedFile),reopened,quota,unchanged,
   review:(await db.documents_local.get(first.localDocument.local_id)).extracted.readerAnalysisV1,
   packet:{originals:packet.originals,records:manifest.records.length,missing:packet.missing.length,paths:manifest.records.map(row=>row.path)},
   account:{binaryObjects:cloudBytes.size,secondHashes,recoveredHashes,recoveredId:recovered.localDocument.local_id,recoveredBlobRows:await second.document_blobs.count()},transfer:{version:compact.version,originals:Object.keys(compact.originals).length,records:expanded.documents.length,allBytesPreserved:expanded.documents.every((item,i)=>item.original.base64===entries[i].original.base64)},missing,
   cloud:{first:firstCloud.cloud.status,retry:retry.cloud.status,linked:link.cloud.status,puts,creates,commits,uniquePaths:new Set(paths).size}};
  for(const database of [db,second,third]){database.close();await Dexie.delete(database.name);}return out;
 });
 assert.equal(result.ids[0],result.ids[1]);assert.equal(result.renamedReused,true);assert.equal(result.count,4);assert.equal(result.binaryCopies,2);assert.equal(result.links,2);
 assert.deepEqual(result.types,['bol','bol','pod','rate_confirmation']);assert.equal(result.reopened.filter(row=>row.hash===result.hash).length,3);assert.notEqual(result.podHash,result.hash);assert.equal(result.reopened[3].hash,result.podHash);
 assert.equal(result.quota,'QuotaExceededError');assert.equal(result.unchanged,true);assert.equal(result.review.pages.length,2);assert.deepEqual(result.review.pending,['pickupAddress']);
 assert.deepEqual({originals:result.packet.originals,records:result.packet.records,missing:result.packet.missing},{originals:2,records:4,missing:0});assert.equal(new Set(result.packet.paths).size,2);
 assert.equal(result.account.binaryObjects,2);assert.equal(result.account.secondHashes.filter(hash=>hash===result.hash).length,3);
 assert.deepEqual(result.account.recoveredHashes,result.account.secondHashes);assert.equal(result.account.recoveredId,result.reopened[2].id);assert.equal(result.account.recoveredBlobRows,4);
 assert.deepEqual(result.transfer,{version:2,originals:2,records:4,allBytesPreserved:true});assert.match(result.missing,/missing/);
 assert.deepEqual(result.cloud,{first:'local_only',retry:'synced',linked:'original_synced',puts:1,creates:1,commits:3,uniquePaths:1});assert.deepEqual(errors,[]);
 console.log('PASS '+browserName+' — real IndexedDB: rename/late reimport idempotency, distinct BOL/POD versions, shared load/type links, atomic quota rollback, reopen, packet export, verified account restore, missing-original recovery, compact transfer, dangling-reference rejection, one cloud PUT across commit retry and two filings');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
