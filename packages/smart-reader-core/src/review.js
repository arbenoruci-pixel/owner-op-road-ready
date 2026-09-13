import {resolveEvidence} from './input.js';
import {normalizeValue} from './profiles.js';
import {validateInvoice} from './validation.js';

export function buildRereadRequests(result) {
  const requests=[];
  for(const document of result.documents) for(const [key,field] of Object.entries(document.fields)){
    if(field.status!=='needs_review')continue;
    for(const candidate of field.candidates) for(const evidence of candidate.evidence){
      const {line,observation}=resolveEvidence(result,evidence);
      const signature=JSON.stringify([evidence.pageId,observation.sourceImageId,line.box]);
      if(!line.box||!observation.sourceImageId||requests.some(r=>r.signature===signature))continue;
      requests.push({signature,documentId:result.documentId,groupId:document.id,field:key,pageId:evidence.pageId,
        sourceImageId:observation.sourceImageId,box:{...line.box},boxScope:'line',reason:field.issues.join(', ')});
    }
  }
  return requests.map(({signature,...request})=>request);
}

export function confirmField(result, {documentId,groupId,field:key,rawValue,evidence,userConfirmed,expectedRawValues,expectedRevision}) {
  if(documentId!==result.documentId||userConfirmed!==true)throw new Error('Explicit confirmation for this document is required');
  if(expectedRevision!==result.reviewRevision)throw new Error('Review changed; confirm the latest revision');
  const group=result.documents.find(d=>d.id===groupId),field=group?.fields[key];
  if(!field)throw new Error('Unknown document field');
  if(JSON.stringify(expectedRawValues)!==JSON.stringify(field.candidates.map(c=>c.rawValue)))throw new Error('Reading changed; review the current candidates');
  const {page}=resolveEvidence(result,evidence);
  if(!group.pageIds.includes(page.id))throw new Error('Evidence belongs to another document');
  if(!field.candidates.some(c=>c.evidence.some(e=>JSON.stringify(e)===JSON.stringify(evidence))))throw new Error('Select evidence belonging to this field');
  if(typeof rawValue!=='string')throw new Error('A field value is required');
  const normalized=normalizeValue(field.kind,rawValue);
  if(normalized.value===null)throw new Error('Corrected value is ambiguous or invalid');
  const next=structuredClone(result);
  const target=next.documents.find(d=>d.id===groupId);
  const correction={documentId,groupId,field:key,sourceQuote:evidence.quote,rawValue,value:normalized.value,
    evidence:structuredClone(evidence),confirmed:true,origin:'human',trainingEligible:false};
  next.corrections.push(correction);
  next.reviewRevision++;
  target.fields[key]={...target.fields[key],status:'confirmed',value:normalized.value,correction,
    // Arithmetic must be checked again after edits; previous passes are stale.
    issues:[]};
  if(target.kind==='invoice')target.checks=validateInvoice(target.fields);
  target.requiresReview=true;target.canAutoFile=false;
  return next;
}

// Export is explicit. Human confirmation alone does not consent to model training.
export function exportCorrections(result, {allowTraining=false}={}) {
  return result.corrections.map(c=>({...structuredClone(c),engineVersion:result.engineVersion,validationChecks:structuredClone(result.documents.find(d=>d.id===c.groupId)?.checks||[]),trainingEligible:allowTraining===true}));
}
