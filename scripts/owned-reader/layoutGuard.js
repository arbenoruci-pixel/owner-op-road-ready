import {PROFILES,normalizeValue} from '../../../../packages/smart-reader-core/src/profiles.js';
import {reviewScanAnalysis} from './ownedReaderAdapter.js';

// The legacy parser flattens columns. Its inferred party/trailer values may
// only remain in the filing form when the OCR lines establish the label/value
// together. Below-label proposals remain available for source review instead.
export function guardOcrLayoutReading(result={}) {
  const owned=reviewScanAnalysis(result);
  const primary=owned.documents.filter(document=>document.role!=='supporting');
  const separated=primary.length>1&&(primary.some(document=>document.kind!=='unknown')||['bol','lumper_receipt','invoice'].includes(result.type?.id));
  if(result.typeEvidenceV110334?.mixedDocuments||separated){
    const review=result.evidenceReviewV11036||{};
    const reason='Separate documents are included. Review the fields under each document; the PDF keeps all pages.';
    return {...result,fields:{references:[],poNumbers:[],needsFieldReview:true},fieldEvidence:{},fieldConfidence:{},
      needsReview:true,needsFieldReview:true,matchedLoad:null,matchedLoadNo:'',routing:{...result.routing,autoFile:false},
      confidence:Math.min(.49,Number(result.confidence||0)),
      typeEvidenceV110334:{...result.typeEvidenceV110334,mixedDocuments:true,requiresTypeReview:true,clearShipmentFields:true,reason:result.typeEvidenceV110334?.mixedDocuments?result.typeEvidenceV110334.reason||reason:reason},
      packetReviewV110338:{separateFields:true},
      evidenceReviewV11036:{...review,evidence:{},suggestedLoad:null,issues:[...new Set([...(review.issues||[]),reason])]}};
  }
  if(result.typeEvidenceV110334?.attachmentReview?.required){
    const reason=result.typeEvidenceV110334.attachmentReview.reason,review=result.evidenceReviewV11036||{};
    result={...result,needsReview:true,needsFieldReview:true,matchedLoad:null,matchedLoadNo:'',routing:{...result.routing,autoFile:false},
      evidenceReviewV11036:{...review,suggestedLoad:null,issues:[...new Set([...(review.issues||[]),reason])]}};
  }
  if(!['bol','pod'].includes(result.type?.id))return result;
  const passes=(result.ocrEvidenceV110323||[]).filter(pass=>pass.lines?.length);
  if(!passes.length)return result;
  const fields={...result.fields},fieldEvidence={...result.fieldEvidence},fieldConfidence={...result.fieldConfidence};
  const review=result.evidenceReviewV11036||{},evidence={...review.evidence},removed=[];
  const specs=PROFILES.find(profile=>profile.id==='bol').fields;
  const mapping={shipper:'shipper',consignee:'consignee',carrierName:'carrier',trailerNo:'trailerNumber'};
  for(const [key,ownedKey] of Object.entries(mapping)){
    if(!fields[key])continue;
    const spec=specs[ownedKey],reads=[];
    for(const pass of passes)for(const line of pass.lines){
      const match=spec.pattern.exec(String(line.text||''));
      if(match)reads.push({...normalizeValue(spec.kind,match[1]),confidence:line.confidence});
    }
    const value=normalizeValue(spec.kind,String(fields[key])).value;
    if(value&&reads.length&&reads.every(read=>read.value===value&&!read.issue&&Number.isFinite(read.confidence)&&read.confidence>=80))continue;
    const previous=fields[key];removed.push(key);fields[key]='';
    delete fieldEvidence[key];delete fieldConfidence[key];delete evidence[key];
    for(const alias of ['origin','destination'])if(fields[alias]===previous){
      fields[alias]='';delete fieldEvidence[alias];delete fieldConfidence[alias];delete evidence[alias];
    }
  }
  if(!removed.length)return result;
  if(Array.isArray(fields.references))fields.references=fields.references.filter(reference=>!removed.includes(reference.kind));
  return {...result,fields,fieldEvidence,fieldConfidence,needsReview:true,needsFieldReview:true,
    layoutGuardV110337:{removedFields:removed},
    evidenceReviewV11036:{...review,evidence,issues:[...new Set([...(review.issues||[]),'Some fields could not be verified beside their labels. Check Reader preview and the original.'])]}};
}
