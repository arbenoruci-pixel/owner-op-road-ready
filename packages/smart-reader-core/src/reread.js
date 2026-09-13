import {readDocument} from './engine.js';
import {buildRereadRequests} from './review.js';

function checkAbort(signal){if(signal?.aborted)throw new DOMException('Reading cancelled','AbortError');}

// A host resolves sourceImageId to original pixels and supplies a recognizer.
// The core owns no network, image cache, credentials or capture loop.
export async function rereadRegions(result, recognizer, {signal,maxRegions=8}={}) {
  if(!recognizer?.id||typeof recognizer.recognizeRegion!=='function')throw new Error('A named region recognizer is required');
  if(!Number.isInteger(maxRegions)||maxRegions<1||maxRegions>32)throw new Error('Read 1 to 32 regions at a time');
  if(result.corrections.length)throw new Error('Export confirmed corrections before starting a new reading');
  const pages=structuredClone(result.pages),requests=buildRereadRequests(result),failures=[];
  for(const [i,request] of requests.slice(0,maxRegions).entries()){
    checkAbort(signal);
    try{
      const output=await recognizer.recognizeRegion({...request,signal});
      checkAbort(signal);
      if(typeof output?.text!=='string'||!output.text.trim()||/[\r\n]/.test(output.text))throw new Error('invalid_region_text');
      const page=pages.find(p=>p.id===request.pageId);
      if(page.observations.length>=12)throw new Error('observation_limit');
      let id=`region-${i+1}`;while(page.observations.some(o=>o.id===id))id+='-next';
      page.observations.push({id,source:recognizer.id,sourceImageId:request.sourceImageId,
        lines:[{id:'line-1',text:output.text,box:{...request.box},confidence:null}]});
    }catch(error){
      checkAbort(signal);
      failures.push({pageId:request.pageId,field:request.field,code:'region_read_failed'});
    }
  }
  checkAbort(signal);
  const next=readDocument({documentId:result.documentId,pages});
  return {...next,reread:{requested:requests.length,attempted:Math.min(requests.length,maxRegions),failures}};
}
