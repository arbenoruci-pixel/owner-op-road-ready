import {createAiFallback} from '../../../../lib/reader-ai/fallback.js';
import {cloudSession} from '../../../../lib/owner-op-cloud/client.js';
import {reviewScanAnalysis} from './ownedReaderAdapter.js';
import {retainedReviewPageSources} from './readerPageSourcesV110373.js';
import {decodeImageFileV3,imageDataToFileV3} from './v3/imageUtilsV3.js';

function withAbort(promise,signal){
  return new Promise((resolve,reject)=>{
    const abort=()=>{cleanup();reject(new DOMException('AI check cancelled','AbortError'));};
    const timeout=setTimeout(abort,6000),cleanup=()=>{clearTimeout(timeout);signal?.removeEventListener('abort',abort);};
    if(signal?.aborted){abort();return;}
    signal?.addEventListener('abort',abort,{once:true});
    promise.then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
  });
}

export function aiPageSources(analysis,file,options={}){
  const combined={...analysis,scanMeta:{...options.scanMeta,...analysis.scanMeta}};
  const result=retainedReviewPageSources(combined);
  const total=Math.max(analysis.pageCount||0,analysis.pageReadingV110328?.total||0,combined.scanMeta.pageFiles?.length||0,1);
  if(total===1 && !result.length && file instanceof Blob && file.type.startsWith('image/'))result.push({pageNumber:1,file});
  // Never send a cropped identifier/signature region as the whole page.
  for(const pass of analysis.ocrEvidenceV110323||[]){
    if(pass.scope==='region' || !/-source-page$/.test(pass.id||'') || !(pass.sourceImageFile instanceof Blob) || result.some(p=>p.pageNumber===pass.page))continue;
    result.push({pageNumber:pass.page,file:pass.sourceImageFile});
  }
  return result;
}

export async function prepareAiPage(file,signal){
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  const pixels=await decodeImageFileV3(file,{maxDimension:1800});
  const image=await imageDataToFileV3(pixels,'document-ai-page.jpg',.85);
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  if(image.size>2_000_000)throw new Error('page_too_large');
  return new Promise((resolve,reject)=>{
    const reader=new FileReader(),abort=()=>reader.abort(),cleanup=()=>signal?.removeEventListener('abort',abort);
    reader.onload=()=>{cleanup();resolve(reader.result);};
    reader.onerror=()=>{cleanup();reject(new Error('image_unavailable'));};
    reader.onabort=()=>{cleanup();reject(new DOMException('Cancelled','AbortError'));};
    signal?.addEventListener('abort',abort,{once:true});reader.readAsDataURL(image);
  });
}

export const assistDocumentClassification = createAiFallback({
  identify:reviewScanAnalysis,sources:aiPageSources,
  session:signal=>withAbort(cloudSession(),signal),prepare:prepareAiPage,
  online:()=>typeof navigator!=='undefined'&&navigator.onLine!==false,
});
