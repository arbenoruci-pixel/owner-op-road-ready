import {fieldsForProfile} from './engine.js';
import {PROFILES,normalizeValue} from './profiles.js';
import {validateInvoice,validateUnloadingReceipt} from './validation.js';

export const reviewKinds=PROFILES.map(({id,label})=>({id,label}));
const checks=group=>group.kind==='invoice'?validateInvoice(group.fields):group.kind==='unloading_receipt'?validateUnloadingReceipt(group.fields):[];
function target(result,{documentId,groupId,expectedRevision,userConfirmed}){
  if(documentId!==result.documentId||userConfirmed!==true)throw new Error('Confirm the current document first.');
  if(expectedRevision!==result.reviewRevision)throw new Error('The reading changed. Open the field again.');
  const group=result.documents.find(d=>d.id===groupId);
  if(!group)throw new Error('Document unavailable.');
  return group;
}
function pageSource(result,group,{pageId,sourceImageId}){
  const page=result.pages.find(p=>p.id===pageId);
  if(!group.pageIds.includes(pageId)||!page?.observations.some(o=>o.sourceImageId===sourceImageId&&sourceImageId))throw new Error('Open a source page belonging to this document.');
  return {pageId,pageNumber:page.number,sourceImageId,boxScope:'page'};
}
// A human can fill a missing field from the image. No synthetic OCR quote or
// confidence is created, and it never changes a load assignment.
export function confirmPageField(result,request){
  const group=target(result,request),field=group.fields[request.field];
  if(!field)throw new Error('Unknown field.');
  const sourcePage=pageSource(result,group,request);
  if(typeof request.rawValue!=='string')throw new Error('Enter the value shown on the page.');
  const normalized=normalizeValue(field.kind,request.rawValue);
  if(normalized.value===null)throw new Error('Check the value. Use YYYY-MM-DD for dates and include the unit for weight.');
  const next=structuredClone(result),updated=next.documents.find(d=>d.id===group.id);
  const correction={documentId:result.documentId,groupId:group.id,field:request.field,rawValue:request.rawValue,value:normalized.value,sourceQuote:null,sourcePage,confirmed:true,origin:'human',trainingEligible:false};
  next.corrections.push(correction);next.reviewRevision++;
  updated.fields[request.field]={...updated.fields[request.field],value:normalized.value,status:'confirmed',issues:[],correction};
  updated.checks=checks(updated);updated.canAutoFile=false;updated.requiresReview=true;
  return next;
}
export function confirmDocumentKind(result,request){
  const group=target(result,request),profile=PROFILES.find(p=>p.id===request.kind);
  if(!profile)throw new Error('Choose a supported document type.');
  const sourcePage=pageSource(result,group,request);
  if(group.kind===request.kind)return result;
  if(Object.values(group.fields).some(f=>f.status==='confirmed'))throw new Error('This document already has confirmed fields. Keep its current type.');
  const next=structuredClone(result),updated=next.documents.find(d=>d.id===group.id);
  Object.assign(updated,{kind:profile.id,label:profile.label,identityStatus:'confirmed',fields:fieldsForProfile(result.pages.filter(p=>group.pageIds.includes(p.id)),profile.id),requiresReview:true,canAutoFile:false});
  updated.checks=checks(updated);
  updated.typeCorrection={kind:profile.id,sourcePage,origin:'human',confirmed:true,trainingEligible:false};
  next.reviewRevision++;
  return next;
}
export function reviewQueue(result){
  return result.documents.flatMap(group=>group.kind==='unknown'?[{groupId:group.id,key:null}]:Object.entries(group.fields).filter(([key,f])=>f.status==='needs_review'||f.status==='missing'&&(f.required||/date/i.test(key))).map(([key])=>({groupId:group.id,key})));
}
// Compact, page-scoped review saved beside the original. Excludes images and
// full OCR transcripts; unresolved candidates remain explicitly unconfirmed.
export function savedReadingReview(result){
  if(!result)return null;
  return {version:1,engineVersion:result.engineVersion,reviewRevision:result.reviewRevision,pageCount:result.pageCount,
    documents:result.documents.map(g=>({id:g.id,kind:g.kind,label:g.label,pages:g.pageIds.map(id=>result.pages.find(p=>p.id===id).number),typeCorrection:g.typeCorrection||null,fields:Object.fromEntries(Object.entries(g.fields).filter(([,f])=>f.status==='confirmed').map(([key,f])=>[key,{label:f.label,value:f.value,correction:f.correction}])),checks:g.checks})),
    remaining:reviewQueue(result).length,trainingEligible:false};
}

// Generic invoice review does not imply a trucking carrier invoice.
export function filingTypeForReview(summary){
  if(summary?.documents?.length!==1||!summary.documents[0].typeCorrection)return null;
  return ({bol:'bol',unloading_receipt:'lumper_receipt',invoice:'other'})[summary.documents[0].kind]??null;
}
