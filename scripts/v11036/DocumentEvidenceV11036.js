import { truckDocumentTypeMetaV1040, backendDocumentTypeV1040 } from './truckDocumentCatalogV1040.js';
import { currentLiveBolContextV11035 } from './liveBolContextV11035.js';

const compact = value => String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function inspectDocumentEvidence(result = {}) {
  const text=String(result.text||result.ocrText||result.rawText||'').trim();
  const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const originalType=result.type?.id||'other', fields={...(result.fields||{})}, issues=[];
  const userSelected=result.userSelectedTypeV11036===originalType;
  const bolHeader=/\b(?:bill\s+of\s+lading|straight\s+bill|B\.?O\.?L\.?(?:\s*(?:no|number|#|:)))\b/i.test(text);
  const shippingSections=[/\b(?:ship\s*from|shipper)\b/i,/\b(?:ship\s*to|consignee)\b/i,/\b(?:weight|freight\s+class|commodity|pieces|packaging)\b/i].filter(re=>re.test(text)).length;
  const rateHeader=/\b(?:carrier\s+rate\s+confirmation|rate\s+confirmation|load\s+confirmation)\b/i.test(text);
  const moneyTerms=/\b(?:line\s*haul|all[- ]in\s+rate|total\s+(?:carrier\s+)?pay|agreed\s+rate|carrier\s+compensation|freight\s+rate)\b[^\n]{0,60}\$?\s*\d[\d,]*\.\d{2}\b/i.test(text);
  const podHeader=/\b(?:proof\s+of\s+delivery|delivery\s+receipt)\b/i.test(text);
  let suggestedType=originalType;
  if(!text && ['bol','pod','rate_confirmation'].includes(originalType)){if(!userSelected)suggestedType='other';issues.push('No readable text — choose the document type after checking the image.');}
  else if(!userSelected&&bolHeader&&shippingSections>=2&&!rateHeader&&!moneyTerms&&['other','rate_confirmation'].includes(originalType))suggestedType='bol';
  if(suggestedType!==originalType)issues.push(suggestedType==='bol'?'Shipping sections and BOL heading support a Bill of Lading. Verify the type.':'The document type needs manual review.');
  if(bolHeader&&rateHeader)issues.push('BOL and Rate Confirmation headings appear together. Check for a mixed document packet.');
  const evidence={};
  for(const key of ['loadNo','bolNo','poNumber','invoiceNo','documentDate','date','deliveryDate','total','gross']){
    if(fields[key]==null||fields[key]==='')continue;
    const value=String(fields[key]),needle=compact(value);
    const variants=[needle];
    if(/^\d{4}-\d{2}-\d{2}$/.test(value)) {const [year,month,day]=value.split('-');variants.push(compact(`${month}/${day}/${year}`),compact(`${Number(month)}/${Number(day)}/${year}`));}
    const line=needle.length>=3?lines.find(item=>variants.some(v=>compact(item).includes(v))):null;
    evidence[key]={value,source:line?'document_text':'unverified',excerpt:line?.slice(0,220)||'',status:line?'read':'check'};
    if(!line&&['loadNo','bolNo','documentDate','date','total','gross'].includes(key))issues.push(`${key.replace(/([A-Z])/g,' $1')}: verify against the image.`);
  }
  // Text in a signature box is not visual signature detection or authenticity.
  let signatureStatus='not_assessed';
  if(['bol','pod'].includes(suggestedType)||podHeader){
    signatureStatus='needs_visual_review';
    fields.podSigned=false;fields.podSignedEvidence=false;
    if(suggestedType==='pod')issues.push('Check the receiver signature and delivery date on the image. OCR cannot confirm a handwritten signature.');
  }
  const quality=result.scanMeta?.documentQualityV11036;
  if(quality?.issues?.length)issues.push(...quality.issues);
  const missingPage=text.match(/\bpage\s+(\d+)\s*(?:of|\/)\s*(\d+)\b/i);
  if(missingPage&&Number(missingPage[2])>Number(result.pageCount||result.scanMeta?.pageCount||1))issues.push(`This document says ${missingPage[2]} pages. Check that all pages are included.`);
  return {text,suggestedType,fields,evidence,issues:[...new Set(issues)],signatureStatus,method:'document-evidence-v11036'};
}

export function qualifyScanResultV11036(result={},state={}){
  const review=inspectDocumentEvidence(result),changed=review.suggestedType!==(result.type?.id||'other');
  const suggestion=currentLiveBolContextV11035(state);
  const mustReview=changed||review.issues.length>0||!review.text||result.needsReview===true;
  return {...result,
    ...(changed?{type:truckDocumentTypeMetaV1040(review.suggestedType),detectedType:truckDocumentTypeMetaV1040(review.suggestedType),backendDocumentType:backendDocumentTypeV1040(review.suggestedType),confidence:Math.min(Number(result.confidence||0),.8),actions:[],method:`document-evidence-v11036:${result.method||'reader'}`} : {}),
    fields:{...review.fields,...(mustReview?{needsFieldReview:true}:{})},
    needsReview:mustReview,
    routing:mustReview?{...(result.routing||{}),autoFile:false}:result.routing,
    evidenceReviewV11036:{...review,text:undefined,fields:undefined,suggestedLoad:suggestion?{loadNo:suggestion.loadNo,day:suggestion.day,source:'active_pickup'}:null},
  };
}
