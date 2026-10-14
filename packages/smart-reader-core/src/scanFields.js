import {resolveEvidence} from './input.js';
import {isDocumentParty} from './fieldGuards.js';
import {isNumberedRateTable} from './numberedRate.js';
import {hasRateStructure} from './rateVocabulary.js';
import {documentReferences} from './documentReference.js';

const mapping={bolNo:'bolNumber',shipper:'shipper',consignee:'consignee',carrierName:'carrier',trailerNo:'trailerNumber',
  poNumber:'poNumber',documentDate:'documentDate',weight:'weight',netWeight:'netWeight',tareWeight:'tareWeight',totalUnits:'totalUnits',temperature:'temperature'};
const referenceKinds={bolNo:'bol_number',poNumber:'po_number',trailerNo:'trailerNo'};
const aliases={shipper:'origin',consignee:'destination',documentDate:'date'};
const bolWarning='BOL number was not verified from its label. Check the original.';
const dateWarning='Document date was not read. Enter it after checking the original.';
const payWarning='Agreed carrier pay was not found under a payment label. Fees and detention amounts are excluded.';
const layoutWarning='Some fields could not be verified beside their labels. Check Reader preview and the original.';

// A certificate may accompany one RateCon without supplying any load fields.
// Require an exact, strong envelope match; mixed or unlinked packets stay guarded.
function linkedRateCertificates(result,doc){
  if(doc?.kind!=='rate_confirmation')return false;
  const primaryRefs=documentReferences(result.pages.filter(page=>doc.pageIds.includes(page.id))),refs=documentReferences(result.pages);
  if(!primaryRefs.length||new Set(refs.map(ref=>ref.value)).size!==1||refs.some(ref=>ref.line.confidence!==null&&ref.line.confidence<.8))return false;
  return result.documents.every(other=>other===doc||other.kind==='signing_certificate'&&other.role==='supporting'
    &&other.fields.documentReference?.status==='supported'&&other.fields.documentReference.value===refs[0].value);
}

const sourceKinds={load_invoice:'invoice',lumper_receipt:'unloading_receipt'};
const sourceKeys={invoiceNumber:'invoiceNo',receiptNumber:'receiptNo',bolNumber:'bolNo',loadNumber:'loadNo',trailerNumber:'trailerNo',carrier:'carrierName',vendor:'vendor',merchant:'merchant',date:'documentDate',invoiceDate:'documentDate',receiptDate:'documentDate',unitNumber:'unitNumber'};

function genericFieldMapping(sourceFields,selectedType){
  const fields=sourceFields||{};
  const mapped=Object.fromEntries(Object.keys(fields).map(key=>[sourceKeys[key]||key,key]));
  // Expense writers consume merchant first, then vendor. Keep those equivalent
  // legacy slots on the same source reading, including clearing stale guesses
  // when that reading is missing or disputed. Never touch unrelated fields.
  if(fields.merchant&&!fields.vendor)mapped.vendor='merchant';
  if(fields.vendor&&!fields.merchant)mapped.merchant='vendor';
  if(selectedType==='fuel_receipt'&&fields.merchant)mapped.fuelProvider='merchant';
  if(fields.unitNumber)mapped.truckNumber='unitNumber';
  const dateKey=Object.keys(fields).find(key=>sourceKeys[key]==='documentDate');
  if(dateKey)mapped.date=dateKey;
  return mapped;
}

// Derive the filing display from this exact scan's current source review.
// The raw analysis and review stay immutable; load assignment and duty links
// remain the driver's choices. Source support never means automatic filing.
export function scanWithSourceFields(analysis,review,selectedType){
  if(!analysis||review?.analysis!==analysis||!selectedType)return analysis;
  const result=review.result,doc=result?.documents?.[0];
  if(result?.engine!=='owned-smart-reader'||(result.documents.length!==1&&!linkedRateCertificates(result,doc))||![selectedType,sourceKinds[selectedType]].includes(doc?.kind)
    ||analysis.typeEvidenceV110334?.mixedDocuments)return analysis;
  const rate=selectedType==='rate_confirmation';
  if(rate&&!result.pages.some(page=>page.observations.some(o=>(isNumberedRateTable(o.lines)||hasRateStructure(o.lines)))))return analysis;
  const delivery=selectedType==='delivery_order',shipping=['bol','pod'].includes(selectedType);
  const genericMapping=genericFieldMapping(doc.fields,selectedType);
  const fieldMapping=delivery?{loadNo:'loadNumber',poNumber:'poNumber',shipper:'shipper',consignee:'consignee',carrierName:'carrier',documentDate:'date'}:rate?{loadNo:'loadNumber',gross:'totalRate',total:'totalRate',documentDate:'documentDate',pickupDate:'pickupDate',deliveryDate:'deliveryDate',equipment:'equipment',miles:'miles',broker:'broker',carrierName:'carrier',shipper:'shipper',consignee:'consignee',pickupAddress:'pickupAddress',deliveryAddress:'deliveryAddress',origin:'pickupCity',destination:'deliveryCity'}:shipping?mapping:genericMapping;
  const fields={...analysis.fields},fieldEvidence={...analysis.fieldEvidence},fieldConfidence={...analysis.fieldConfidence};
  const oldReview=analysis.evidenceReviewV11036||{},evidence={...oldReview.evidence},accepted=[],proofs={},savedWarnings=[];
  for(const [key,ownedKey]of Object.entries(fieldMapping)){
    const field=doc.fields[ownedKey];if(!field)continue;
    const alias=rate||!shipping?null:aliases[key],replaceAlias=alias&&fields[alias]===fields[key];
    if(replaceAlias){delete fields[alias];delete fieldEvidence[alias];delete fieldConfidence[alias];delete evidence[alias];}
    delete fields[key];delete fieldEvidence[key];delete fieldConfidence[key];delete evidence[key];
    if(key==='weight'){delete fields.weightUnit;delete fieldEvidence.weightUnit;delete evidence.weightUnit;}
    if(!['supported','confirmed'].includes(field.status)||typeof field.value!=='string'||!field.value)continue;
    if(field.kind==='party'&&!isDocumentParty(field.value)){
      savedWarnings.push('The saved '+field.label.toLowerCase()+' value looks like a form label. Check the company name on the original.');continue;
    }
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
  const fieldReferenceKinds=delivery?{...referenceKinds,loadNo:'load_number'}:referenceKinds;
  fields.references=(Array.isArray(fields.references)?fields.references:[]).filter(ref=>!Object.values(fieldReferenceKinds).includes(ref.kind));
  for(const key of accepted)if(fieldReferenceKinds[key])fields.references.push({kind:fieldReferenceKinds[key],value:fields[key],source:'reader_source'});
  fields.readerSourceFieldsV110393={engineVersion:result.engineVersion,documentId:result.documentId,reviewRevision:result.reviewRevision,fields:proofs};
  const removed=(analysis.layoutGuardV110337?.removedFields||[]).filter(key=>!accepted.includes(key));
  const issues=(oldReview.issues||[]).filter(issue=>!(issue===bolWarning&&accepted.includes('bolNo')
    ||issue===dateWarning&&accepted.includes('documentDate')||issue===payWarning&&rate&&accepted.includes('gross')
    ||issue===layoutWarning&&analysis.layoutGuardV110337&&!removed.length));
  if(shipping&&!fields.bolNo&&!issues.includes(bolWarning))issues.push(bolWarning);
  for(const warning of savedWarnings)if(!issues.includes(warning))issues.push(warning);
  return {...analysis,fields,fieldEvidence,fieldConfidence,needsReview:true,routing:{...analysis.routing,autoFile:false},
    ...(analysis.layoutGuardV110337?{layoutGuardV110337:{...analysis.layoutGuardV110337,removedFields:removed}}:{}),
    evidenceReviewV11036:{...oldReview,evidence,issues}};
}
