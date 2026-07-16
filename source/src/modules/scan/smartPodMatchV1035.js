function text(value = '') {
  return value === 0 ? '0' : String(value || '').replace(/\s+/g, ' ').trim();
}

function upper(value = '') {
  return text(value).toUpperCase();
}

function ref(value = '') {
  return upper(value).replace(/[^A-Z0-9-]/g, '');
}

function dayKey(value = '') {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (!match) return '';
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${String(match[1]).padStart(2, '0')}-${String(match[2]).padStart(2, '0')}`;
}

function normalized(value = '') {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function cityKey(value = '') {
  return normalized(value).replace(/^saint /, 'st ');
}

function place(value = {}) {
  return [text(value.city || value.deliveryCity || value.toCity), upper(value.state || value.deliveryState || value.toState).slice(0, 2)].filter(Boolean).join(', ');
}

function samePlace(a = {}, b = {}) {
  const ac = cityKey(a.city || a.deliveryCity || a.toCity);
  const bc = cityKey(b.city || b.deliveryCity || b.toCity);
  const as = upper(a.state || a.deliveryState || a.toState).slice(0, 2);
  const bs = upper(b.state || b.deliveryState || b.toState).slice(0, 2);
  return Boolean(ac && bc && as && bs && as === bs && (ac === bc || ac.includes(bc) || bc.includes(ac)));
}

function terminal(value = '') {
  return /^(?:delivered|completed|closed|cancelled|canceled|archived|dismissed)$/i.test(text(value));
}

function guideDeliveries(guide = {}) {
  return (Array.isArray(guide.stops) ? guide.stops : [])
    .filter(stop => stop?.type === 'delivery')
    .map((stop, index, all) => ({ ...stop, deliverySequence:index + 1, deliveryCount:all.length }));
}

function guideReferences(guide = {}) {
  return new Set([guide.loadNo, guide.orderNo, guide.legNo, guide.pickupNumber].map(ref).filter(Boolean));
}

function fieldReferences(fields = {}) {
  return [...new Set([
    fields.loadNo,
    fields.bolNo,
    fields.poNumber,
    fields.orderNo,
    fields.legNo,
    fields.deliveryNo,
    fields.salesOrder,
  ].map(ref).filter(Boolean))];
}

function eventReferences(event = {}) {
  return [event.loadNo, event.shippingDocs, event.orderNo, event.legNo, event.bol, event.po, event.stopPo]
    .map(ref)
    .filter(Boolean);
}

function eventEntries(state = {}) {
  return Object.entries(state.eventsByDay || {}).flatMap(([day, rows]) => (
    (Array.isArray(rows) ? rows : []).map(event => ({ day, event }))
  ));
}

function deliveryEventForStop(state = {}, guide = {}, stop = {}) {
  const refs = guideReferences(guide);
  const candidates = eventEntries(state).filter(({ event }) => {
    if (event?.status !== 'ON') return false;
    if (!/delivery|unloading|received|delivered/i.test(`${event.note || ''} ${event.description || ''}`)) return false;
    if (!samePlace(event, stop)) return false;
    const eventRefs = eventReferences(event);
    return !eventRefs.length || eventRefs.some(value => refs.has(value));
  });
  return candidates.sort((a, b) => String(b.day).localeCompare(String(a.day)) || Number(b.event.startMin || 0) - Number(a.event.startMin || 0))[0] || null;
}

function activeGuides(state = {}) {
  const guides = Object.values(state.loadGuidesById || {}).filter(guide => guide && !terminal(guide.status));
  const preferredId = text(state.activeLoadGuideId || state.loadInfo?.guideId);
  return guides.sort((a, b) => Number(text(b.id) === preferredId) - Number(text(a.id) === preferredId));
}

function haystack(fields = {}, analysis = {}) {
  return normalized([
    analysis?.text,
    fields.origin,
    fields.destination,
    fields.shipFromDetails,
    fields.shipToDetails,
    fields.receiver,
    fields.consignee,
    fields.shipper,
    fields.poNumber,
    fields.bolNo,
    fields.loadNo,
    fields.title,
  ].filter(Boolean).join(' '));
}

function containsToken(source = '', value = '', minLength = 3) {
  const token = normalized(value);
  return token.length >= minLength && source.includes(token);
}

function scoreStop(state = {}, guide = {}, stop = {}, fields = {}, analysis = {}) {
  const body = haystack(fields, analysis);
  const refs = fieldReferences(fields);
  const guideRefs = guideReferences(guide);
  const stopPo = ref(stop.poNumber);
  const stopDate = dayKey(stop.date || stop.appointment);
  const docDate = dayKey(fields.deliveryDate || fields.date || fields.documentDate);
  const destination = text(fields.destination || fields.shipToDetails || fields.receiver || fields.consignee);
  const eventMatch = deliveryEventForStop(state, guide, stop);
  let score = 0;
  const reasons = [];

  if (refs.some(value => guideRefs.has(value))) { score += 150; reasons.push('load/order/leg reference'); }
  if (stopPo && refs.includes(stopPo)) { score += 190; reasons.push('stop PO'); }
  else if (stopPo && body.includes(normalized(stop.poNumber))) { score += 115; reasons.push('stop PO in document text'); }
  if (destination && samePlace({ city:destination.match(/([A-Za-z][A-Za-z .'-]+),\s*([A-Za-z]{2})/)?.[1], state:destination.match(/([A-Za-z][A-Za-z .'-]+),\s*([A-Za-z]{2})/)?.[2] }, stop)) {
    score += 95;
    reasons.push('receiver location');
  }
  if (containsToken(body, stop.city, 4)) { score += 62; reasons.push('receiver city in document'); }
  const companyWords = normalized(stop.company).split(' ').filter(word => word.length >= 5);
  const companyHits = companyWords.filter(word => body.includes(word)).length;
  if (companyHits >= 2) { score += 62; reasons.push('receiver company'); }
  else if (companyHits === 1) { score += 28; reasons.push('receiver name token'); }
  if (stopDate && docDate && stopDate === docDate) { score += 22; reasons.push('document/stop date'); }
  if (eventMatch) { score += 105; reasons.push('delivery event on log'); }
  if (text(guide.id) === text(state.activeLoadGuideId || state.loadInfo?.guideId)) score += 24;
  if (samePlace(state.currentLocation || {}, stop)) score += 18;

  return { score, reasons, eventMatch };
}

function fallbackLoadMatch(state = {}, guides = []) {
  const preferred = guides[0] || null;
  const loadNo = text(preferred?.loadNo || preferred?.orderNo || state.loadInfo?.loadNo || state.loadInfo?.orderNo || state.loadInfo?.shippingDocs);
  if (!loadNo) return null;
  return {
    matched:true,
    loadOnly:true,
    ambiguous:guides.length > 1,
    loadNo,
    orderNo:text(preferred?.orderNo || loadNo),
    legNo:text(preferred?.legNo || state.loadInfo?.legNo),
    guideId:text(preferred?.id || state.loadInfo?.guideId),
    confidence:guides.length <= 1 ? .78 : .55,
    reason:guides.length <= 1 ? `Only active load ${loadNo}` : 'Multiple active loads; confirm the load before saving',
  };
}

export function matchSmartPodToLoadV1035(state = {}, typeId = 'other', fields = {}, analysis = {}) {
  if (text(typeId).toLowerCase() !== 'pod') return null;
  const guides = activeGuides(state);
  if (!guides.length) return fallbackLoadMatch(state, guides);
  const candidates = [];
  for (const guide of guides) {
    for (const stop of guideDeliveries(guide)) {
      const scored = scoreStop(state, guide, stop, fields, analysis);
      candidates.push({ guide, stop, ...scored });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0] || null;
  const second = candidates[1] || null;
  const strong = best && (best.score >= 90 || (guides.length === 1 && best.score >= 55));
  const separated = !second || best.score - second.score >= 24 || best.guide.id === second.guide.id;
  if (!best || !strong || !separated) return fallbackLoadMatch(state, guides);

  const guide = best.guide;
  const stop = best.stop;
  const event = best.eventMatch;
  const deliveries = guideDeliveries(guide);
  const loadNo = text(guide.loadNo || guide.orderNo || state.loadInfo?.loadNo);
  const existingLoadRef = ref(fields.loadNo);
  const validGuideRefs = guideReferences(guide);
  const shouldOverrideLoadNo = !existingLoadRef || !validGuideRefs.has(existingLoadRef);
  const linkDay = event?.day || dayKey(stop.date || stop.appointment);
  const confidence = best.score >= 260 ? .99 : best.score >= 180 ? .95 : best.score >= 120 ? .9 : .82;
  const stopText = place(stop);
  return {
    matched:true,
    loadOnly:false,
    ambiguous:false,
    confidence,
    score:best.score,
    reason:[`POD matched load ${loadNo}`, stop.poNumber ? `PO ${stop.poNumber}` : '', stopText, event ? 'delivery event found' : 'Rate Con stop'].filter(Boolean).join(' · '),
    guideId:text(guide.id),
    loadNo,
    orderNo:text(guide.orderNo || loadNo),
    legNo:text(guide.legNo || state.loadInfo?.legNo),
    shouldOverrideLoadNo,
    originalLoadNo:text(fields.loadNo),
    stopId:text(stop.id || `delivery_${stop.deliverySequence}`),
    stopSequence:Number(stop.deliverySequence),
    stopCount:deliveries.length,
    stopPo:text(stop.poNumber),
    stopCompany:text(stop.company),
    stopAddress:text(stop.address || stop.cityState || stopText),
    stopCity:text(stop.city),
    stopState:upper(stop.state).slice(0, 2),
    linkDay,
    eventId:text(event?.event?.id),
    finalStop:Number(stop.deliverySequence) === deliveries.length,
  };
}

export function applySmartPodMatchV1035(fields = {}, match = null) {
  if (!match?.matched) return fields;
  const replaceLoad = match.shouldOverrideLoadNo || !text(fields.loadNo);
  return {
    ...fields,
    ...(replaceLoad ? { loadNo:match.loadNo } : {}),
    ...(match.linkDay ? { linkDay:match.linkDay } : {}),
    ...(match.eventId ? { linkEventId:match.eventId } : {}),
    ...(!text(fields.poNumber) && match.stopPo ? { poNumber:match.stopPo } : {}),
    ...(!text(fields.destination) && match.stopAddress ? { destination:match.stopAddress } : {}),
    orderNo:match.orderNo || fields.orderNo || '',
    legNo:match.legNo || fields.legNo || '',
    matchedGuideId:match.guideId || '',
    matchedStopId:match.stopId || '',
    matchedStopSequence:Number(match.stopSequence || 0),
    matchedStopCount:Number(match.stopCount || 0),
    matchedStopPo:match.stopPo || '',
    matchedStopCompany:match.stopCompany || '',
    matchedStopAddress:match.stopAddress || '',
    matchedLogDay:match.linkDay || '',
    matchedEventId:match.eventId || '',
    loadMatchSource:match.loadOnly ? 'single_active_load_v1035' : 'pod_ratecon_stop_v1035',
    loadMatchConfidence:Number(match.confidence || 0),
    loadMatchReason:match.reason || '',
    ocrLoadNoOriginal:match.shouldOverrideLoadNo ? match.originalLoadNo || '' : fields.ocrLoadNoOriginal || '',
    podFinalStop:match.finalStop === true,
  };
}

export function applySmartPodSuggestionV1035(suggestion = {}, match = null) {
  if (!match?.matched || !match.linkDay) return suggestion;
  return {
    ...suggestion,
    day:match.linkDay,
    eventId:match.eventId || suggestion.eventId || '',
    confidence:Math.max(Number(suggestion.confidence || 0), Number(match.confidence || 0)),
    score:Math.max(Number(suggestion.score || 0), Number(match.score || 0)),
    reason:match.reason || suggestion.reason,
    automatic:match.ambiguous !== true && Number(match.confidence || 0) >= .78,
    podMatch:match,
  };
}

function documentType(document = {}) {
  return text(document.extracted?.type || document.classification?.selectedType || document.type || document.label).toLowerCase();
}

function documentLoadNo(document = {}) {
  return ref(document.loadNo || document.load_no || document.extracted?.loadNo || document.extracted?.orderNo || document.extracted?.bolNo);
}

export function podBillingPatchV1035({ store = {}, loadNo = '', date = '', podDocumentId = '', fields = {} } = {}) {
  const key = ref(loadNo);
  if (!key) return null;
  const loads = Array.isArray(store.loads) ? store.loads : [];
  const load = loads.find(row => ref(row.loadNo || row.orderNo) === key);
  if (!load) return null;
  const docs = (Array.isArray(store.documents) ? store.documents : []).filter(document => documentLoadNo(document) === key);
  const types = new Set(docs.map(documentType));
  const hasRate = types.has('rate_confirmation') || types.has('rate confirmation') || Boolean(load.documentId || load.rateConDocumentId);
  const hasBol = types.has('bol') || types.has('bill of lading');
  const finalPod = fields.podFinalStop === true || docs.some(document => documentType(document) === 'pod' && document.extracted?.podFinalStop === true && document.extracted?.podSigned !== false);
  const ready = hasRate && hasBol && finalPod;
  const sequence = Number(fields.matchedStopSequence || fields.deliveryStopSequence || 0);
  const stopKey = text(fields.matchedStopId || (sequence ? `stop_${sequence}` : '') || podDocumentId);
  const stopDocuments = { ...(load.podStopDocuments || {}) };
  if (stopKey) stopDocuments[stopKey] = {
    documentId:podDocumentId,
    sequence:sequence || null,
    po:text(fields.matchedStopPo || fields.poNumber),
    company:text(fields.matchedStopCompany),
    address:text(fields.matchedStopAddress),
    logDay:text(fields.linkDay || fields.matchedLogDay),
    finalStop:fields.podFinalStop === true,
    signed:fields.podSigned !== false,
    receivedAt:Date.now(),
  };
  const currentStatus = text(load.status).toLowerCase();
  const protectedStatus = ['paid','submitted','invoiced'].includes(currentStatus);
  return {
    loadId:load.id,
    ready,
    hasRate,
    hasBol,
    finalPod,
    intermediatePod:!finalPod,
    patch:{
      status:protectedStatus ? load.status : (ready ? 'invoice_ready' : (currentStatus && currentStatus !== 'delivered' ? load.status : 'in_progress')),
      ...(finalPod ? { deliveredDate:load.deliveredDate || date || '', podDocumentId:podDocumentId || load.podDocumentId || '' } : {}),
      podStopDocuments:stopDocuments,
      billingStage:ready ? 'ready_for_factoring' : (finalPod ? 'final_pod_received' : 'partial_pod_received'),
      factoringStatus:ready ? 'ready_to_submit' : (finalPod ? 'missing_paperwork' : 'final_stop_pod_pending'),
      updatedFromPod:true,
    },
  };
}
