import {evidenceFor} from './input.js';
const reference=/^\s*DOCUMENT REF(?:ERENCE)?\s*:\s*([A-Z0-9][A-Z0-9-]{7,})(?=\s|$)/id;
const visuallySimilar=(a,b)=>{
  // Fold case only for the comparison. Keep the source strings and evidence
  // unchanged, and never label a case-only difference as an O/0 discrepancy.
  const left=a.toUpperCase(),right=b.toUpperCase();
  return left!==right&&left.length===right.length&&left.replace(/[O0]/g,'0')===right.replace(/[O0]/g,'0');
};

// This is a warning, never an envelope merge or an OCR character replacement.
// Compare only a single primary RateCon's explicit reference with supporting
// pages in the packet. Multiple primary documents have no inferred ownership.
export function referenceDiscrepancies(result){
  const primary=(result?.documents||[]).filter(d=>d.role!=='supporting');
  if(primary.length!==1||primary[0].kind!=='rate_confirmation')return [];
  const anchors=[];
  for(const page of result.pages.filter(p=>primary[0].pageIds.includes(p.id)))for(const observation of page.observations)for(const line of observation.lines){
    const match=reference.exec(line.text);
    if(match&&(line.confidence===null||line.confidence>=.8))anchors.push({value:match[1],evidence:evidenceFor(page,observation,line,...match.indices[1])});
  }
  const values=[...new Set(anchors.map(a=>a.value.toUpperCase()))];
  if(values.length!==1)return [];
  const expected=anchors[0].value,expectedVariants=[...new Set(anchors.map(a=>a.value))],warnings=[];
  for(const group of result.documents){
    if(!['signature_page','signing_certificate'].includes(group.kind))continue;
    const field=group.fields?.documentReference;
    if(!field)continue;
    const confirmed=field.correction?.confirmed===true;
    const observed=confirmed?[field.value]:[...new Set(field.candidates.map(c=>c.value).filter(Boolean))];
    for(const value of observed){
      if(!visuallySimilar(value,expected))continue;
      warnings.push({id:'similar_document_references',groupId:group.id,key:'documentReference',
        status:confirmed?'confirmed_difference':'needs_review',value,expected,expectedVariants,
        message:'Similar document references differ (letter O / number 0). Check the source before treating these pages as one signed document.',
        primaryEvidence:anchors.map(a=>a.evidence),
        supportingEvidence:field.candidates.filter(c=>c.value===value).flatMap(c=>c.evidence)});
    }
  }
  return warnings;
}
