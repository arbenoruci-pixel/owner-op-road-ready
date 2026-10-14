import {AI_READER_VERSION} from './policy.js';
import {skippedAiExtraction} from './extraction.js';

// Public limits describe the existing classification budget, not a new grant
// to send extra pages or perform extraction. Keep browser/server limits equal.
export const AI_READER_LIMITS = Object.freeze({
  maxRequestsPerScan:4, maxPageNumber:200, maxTextCharacters:6000,
  maxImageBytes:2_000_000, maxImageDimension:1800, maxRequestBytes:2_900_000,
  maxOutputTokens:1200, serverTimeoutMs:25000, scanTimeoutMs:110000,
});
const errors = new Set(['unavailable','timed_out','invalid_ai_result','invalid_local_analysis','invalid_configuration']);
export function classificationDiagnostic({pages=[],skippedPages=[],model=null,modelStatus=model?'reported':'not_checked',reason=null,pageCount=0}={}) {
  const attemptedPageCount=pages.filter(page=>page.attempted===true).length;
  const completedPageCount=pages.filter(page=>page.result).length;
  const errorCount=pages.filter(page=>errors.has(page.status) || page.attempted===true && !page.result).length;
  const state=errorCount || errors.has(reason)?'error':attemptedPageCount || completedPageCount?'attempted':'skipped';
  return {stage:'classification',state,reason:reason || (errorCount?'page_errors':completedPageCount?'completed':attemptedPageCount?'no_result':'not_needed'),
    version:AI_READER_VERSION,model,modelStatus,limits:{...AI_READER_LIMITS},pageCount,
    selectedPageCount:pages.length,attemptedPageCount,completedPageCount,
    cachedPageCount:pages.filter(page=>page.cached===true).length,pages,skippedPages,
    origin:'ai',verified:false,requiresReview:true,canAutoFile:false};
}

// Old scans or an interrupted/unwired stage must not export an unexplained
// null. Do not claim that an older scan ran either AI stage.
export function aiReadingDiagnostics(analysis={}) {
  const previous=analysis.aiClassification;
  let aiClassification=previous || classificationDiagnostic({reason:'not_run',pageCount:analysis.pageCount || 0});
  if(previous && !previous.state){
    const pages=(previous.pages || []).map(page=>({...page,attempted:page.attempted===true,cached:page.cached===true,attemptHistory:'not_recorded'}));
    const models=[...new Set(pages.map(page=>page.result?.model).filter(Boolean))];
    aiClassification=classificationDiagnostic({pages,reason:'legacy_diagnostics_unavailable',pageCount:analysis.pageCount || 0,model:models.length===1?models[0]:null,modelStatus:models.length===1?'reported':'not_recorded'});
    aiClassification.version=previous.version || AI_READER_VERSION;
    aiClassification.limitsSource='current_policy_not_legacy_measurement';
  }
  return {aiClassification,aiExtraction:analysis.aiExtraction || skippedAiExtraction()};
}

// Deadline enforcement must also settle when a dependency ignores AbortSignal.
// Passing a thunk prevents work from starting after the deadline/cancellation.
export function withAiAbort(work,signal) {
  return new Promise((resolve,reject)=>{
    const abort=()=>{cleanup();reject(new DOMException('AI check cancelled','AbortError'));};
    const cleanup=()=>signal?.removeEventListener('abort',abort);
    if(signal?.aborted){abort();return;}
    signal?.addEventListener('abort',abort,{once:true});
    Promise.resolve().then(()=>{if(signal?.aborted)throw new DOMException('AI check cancelled','AbortError');return work();})
      .then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
  });
}
