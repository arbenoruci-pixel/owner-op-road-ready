import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareDocumentAudit } from './auditPackage.js';
function untar(bytes) {
  const entries=new Map(), decoder=new TextDecoder();
  for(let offset=0;offset+512<=bytes.length;){
    const h=bytes.subarray(offset,offset+512);if(h.every(n=>n===0))break;
    const text=(a,b)=>decoder.decode(h.subarray(a,b)).replace(/\0.*$/s,'');
    const name=text(0,100),prefix=text(345,500),size=parseInt(text(124,136),8);
    const check=parseInt(text(148,156),8);const copy=h.slice();copy.fill(32,148,156);
    assert.equal(copy.reduce((s,b)=>s+b,0),check);
    const key=prefix?prefix+'/'+name:name;assert.ok(!entries.has(key));
    entries.set(key,bytes.slice(offset+512,offset+512+size));offset+=512+Math.ceil(size/512)*512;
  }
  return entries;
}
const defaults={folders:[],state:{custom:'retain'},businessStore:{expenses:[{id:'expense'}]},report:{issues:[]},loadNumber:d=>d.load_no,documentType:d=>d.type};
test('continues after storage and Blob I/O failures, preserves all metadata and hashes exact original bytes',async()=>{
  const original=new Uint8Array([0,1,255,23,17]);let reads=0;
  const docs=Array.from({length:5},(_,i)=>({id:String(i),load_no:'LOAD1',type:'pod',original_file_name:'same.pdf',classification:{selectedType:'bol'},extracted:{loadNo:'CONFLICT'},custom:{keep:true}}));
  const before=JSON.stringify(docs),progress=[];
  const result=await prepareDocumentAudit({...defaults,documents:docs,onProgress:p=>progress.push(p),readBlob:async d=>{
    if(d.id==='1')throw new DOMException('The I/O read operation failed.','NotReadableError');
    if(d.id==='2')return {size:5,arrayBuffer:async()=>{throw new DOMException('The I/O read operation failed.','NotReadableError');}};
    if(d.id==='3')return null;
    return {size:original.length,arrayBuffer:async()=>{reads++;return original.buffer;}};
  }});
  assert.equal(result.originals,2);assert.equal(result.missingOriginals,3);assert.equal(result.complete,false);assert.equal(reads,2);
  assert.equal(JSON.stringify(docs),before);assert.deepEqual(progress.at(-1),{completed:5,total:5,failed:3});
  const entries=untar(new Uint8Array(await result.file.arrayBuffer()));
  const read=p=>JSON.parse(new TextDecoder().decode(entries.get(p)));
  assert.deepEqual(read('audit/documents.json'),docs);assert.deepEqual(read('audit/app-state.json'),defaults.state);
  assert.deepEqual(read('audit/business-store.json'),defaults.businessStore);
  const manifest=read('audit/document-manifest.json');
  for(const item of manifest){assert.equal(entries.has(item.path),item.blobIncluded);if(item.blobIncluded){assert.deepEqual(entries.get(item.path),original);assert.equal(item.sha256,createHash('sha256').update(original).digest('hex'));}}
  assert.deepEqual(read('audit/unavailable-originals.json').map(x=>x.code),['ORIGINAL_READ_FAILED','ORIGINAL_READ_FAILED','ORIGINAL_MISSING']);
  assert.equal(read('audit/report.json').export.complete,false);
});
test('long duplicate names and unsafe paths remain unique and recoverable; all missing and empty collections still export metadata',async()=>{
  for(const missing of [false,true]){
    const docs=Array.from({length:180},(_,i)=>({id:String(i),load_no:'L'.repeat(200),type:'../pod/'.repeat(30),original_file_name:'photo'.repeat(70)+'.jpg'}));
    const result=await prepareDocumentAudit({...defaults,documents:docs,readBlob:async()=>missing?null:new Blob(['hello'])});
    const entries=untar(new Uint8Array(await result.file.arrayBuffer()));
    assert.equal(result.originals,missing?0:180);assert.equal(result.manifest.length,180);
    if(!missing)for(const item of result.manifest)assert.equal(new TextDecoder().decode(entries.get(item.path)),'hello');
    assert.equal(new Set(result.manifest.map(x=>x.path)).size,180);
  }
  const empty=await prepareDocumentAudit({...defaults,documents:[],readBlob:async()=>{throw new Error('unexpected');}});
  assert.equal(empty.complete,true);assert.ok(empty.file.size>0);
});
