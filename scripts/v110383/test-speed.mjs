import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const code=fs.readFileSync('scripts/v110383/webOcr.js','utf8').replaceAll('export ','');
const factory=mock=>new Function('window',code+';return {recognizeDocumentText,terminateWebOcr};')({Tesseract:{createWorker:async()=>mock}});
const signal=()=>new AbortController().signal;
test('completed OCR is reused with new cancellation signals; source or parameters get a new read',async()=>{
  let calls=0;const reader=factory({setParameters:async()=>{},terminate:async()=>{},recognize:async()=>{calls++;return {data:{text:'BOL NO: 0012345000',confidence:96}};}});
  const photo={type:'image/png'};
  const first=await reader.recognizeDocumentText(photo,{signal:signal(),pageSegMode:'3'});
  for(let i=0;i<3;i++)assert.deepEqual(await reader.recognizeDocumentText(photo,{signal:signal(),pageSegMode:'3'}),first);
  assert.equal(calls,1,'three duplicate successful reads require zero additional OCR jobs');
  const abort=new AbortController();abort.abort();await assert.rejects(reader.recognizeDocumentText(photo,{signal:abort.signal,pageSegMode:'3'}),{name:'AbortError'});
  await reader.recognizeDocumentText(photo,{signal:signal(),pageSegMode:'11'});assert.equal(calls,2);
  await reader.recognizeDocumentText({type:'image/png'},{signal:signal(),pageSegMode:'3'});assert.equal(calls,3);
  await reader.terminateWebOcr();await reader.recognizeDocumentText(photo,{signal:signal(),pageSegMode:'3'});assert.equal(calls,4);
});
test('canceled OCR never becomes a reusable result and leaves subsequent work available',async()=>{
  let started,finish,calls=0;
  const began=new Promise(r=>started=r),pending=new Promise(r=>finish=r);
  const reader=factory({setParameters:async()=>{},terminate:async()=>{},recognize:async()=>{calls++;if(calls===1){started();return pending;}return {data:{text:'fresh source',confidence:96}};}});
  const photo={type:'image/png'},controller=new AbortController();
  const first=reader.recognizeDocumentText(photo,{signal:controller.signal});await began;controller.abort();
  await assert.rejects(first,{name:'AbortError'});finish({data:{text:'stale source',confidence:96}});
  const next=await reader.recognizeDocumentText(photo,{signal:signal()});assert.equal(next.text,'fresh source');assert.equal(calls,2);
});
