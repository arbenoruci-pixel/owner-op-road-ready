import {AI_READER_VERSION, aiClassificationReason, validateAiClassification} from './policy.js';

const cancelled = signal => {if(signal?.aborted)throw new DOMException('Scan cancelled','AbortError');};
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');

// One bounded, page-specific attempt. Failure returns the unchanged local
// reading with an explicit status. Successful AI output remains a suggestion.
export function createAiFallback({identify,sources,session,prepare,fetcher=fetch,online=()=>true}) {
  const cache=new Map();
  return async function assist(analysis,file,options={}) {
    cancelled(options.signal);
    if(options.preferredType && options.preferredType!=='auto' || analysis.userSelectedTypeV11036)return analysis;
    const review=identify(analysis);
    const requests=review.pages.flatMap(page=>{
      const identity=review.pageIdentities.find(item=>item.pageId===page.id);
      const text=page.observations.filter(o=>!o.id?.includes('detail')).map(o=>o.lines.map(line=>line.text).join('\n')).join('\n');
      const reason=aiClassificationReason(identity,text);
      // Decide locally from every page read; the provider's text limit must
      // not hide a delivery stamp found late in a later OCR observation.
      return reason?[{pageNumber:page.number,reason,text:text.slice(0,6000)}]:[];
    });
    if(!requests.length)return analysis;
    let aiSourcePages=[];
    // Blob references live only with this in-memory scan. Saved/exported AI
    // provenance contains classifications, never these source files.
    const finish=pages=>({...analysis,aiSourcePages,aiClassification:{version:AI_READER_VERSION,pages},needsReview:true});
    const allStatus=status=>finish(requests.map(({pageNumber,reason})=>({pageNumber,reason,status})));
    if(!online())return allStatus('offline');
    const controller=new AbortController(),abort=()=>controller.abort();
    options.signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(abort,60000);
    try{
      const available=await fetcher('/api/reader/classify',{signal:controller.signal,cache:'no-store'});
      if(!available.ok)return allStatus('unavailable');
      const config=await available.json();
      if(config.enabled!==true)return allStatus('not_configured');
      if(typeof config.model!=='string' || config.version!==AI_READER_VERSION)return allStatus('unavailable');
      const user=await session(controller.signal);
      if(!user?.access_token || !user?.user?.id)return allStatus('signed_out');
      const pageSources=sources(analysis,file,options),pages=[];
      aiSourcePages=pageSources.filter(source=>requests.some(request=>request.pageNumber===source.pageNumber));
      let attempted=0;
      for(const request of requests){
        cancelled(options.signal);
        if(controller.signal.aborted){pages.push({...request,text:undefined,status:'unavailable'});continue;}
        const {pageNumber,reason,text}=request;
        const source=pageSources.find(item=>item.pageNumber===pageNumber)?.file;
        if(!source){pages.push({pageNumber,reason,status:'source_unavailable'});continue;}
        // Avoid turning a large unreadable packet into an unbounded AI batch.
        if(attempted>=2){pages.push({pageNumber,reason,status:'limit_reached'});continue;}
        try{
          const image=await prepare(source,controller.signal);
          const hash=await digest(new TextEncoder().encode(image+'\n'+text));
          const imageHash=await digest(Uint8Array.from(atob(image.split(',')[1]),c=>c.charCodeAt(0)));
          const key=[user.user.id,config.version,config.model,hash].join(':');
          if(cache.has(key)){pages.push({pageNumber,reason,...cache.get(key)});continue;}
          attempted++;
          options.onProgress?.(.99,`AI checking document type · Page ${pageNumber}…`);
          const response=await fetcher('/api/reader/classify',{method:'POST',signal:controller.signal,cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+user.access_token},body:JSON.stringify({image,text,pageNumber})});
          const value=await response.json();
          cancelled(options.signal);
          if(!response.ok || value.ok!==true){
            const status=['not_configured','signed_out','limit_reached','invalid_ai_result'].includes(value.error)?value.error:'unavailable';
            pages.push({pageNumber,reason,status});
            // No retries or further paid requests after quota/auth/provider failure.
            for(const rest of requests.slice(pages.length))pages.push({pageNumber:rest.pageNumber,reason:rest.reason,status});
            break;
          }
          if(value.pageNumber!==pageNumber || !value.result || value.result.version!==AI_READER_VERSION || value.result.imageHash!==imageHash)throw new Error('invalid_ai_result');
          const {kind,certainty,quality,mixed,delivery,evidence}=value.result;
          const checked=validateAiClassification({kind,certainty,quality,mixed,delivery,evidence});
          const result={...checked,model:config.model,imageHash:typeof value.result.imageHash==='string'?value.result.imageHash:'',checkedAt:value.result.checkedAt};
          const entry={status:result.status,result};
          if(cache.size>=40)cache.delete(cache.keys().next().value);
          cache.set(key,entry);pages.push({pageNumber,reason,...entry});
        }catch(error){cancelled(options.signal);pages.push({pageNumber,reason,status:error.message==='invalid_ai_result'?'invalid_ai_result':'unavailable'});}
      }
      cancelled(options.signal);
      return finish(pages);
    }catch{cancelled(options.signal);return allStatus('unavailable');}
    finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
  };
}
