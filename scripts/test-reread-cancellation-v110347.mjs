import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('source/src/modules/scan/webOcr.js','utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const api=()=>new Function('window',source.replaceAll('export ','')+'; return {recognizeDocumentText};')(globalThis.window);
const photo={type:'image/png'},success={data:{text:'BOL: B-21',confidence:96}};

// A hung recognition is terminated and its queue slot released promptly.
let created=0,stopped=0,started=deferred();
globalThis.window={Tesseract:{createWorker:async()=>{
  const id=++created;return {setParameters:async()=>{},terminate:async()=>{stopped++;},recognize:async()=>{if(id===1){started.resolve();return new Promise(()=>{});}return success;}};
}}};
let reader=api(),controller=new AbortController();
const first=reader.recognizeDocumentText(photo,{signal:controller.signal});
await started.promise;controller.abort();await assert.rejects(first,{name:'AbortError'});
const second=await reader.recognizeDocumentText(photo,{signal:new AbortController().signal});
assert.equal(second.text,'BOL: B-21');assert.equal(stopped,1);assert.equal(created,2);

// A canceled queued request never terminates somebody else's active worker.
let finish=deferred();started=deferred();stopped=0;created=0;
window.Tesseract.createWorker=async()=>({setParameters:async()=>{},terminate:async()=>{stopped++;},recognize:async()=>{started.resolve();return finish.promise;}});
reader=api();const active=reader.recognizeDocumentText(photo);await started.promise;
controller=new AbortController();const queued=reader.recognizeDocumentText({type:'image/png'},{signal:controller.signal});controller.abort();
await assert.rejects(queued,{name:'AbortError'});assert.equal(stopped,0);finish.resolve(success);await active;await tick();assert.equal(stopped,0);

// Cancel during model creation. A late original worker cannot kill the new one.
let creation=deferred();started=deferred();stopped=0;created=0;
window.Tesseract.createWorker=async()=>{const id=++created;if(id===1){started.resolve();return creation.promise;}return {setParameters:async()=>{},terminate:async()=>{throw new Error('new worker terminated');},recognize:async()=>success};};
reader=api();controller=new AbortController();const pending=reader.recognizeDocumentText(photo,{signal:controller.signal});await started.promise;controller.abort();
await assert.rejects(pending,{name:'AbortError'});await reader.recognizeDocumentText(photo,{signal:new AbortController().signal});
creation.resolve({setParameters:async()=>{},terminate:async()=>{stopped++;}});await tick();
assert.ok(stopped>=1);assert.equal((await reader.recognizeDocumentText(photo,{signal:new AbortController().signal})).text,'BOL: B-21');assert.equal(created,2);
delete globalThis.window;
console.log('PASS — cancel stops active OCR, releases retries, skips canceled queued work and isolates late worker creation');
