// Document identity is grounded in each page's headings and field groups.
// OCR retries are alternate observations of one page, never extra pages.
const bolTitle=/\b(?:b[i1l|]{1,3}|[i1]ll)\s+[o0]f\s+lad[i1l|]n[g6]\b/i;
const podTitle=/\b(?:proof\s+of\s+delivery|customer\s+delivery\s+copy|delivery\s+receipt)\b/i;
const rateTitle=/\b(?:carrier\s+rate\s+confirmation|rate\s+confirmation|load\s+confirmation(?:\s+and\s+payment\s+agreement)?)\b/i;
const gateTitle=/\bgate\s+pass\b|\bdrop\s+load\b/i;
const groupCount=(text,patterns)=>patterns.filter(pattern=>pattern.test(text)).length;
function heading(text,pattern){
  return String(text).replace(/\[\[PAGE:\d+\]\]/g,'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean).slice(0,18).some(line=>{
    const match=pattern.exec(line);
    return match&&match.index<=40&&line.length<=150&&!/\b(?:must|shall|submit|attach|provide|return|required|send|without|copy\s+of|subject\s+to)\b/i.test(line);
  });
}
export function inspectPageIdentity(text=''){
  const s=String(text).replace(/[ \t]+/g,' '),groups=groupCount(s,[/\b(?:consign(?:ee|ed|en)|ship\s*to)\b/i,/\b(?:shipper|ship\s*from|carrier)\b/i,/\b(?:qty|quantity|weight|freight|commodit(?:y|ies)|product\s+code|pounds|ship\s+charges)\b/i]);
  const candidates=[];
  if(groups>=2&&(heading(s,bolTitle)||heading(s,podTitle))){
    const typeId=heading(s,podTitle)?'pod':'bol';
    candidates.push({typeId,confidence:.91,reason:typeId==='pod'?'Delivery heading and shipping fields':'Bill of lading heading and shipping fields'});
  }
  if(heading(s,rateTitle)&&/\b(?:flat\s+rate|total\s+(?:carrier\s+)?pay|carrier\s+rate|agreed\s+rate|line\s*haul|rate\s*:)/i.test(s))candidates.push({typeId:'rate_confirmation',confidence:.94,reason:'Rate confirmation heading and payment terms'});
  const gateGroups=groupCount(s,[/\btrailer\s*(?:#|no\.?|number)/i,/\b(?:arrival\s+time|appointment\s*(?:time|window|date)?|dock\s+assignment)\b/i,/\b(?:shipper|carrier|guard\s+house|assigned\s+by)\b/i]);
  if(heading(s,gateTitle)&&gateGroups>=2)candidates.push({typeId:'gate_pass',confidence:.90,reason:'Gate pass heading and facility arrival fields'});
  if(candidates.length>1)return {typeId:'other',confidence:0,status:'conflicting',reason:'Conflicting document headings on this page'};
  return candidates[0]||null;
}
function documentPages(analysis){
  const text=String(analysis.text||'');
  const marked=[...text.matchAll(/\[\[PAGE:(\d+)\]\]([\s\S]*?)(?=\[\[PAGE:\d+\]\]|$)/g)].map(m=>({page:Number(m[1]),text:m[2]}));
  const pages=marked.length?marked:Array.isArray(analysis.pages)&&analysis.pages.some(p=>p.text)?analysis.pages.map((p,i)=>({page:Number(p.page??p.pageNumber??i+1),text:String(p.text||'')})):[{page:1,text}];
  return pages.map(page=>({...page,reads:[page.text,...(analysis.ocrEvidenceV110323||[]).filter(p=>Number(p.page)===page.page&&Number(p.confidence??1)>=.45).map(p=>String(p.text||''))]}));
}
function bolReferences(text){
 return [...String(text).matchAll(/\b(?:B[O0]L|B[\/|]L|BILL\s+OF\s+LADING)[ \t]*(?:NUMBER|N[O0]\.?|ID|#|:)[ \t:#-]*([A-Z0-9][A-Z0-9._/-]{2,35})/gi)].map(m=>m[1].toUpperCase()).filter(v=>/\d/.test(v));
}
export function decideDocumentIdentity(analysis={}){
  const pages=documentPages(analysis),pageTypes=pages.map(page=>{
    const evidence=page.reads.map(inspectPageIdentity).filter(Boolean),ids=[...new Set(evidence.map(item=>item.typeId))];
    return {page:page.page,typeId:ids.length===1?ids[0]:ids.length?'other':'',conflicting:ids.length>1||evidence.some(e=>e.status==='conflicting'),evidence:evidence.map(e=>e.reason)};
  });
  const types=[...new Set(pageTypes.map(p=>p.typeId).filter(Boolean))];
  const refs=pages.map(page=>[...new Set(bolReferences(page.text))]);
  const allRefs=[...new Set(refs.flat())];
  const mixedShipments=pages.length>1&&refs.filter(r=>r.length===1).length>1&&allRefs.length>1;
  const unidentifiedExtraPage=types.length>0&&pages.some((page,i)=>!pageTypes[i].typeId&&page.reads.some(text=>text.trim()));
  // Unclassified or generic attachments cannot erase a clear primary label.
  // Keep each page's evidence and block automatic filing/load association until
  // their relationship is reviewed. Two clear document types still conflict.
  const primaryPages=pageTypes.filter(page=>!page.supporting&&!page.conflicting&&page.typeId&&!['other','other_expense'].includes(page.typeId));
  const primaryTypes=[...new Set(primaryPages.map(page=>page.typeId))];
  const uncertainPages=pageTypes.filter(page=>!page.supporting&&!primaryPages.includes(page));
  if(primaryTypes.length===1&&uncertainPages.length&&!mixedShipments)return {
    typeId:primaryTypes[0],confidence:.49,requiresTypeReview:true,mixedDocuments:true,clearShipmentFields:true,pageTypes,
    primaryPages:primaryPages.map(page=>page.page),unclassifiedPages:uncertainPages.map(page=>page.page),
    reason:'Primary document identified. Review additional pages '+uncertainPages.map(page=>page.page).join(', ')+' before choosing a load folder.',
  };
  if(pageTypes.some(p=>p.conflicting)||types.length>1||mixedShipments||unidentifiedExtraPage)return {typeId:'other',confidence:0,requiresTypeReview:true,mixedDocuments:true,clearShipmentFields:true,pageTypes,reason:mixedShipments?'Pages have different BOL numbers. Scan each shipment separately.':unidentifiedExtraPage?'Some pages could not be identified. Check whether these documents belong together.':'Pages have conflicting document types. Check and separate the documents.'};
  if(types.length===1&&types[0]!=='other')return {typeId:types[0],confidence:.9,requiresTypeReview:false,pageTypes,reason:pageTypes.find(p=>p.typeId)?.evidence[0]};
  const current=analysis.type?.id||'other';
  // The legacy catalog may rank Gate Pass highest on ordinary carrier/trailer
  // words. It must never survive without a gate/arrival document identity.
  if(current==='gate_pass'||current==='other'||analysis.lowEvidence===true||!String(analysis.text||'').trim())return {typeId:'other',confidence:0,requiresTypeReview:true,pageTypes,reason:'Document type is uncertain. Choose the type after checking the pages.'};
  return {typeId:current,confidence:Number(analysis.confidence||0),requiresTypeReview:false,pageTypes,reason:'Retained the qualified document reader decision'};
}
export function applyDocumentIdentity(analysis,decision,meta,reanalyze,options={}){
  const changed=decision.typeId!==analysis.type?.id;
  let result=changed?{...analysis,...reanalyze(analysis,decision.typeId,options),type:meta(decision.typeId),detectedType:meta(decision.typeId)}:{...analysis};
  if(decision.clearShipmentFields){
    result.fields={...result.fields};
    for(const key of ['loadNo','orderNo','bolNo','poNumber','shipmentId','matchedLoadNo','canonicalLoadNo','origin','destination','broker','brokerName','documentDate','date'])result.fields[key]='';
    result.fields.references=[];result.fields.poNumbers=[];
    result.fieldEvidence={};
    result.evidenceReviewV11036={...result.evidenceReviewV11036,evidence:{},issues:[decision.reason]};
    result.matchedLoad=null;result.matchedLoadNo='';
  }
  return {...result,confidence:decision.requiresTypeReview?Math.min(.49,Number(result.confidence||0)):changed?decision.confidence:result.confidence,needsReview:result.needsReview||decision.requiresTypeReview||changed,needsFieldReview:result.needsFieldReview||decision.requiresTypeReview,lowEvidence:decision.requiresTypeReview,typeEvidenceV110334:decision,method:String(result.method||'')+'+page-identity-v110334'};
}
