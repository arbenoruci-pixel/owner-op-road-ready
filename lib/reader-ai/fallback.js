import {AI_READER_VERSION, aiClassificationReason, validateAiClassification} from './policy.js';
import {AI_READER_LIMITS,classificationDiagnostic,withAiAbort} from './diagnostics.js';
import {skippedAiExtraction} from './extraction.js';
import {boundedOcrContext} from './ocrContext.js';

const cancelled = signal => {if(signal?.aborted)throw new DOMException('Scan cancelled','AbortError');};
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
const successful = new Set(['suggested','needs_review']);
const safeError = error => ['not_configured','signed_out','limit_reached','invalid_ai_result','timed_out','page_too_large','source_unavailable'].includes(error)?error:'unavailable';

// Page-specific classification only. Even a skipped stage is recorded, and
// extraction remains a separate explicitly unimplemented stage. Neither stage
// overwrites local fields, confirms evidence, or files documents.
export function createAiFallback({identify,sources,session,prepare,fetcher=fetch,online=()=>true,setTimer=setTimeout,clearTimer=clearTimeout}) {
  const cache=new Map();
  return async function assist(analysis,file,options={}) {
    cancelled(options.signal);
    let aiSourcePages=analysis.aiSourcePages || [],model=null,modelStatus='not_checked',requests=[],skippedPages=[],pageCount=analysis.pageCount || 0;
    const finish=(pages,reason=null)=>({...analysis,aiSourcePages,
      aiClassification:classificationDiagnostic({pages,skippedPages,model,modelStatus,reason,pageCount}),
      aiExtraction:skippedAiExtraction(),...(requests.length?{needsReview:true}:{})});
    if(options.preferredType && options.preferredType!=='auto' || analysis.userSelectedTypeV11036)return finish([],'user_selected_type');
    let review;
    try {review=identify(analysis);if(!Array.isArray(review.pages)||!Array.isArray(review.pageIdentities))throw new Error('invalid_local_analysis');}
    catch {return finish([],'invalid_local_analysis');}
    pageCount=review.pages.length;
    for(const page of review.pages){
      const identity=review.pageIdentities.find(item=>item.pageId===page.id);
      // Source-linked RateCon continuation belongs to a local document. It
      // need not repeat the primary page's rate table to remain local.
      const continuation=identity?.kind==='unknown'&&identity.status!=='conflicting'&&review.documents?.some(doc=>
        doc.kind==='rate_confirmation'&&doc.reference&&doc.pageIds.length>1&&doc.pageIds.includes(page.id));
      const text=(page.observations||[]).filter(o=>!o.id?.includes('detail')).map(o=>(o.lines||[]).map(line=>line.text).join('\n')).join('\n');
      const reason=continuation?null:aiClassificationReason(identity,text);
      // Evaluate all local text before applying the provider context cap.
      if(reason)requests.push({pageNumber:page.number,reason,text:boundedOcrContext((page.observations||[]).filter(o=>!o.id?.includes('detail')),AI_READER_LIMITS.maxTextCharacters),textCharactersRead:text.length});
      else skippedPages.push({pageNumber:page.number,state:'skipped',attempted:false,reason:continuation?'source_linked_continuation':identity?.status==='confirmed'?'human_confirmed_type':'supported_local_type'});
    }
    if(!requests.length)return finish([],'supported_local_type');
    const entry=(request,status,extra={})=>({pageNumber:request.pageNumber,reason:request.reason,status,
      state:successful.has(status)?'attempted':extra.attempted || ['unavailable','timed_out','invalid_ai_result','invalid_configuration'].includes(status)?'error':'skipped',
      attempted:false,cached:false,textCharactersRead:request.textCharactersRead,textCharactersSent:0,
      textTruncated:request.textCharactersRead>AI_READER_LIMITS.maxTextCharacters,...extra});
    const allStatus=status=>finish(requests.map(request=>entry(request,status)),status);
    if(!online())return allStatus('offline');
    const controller=new AbortController(),abort=()=>controller.abort();
    options.signal?.addEventListener('abort',abort,{once:true});
    let timedOut=false;
    const timer=setTimer(()=>{timedOut=true;abort();},AI_READER_LIMITS.scanTimeoutMs);
    const bounded=work=>withAiAbort(work,controller.signal);
    const pages=[];
    const remainder=status=>{for(const request of requests.slice(pages.length))pages.push(entry(request,status,{blockedByPriorPage:true}));};
    try{
      const available=await bounded(()=>fetcher('/api/reader/classify',{signal:controller.signal,cache:'no-store'}));
      if(!available.ok){modelStatus='unavailable';return allStatus('unavailable');}
      const config=await bounded(()=>available.json());
      if(config.enabled!==true){modelStatus='not_configured';return allStatus('not_configured');}
      if(typeof config.model!=='string' || !config.model || config.version!==AI_READER_VERSION){modelStatus='unavailable';return allStatus('invalid_configuration');}
      model=config.model;modelStatus='reported';
      const user=await bounded(()=>session(controller.signal));
      if(!user?.access_token || !user?.user?.id)return allStatus('signed_out');
      const pageSources=sources(analysis,file,options);
      aiSourcePages=pageSources.filter(source=>requests.some(request=>request.pageNumber===source.pageNumber));
      let attempted=0;
      for(const request of requests){
        cancelled(options.signal);
        if(controller.signal.aborted){remainder(timedOut?'timed_out':'unavailable');break;}
        const {pageNumber,reason,text}=request;
        if(!Number.isInteger(pageNumber)||pageNumber<1||pageNumber>AI_READER_LIMITS.maxPageNumber){pages.push(entry(request,'page_limit'));continue;}
        const source=pageSources.find(item=>item.pageNumber===pageNumber)?.file;
        if(!source){pages.push(entry(request,'source_unavailable'));continue;}
        if(attempted>=AI_READER_LIMITS.maxRequestsPerScan){pages.push(entry(request,'limit_reached'));continue;}
        let dispatched=false;
        try{
          const image=await bounded(()=>prepare(source,controller.signal));
          const hash=await bounded(()=>digest(new TextEncoder().encode(image+'\n'+text)));
          const imageHash=await bounded(()=>digest(Uint8Array.from(atob(image.split(',')[1]),c=>c.charCodeAt(0))));
          const key=[user.user.id,config.version,config.model,hash].join(':');
          if(cache.has(key)){pages.push(entry(request,cache.get(key).status,{...cache.get(key),cached:true}));continue;}
          cancelled(options.signal);
          if(controller.signal.aborted)throw new DOMException('AI check timed out','AbortError');
          attempted++;dispatched=true;
          options.onProgress?.(.99,`AI checking document type · Page ${pageNumber}…`);
          const response=await bounded(()=>fetcher('/api/reader/classify',{method:'POST',signal:controller.signal,cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+user.access_token},body:JSON.stringify({image,text,pageNumber})}));
          const value=await bounded(()=>response.json());
          cancelled(options.signal);
          if(!response.ok || value.ok!==true){
            const status=safeError(value.error);
            const outputIssue=['token_limit','refused_output','incomplete_output','invalid_json','invalid_schema'].includes(value.diagnostic?.outputIssue)?value.diagnostic.outputIssue:null;
            pages.push(entry(request,status,{attempted:true,textCharactersSent:text.length,...(outputIssue?{outputIssue}:{})}));
            remainder(status);break;
          }
          if(value.pageNumber!==pageNumber || !value.result || value.result.version!==AI_READER_VERSION || value.result.imageHash!==imageHash || value.result.model!==undefined && value.result.model!==config.model)throw new Error('invalid_ai_result');
          const {kind,certainty,quality,mixed,delivery,evidence}=value.result;
          const checked=validateAiClassification({kind,certainty,quality,mixed,delivery,evidence});
          const result={...checked,model:config.model,imageHash,checkedAt:value.result.checkedAt};
          const saved={status:result.status,result};
          if(cache.size>=40)cache.delete(cache.keys().next().value);
          cache.set(key,saved);pages.push(entry(request,result.status,{...saved,attempted:true,textCharactersSent:text.length,cached:value.cached===true}));
        }catch(error){
          cancelled(options.signal);
          const status=timedOut?'timed_out':safeError(error.message);
          pages.push(entry(request,status,{attempted:dispatched,textCharactersSent:dispatched?text.length:0}));
          // A failed provider request must not trigger additional paid calls.
          if(dispatched||controller.signal.aborted){remainder(status);break;}
        }
      }
      cancelled(options.signal);
      return finish(pages);
    }catch{
      cancelled(options.signal);
      const status=timedOut?'timed_out':'unavailable';
      if(!pages.length)return allStatus(status);
      remainder(status);return finish(pages,status);
    }
    finally{clearTimer(timer);options.signal?.removeEventListener('abort',abort);}
  };
}
