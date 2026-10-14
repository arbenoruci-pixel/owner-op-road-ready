// Separate extraction contracts. Classification evidence never fills fields.
// All extraction candidates require source review; no filing or persistence here.
export const AI_EXTRACTION_VERSION='document-extraction-candidates-v1';
export const AI_EXTRACTION_LIMITS=Object.freeze({maxCandidates:8,maxEvidencePerCandidate:3,maxQuoteCharacters:240,maxValueCharacters:180});
export const AI_EXTRACTION_FIELDS=Object.freeze({
  bolNumber:'identifier',loadNumber:'identifier',poNumber:'identifier',trailerNumber:'identifier',
  invoiceNumber:'identifier',receiptNumber:'identifier',documentDate:'date',date:'date',receiptDate:'date',invoiceDate:'date',pickupDate:'date',deliveryDate:'date',
  shipper:'party',consignee:'party',carrier:'party',vendor:'party',merchant:'party',total:'amount',totalRate:'amount',weight:'quantity',gallons:'quantity',
});
export const AI_EXTRACTION_KIND_FIELDS=Object.freeze({
  bol:['bolNumber','poNumber','trailerNumber','documentDate','shipper','consignee','carrier','weight'],
  pod:['bolNumber','poNumber','trailerNumber','documentDate','deliveryDate','shipper','consignee','carrier','weight'],
  delivery_order:['loadNumber','poNumber','documentDate','shipper','consignee','carrier','weight'],
  rate_confirmation:['loadNumber','poNumber','pickupDate','deliveryDate','shipper','consignee','carrier','totalRate'],
  fuel_receipt:['receiptNumber','date','documentDate','merchant','vendor','total','gallons'],
  unloading_receipt:['receiptNumber','poNumber','trailerNumber','receiptDate','documentDate','carrier','vendor','total'],
  receipt:['receiptNumber','date','documentDate','merchant','vendor','total'],
  packing_list:['poNumber','documentDate','shipper','consignee','weight'],
  invoice:['invoiceNumber','invoiceDate','documentDate','vendor','total'],
});
const evidenceSchema={type:'object',additionalProperties:false,required:['pageId','pageNumber','sourceImageId','observationId','lineId','quote'],properties:{
  pageId:{type:'string',minLength:1},pageNumber:{type:'integer',minimum:1,maximum:200},sourceImageId:{type:'string',minLength:1},
  observationId:{type:'string',minLength:1},lineId:{type:'string',minLength:1},quote:{type:'string',minLength:1,maxLength:240},
}};
export const AI_EXTRACTION_SCHEMA={type:'object',additionalProperties:false,required:['kind','candidates'],properties:{
  kind:{type:'string',enum:Object.keys(AI_EXTRACTION_KIND_FIELDS)},
  candidates:{type:'array',maxItems:8,items:{type:'object',additionalProperties:false,required:['field','rawValue','evidence'],properties:{
    field:{type:'string',enum:Object.keys(AI_EXTRACTION_FIELDS)},rawValue:{type:'string',minLength:1,maxLength:180},
    evidence:{type:'array',minItems:1,maxItems:3,items:evidenceSchema},
  }}},
}};
export function skippedAiExtraction(reason='not_requested') {
  return {stage:'extraction',state:'skipped',reason,version:AI_EXTRACTION_VERSION,model:null,modelStatus:'not_used',
    limits:{...AI_EXTRACTION_LIMITS},attemptedPageCount:0,candidates:[],origin:'ai',verified:false,requiresReview:true,canAutoFile:false};
}
const fail=()=>{throw new Error('invalid_ai_extraction');};
const exactKeys=(value,keys)=>value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).length===keys.length && keys.every(key=>Object.hasOwn(value,key));
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;

/**
 * Validate proposals against already retained source observations, never model
 * supplied observations. This verifies the source link and verbatim text, not
 * semantic correctness. Dates/amounts remain literal strings, not inferred or
 * normalized values. Image-only proposals need manual transcription for now.
 * @returns {{kind:string,candidates:Array<{field:string,valueType:string,rawValue:string,origin:string,status:string,verified:boolean,requiresReview:boolean,canAutoFile:boolean,provenance:object}>}}
 */
export function validateAiExtraction(value,{documentId,pages,model,imageHashes={}}={}) {
  if(!text(documentId,240)||!text(model,120)||!Array.isArray(pages)||!exactKeys(value,['kind','candidates'])||!Object.hasOwn(AI_EXTRACTION_KIND_FIELDS,value.kind)||!Array.isArray(value.candidates)||value.candidates.length>AI_EXTRACTION_LIMITS.maxCandidates)fail();
  const seen=new Set();
  const candidates=value.candidates.map(candidate=>{
    if(!exactKeys(candidate,['field','rawValue','evidence'])||!AI_EXTRACTION_KIND_FIELDS[value.kind].includes(candidate.field)||!text(candidate.rawValue,180)||!Array.isArray(candidate.evidence)||!candidate.evidence.length||candidate.evidence.length>3)fail();
    const duplicate=JSON.stringify([candidate.field,candidate.rawValue]);if(seen.has(duplicate))fail();seen.add(duplicate);
    const evidence=candidate.evidence.map(item=>{
      if(!exactKeys(item,['pageId','pageNumber','sourceImageId','observationId','lineId','quote'])||!Number.isInteger(item.pageNumber)||item.pageNumber<1||item.pageNumber>200||!text(item.quote,240)||['pageId','sourceImageId','observationId','lineId'].some(key=>!text(item[key],240)))fail();
      const matching=pages.filter(page=>page.id===item.pageId&&page.number===item.pageNumber);if(matching.length!==1)fail();
      const observations=matching[0].observations?.filter(observation=>observation.id===item.observationId&&observation.sourceImageId===item.sourceImageId&&observation.source!=='ai') || [];
      if(observations.length!==1)fail();
      const lines=observations[0].lines?.filter(line=>line.id===item.lineId)||[];
      if(lines.length!==1||typeof lines[0].text!=='string'||!lines[0].text.includes(item.quote)||!item.quote.includes(candidate.rawValue))fail();
      // Hashes and boxes, when available, come only from trusted input.
      const hash=imageHashes[item.sourceImageId];
      return {...item,...(typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash)?{imageHash:hash}:{}),...(lines[0].box?{box:{...lines[0].box}}:{}),sourceLinkVerified:true,semanticVerified:false};
    });
    return {field:candidate.field,valueType:AI_EXTRACTION_FIELDS[candidate.field],rawValue:candidate.rawValue,origin:'ai',status:'needs_review',verified:false,requiresReview:true,canAutoFile:false,
      provenance:{documentId,kind:value.kind,model,version:AI_EXTRACTION_VERSION,evidence}};
  });
  return {kind:value.kind,candidates,origin:'ai',verified:false,requiresReview:true,canAutoFile:false,version:AI_EXTRACTION_VERSION};
}

export const AI_EXTRACTION_PROVIDER_SCHEMA={type:'object',additionalProperties:false,required:['kind','quality','candidates'],properties:{
  kind:{type:'string',enum:Object.keys(AI_EXTRACTION_KIND_FIELDS)},quality:{type:'string',enum:['readable','partial','unreadable']},
  candidates:{type:'array',maxItems:AI_EXTRACTION_LIMITS.maxCandidates,items:{type:'object',additionalProperties:false,required:['field','rawValue','quote','location'],properties:{
    field:{type:'string',enum:Object.keys(AI_EXTRACTION_FIELDS)},rawValue:{type:'string',minLength:1,maxLength:180},
    quote:{type:'string',minLength:1,maxLength:240},location:{type:'string',enum:['top','middle','bottom']},
  }}},
}};
export function extractionFields(kind,fields) {
  return Object.hasOwn(AI_EXTRACTION_KIND_FIELDS,kind)&&Array.isArray(fields)?fields.filter(field=>AI_EXTRACTION_KIND_FIELDS[kind].includes(field)):[];
}
export function validateAiExtractionResponse(value,{kind,fields}={}) {
  if(!exactKeys(value,['kind','quality','candidates'])||value.kind!==kind||!Object.hasOwn(AI_EXTRACTION_KIND_FIELDS,kind)||!['readable','partial','unreadable'].includes(value.quality)||!Array.isArray(value.candidates)||value.candidates.length>AI_EXTRACTION_LIMITS.maxCandidates)fail();
  const allowed=extractionFields(kind,fields),seen=new Set();
  const candidates=value.candidates.map(candidate=>{
    if(!exactKeys(candidate,['field','rawValue','quote','location'])||!allowed.includes(candidate.field)||!text(candidate.rawValue,180)||!text(candidate.quote,240)||!candidate.quote.includes(candidate.rawValue)||!['top','middle','bottom'].includes(candidate.location))fail();
    const key=JSON.stringify([candidate.field,candidate.rawValue]);if(seen.has(key))fail();seen.add(key);
    return {...candidate,valueType:AI_EXTRACTION_FIELDS[candidate.field],origin:'ai',verified:false,requiresReview:true,canAutoFile:false};
  });
  if(value.quality==='unreadable'&&candidates.length)fail();
  return {kind,quality:value.quality,candidates,status:'needs_review',version:AI_EXTRACTION_VERSION,origin:'ai',verified:false,requiresReview:true,canAutoFile:false};
}

// Only quotes independently present in the retained page can become source-
// linked proposals. Image-only or conflicting readings are not admitted.
export function admitAiExtractionCandidates(value,{documentId,groupId,page,sourceImageId,model,imageHash,fields}={}) {
  const checked=validateAiExtractionResponse({kind:value.kind,quality:value.quality,candidates:value.candidates.map(({field,rawValue,quote,location})=>({field,rawValue,quote,location}))},{kind:value.kind,fields});
  const candidates=[],rejected=[];
  for(const candidate of checked.candidates){
    const matches=[];
    for(const observation of page?.observations||[]){
      if(!observation.sourceImageId || observation.source==='ai')continue;
      for(const line of observation.lines||[]){
        if(typeof line.text==='string'&&line.text.includes(candidate.quote))matches.push({pageId:page.id,pageNumber:page.number,sourceImageId:observation.sourceImageId,observationId:observation.id,lineId:line.id,quote:candidate.quote});
      }
    }
    if(!matches.length){rejected.push({field:candidate.field,reason:'source_quote_not_found'});continue;}
    try{
      const validated=validateAiExtraction({kind:checked.kind,candidates:[{field:candidate.field,rawValue:candidate.rawValue,evidence:[matches[0]]}]},{documentId,pages:[page],model});
      const admitted=validated.candidates[0];
      candidates.push({...admitted,groupId,provenance:{...admitted.provenance,providerImage:{pageId:page.id,pageNumber:page.number,sourceImageId,imageHash},location:candidate.location,...(typeof value.checkedAt==='string'?{checkedAt:value.checkedAt}:{})}});
    }catch{rejected.push({field:candidate.field,reason:'source_link_invalid'});}
  }
  return {candidates,rejected};
}
