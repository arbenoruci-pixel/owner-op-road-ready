import {normalizeBolMeasurement,validateBolWeights} from './bolMeasurements.js';

const keys=['netWeight','tareWeight','weight'];
const sameObservation=(a,b)=>a.pageId===b.pageId&&a.observationId===b.observationId;
const strong=e=>e.recognizerConfidence!==null&&e.recognizerConfidence>=.8;
function direct(candidate,evidence){
  if(!strong(evidence))return false;
  const labels=(candidate.labelEvidence||[]).filter(label=>sameObservation(label,evidence));
  return labels.length?evidence.supportMethod==='aligned_measurement_row'&&labels.every(strong):evidence.start>0;
}
function completeReading(field){
  const candidates=(field?.candidates||[]).filter(c=>c.numericValue!=null);
  if(!candidates.length||new Set(candidates.map(c=>JSON.stringify([c.thousandths,c.unit]))).size!==1)return null;
  return {candidate:candidates[0],candidates,evidence:candidates.flatMap(c=>c.evidence),direct:candidates.flatMap(c=>c.evidence.filter(e=>direct(c,e)))};
}
function fragmentKind(raw,complete){
  const value=raw.trim(),number=complete.numericValue;
  // Only a visibly cut decimal is a prefix. A complete shorter number is
  // another reading and remains a conflict.
  if(/^(?:\d{1,3}(?:,\d{3})+|\d+)\.$/.test(value)&&number.startsWith(value.replaceAll(',','')))return 'cut_decimal';
  // The digit string must also exist as a complete reading. A single f can
  // be a table-border artifact; digit-like letters and partial units are excluded.
  const border=/^((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{1,3})f$/.exec(value);
  if(border&&normalizeBolMeasurement('shipping_weight',border[1]).thousandths===complete.thousandths)return 'border_tail';
  return null;
}

// Resolve redundant fragments, retaining every candidate, quote and original
// confidence. Arithmetic supports an observed number; it never supplies digits.
export function reconcileBolMeasurements(fields){
  fields={...fields};
  for(const key of keys){
    const field=fields[key];if(field?.correction||!field?.candidates?.some(candidate=>candidate.issue==='ocr_weight_unit'))continue;
    const candidates=field.candidates.filter(candidate=>candidate.numericValue!=null);
    if(!candidates.length||new Set(candidates.map(candidate=>JSON.stringify([candidate.thousandths,candidate.unit]))).size!==1)continue;
    const sources=candidates.flatMap(candidate=>candidate.evidence.filter(evidence=>direct(candidate,evidence)));
    const corroborated=sources.some(source=>new Set(sources.filter(other=>other.pageId===source.pageId).map(other=>other.observationId)).size>=2);
    if(corroborated)fields[key]={...field,issues:field.issues.filter(issue=>issue!=='ocr_weight_unit')};
  }
  const next={...fields},readings=Object.fromEntries(keys.map(key=>[key,completeReading(fields[key])])),supports={};
  for(const key of keys){
    const reading=readings[key];if(!reading?.direct.length)continue;
    supports[key]={method:'direct_measurement',evidence:reading.direct};
  }
  if(validateBolWeights(fields)[0].status==='passed')for(const key of keys){
    const reading=readings[key];if(!reading||reading.candidate.unit!==null||supports[key])continue;
    for(const candidate of fields[key].candidates.filter(c=>c.issue==='invalid_weight'&&fragmentKind(c.rawValue,reading.candidate)==='border_tail')){
      const source=candidate.evidence.find(e=>direct(candidate,e)
        &&reading.evidence.some(other=>other.pageId===e.pageId&&other.observationId!==e.observationId&&other.sourceImageId!==e.sourceImageId)
        &&keys.filter(other=>other!==key).every(other=>readings[other]?.direct.some(proof=>proof.pageId===e.pageId)));
      if(source){supports[key]={method:'matching_measurement_digits',evidence:[...reading.evidence.filter(e=>e.pageId===source.pageId),source]};break;}
    }
  }
  for(const key of keys){
    const field=fields[key],reading=readings[key],support=supports[key];
    if(!reading||!support||field.correction)continue;
    const invalid=field.candidates.filter(c=>c.issue==='invalid_weight');
    const resolved=invalid.filter(c=>fragmentKind(c.rawValue,reading.candidate)
      &&c.evidence.every(e=>support.evidence.some(proof=>proof.pageId===e.pageId)
        &&!field.candidates.some(other=>other!==c&&other.evidence.some(proof=>sameObservation(proof,e)&&proof.lineId!==e.lineId))));
    const allResolved=resolved.length===invalid.length;
    const issues=field.issues.filter(issue=>!(allResolved&&['invalid_weight','weak_recognition','layout_needs_review','damaged_label','label_needs_review','conflicting_reads'].includes(issue)));
    next[key]={...field,issues,status:issues.length?'needs_review':'supported',value:issues.length?null:reading.candidate.value,
      numberSupport:{numericValue:reading.candidate.numericValue,unit:reading.candidate.unit,...support,
        resolvedRawValues:resolved.map(c=>c.rawValue)}};
  }
  return next;
}

export function visibleMeasurementCandidates(field){
  const resolved=field.numberSupport?.resolvedRawValues||[];
  return field.candidates.filter(c=>!resolved.includes(c.rawValue));
}
