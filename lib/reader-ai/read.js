import {SMART_READING_VERSION} from './smartReading.js';
import {withAiAbort} from './diagnostics.js';
import {boundedOcrContext} from './ocrContext.js';

export const originalDigest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
const messages={offline:'Offline. The original is kept; read it when connected.',signed_out:'Sign in to finish automatic reading.',
  limit_reached:'The image service is busy. The original is kept; try again shortly.',invalid_ai_result:'The image reading could not be verified. The original is kept.',
  unavailable:'Automatic reading is unavailable. The original is kept.',timed_out:'Reading took too long. The original is kept.',
  source_changed:'The original changed. Read the current document again.',account_changed:'Account changed. Read the document again.'};
const pause=(ms,signal)=>new Promise((resolve,reject)=>{
  const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(new DOMException('Cancelled','AbortError'));};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
});

// The scan pipeline owns the paid read. Review components reuse this source-
// bound result instead of starting another read when the form is mounted.
export function createAutomaticReader({identify,sources,session,prepare,fetcher=fetch,online=()=>true,wait=pause,setTimer=setTimeout,clearTimer=clearTimeout}){
  return async function read(analysis,file,options={}){
    if(options.signal?.aborted)throw new DOMException('Cancelled','AbortError');
    let review;
    try{review=identify(analysis);}catch{return null;}
    if(review.pages?.length!==1||review.pageCount!==1||review.documents?.length!==1||review.documents[0].pageIds.length!==1||review.documents[0].boundaryReview)return null;
    const page=review.pages[0],original=sources(analysis,file,options).find(p=>p.pageNumber===page.number)?.file;
    if(!(original instanceof Blob))return null;
    const stage={version:SMART_READING_VERSION,state:'error',pageNumber:page.number,attempted:false};
    const finish=(reason,extra={})=>({...analysis,aiSourcePages:[{pageNumber:page.number,file:original}],automaticReadingStage:{...stage,reason,message:messages[reason]||messages.unavailable,...extra}});
    // Keep the established local-only review when no network is available.
    if(!online())return null;
    const controller=new AbortController(),abort=()=>controller.abort();
    options.signal?.addEventListener('abort',abort,{once:true});
    let timedOut=false;
    const timer=setTimer(()=>{timedOut=true;abort();},115000),bounded=fn=>withAiAbort(fn,controller.signal);
    try{
      const available=await bounded(()=>fetcher('/api/reader/classify',{signal:controller.signal,cache:'no-store'}));
      const config=await bounded(()=>available.json());
      if(!available.ok||!config.enabled||config.smartReading?.enabled!==true||config.smartReading.version!==SMART_READING_VERSION)return null;
      stage.model=config.model;
      let user=await bounded(()=>session(controller.signal));
      if(!user?.access_token||!user?.user?.id)return finish('signed_out');
      stage.accountId=user.user.id;
      options.onProgress?.(.99,'Reading and checking the original…');
      const image=await bounded(()=>prepare(original,controller.signal));
      stage.originalHash=await bounded(()=>originalDigest(original.arrayBuffer()));
      stage.imageHash=await bounded(()=>originalDigest(Uint8Array.from(atob(image.split(',')[1]),c=>c.charCodeAt(0))));
      const text=boundedOcrContext(page.observations.filter(o=>o.source!=='ai'),6000);
      for(let attempt=0;attempt<2;attempt++){
        stage.attempted=true;
        const response=await bounded(()=>fetcher('/api/reader/classify',{method:'POST',signal:controller.signal,cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+user.access_token},body:JSON.stringify({operation:'read',image,text,pageNumber:page.number})}));
        const value=await bounded(()=>response.json());
        if(!response.ok||value.ok!==true){
          const retry=value.diagnostic?.retryAfterMs;
          if(attempt===0&&response.status===429&&value.diagnostic?.limitScope==='reader'&&Number.isFinite(retry)&&retry>0&&retry<=60000){
            options.onProgress?.(.99,'Waiting briefly for the reader. Your original is kept…');
            await bounded(()=>wait(retry+100,controller.signal));
            const current=await bounded(()=>session(controller.signal));
            if(current?.user?.id!==user.user.id)return finish('account_changed');
            if(!current?.access_token)return finish('signed_out');
            user=current;
            options.onProgress?.(.99,'Reading and checking the original…');continue;
          }
          return finish(Object.hasOwn(messages,value.error)?value.error:'unavailable',{httpStatus:response.status,limitScope:value.diagnostic?.limitScope||null,outputIssue:value.diagnostic?.outputIssue||null});
        }
        if(value.pageNumber!==page.number||value.result?.model!==config.model||value.result?.imageHash!==stage.imageHash||value.result?.version!==SMART_READING_VERSION)return finish('source_changed');
        const current=await bounded(()=>session(controller.signal));
        if(current?.user?.id!==user.user.id)return finish('account_changed');
        return finish('completed',{state:'completed',message:'Read and checked automatically',result:value.result});
      }
    }catch(error){
      if(options.signal?.aborted)throw new DOMException('Cancelled','AbortError');
      return finish(timedOut?'timed_out':'unavailable');
    }finally{clearTimer(timer);options.signal?.removeEventListener('abort',abort);controller.abort();}
  };
}
