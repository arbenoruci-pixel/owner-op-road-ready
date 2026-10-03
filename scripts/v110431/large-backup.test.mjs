import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildLargeBackup,inspectLargeBackup} from './largeBackup.js';
import {CHUNK_BYTES,readStoredZip,ChunkedZip,inspectBlob} from './chunkedZip.js';
const mb=new Uint8Array(CHUNK_BYTES);mb.fill(71);
const original=new Blob([Array.from({length:300},()=>new Blob([mb]))].flat(),{type:'application/pdf'});
const rows={documents_local:[{local_id:'doc',client_document_id:'one',original_file_name:'large.pdf',load_no:'A1'}],document_blobs:[{local_blob_id:'blob',client_document_id:'one',blob:original}],capture_asset_blobs:[{local_asset_id:'page',blob:new Blob(['page'],{type:'image/jpeg'})}],app_snapshots:[{key:'owner-op-road-ready-state-v1',state:{eventsByDay:{}}}]};
const db={tables:Object.keys(rows).map(name=>({name,toCollection:()=>({offset:offset=>({limit:n=>({toArray:async()=>rows[name].slice(offset,offset+n)})})})})),table:name=>({toArray:async()=>rows[name]})};
const state={eventsByDay:{'2026-10-01':[{status:'SB',startMin:0,endMin:1440}]},driverProfile:{name:'Large export'},dotWallet:{documents:{permit:{attachmentDataUrl:'data:image/png;base64,AQID'}}}};
const nativeRead=Blob.prototype.arrayBuffer;let biggestRead=0;
Blob.prototype.arrayBuffer=function(){biggestRead=Math.max(biggestRead,this.size);assert.ok(this.size<=CHUNK_BYTES,'Binary read exceeded 1 MB');return nativeRead.call(this);};
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rr-large-'));
try{
 const result=await buildLargeBackup({db,state,businessStore:{loads:[{loadNo:'A1'}]},inventory:{logDays:1,documentBlobRows:1},localRows:[{key:'owner-op-prototype-auth-v1',value:'SECRET'},{key:'road-ready-big-string',value:JSON.stringify({attachmentDataUrl:'data:image/png;base64,'+Buffer.alloc(80000,7).toString('base64')})}]});
 assert.ok(result.file.size>300*CHUNK_BYTES);assert.ok(result.file.size<302*CHUNK_BYTES,'Documents were duplicated or base64-expanded');assert.equal(result.originals,3);
 assert.ok(JSON.stringify(result.archive).length<50000,'Backup index grew with document binary size');assert.equal(JSON.stringify(result.archive).includes('SECRET'),false);
 const checked=await inspectLargeBackup(result.file),ref=checked.archive.payload.dexie.document_blobs[0].blob;
 const restored=await checked.resolveZipFile(ref);assert.equal(restored.size,original.size);assert.equal(restored.type,'application/pdf');
 assert.deepEqual(new Uint8Array(await restored.slice(-4).arrayBuffer()),new Uint8Array([71,71,71,71]));
 assert.equal(await checked.resolveZipFile(checked.archive.payload.state.dotWallet.documents.permit.attachmentDataUrl),'data:image/png;base64,AQID');
 const zip=await readStoredZip(result.file);assert.ok(zip.get('Logbook/Logbook.html'));assert.ok(zip.get(ref.path));
 const corrupted=new File([result.file.slice(0,ref.path.length+31),new Uint8Array([0]),result.file.slice(ref.path.length+32)],'broken.zip');
 await assert.rejects(()=>inspectLargeBackup(corrupted),/checksum/);
 const controller=new AbortController();await assert.rejects(()=>buildLargeBackup({db,state,localRows:[],signal:controller.signal,onProgress:()=>controller.abort()}),{name:'AbortError'});
 // Validate the ZIP with an independent implementation, streaming it to disk.
 const out=fs.createWriteStream(path.join(dir,'everything.zip'));for await(const bytes of result.file.stream())if(!out.write(bytes))await new Promise(resolve=>out.once('drain',resolve));await new Promise(resolve=>out.end(resolve));
 const test=spawnSync('python3',['-c',"import zipfile,sys,json\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert z.testzip() is None\n a=json.loads(z.read('Road-Ready-Backup.roadready.json'))\n r=a['payload']['dexie']['document_blobs'][0]['blob']\n assert z.getinfo(r['path']).file_size==300*1024*1024\n assert len(z.read('Road-Ready-Backup.roadready.json'))<50000\n",path.join(dir,'everything.zip')],{encoding:'utf8'});assert.equal(test.status,0,test.stderr);
 console.log(`PASS: 300 MB original export and verification, <= ${biggestRead/1024} KB binary reads, ZIP overhead <2 MB, direct file restore, legacy attachments, token exclusion, corruption rejection, cancellation, independent ZIP reader`);
}finally{Blob.prototype.arrayBuffer=nativeRead;fs.rmSync(dir,{recursive:true,force:true});}
