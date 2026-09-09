// Read document structure before generic keyword scores. These are document
// headings and field groups; filenames and the active trip are never evidence.
export function classifySmartScanStructureV11039(text = '') {
  const s=String(text), compact=s.replace(/\s+/g,' ');
  const matches = rules => rules.filter(re => re.test(s)).length;
  if (/\b(?:rate\s+confirmation|load\s+confirmation\s+and\s+payment\s+agreement)\b/i.test(compact) &&
    /\b(?:flat\s+rate|total\s+(?:carrier\s+)?pay|carrier\s+rate|agreed\s+rate|rate\s*:)\b/i.test(compact))
    return {typeId:'rate_confirmation',confidence:.96,reason:'Rate confirmation heading and carrier payment terms'};
  if (/\bgate\s+pass\b/i.test(compact) && matches([/\btrailer\s*(?:#|no|number)/i,/\b(?:arrival\s+time|appointment)/i,/\b(?:shipper|carrier|guard\s+house)\b/i])>=2)
    return {typeId:'gate_pass',confidence:.94,reason:'Gate pass, equipment and arrival fields'};
  if (/\b(?:tow(?:ing)?\s+(?:record|invoice|service)|relocation\s+tow)\b/i.test(compact) &&
    matches([/\binvoice\b/i,/\b(?:vehicle|drive\s+away|light\s+duty|heavy\s+duty)\b/i,/\b(?:total\s+cost|payment|released)\b/i])>=2)
    return {typeId:'roadside_service',confidence:.91,reason:'Towing record and vehicle/service charges'};
  if (/\b(?:autozone|o[’']?reilly\s+auto|napa\s+auto\s+parts|advance\s+auto\s+parts)\b/i.test(compact) &&
    matches([/\b(?:receipt|purchase|invoice)\b/i,/\b(?:subtotal|total|credit|card|payment)\b/i,/\b(?:items?\s+sold|parts?|rewards)\b/i])>=2)
    return {typeId:'parts_receipt',confidence:.87,reason:'Auto parts merchant and purchase receipt fields'};
  if (/\bpacking\s+(?:list|slip)\b/i.test(compact) && matches([/\b(?:ship\s+to|customer)\b/i,/\b(?:order|load)\s*(?:number|no|[i1]d|#)/i,/\b(?:qty|quantity|product|item|stop)\b/i])>=2)
    return {typeId:'packing_list',confidence:.92,reason:'Packing list with shipping and item references'};
  const bolHeading=/\b(?:bill\s+of\s+ladin[g6]?|bil\s+of\s+lading|B[\/I|]L\s*N[O0]\.?)\b/i.test(compact);
  const shippingGroups=matches([/\b(?:c?onsign(?:ee|ed|en)|ship\s+to)\b/i,/\b(?:shipper|ship\s+from|carrier)\b/i,/\b(?:quantity|weight|freight|commodity|commodities|product\s+code|pounds|temperature|ship\s+charges)\b/i]);
  const shippingId=/\b(?:B[\/I|]L\s*N[O0]|LADING\s*:|SHIPMENT\s*(?:[I1]D|NO|#))/i.test(compact);
  if (shippingGroups>=3 && (bolHeading || shippingId)) {
    const explicitPod=/\b(?:proof\s+of\s+delivery|customer\s+delivery\s+copy|delivery\s+receipt)\b/i.test(compact);
    return {typeId:explicitPod?'pod':'bol',confidence:.90,reason:explicitPod?'Delivery document heading and shipping fields':'Bill of lading structure and shipping fields'};
  }
  if (/\bbil[l1]?\s+of\s+lading\b/i.test(compact) && /\bconsignee\b/i.test(compact) && /\bcarrier\b/i.test(compact) && /\bship\s+charges|\bship\s+via|\bship\s*:/i.test(compact))
    return {typeId:'bol',confidence:.82,reason:'Shipping contract, consignee and carrier fields'};
  return null;
}

export function qualifyRateConReferenceV11039(result) {
  if(result.type?.id!=='rate_confirmation')return result;
  const text=String(result.text||'');
  const refs=[...text.matchAll(/\bLOAD[ \t]*(?:NUMBER|N[O0]\.?(?=[\s:#-])|#)[ \t:#-]*([A-Z0-9][A-Z0-9-]{2,27})(?=$|[\s,;|])/gi)]
    .map(m=>m[1].toUpperCase()).filter(v=>/\d/.test(v)&&!/^\d{4}-\d{2}-\d{2}$/.test(v));
  const unique=[...new Set(refs)];
  if(unique.length!==1)return result;
  return {...result,fields:{...result.fields,loadNo:unique[0],orderNo:result.fields?.orderNo||unique[0]}};
}
