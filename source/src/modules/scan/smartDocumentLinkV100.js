import { localDayKey } from '../../shared/utils/date.js';
import { applyShippingDocumentReference, findShippingDocsTargetEvent, isDeliveryLoadEvent, isPickupLoadEvent } from '../../core/routes/shippingDocsRepair.js';

export const SMART_DOCUMENT_LINK_EVENT = 'road-ready-smart-document-link-v100';

function text(value = '') {
  return String(value || '').trim();
}

function dayKey(value = '') {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (!match) return '';
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${String(match[1]).padStart(2, '0')}-${String(match[2]).padStart(2, '0')}`;
}

function ref(value = '') {
  return text(value).toUpperCase().replace(/\s+/g, '');
}

function refsFromObject(value = {}) {
  return [...new Set([
    value.shippingDocs,
    value.loadNo,
    value.bol,
    value.bolNo,
    value.po,
    value.poNumber,
    value.orderNo,
  ].map(ref).filter(Boolean))];
}

function routeEntries(state = {}) {
  return Object.entries(state.routeLegsByDay || {}).flatMap(([homeDay, legs]) => (
    (Array.isArray(legs) ? legs : []).map((leg, index) => ({ homeDay, index, leg }))
  ));
}

function eventEntries(state = {}) {
  return Object.entries(state.eventsByDay || {}).flatMap(([day, events]) => (
    (Array.isArray(events) ? events : []).map((event, index) => ({ day, index, event }))
  ));
}

function normalizedPlace(value = '') {
  const raw = text(value).toLowerCase().replace(/[^a-z0-9, ]/g, ' ').replace(/\s+/g, ' ');
  const match = raw.match(/([a-z][a-z .'-]{2,45}),\s*([a-z]{2})\b/);
  return match ? `${match[1].trim()}, ${match[2].toUpperCase()}` : raw.trim();
}

function samePlace(a = '', b = '') {
  const left = normalizedPlace(a);
  const right = normalizedPlace(b);
  return !!left && !!right && (left === right || left.includes(right) || right.includes(left));
}

function eventPlace(event = {}) {
  return [event.city, event.state].filter(Boolean).join(', ');
}

function legDay(entry = {}) {
  return entry.leg?.pickupDay || entry.leg?.day || entry.homeDay || entry.leg?.deliveryDay || '';
}

function candidateDays(state = {}) {
  return [...new Set([
    ...Object.keys(state.eventsByDay || {}),
    ...Object.keys(state.routeLegsByDay || {}),
    localDayKey(),
  ].filter(Boolean))].sort();
}

export function suggestSmartDocumentLinkV100(state = {}, typeId = 'other', fields = {}) {
  const documentDay = dayKey(fields.date || fields.documentDate || fields.pickupDate || '');
  const documentRefs = [...new Set([
    fields.loadNo,
    fields.bolNo,
    fields.poNumber,
    fields.invoiceNo,
    fields.transactionId,
  ].map(ref).filter(Boolean))];
  const origin = fields.origin || fields.shipFromDetails || '';
  const destination = fields.destination || fields.shipToDetails || '';
  const scores = new Map();
  const evidence = new Map();
  const eventMatch = new Map();

  function add(day, points, reason, eventId = '') {
    if (!day) return;
    scores.set(day, Number(scores.get(day) || 0) + points);
    const reasons = evidence.get(day) || [];
    if (reason && !reasons.includes(reason)) reasons.push(reason);
    evidence.set(day, reasons);
    if (eventId && !eventMatch.has(day)) eventMatch.set(day, eventId);
  }

  if (documentDay) add(documentDay, 45, 'Document date matches this log day');
  if (!documentDay) add(localDayKey(), 10, 'No document date; today is suggested for review');

  for (const { day, event } of eventEntries(state)) {
    const eventRefs = refsFromObject(event);
    const exact = documentRefs.some(value => eventRefs.includes(value));
    if (exact) add(day, 120, 'Load/BOL reference matches a log event', event.id || '');
    if (typeId === 'bol' || typeId === 'pod' || typeId === 'rate_confirmation') {
      if (origin && isPickupLoadEvent(event) && samePlace(origin, eventPlace(event))) add(day, 28, 'Shipper matches the pickup event', event.id || '');
      if (destination && isDeliveryLoadEvent(event) && samePlace(destination, eventPlace(event))) add(day, 28, 'Receiver matches the delivery event', event.id || '');
      if (documentDay === day && (isPickupLoadEvent(event) || isDeliveryLoadEvent(event))) add(day, 22, 'Load work exists on the document date', event.id || '');
    }
    if (typeId === 'fuel_receipt' && /fuel/i.test(`${event.note || ''} ${event.description || ''}`)) {
      if (!documentDay || documentDay === day) add(day, 60, 'Fuel event matches the receipt date', event.id || '');
    }
  }

  for (const entry of routeEntries(state)) {
    const day = legDay(entry);
    const leg = entry.leg || {};
    const exact = documentRefs.some(value => refsFromObject(leg).includes(value));
    if (exact) add(day, 130, 'Load/BOL reference matches the route leg', leg.pickupEventId || leg.deliveryEventId || '');
    const from = [leg.fromCity, leg.fromState].filter(Boolean).join(', ');
    const to = [leg.toCity, leg.toState].filter(Boolean).join(', ');
    if (origin && samePlace(origin, from)) add(day, 24, 'Shipper matches the route origin', leg.pickupEventId || '');
    if (destination && samePlace(destination, to)) add(day, 24, 'Receiver matches the route destination', leg.deliveryEventId || leg.pickupEventId || '');
  }

  const loadInfoRefs = refsFromObject(state.loadInfo || {});
  if (documentRefs.some(value => loadInfoRefs.includes(value))) {
    add(state.loadInfo?.sourceEventDay || documentDay || localDayKey(), 115, 'Reference matches the active load', state.loadInfo?.sourceEventId || '');
  }

  const ranked = candidateDays(state).map(day => ({
    day,
    score:Number(scores.get(day) || 0),
    reasons:evidence.get(day) || [],
    eventId:eventMatch.get(day) || '',
  })).sort((a, b) => b.score - a.score || String(b.day).localeCompare(String(a.day)));
  const best = ranked[0] || { day:documentDay || localDayKey(), score:0, reasons:[], eventId:'' };
  const confidence = best.score >= 120 ? .98 : best.score >= 85 ? .9 : best.score >= 55 ? .78 : best.score >= 35 ? .64 : .38;
  return {
    day:best.day || documentDay || localDayKey(),
    eventId:best.eventId,
    confidence,
    score:best.score,
    reason:best.reasons.join(' · ') || 'Choose the log day before saving',
    automatic:best.score >= 55,
    candidates:ranked.slice(0, 5),
  };
}

function documentSummary(payload = {}) {
  const fields = payload.fields || {};
  const local = payload.localDocument || payload.document || {};
  return {
    id:local.local_id || local.id || fields.documentId || `doc_${Date.now()}`,
    clientDocumentId:local.client_document_id || '',
    type:payload.type?.id || payload.typeId || fields.type || 'other',
    title:fields.title || payload.type?.label || 'Document',
    date:fields.date || '',
    loadNo:fields.loadNo || fields.bolNo || '',
    fileName:local.original_file_name || local.fileName || '',
    confidence:Number(payload.analysis?.confidence || payload.confidence || 0),
    linkedAt:Date.now(),
  };
}

function upsertDocumentByDay(state = {}, day = '', document = {}) {
  const map = { ...(state.documentsByDay || {}) };
  const list = [...(map[day] || [])];
  const index = list.findIndex(item => item?.id === document.id);
  if (index >= 0) list[index] = { ...list[index], ...document };
  else list.push(document);
  map[day] = list.slice(-100);
  return map;
}

function patchExactEvent(eventsByDay = {}, day = '', eventId = '', patch = {}) {
  if (!day || !eventId) return eventsByDay || {};
  const list = Array.isArray(eventsByDay?.[day]) ? eventsByDay[day] : [];
  let changed = false;
  const next = list.map(event => {
    if (event?.id !== eventId) return event;
    changed = true;
    return { ...event, ...patch };
  });
  return changed ? { ...(eventsByDay || {}), [day]:next } : eventsByDay || {};
}

function patchLinkedRoute(routeLegsByDay = {}, eventId = '', loadNo = '', patch = {}) {
  const next = { ...(routeLegsByDay || {}) };
  let changed = false;
  Object.entries(next).forEach(([day, legs]) => {
    const list = Array.isArray(legs) ? legs : [];
    const updated = list.map(leg => {
      const exactEvent = eventId && (leg.pickupEventId === eventId || leg.deliveryEventId === eventId);
      const exactRef = loadNo && refsFromObject(leg).includes(ref(loadNo));
      if (!exactEvent && !exactRef) return leg;
      changed = true;
      return { ...leg, ...patch, updatedAt:Date.now() };
    });
    if (updated.some((leg, index) => leg !== list[index])) next[day] = updated;
  });
  return changed ? next : routeLegsByDay || {};
}

function placeParts(value = '') {
  const match = text(value).match(/([A-Za-z][A-Za-z .'-]{1,45}),\s*([A-Za-z]{2})\b/);
  return match ? { city:match[1].trim(), state:match[2].toUpperCase() } : { city:'', state:'' };
}

function linkBolOrPod(state = {}, payload = {}, suggestion = {}) {
  const fields = payload.fields || {};
  const loadNo = text(fields.loadNo || fields.bolNo || fields.poNumber).toUpperCase();
  const day = fields.linkDay || suggestion.day || state.activeDay || localDayKey();
  const eventId = fields.linkEventId || suggestion.eventId || '';
  let next = loadNo ? applyShippingDocumentReference(state, { day, value:loadNo, eventId }) : state;
  const target = findShippingDocsTargetEvent(next, day, eventId) || null;
  const targetId = target?.id || eventId;
  const doc = documentSummary(payload);
  const eventPatch = {
    documentIds:[...new Set([...(target?.documentIds || []), doc.id])],
    shippingDocumentId:doc.id,
    shippingDocumentType:doc.type,
    shippingDocumentDate:fields.date || '',
    shippingDocs:loadNo || target?.shippingDocs || '',
    loadNo:loadNo || target?.loadNo || '',
    bol:fields.bolNo || loadNo || target?.bol || '',
    po:fields.poNumber || target?.po || '',
    seal:fields.seal || target?.seal || '',
    trailerNo:fields.trailerNo || target?.trailerNo || '',
    shipmentWeight:Number(fields.weight || 0) || target?.shipmentWeight || 0,
    shipmentPieces:Number(fields.totalPieces || 0) || target?.shipmentPieces || 0,
    commodity:fields.commodity || target?.commodity || '',
    shipper:fields.shipper || fields.shipFromDetails || target?.shipper || '',
    consignee:fields.consignee || fields.shipToDetails || target?.consignee || '',
    documentLinkedAt:Date.now(),
  };
  const eventsByDay = patchExactEvent(next.eventsByDay || {}, day, targetId, eventPatch);
  const routePatch = {
    shippingDocs:loadNo,
    loadNo,
    bol:fields.bolNo || loadNo,
    po:fields.poNumber || '',
    seal:fields.seal || '',
    trailerNo:fields.trailerNo || '',
    weight:Number(fields.weight || 0) || 0,
    pieces:Number(fields.totalPieces || 0) || 0,
    commodity:fields.commodity || '',
    shippingDocumentId:doc.id,
    shippingDocumentType:doc.type,
    shipFromDetails:fields.shipFromDetails || '',
    shipToDetails:fields.shipToDetails || '',
  };
  const routeLegsByDay = patchLinkedRoute(next.routeLegsByDay || {}, targetId, loadNo, routePatch);
  const from = placeParts(fields.origin || fields.shipFromDetails || '');
  const to = placeParts(fields.destination || fields.shipToDetails || '');
  const loadInfo = {
    ...(next.loadInfo || {}),
    shippingDocs:loadNo || next.loadInfo?.shippingDocs || '',
    loadNo:loadNo || next.loadInfo?.loadNo || '',
    bol:fields.bolNo || loadNo || next.loadInfo?.bol || '',
    po:fields.poNumber || next.loadInfo?.po || '',
    seal:fields.seal || next.loadInfo?.seal || '',
    trailerNo:fields.trailerNo || next.loadInfo?.trailerNo || '',
    pickupCity:from.city || next.loadInfo?.pickupCity || '',
    pickupState:from.state || next.loadInfo?.pickupState || '',
    deliveryCity:to.city || next.loadInfo?.deliveryCity || '',
    deliveryState:to.state || next.loadInfo?.deliveryState || '',
    weight:Number(fields.weight || 0) || next.loadInfo?.weight || 0,
    pieces:Number(fields.totalPieces || 0) || next.loadInfo?.pieces || 0,
    commodity:fields.commodity || next.loadInfo?.commodity || '',
    sourceEventId:targetId || next.loadInfo?.sourceEventId || '',
    sourceEventDay:day,
    shippingDocumentId:doc.id,
    updatedAt:Date.now(),
  };
  const certifyStatus = next.certifyStatus?.[day] === 'Certified'
    ? { ...(next.certifyStatus || {}), [day]:'Needs Recertification' }
    : next.certifyStatus || {};
  return { ...next, eventsByDay, routeLegsByDay, loadInfo, certifyStatus, documentsByDay:upsertDocumentByDay(next, day, doc), lastDocumentLink:{ day, eventId:targetId, documentId:doc.id, type:doc.type, at:Date.now() } };
}

function linkRateConfirmation(state = {}, payload = {}, suggestion = {}) {
  const fields = payload.fields || {};
  const day = fields.linkDay || suggestion.day || dayKey(fields.pickupDate || fields.date) || localDayKey();
  const eventId = fields.linkEventId || suggestion.eventId || '';
  const loadNo = text(fields.loadNo).toUpperCase();
  const doc = documentSummary(payload);
  let next = state;
  if (loadNo && eventId) next = applyShippingDocumentReference(state, { day, value:loadNo, eventId });
  const from = placeParts(fields.origin || '');
  const to = placeParts(fields.destination || '');
  const loadInfo = {
    ...(next.loadInfo || {}),
    loadNo:loadNo || next.loadInfo?.loadNo || '',
    shippingDocs:loadNo || next.loadInfo?.shippingDocs || '',
    broker:fields.broker || next.loadInfo?.broker || '',
    rate:Number(fields.total || fields.gross || 0) || next.loadInfo?.rate || 0,
    gross:Number(fields.total || fields.gross || 0) || next.loadInfo?.gross || 0,
    pickupCity:from.city || next.loadInfo?.pickupCity || '',
    pickupState:from.state || next.loadInfo?.pickupState || '',
    deliveryCity:to.city || next.loadInfo?.deliveryCity || '',
    deliveryState:to.state || next.loadInfo?.deliveryState || '',
    pickupDate:fields.pickupDate || fields.date || '',
    deliveryDate:fields.deliveryDate || '',
    equipment:fields.equipment || next.loadInfo?.equipment || '',
    rateConfirmationDocumentId:doc.id,
    sourceEventDay:day,
    sourceEventId:eventId || next.loadInfo?.sourceEventId || '',
    source:'rate_confirmation_import',
    updatedAt:Date.now(),
  };
  const target = eventId ? (next.eventsByDay?.[day] || []).find(event => event.id === eventId) : null;
  const eventsByDay = target ? patchExactEvent(next.eventsByDay || {}, day, eventId, {
    shippingDocs:loadNo || target.shippingDocs || '',
    loadNo:loadNo || target.loadNo || '',
    destination:fields.destination || target.destination || '',
    rateConfirmationDocumentId:doc.id,
    broker:fields.broker || target.broker || '',
    loadRate:Number(fields.total || 0) || target.loadRate || 0,
    documentIds:[...new Set([...(target.documentIds || []), doc.id])],
  }) : next.eventsByDay || {};
  const routeLegsByDay = patchLinkedRoute(next.routeLegsByDay || {}, eventId, loadNo, {
    shippingDocs:loadNo,
    loadNo,
    fromCity:from.city,
    fromState:from.state,
    toCity:to.city,
    toState:to.state,
    rate:Number(fields.total || 0) || 0,
    broker:fields.broker || '',
    rateConfirmationDocumentId:doc.id,
  });
  return { ...next, eventsByDay, routeLegsByDay, loadInfo, documentsByDay:upsertDocumentByDay(next, day, doc), lastDocumentLink:{ day, eventId, documentId:doc.id, type:doc.type, at:Date.now() } };
}

function linkFuelReceipt(state = {}, payload = {}, suggestion = {}) {
  const fields = payload.fields || {};
  const day = fields.linkDay || suggestion.day || dayKey(fields.date) || localDayKey();
  const eventId = fields.linkEventId || suggestion.eventId || '';
  const doc = documentSummary(payload);
  const list = [...(state.fuelReceiptsByDay?.[day] || [])];
  const record = {
    id:doc.id,
    date:fields.date || day,
    merchant:fields.merchant || '',
    cityState:fields.cityState || '',
    gallons:Number(fields.gallons || 0) || 0,
    pricePerGallon:Number(fields.pricePerGallon || 0) || 0,
    total:Number(fields.total || 0) || 0,
    discount:Number(fields.discount || 0) || 0,
    provider:fields.fuelProvider || '',
    transactionId:fields.transactionId || '',
    linkedEventId:eventId,
    linkedAt:Date.now(),
  };
  const existing = list.findIndex(item => item.id === record.id);
  if (existing >= 0) list[existing] = { ...list[existing], ...record };
  else list.push(record);
  const fuelReceiptsByDay = { ...(state.fuelReceiptsByDay || {}), [day]:list.slice(-200) };
  const target = eventId ? (state.eventsByDay?.[day] || []).find(event => event.id === eventId) : null;
  const eventsByDay = target ? patchExactEvent(state.eventsByDay || {}, day, eventId, {
    fuelReceiptId:doc.id,
    fuelMerchant:fields.merchant || target.fuelMerchant || '',
    fuelGallons:Number(fields.gallons || 0) || target.fuelGallons || 0,
    fuelTotal:Number(fields.total || 0) || target.fuelTotal || 0,
    fuelCityState:fields.cityState || target.fuelCityState || '',
    documentIds:[...new Set([...(target.documentIds || []), doc.id])],
  }) : state.eventsByDay || {};
  return { ...state, eventsByDay, fuelReceiptsByDay, documentsByDay:upsertDocumentByDay(state, day, doc), lastDocumentLink:{ day, eventId, documentId:doc.id, type:doc.type, at:Date.now() } };
}

export function applySmartDocumentLinkV100(state = {}, payload = {}) {
  const typeId = payload.type?.id || payload.typeId || payload.fields?.type || 'other';
  const fields = payload.fields || {};
  if (fields.linkToLogbook === false) return state;
  const suggestion = suggestSmartDocumentLinkV100(state, typeId, fields);
  if (typeId === 'bol' || typeId === 'pod') return linkBolOrPod(state, payload, suggestion);
  if (typeId === 'rate_confirmation') return linkRateConfirmation(state, payload, suggestion);
  if (typeId === 'fuel_receipt') return linkFuelReceipt(state, payload, suggestion);
  const day = fields.linkDay || suggestion.day || dayKey(fields.date) || localDayKey();
  const doc = documentSummary(payload);
  return { ...state, documentsByDay:upsertDocumentByDay(state, day, doc), lastDocumentLink:{ day, eventId:fields.linkEventId || suggestion.eventId || '', documentId:doc.id, type:doc.type, at:Date.now() } };
}

export function dispatchSmartDocumentLinkV100(payload = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SMART_DOCUMENT_LINK_EVENT, { detail:payload }));
}
