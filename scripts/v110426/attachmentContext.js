export function attachmentContext(guide, step) {
  const type = step?.documentType;
  const loadNo = String(guide?.loadNo || guide?.orderNo || '').trim();
  if (!guide?.id || !loadNo || !['bol', 'pod'].includes(type)) return null;
  const deliveries = (guide.stops || []).filter(s => s.type === 'delivery').map((s, i) => ({...s, deliverySequence:i + 1}));
  const stop = type === 'pod' ? (deliveries.find(s => s.deliverySequence === Number(step.stopSequence)) || deliveries.filter(s => s.role !== 'trailer_return').at(-1)) : null;
  return {guideId:guide.id, loadNo, type, broker:guide.broker || '', stop:stop || null, stopSequence:stop?.deliverySequence || 0, isFinalStop:step.id === 'final_pod'};
}

export async function saveLoadAttachment({file, context, date, state, storage, buildRecord, upsertRecord, readStore, writeStore}) {
  if (!file || !context?.guideId || !context.loadNo || !['bol', 'pod'].includes(context.type)) throw new Error('Open the load again and choose Add.');
  const fields = {type:context.type, title:`${context.type.toUpperCase()} · Load ${context.loadNo}`, loadNo:context.loadNo, canonicalLoadNo:context.loadNo, guideId:context.guideId, documentDate:date, date, stopSequence:context.stopSequence, linkToLogbook:false};
  if (context.type === 'pod') Object.assign(fields, {podSigned:true, signatureSource:'driver_added_signed_pod'});
  const stored = await storage({file, type:context.type, title:fields.title, metadata:{loadNo:context.loadNo, relationType:context.type}, extracted:fields, classification:{selectedType:context.type, method:'driver_add', confidence:0}});
  const record = buildRecord({stored, type:{id:context.type, label:context.type.toUpperCase()}, fields, analysis:{fields, method:'driver_add'}, match:{matched:true, loadNo:context.loadNo, canonicalLoadId:context.guideId, broker:context.broker}, selectedLoadNo:context.loadNo, selectedStop:context.stop, selectedStopSequence:context.stopSequence, documentDate:date, userConfirmed:true, linkToLogbook:false});
  Object.assign(record, {guideId:context.guideId, isFinalStop:context.isFinalStop, attachmentSource:'driver_checklist', ...(context.type === 'pod' ? {podSigned:true} : {})});
  writeStore(upsertRecord(readStore(), record, state));
  return record;
}
