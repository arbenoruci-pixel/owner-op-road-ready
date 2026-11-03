import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import {createSyncPacer,streamRecordInventory} from './pacing.js';
import {projectRecords} from '../../lib/owner-op-cloud/recordsCoreV110451.js';

test('long CPU work yields for input and a new logbook priority cancels the next file request',async()=>{
 let clock=0,interrupted=false;const waits=[];
 const pacer=createSyncPacer({now:()=>clock,wait:async ms=>{waits.push(ms);if(ms)interrupted=true;},check:()=>{if(interrupted)throw Error('records first');}});
 await pacer.yield();assert.deepEqual(waits,[]);clock=9;await pacer.yield();assert.deepEqual(waits,[0]);
 await assert.rejects(pacer.file(),/records first/);assert.deepEqual(waits,[0,350]);
});

test('stream matches every inventory identity/hash, puts logbook first, and reads at most one table row at a time',async()=>{
 const state={activeDriverId:'driver',eventsByDay:{'2026-11-01':[{id:'drive',status:'D'}]},dotWallet:{documents:{license:{title:'license'}}}};
 const business={documents:[{id:'dup',title:'one'},{id:'dup',title:'two'}],loads:[{id:'load',loadNo:'123'}]};
 const localRows=[{key:'owner-op-setting',value:'{"value":1}'}];
 const tables={sync_meta:[{key:'recover',value:['x'.repeat(100000),'y'.repeat(400001)]},{key:'owner-op-record-sync-v1:private',value:'excluded'}],documents_local:[{local_id:'doc',title:'BOL'}],document_blobs:[{local_blob_id:'blob',bytes:new Blob(['original'])}],app_snapshots:[{key:'state',state}],unknown_table:[{title:'without-id'},{title:'second'}]};
 const reads=[],expected=projectRecords({state,business,localRows,tables});let outstanding=0,max=0,yields=0;
 const db={tables:Object.entries(tables).map(([name,rows])=>({name,toArray:()=>{throw Error('full-table read');},toCollection:()=>({primaryKeys:async()=>rows.map((r,i)=>r.key??r.local_id??r.local_blob_id??i)}),get:async key=>{outstanding++;max=Math.max(max,outstanding);reads.push(name);await Promise.resolve();outstanding--;return rows.find((r,i)=>(r.key??r.local_id??r.local_blob_id??i)===key);}}))};
 const actual=[];for await(const record of streamRecordInventory({db,state,business,localRows,project:projectRecords,checkpoint:async()=>{yields++;}}))actual.push(record);
 const sorted=rows=>rows.sort((a,b)=>a.record_key.localeCompare(b.record_key));
 assert.deepEqual(sorted([...actual]),sorted(expected));assert.equal(actual[0].kind,'drivers');assert.equal(actual[1].kind,'logbook_days');
 assert.equal(reads.at(-1),'sync_meta');assert.equal(max,1);assert.ok(yields>actual.length);
 assert.equal(actual.filter(r=>r.record_key==='driver/driver_primary').length,0,'row projection cannot invent drivers');
});

function fileRuntime(){
 const source=fs.readFileSync('lib/owner-op-cloud/accountFilesV110455.js','utf8').replace(/^import[^\n]*\n/gm,'').replace(/\bexport /g,'');
 const hashBytes=async bytes=>Buffer.from(await webcrypto.subtle.digest('SHA-256',bytes)).toString('hex');
 const store=new Map(),calls=[];
 const verifiedPiece=async(storage,uid,blob,known)=>{const data=await blob.arrayBuffer(),sha256=await hashBytes(data);store.set(sha256,data);calls.push('upload');known.add(sha256);return{sha256,bytes:blob.size};};
 const storage={download:async key=>{calls.push('download');return{data:new Blob([store.get(key)])};}};
 const runtime=new Function('hashBytes','verifiedPiece','objectPath','PART_BYTES','bounded',source+'\nreturn {encode,decode};')(hashBytes,verifiedPiece,(_,sha)=>sha,1024,async p=>p);
 return {...runtime,storage,calls,store};
}
test('documents upload/download one paced chunk at a time and preserve exact original bytes',async()=>{
 const f=fileRuntime(),original=new Uint8Array(3500).map((_,i)=>i%251),events=[];
 const opts={storage:f.storage,uid:'synthetic',known:new Set(),pace:async()=>events.push('pace'),check:()=>events.push('check'),yieldUI:async()=>{}};
 const encoded=await f.encode({file:new Blob([original])},opts);assert.equal(encoded.file.chunks.length,4);assert.equal(events.filter(e=>e==='pace').length,4);
 events.length=0;const decoded=await f.decode(encoded,opts);assert.equal(events.filter(e=>e==='pace').length,4);
 assert.deepEqual(new Uint8Array(await decoded.file.arrayBuffer()),original);
 const before=f.calls.length;await assert.rejects(f.decode(encoded,{...opts,pace:async()=>{throw Error('logbook priority');}}),/logbook priority/);assert.equal(f.calls.length,before);
 const corrupt={...encoded,file:{...encoded.file,size:3501}};await assert.rejects(f.decode(corrupt,opts),/incomplete/);
});
