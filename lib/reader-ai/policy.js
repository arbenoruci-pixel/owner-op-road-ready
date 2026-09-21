// Shared by the server and the reader. AI evidence is a visual suggestion,
// never an OCR observation, a human confirmation, or permission to file a load.
export const AI_READER_VERSION = 'document-classification-v1';
export const AI_KINDS = ['bol', 'pod', 'fuel_receipt', 'rate_confirmation', 'unloading_receipt', 'receipt', 'packing_list', 'invoice', 'other'];
export const AI_LABELS = {bol:'BOL', pod:'POD', fuel_receipt:'Fuel receipt', rate_confirmation:'Rate confirmation', unloading_receipt:'Lumper receipt', receipt:'Receipt', packing_list:'Packing list', invoice:'Invoice', other:'Uncertain document'};
export const EVIDENCE_CODES = ['heading', 'shipping_structure', 'receiver_acknowledgement', 'fuel_product', 'fuel_dispensing', 'payment', 'unloading_service', 'rate_agreement', 'item_list'];
const generic = new Set(['unknown', 'other', 'receipt', 'other_expense']);

export function aiClassificationReason(identity, text = '') {
  if (identity?.status === 'confirmed') return null;
  if (!identity || generic.has(identity.kind)) return 'uncertain_type';
  if (identity.status !== 'supported') return 'conflicting_or_weak_type';
  // Handwriting/stamps can be visible even when OCR sees only a printed label.
  if (identity.kind === 'bol' && /\b(?:received\s+by|receiver\s+signature|consignee\s+signature|delivery\s+receipt)\b/i.test(text)) return 'delivery_acknowledgement';
  return null;
}

export const AI_CLASSIFICATION_SCHEMA = {
  type:'object', additionalProperties:false,
  required:['kind','certainty','quality','mixed','delivery','evidence'],
  properties:{
    kind:{type:'string',enum:AI_KINDS},
    certainty:{type:'string',enum:['clear','uncertain']},
    quality:{type:'string',enum:['readable','partial','unreadable']},
    mixed:{type:'boolean'},
    delivery:{type:'string',enum:['receiver_signed','receiver_stamped','blank','pickup_only','uncertain','none']},
    evidence:{type:'array',maxItems:5,items:{type:'object',additionalProperties:false,required:['code','quote','location'],properties:{
      code:{type:'string',enum:EVIDENCE_CODES},quote:{type:'string',maxLength:180},location:{type:'string',enum:['top','middle','bottom']},
    }}},
  },
};

export function validateAiClassification(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_ai_result');
  const keys = Object.keys(AI_CLASSIFICATION_SCHEMA.properties);
  if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !(key in value))) throw new Error('invalid_ai_result');
  if (!AI_KINDS.includes(value.kind) || !['clear','uncertain'].includes(value.certainty) || !['readable','partial','unreadable'].includes(value.quality) || typeof value.mixed !== 'boolean' || !AI_CLASSIFICATION_SCHEMA.properties.delivery.enum.includes(value.delivery)) throw new Error('invalid_ai_result');
  if (!Array.isArray(value.evidence) || value.evidence.length > 5) throw new Error('invalid_ai_result');
  const evidence = value.evidence.map(item => {
    if (!item || Object.keys(item).length !== 3 || !EVIDENCE_CODES.includes(item.code) || typeof item.quote !== 'string' || !item.quote.trim() || item.quote.length > 180 || !['top','middle','bottom'].includes(item.location)) throw new Error('invalid_ai_result');
    return {code:item.code,quote:item.quote.trim(),location:item.location};
  });
  const codes = new Set(evidence.map(item => item.code));
  const has = (...items) => items.every(item => codes.has(item));
  const enough = {
    bol:has('heading','shipping_structure'),
    pod:has('shipping_structure','receiver_acknowledgement') && ['receiver_signed','receiver_stamped'].includes(value.delivery),
    fuel_receipt:has('fuel_product','fuel_dispensing','payment'),
    rate_confirmation:has('heading','rate_agreement'),
    unloading_receipt:has('unloading_service','payment'),
    receipt:has('heading','payment'),
    packing_list:has('heading','item_list'),
    invoice:has('heading','payment'),
  }[value.kind];
  const contradictoryBol = value.kind === 'bol' && ['receiver_signed','receiver_stamped','uncertain'].includes(value.delivery);
  return {...value,evidence,status:value.certainty === 'clear' && value.quality !== 'unreadable' && !value.mixed && enough && !contradictoryBol ? 'suggested' : 'needs_review',
    origin:'ai',verified:false,requiresReview:true,canAutoFile:false,version:AI_READER_VERSION};
}

export function aiStatusMessage(status) {
  return ({not_configured:'AI assistance is not enabled. Check the original page.',offline:'Offline. Check the original page or read again when connected.',signed_out:'Sign in to use AI assistance.',unavailable:'AI is unavailable. Your local reading is still available.',limit_reached:'AI usage limit reached. Check the original page.',source_unavailable:'AI needs the original page image. Check or rescan this page.',invalid_ai_result:'AI could not verify a type. Check the original page.',cancelled:'AI check cancelled.'})[status] || 'Check the original page.';
}
