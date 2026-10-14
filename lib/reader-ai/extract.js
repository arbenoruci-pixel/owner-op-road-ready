import {AI_READER_LIMITS,withAiAbort} from './diagnostics.js';
import {AI_EXTRACTION_VERSION,AI_EXTRACTION_LIMITS,extractionFields,skippedAiExtraction,validateAiExtractionResponse,admitAiExtractionCandidates} from './extraction.js';

const cancelled=signal=>{if(signal?.aborted)throw new DOMException('Extraction cancelled','AbortError');};
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
const safeStatus=status=>['not_configured','offline','signed_out','limit_reached','invalid_ai_result','timed_out','source_unavailable','page_too_large'].includes(status)?status:'unavailable';
const copyCandidate=candidate=>JSON.parse(JSON.stringify(candidate));
export function missingAiFields(group){return extractionFields(group?.kind,Object.entries(group?.fields||{}).filter(([,field])=>['missing','needs_review'].includes(field.status)).map(([key])=>key));}

// Invoked only by the explicit page action, never by automatic classification.
// Requests across all groups in the same scan share this in-memory ledger;
// existing server auth, quota and provider budget remain the final guard.
export function createAiExtraction({session,prepare,fetcher=fetch,online=()=>true,setTimer=setTimeout,clearTimer=clearTimeout}) {
  const ledger=new WeakMap(),pending=new WeakSet(),cache=new Map();
  return async function extract({analysis,result,groupId,pageId,sourceImageId,file,signal,previous=result?.aiExtraction || analysis?.aiExtraction}={}) {
    cancelled(signal);
    const base=previous || skippedAiExtraction(),group=result?.documents?.find(item=>item.id===groupId),page=result?.pages?.find(item=>item.id===pageId);
    let model=null,attempted=false,timedOut=false,text='',fullText='',imageHash='';
    const priorAttempts=Math.max(Number(base.attemptedPageCount)||0,ledger.get(analysis)||0);
    const reasonEntry=(status,extra={})=>({pageId,pageNumber:page?.number,groupId,status,attempted,model,...extra});
    const finish=(status,{candidates=[],rejected=[],cached=false}={})=>{
      const completed=status==='needs_review';
      const retained=(base.candidates||[]).filter(candidate=>!completed || candidate.groupId!==groupId || candidate.provenance?.providerImage?.pageId!==pageId).map(copyCandidate);
      return {...skippedAiExtraction(status),state:completed?'attempted':attempted||['unavailable','timed_out','invalid_ai_result'].includes(status)?'error':'skipped',reason:completed?candidates.length?'source_linked_candidates':'no_source_linked_candidates':status,
        model,modelStatus:model?'reported':'not_used',limits:{...AI_EXTRACTION_LIMITS,...AI_READER_LIMITS},
        attemptedPageCount:Math.max(priorAttempts,ledger.get(analysis)||0),candidates:[...retained,...candidates],
        pages:[...(base.pages||[]).filter(item=>item.pageId!==pageId || item.groupId!==groupId),reasonEntry(status,{cached,candidatesCount:candidates.length,rejectedCount:rejected.length,rejections:rejected,
          textCharactersRead:fullText.length,textCharactersSent:attempted?text.length:0,textTruncated:fullText.length>AI_READER_LIMITS.maxTextCharacters})]};
    };
    if(!analysis||typeof analysis!=='object'||!result?.documentId||!group||!page||!group.pageIds.includes(pageId)||!file||sourceImageId!==`${result.documentId}:${page.id}:original`||!page.observations?.some(o=>o.sourceImageId===sourceImageId))return finish('source_unavailable');
    const fields=missingAiFields(group);
    if(!fields.length)return finish('no_missing_fields');
    if(group.boundaryReview || !['supported','confirmed'].includes(group.identityStatus))return finish('type_review_required');
    if(!Number.isInteger(page.number)||page.number<1||page.number>AI_READER_LIMITS.maxPageNumber)return finish('page_limit');
    if(pending.has(analysis))return finish('already_running');
    if(!online())return finish('offline');
    const classificationAttempts=Number(analysis.aiClassification?.attemptedPageCount)||0;
    if(priorAttempts+classificationAttempts>=AI_READER_LIMITS.maxRequestsPerScan)return finish('limit_reached');
    pending.add(analysis);
    const controller=new AbortController(),abort=()=>controller.abort();
    signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimer(()=>{timedOut=true;abort();},AI_READER_LIMITS.serverTimeoutMs);
    const bounded=work=>withAiAbort(work,controller.signal);
    try{
      const available=await bounded(()=>fetcher('/api/reader/classify',{signal:controller.signal,cache:'no-store'}));
      if(!available.ok)return finish('unavailable');
      const config=await bounded(()=>available.json());
      if(config.enabled!==true)return finish('not_configured');
      if(typeof config.model!=='string'||!config.model||config.extraction?.version!==AI_EXTRACTION_VERSION)return finish('unavailable');
      model=config.model;
      const user=await bounded(()=>session(controller.signal));
      if(!user?.access_token||!user?.user?.id)return finish('signed_out');
      fullText=page.observations.filter(o=>o.source!=='ai'&&!o.id?.includes('detail')).map(o=>(o.lines||[]).map(line=>line.text).join('\n')).join('\n');
      text=fullText.slice(0,AI_READER_LIMITS.maxTextCharacters);
      const image=await bounded(()=>prepare(file,controller.signal));
      imageHash=await bounded(()=>digest(Uint8Array.from(atob(image.split(',')[1]),char=>char.charCodeAt(0))));
      const key=await bounded(()=>digest(new TextEncoder().encode(JSON.stringify([user.user.id,model,AI_EXTRACTION_VERSION,imageHash,text,group.kind,fields]))));
      let responseValue=cache.get(key),cached=Boolean(responseValue);
      if(!responseValue){
        cancelled(signal);
        if(controller.signal.aborted)throw new DOMException('Timed out','AbortError');
        ledger.set(analysis,priorAttempts+1);attempted=true;
        const response=await bounded(()=>fetcher('/api/reader/classify',{method:'POST',signal:controller.signal,cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+user.access_token},body:JSON.stringify({operation:'extract',kind:group.kind,fields,pageNumber:page.number,image,text})}));
        const payload=await bounded(()=>response.json());
        if(!response.ok || payload.ok!==true)return finish(safeStatus(payload.error));
        if(payload.pageNumber!==page.number || payload.result?.version!==AI_EXTRACTION_VERSION || payload.result?.model!==model || payload.result?.imageHash!==imageHash)throw new Error('invalid_ai_result');
        responseValue=payload.result;
        // Do not cache unvalidated provider values.
        validateAiExtractionResponse({kind:responseValue.kind,quality:responseValue.quality,candidates:responseValue.candidates.map(({field,rawValue,quote,location})=>({field,rawValue,quote,location}))},{kind:group.kind,fields});
        if(cache.size>=40)cache.delete(cache.keys().next().value);
        cache.set(key,responseValue);cached=payload.cached===true;
      }
      cancelled(signal);
      const admitted=admitAiExtractionCandidates(responseValue,{documentId:result.documentId,groupId,page,sourceImageId,model,imageHash,fields});
      return finish('needs_review',{...admitted,cached});
    }catch(error){cancelled(signal);return finish(timedOut?'timed_out':safeStatus(error.message==='invalid_ai_extraction'?'invalid_ai_result':error.message));}
    finally{clearTimer(timer);signal?.removeEventListener('abort',abort);pending.delete(analysis);}
  };
}
