import {analyzeCameraFrame} from './cameraAnalysisV1104110.js';

// A single reusable worker, one active frame and no video queue. Callers skip
// stale live frames while a burst frame is being inspected. Keep a local copy
// for the identical fallback when browser workers fail or time out.
export function createCameraAnalyzer(){
  let worker=null,pending=null,disabled=false,disposed=false;
  const terminate=()=>{worker?.terminate();worker=null;};
  return {
    busy:()=>Boolean(pending),
    degraded:()=>disabled||typeof Worker==='undefined',
    async analyze(pixels,width,height,{allowMainThread=true}={}){
      if(pending)await pending.catch(()=>{});
      if(disposed)throw new Error('Camera closed');
      if(!disabled&&typeof Worker!=='undefined'){
        try{
          worker ||= new Worker(new URL('./cameraAnalysisWorkerV1104110.js',import.meta.url),{type:'module'});
          let timer,rejectJob;
          const job=new Promise((resolve,reject)=>{
            rejectJob=reject;timer=setTimeout(()=>reject(new Error('Camera analysis timed out')),1800);
            worker.onmessage=event=>event.data.ok?resolve(event.data.value):reject(new Error(event.data.error));
            worker.onerror=()=>reject(new Error('Camera worker unavailable'));
            worker.postMessage({pixels,width,height});
          });
          pending=job;this.cancel=()=>rejectJob(new Error('Camera closed'));
          try{return await job;}finally{clearTimeout(timer);pending=null;this.cancel=null;}
        }catch{disabled=true;terminate();}
      }
      if(disposed)throw new Error('Camera closed');
      if(!allowMainThread)throw new Error('Camera auto detection unavailable');
      return analyzeCameraFrame(pixels,width,height);
    },
    dispose(){disposed=true;this.cancel?.();terminate();},
  };
}
