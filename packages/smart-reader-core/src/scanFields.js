import {resolveEvidence} from './input.js';

const mapping={bolNo:'bolNumber',shipper:'shipper',consignee:'consignee',carrierName:'carrier',trailerNo:'trailerNumber',
  poNumber:'poNumber',documentDate:'documentDate',weight:'weight',netWeight:'netWeight',tareWeight:'tareWeight'};
const referenceKinds={bolNo:'bol_number',poNumber:'po_number',trailerNo:'trailerNo'};
const aliases={shipper:'origin',consignee:'destination',documentDate:'date'};
const bolWarning='BOL number was not verified from its label. Check the original.';
const dateWarning='Document date was not read. Enter it after checking the original.';
const layoutWarning='Some fields could not be verified beside their labels. Check Reader preview and the original.';

// Derive the filing display from this exact scan's current source review.
// The raw analysis and review stay immutable; load assignment and duty links
// remain the driver's choices. Source support never means automatic filing.
export function scanWithSourceFields(analysis,review,selectedType){
  if(!analysis||review?.analysis!==analysis||!['bol','pod'].includes(selectedType))return analysis;
  const result=review.result,doc=result?.documents?.[0];
  if(result?.engine!=='owned-smart-reader'||result.documents.length!==1||doc.kind!==selectedType
    ||analysis.typeEvidenceV110334?.mixedDocuments)return analysis;
  const fields={...analysis.fields},fieldEvidence={...analysis.fieldEvidence},fieldConfidence={...analysis.fieldConfidence};
  const oldReview=analysis.evidenceReviewV11036||{},evidence={...oldReview.evidence},accepted=[],proofs={};
  for(const [key,ownedKey]of Object.entries(mapping)){
    const field=doc.fields[ownedKey];if(!field)continue;
    const alias=aliases[key],replaceAlias=alias&&fields[alias]===fields[key];
    if(replaceAlias){delete fields[alias];delete fieldEvidence[alias];delete fieldConfidence[alias];delete evidence[alias];}
    delete fields[key];delete fieldEvidence[key];delete fieldConfidence[key];delete evidence[key];
    if(key==='weight'){delete fields.weightUnit;delete fieldEvidence.weightUnit;delete evidence.weightUnit;}
    if(!['supported','confirmed'].includes(field.status)||typeof field.value!=='string'||!field.value)continue;
    const pageSource=field.status==='confirmed'&&field.correction?.sourcePage;
    const validPage=pageSource&&doc.pageIds.includes(pageSource.pageId)&&result.pages.some(page=>page.id===pageSource.pageId
      &&page.observations.some(observation=>observation.sourceImageId&&observation.sourceImageId===pageSource.sourceImageId));
    const references=field.correction?.evidence?[field.correction.evidence]:(field.candidates||[])
      .filter(candidate=>candidate.value===field.value).flatMap(candidate=>[...candidate.evidence,...(candidate.continuationEvidence||[])]);
    const valid=references.filter(ref=>{try{return doc.pageIds.includes(ref.pageId)&&!!resolveEvidence(result,ref);}catch{return false;}});
    if(!valid.length&&!validPage)continue;
    fields[key]=field.value;accepted.push(key);
    if(replaceAlias)fields[alias]=field.value;
    proofs[key]={status:field.status,value:field.value,evidence:valid,...(validPage?{sourcePage:pageSource}:{})};
    evidence[key]=fieldEvidence[key]={fieldLabel:field.label,value:field.value,source:field.status==='confirmed'?'driver_confirmed':'document_text',
      status:field.status==='confirmed'?'confirmed':'read',excerpt:[...new Set(valid.map(ref=>ref.quote))].join('\n').slice(0,350)};
  }
  fields.references=(Array.isArray(fields.references)?fields.references:[]).filter(ref=>!Object.values(referenceKinds).includes(ref.kind));
  for(const key of accepted)if(referenceKinds[key])fields.references.push({kind:referenceKinds[key],value:fields[key],source:'reader_source'});
  fields.readerSourceFieldsV110393={engineVersion:result.engineVersion,documentId:result.documentId,reviewRevision:result.reviewRevision,fields:proofs};
  const removed=(analysis.layoutGuardV110337?.removedFields||[]).filter(key=>!accepted.includes(key));
  const issues=(oldReview.issues||[]).filter(issue=>!(issue===bolWarning&&accepted.includes('bolNo')
    ||issue===dateWarning&&accepted.includes('documentDate')||issue===layoutWarning&&analysis.layoutGuardV110337&&!removed.length));
  if(!fields.bolNo&&!issues.includes(bolWarning))issues.push(bolWarning);
  return {...analysis,fields,fieldEvidence,fieldConfidence,needsReview:true,routing:{...analysis.routing,autoFile:false},
    ...(analysis.layoutGuardV110337?{layoutGuardV110337:{...analysis.layoutGuardV110337,removedFields:removed}}:{}),
    evidenceReviewV11036:{...oldReview,evidence,issues}};
}
