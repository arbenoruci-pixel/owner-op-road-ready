// Form labels and freight instructions cannot establish a company identity.
export function isDocumentParty(raw) {
  const value=String(raw||'').trim();
  return value.length>0&&value.length<=200&&/\p{L}/u.test(value)
    && !/^[\s|.,;:_-]*(?:(?:BOL|B\/L|BILL\s+OF\s+LADING|INVOICE|RECEIPT|TRAILER|(?:CUSTOMER\s+)?(?:P\.?\s*O\.?|PURCHASE\s+ORDER))\s*(?:NUMBER\b|NO\b\.?|ID\b|#|:)|(?:DATE|TOTAL\s+(?:NET\s+)?WEIGHT)\s*:)/i.test(value)
    && !/^(?:[\s.,;:_-]*)(?:signature(?:\s*[/;:]|$|\s+(?:date|of|shipper|carrier|required)\b)|sign(?:\s+(?:here|below|parties|pusties)\b|\s*[:/]|$)|n\s*[/;:]|name\s*[:;]|number\b|collect\b|prepaid\b)/i.test(value)
    && !/^(?:acknowledges?\b|shall\b|certif(?:y|ies)\b|without\s+recour\w*\b|recourse\b)/i.test(value)
    && !/sign[a-z]*\s*\/\s*date|trailer\s+loaded|freight\s+counted|required\s+placards|number\s+of\s+packages|carrier\s+name\s*[:;]/i.test(value);
}

export function guardDocumentReading(result={}) {
  const fields={...result.fields},fieldEvidence={...result.fieldEvidence},removed=[];
  for(const key of ['shipper','consignee','carrierName','broker','brokerName']){
    if(!fields[key]||isDocumentParty(fields[key]))continue;
    const value=fields[key];removed.push(key);fields[key]='';delete fieldEvidence[key];
    for(const alias of ['origin','destination'])if(fields[alias]===value){removed.push(alias);fields[alias]='';delete fieldEvidence[alias];}
  }
  if(!removed.length)return result;
  const review=result.evidenceReviewV11036||{},evidence={...review.evidence};
  for(const key of removed)delete evidence[key];
  return {...result,fields,fieldEvidence,needsReview:true,needsFieldReview:true,
    readingGuardV110336:{removedFields:removed},
    evidenceReviewV11036:{...review,evidence,issues:[...new Set([...(review.issues||[]),'Some party names were form instructions. Check the original document.'])]}};
}
