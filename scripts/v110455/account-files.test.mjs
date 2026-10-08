import assert from 'node:assert/strict';import fs from 'node:fs';import {pathToFileURL} from 'node:url';
const code=fs.readFileSync('scripts/v110455/accountFiles.js','utf8').replace("'./mirrorCoreV110450.js'",JSON.stringify(pathToFileURL(process.cwd()+'/scripts/v110450/mirrorCore.js').href));
const {encode,decode,snapshotBundle,localPieceSource,readFile}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const {hashBytes}=await import('../v110450/mirrorCore.js');
const uid='00000000-0000-4000-8000-000000000055',store=new Map();let uploads=0,corrupt=false;
const storage={upload:async(k,v)=>{uploads++;store.set(k,new Blob([v]));return {};},download:async k=>({data:corrupt?new Blob(['damaged']):store.get(k)})};
const opts={uid,storage,known:new Set()},raw={pdf:new Blob(['original bytes'],{type:'application/pdf'}),signature:'data:image/png;base64,c2lnbmF0dXJl',text:'x'.repeat(70000)};
const packed=await encode(raw,opts),restored=await decode(packed,opts);assert.equal(await restored.pdf.text(),'original bytes');assert.equal(restored.signature,raw.signature);assert.equal(restored.text,raw.text);await encode(raw,opts);assert.equal(uploads,3);
corrupt=true;await assert.rejects(decode(packed,opts),/verification/);corrupt=false;
const payload={state:{activeDriverId:'alpha',signatureByDay:{'2026-10-05':{signatureDataUrl:{__roadReadyZipFile:'DataURL',path:'sig',size:9,mimeType:'image/png',prefix:'data:image/png;base64,'}}}},businessStore:{loads:[{id:'one'}]},dexie:{},localStorage:[]};
const archive={payload,payloadSha256:await hashBytes(new TextEncoder().encode(JSON.stringify(payload)))},index=await encode(new Blob([JSON.stringify(archive)]),opts);
const snap={manifest:{files:[{name:'Road-Ready-Backup.roadready.json',size:index.size,chunks:index.chunks},{name:'sig',size:9,chunks:packed.signature.chunks}]}};
const seeded=await snapshotBundle(snap,opts),resolved=await decode(seeded,opts);assert.equal(resolved.state.signatureByDay['2026-10-05'].signatureDataUrl,raw.signature);assert.equal(resolved.business.loads[0].id,'one');
console.log('PASS files: original bytes, signatures, large text, deduplication, corrupt-file rejection, verified legacy snapshot bootstrap');

// Reuse IndexedDB rows lazily, without retaining their large binary payloads.
const originalBytes=new Uint8Array(2*1048576+19);originalBytes.fill(7,0,1048576);originalBytes.fill(9,1048576,2*1048576);originalBytes.fill(11,2*1048576);
let savedRow={nested:[{blob:new Blob([originalBytes],{type:'application/pdf'})}]},rowReads=0,networkReads=0;
const manifest=await encode(savedRow,opts),source=localPieceSource();
source.remember(manifest,async()=>{rowReads++;return savedRow;});
assert.equal(rowReads,0,'Indexing a manifest must not load original bytes');
const receive={...opts,localPiece:source.read,storage:{download:async key=>{networkReads++;return storage.download(key);}}};
const local=await decode(manifest,receive);assert.equal(networkReads,0);assert.equal(rowReads,3);assert.equal(local.nested[0].blob.type,'application/pdf');
assert.equal(await hashBytes(await local.nested[0].blob.arrayBuffer()),await hashBytes(originalBytes));
// A same-size local replacement must never masquerade as the requested original.
const damaged=originalBytes.slice();damaged[1048576]=99;savedRow={nested:[{blob:new Blob([damaged])}]};
assert.equal(await hashBytes(await (await readFile(manifest.nested[0].blob,receive)).arrayBuffer()),await hashBytes(originalBytes));assert.equal(networkReads,1);
corrupt=true;await assert.rejects(readFile(manifest.nested[0].blob,receive),/verification/);corrupt=false;
// A deleted row or IndexedDB read failure falls back, without accepting missing bytes.
savedRow=null;const beforeMissing=networkReads;await readFile(manifest.nested[0].blob,receive);assert.equal(networkReads-beforeMissing,3);
const unreadable=localPieceSource();unreadable.remember(manifest,async()=>{throw Error('Local row unavailable');});
await readFile(manifest.nested[0].blob,{...receive,localPiece:unreadable.read});
const isolated=localPieceSource();assert.equal(await isolated.read(manifest.nested[0].blob.chunks[0]),null,'A new receive/account must have an empty source index');
const beforeStop=networkReads;await assert.rejects(readFile(manifest.nested[0].blob,{...receive,check:()=>{throw Error('Account changed');}}),/Account changed/);assert.equal(networkReads,beforeStop);
// Typed-array views must respect the byte offset of their original view.
const padded=new Uint8Array([0,0,4,5,6,0]),view=padded.subarray(2,5),arrayRow={bytes:view},arrayManifest=await encode(arrayRow,opts);
source.remember(arrayManifest,async()=>arrayRow);const arrayOut=await decode(arrayManifest,receive);assert.deepEqual([...new Uint8Array(arrayOut.bytes)],[4,5,6]);
console.log('PASS local reuse: lazy row reads, exact multi-chunk bytes/MIME, corrupt/missing local fallback, corrupt cloud rejection, cancellation, account isolation, typed-array offsets');
