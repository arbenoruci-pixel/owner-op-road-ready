import {processDocument} from './processDocumentV110330.js';

// A worker owns each bounded photo job and releases its pixels on completion.
// Unsupported worker/canvas implementations use the same local engine.
export async function processDocumentClient(file,source) {
  if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined'||typeof createImageBitmap==='undefined')return processDocument(file,source);
  let worker,timer;
  try {
    return await new Promise((resolve,reject)=>{
      worker=new Worker(new URL('./documentProcessingWorkerV110330.js',import.meta.url),{type:'module'});
      timer=setTimeout(()=>reject(new Error('Photo worker timed out')),20000);
      worker.onmessage=event=>event.data.ok?resolve(event.data.value):reject(new Error(event.data.error));
      worker.onerror=()=>reject(new Error('Photo worker unavailable'));
      worker.postMessage({file,source});
    });
  }catch{
    worker?.terminate();clearTimeout(timer);
    return await processDocument(file,source);
  }finally{worker?.terminate();clearTimeout(timer);}
}
