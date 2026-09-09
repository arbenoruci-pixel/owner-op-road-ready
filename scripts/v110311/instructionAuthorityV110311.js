export const INSTRUCTION_GUIDE_SOURCE_V110311='load_instructions_v110311';
export const instructionRefV110311=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function instructionBrokerKeyV110311(value='') {
 const text=String(value);if(/\btql\b|total\s+quality\s+logistics/i.test(text))return 'tql';
 return text.toLowerCase().replace(/\b(?:llc|inc|logistics|transportation)\b/g,'').replace(/[^a-z0-9]/g,'');
}
export function instructionGuideBackedV110311(guide={}) {
 return guide.source===INSTRUCTION_GUIDE_SOURCE_V110311 && guide.instructionEvidenceV110311===true && Boolean(guide.sourceDocumentId) && /^\d{5,12}$/.test(guide.loadNo||'') && Boolean(guide.broker) && (guide.stops||[]).length>=2 && (guide.steps||[]).length>0;
}
export function instructionLoadBackedV110311(load={},documents=[]) {
 if(load.source!==INSTRUCTION_GUIDE_SOURCE_V110311)return false;
 return documents.some(d=>d.id===load.documentId&&d.type==='load_tender'&&d.status==='verified'&&instructionRefV110311(d.canonicalLoadNo)===instructionRefV110311(load.loadNo)&&instructionBrokerKeyV110311(d.broker)===instructionBrokerKeyV110311(load.broker)&&Boolean(d.instructionGuide||d.extracted?.instructionPlanV110311));
}
export function preserveInstructionSelectionV110311(before={},after={}) {
 const id=before.activeLoadGuideId,guide=after.loadGuidesById?.[id];
 if(!instructionGuideBackedV110311(guide)||guide.status!=='active'||guide.excludedFromActiveLoad)return after;
 return {...after,activeLoadGuideId:id,loadInfo:{...before.loadInfo,guideId:id,loadNo:guide.loadNo,shippingDocs:guide.loadNo,orderNo:guide.loadNo,broker:guide.broker,source:guide.source,stops:guide.stops,pickupDate:guide.pickupDate,deliveryDate:guide.deliveryDate}};
}
