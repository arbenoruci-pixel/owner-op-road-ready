export const ROAD_READY_DOCUMENT_COMMIT_EVENT_V105 = 'road-ready-document-commit-v105';
export const ROAD_READY_OS_FOUNDATION_VERSION_V105 = '105.0.0';

const COMPLETE_STATUS_V105 = /^(?:delivered|completed|closed|done|paid|invoiced)$/i;
const HIDDEN_STATUS_V105 = /^(?:cancelled|canceled|dismissed|archived|superseded)$/i;
const LOAD_DOCUMENT_TYPES_V105 = new Set([
  'rate_confirmation', 'load_tender', 'bol', 'pod', 'delivery_receipt',
  'lumper_receipt', 'scale_ticket', 'detention_approval', 'layover_approval',
  'tonu', 'osd_report', 'claim_notice', 'load_invoice',
]);

function textV105(value = '') {
  return value === 0 ? '0' : String(value || '').trim();
}

function upperV105(value = '') {
  return textV105(value).toUpperCase();
}

function numberV105(value = 0) {
  const parsed = Number(String(value ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function uniqueV105(values = []) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const key = typeof value === 'object'
      ? `${textV105(value.kind).toLowerCase()}:${normalizeReferenceV105(value.value)}`
      : normalizeReferenceV105(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function normalizeReferenceV105(value = '') {
  return upperV105(value).replace(/[^A-Z0-9-]/g, '');
}

export function isDateLikeReferenceV105(value = '') {
  const raw = textV105(value);
  if (!raw) return false;
  if (/\b(?:date|dated|issued|delivery date|pickup date)\b/i.test(raw)) return true;
  if (/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}$/.test(raw)) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return true;
  if (/^(?:19|20)\d{2}$/.test(raw)) return true;
  if (/^(?:19|20)\d{6}$/.test(raw)) {
    const year = Number(raw.slice(0, 4));
    const month = Number(raw.slice(4, 6));
    const day = Number(raw.slice(6, 8));
    if (year >= 1990 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) return true;
  }
  return false;
}

export function isValidCanonicalLoadNoV105(value = '') {
  const raw = textV105(value);
  if (!raw || isDateLikeReferenceV105(raw)) return false;
  const normalized = normalizeReferenceV105(raw);
  if (normalized.length < 3 || normalized.length > 28) return false;
  if (!/[0-9]/.test(normalized)) return false;
  if (/^(?:DATE|LOAD|ORDER|BOL|PO|NONE|UNKNOWN|OTHER|CONFIRMATION)$/i.test(normalized)) return false;
  return /^[A-Z0-9][A-Z0-9-]*$/.test(normalized);
}

export function normalizeCanonicalLoadNoV105(value = '') {
  return isValidCanonicalLoadNoV105(value) ? normalizeReferenceV105(value) : '';
}

export function isSafeDateV105(value = '') {
  const raw = textV105(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(5, 7));
  const day = Number(raw.slice(8, 10));
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

export function normalizeDateV105(value = '') {
  const raw = textV105(value);
  if (isSafeDateV105(raw)) return raw;
  const match = raw.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/);
  if (!match) return '';
  const year = match[3].length === 2 ? Number(`20${match[3]}`) : Number(match[3]);
  const month = Number(match[1]);
  const day = Number(match[2]);
  const candidate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isSafeDateV105(candidate) ? candidate : '';
}

function plausibleCurrentOperationalDateV105(value = '') {
  const day = normalizeDateV105(value);
  if (!day) return true;
  const year = Number(day.slice(0, 4));
  const currentYear = new Date().getFullYear();
  return Math.abs(year - currentYear) <= 2;
}

function normalizeCityV105(value = '') {
  return textV105(value)
    .toLowerCase()
    .replace(/\bsaint\b/g, 'st')
    .replace(/\bst[.]?\b/g, 'st')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stateCodeV105(value = '') {
  return upperV105(value).replace(/[^A-Z]/g, '').slice(0, 2);
}

export function isDateLikePlaceV105(value = '') {
  const raw = textV105(value);
  if (!raw) return false;
  return /(?:^|\b)(?:date|dated|on)\s*[: -]?\s*(?:19|20)\d{2}/i.test(raw)
    || /^\s*(?:19|20)\d{2}-\d{2}-\d{2}\s*$/i.test(raw);
}

export function normalizePlaceV105(value = '', state = '') {
  if (value && typeof value === 'object') {
    const city = textV105(value.city || value.deliveryCity || value.toCity || value.currentStopCity);
    const st = stateCodeV105(value.state || value.deliveryState || value.toState || value.currentStopState);
    return { city:isDateLikePlaceV105(city) ? '' : city, state:st };
  }
  const raw = textV105(value);
  if (!raw || isDateLikePlaceV105(raw)) return { city:'', state:stateCodeV105(state) };
  const parts = raw.split(',');
  if (parts.length > 1) {
    const st = stateCodeV105(parts.pop());
    return { city:textV105(parts.join(',')), state:st };
  }
  const trailing = raw.match(/^(.+?)\s+([A-Za-z]{2})$/);
  return trailing
    ? { city:textV105(trailing[1]), state:stateCodeV105(trailing[2]) }
    : { city:raw, state:stateCodeV105(state) };
}

export function placeTextV105(value = {}) {
  const place = normalizePlaceV105(value);
  return [place.city, place.state].filter(Boolean).join(', ');
}

function samePlaceV105(a = {}, b = {}) {
  const left = normalizePlaceV105(a);
  const right = normalizePlaceV105(b);
  const ac = normalizeCityV105(left.city);
  const bc = normalizeCityV105(right.city);
  if (!ac || !bc) return false;
  if (left.state && right.state && left.state !== right.state) return false;
  return ac === bc || ac.includes(bc) || bc.includes(ac);
}

function sameWordsV105(a = '', b = '') {
  const left = textV105(a).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const right = textV105(b).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function dayTimeV105(day = '', minute = 0) {
  const normalized = normalizeDateV105(day);
  const base = normalized ? Date.parse(`${normalized}T00:00:00`) : 0;
  return (Number.isFinite(base) ? base : 0) + Math.max(0, numberV105(minute)) * 60000;
}

function eventEntriesV105(state = {}) {
  return Object.entries(state.eventsByDay || {}).flatMap(([day, rows]) => (
    (Array.isArray(rows) ? rows : []).filter(Boolean).map((event, index) => ({
      day,
      event,
      index,
      at:dayTimeV105(day, event.startMin),
    }))
  )).sort((a, b) => a.at - b.at || a.index - b.index);
}

function routeEntriesV105(state = {}) {
  return Object.entries(state.routeLegsByDay || {}).flatMap(([day, rows]) => (
    (Array.isArray(rows) ? rows : []).filter(Boolean).map((leg, index) => ({
      day,
      leg,
      index,
      at:dayTimeV105(leg.pickupDay || leg.day || day, leg.pickupMin),
    }))
  ));
}

function activityTextV105(event = {}) {
  const reasons = Array.isArray(event.reasons) ? event.reasons : [];
  return [...reasons, event.note, event.description, event.reason].map(textV105).filter(Boolean).join(' · ');
}

function isPickupEventV105(event = {}) {
  return upperV105(event.status) === 'ON' && /pickup|pick up|loading|drop\s*&\s*hook|hook(ed)?/i.test(activityTextV105(event));
}

function isDeliveryEventV105(event = {}) {
  return upperV105(event.status) === 'ON' && /delivery|unloading|delivered|drop\s*off/i.test(activityTextV105(event));
}

function eventLoadRefsV105(event = {}) {
  return uniqueV105([
    event.loadNo,
    event.shippingDocs,
    event.orderNo,
    event.pickedUpLoadNo,
    event.deliveredLoadNo,
    event.bol,
    event.po,
  ].map(normalizeCanonicalLoadNoV105).filter(Boolean));
}

function referenceObjectV105(kind = 'reference', value = '', source = '') {
  const normalized = normalizeReferenceV105(value);
  if (!normalized || isDateLikeReferenceV105(value)) return null;
  return { kind, value:normalized, source };
}

function addAliasV105(candidate, kind, value, source = '') {
  const alias = referenceObjectV105(kind, value, source);
  if (!alias) return;
  candidate.aliases = uniqueV105([...(candidate.aliases || []), alias]);
}

function normalizeStopV105(stop = {}, index = 0) {
  const type = stop.type === 'pickup' || index === 0 && stop.type !== 'delivery' ? 'pickup' : 'delivery';
  const place = normalizePlaceV105(stop.city || stop.cityState || stop.address || '', stop.state);
  return {
    ...stop,
    id:textV105(stop.id || `${type}_${index + 1}`),
    type,
    sequence:Number(stop.sequence ?? index),
    deliverySequence:type === 'delivery' ? Number(stop.deliverySequence || stop.stopSequence || 0) : 0,
    company:textV105(stop.company || stop.facility || stop.name),
    city:place.city,
    state:place.state,
    cityState:[place.city, place.state].filter(Boolean).join(', '),
    address:isDateLikePlaceV105(stop.address) ? '' : textV105(stop.address),
    date:normalizeDateV105(stop.date || stop.deliveryDate || stop.pickupDate),
    appointment:textV105(stop.appointment || [stop.date, stop.time].filter(Boolean).join(' ')),
    poNumber:normalizeReferenceV105(stop.poNumber || stop.po || ''),
    bolNumber:normalizeReferenceV105(stop.bolNumber || stop.bol || ''),
  };
}

function candidateSkeletonV105(loadNo = '') {
  return {
    id:`load_${normalizeCanonicalLoadNoV105(loadNo) || 'unknown'}`,
    loadNo:normalizeCanonicalLoadNoV105(loadNo),
    broker:'',
    carrierName:'',
    origin:'',
    destination:'',
    pickupDate:'',
    deliveryDate:'',
    status:'open',
    active:false,
    sourceKinds:[],
    aliases:[],
    stops:[],
    routeLegs:[],
    latestActivityAt:0,
    latestPickupAt:0,
    latestDeliveryAt:0,
    updatedAt:0,
    scoreBias:0,
  };
}

function mergeCandidateV105(target, incoming = {}) {
  if (!target.loadNo && incoming.loadNo) target.loadNo = incoming.loadNo;
  for (const key of ['broker','carrierName','origin','destination','pickupDate','deliveryDate']) {
    if (!target[key] && incoming[key]) target[key] = incoming[key];
  }
  target._sawOpen ||= incoming.status === 'open';
  target._sawCompleted ||= incoming.status === 'completed';
  target.status = target._sawOpen ? 'open' : (target._sawCompleted ? 'completed' : target.status);
  target.active ||= Boolean(incoming.active);
  target.latestActivityAt = Math.max(numberV105(target.latestActivityAt), numberV105(incoming.latestActivityAt));
  target.latestPickupAt = Math.max(numberV105(target.latestPickupAt), numberV105(incoming.latestPickupAt));
  target.latestDeliveryAt = Math.max(numberV105(target.latestDeliveryAt), numberV105(incoming.latestDeliveryAt));
  target.updatedAt = Math.max(numberV105(target.updatedAt), numberV105(incoming.updatedAt));
  target.scoreBias = Math.max(numberV105(target.scoreBias), numberV105(incoming.scoreBias));
  target.sourceKinds = uniqueV105([...(target.sourceKinds || []), ...(incoming.sourceKinds || [])]);
  target.aliases = uniqueV105([...(target.aliases || []), ...(incoming.aliases || [])]);
  const stopMap = new Map((target.stops || []).map(stop => [textV105(stop.id) || `${stop.type}_${stop.sequence}_${stop.cityState}`, stop]));
  for (const stop of incoming.stops || []) {
    const key = textV105(stop.id) || `${stop.type}_${stop.sequence}_${stop.cityState}`;
    const previous = stopMap.get(key) || {};
    stopMap.set(key, { ...previous, ...stop });
  }
  target.stops = [...stopMap.values()];
  const legMap = new Map((target.routeLegs || []).map(leg => [textV105(leg.id) || `${leg.stopSequence}_${leg.toCity}_${leg.deliveryDay}`, leg]));
  for (const leg of incoming.routeLegs || []) {
    const key = textV105(leg.id) || `${leg.stopSequence}_${leg.toCity}_${leg.deliveryDay}`;
    legMap.set(key, { ...(legMap.get(key) || {}), ...leg });
  }
  target.routeLegs = [...legMap.values()];
  return target;
}

function guideIsCompleteV105(guide = {}, state = {}) {
  if (COMPLETE_STATUS_V105.test(textV105(guide.status))) return true;
  const deliveries = (guide.stops || []).filter(stop => stop?.type === 'delivery');
  const legs = routeEntriesV105(state).map(entry => entry.leg).filter(leg => leg?.loadGroupId === guide.id);
  if (legs.length && legs.every(leg => COMPLETE_STATUS_V105.test(textV105(leg.status)) || textV105(leg.stopStatus).toLowerCase() === 'done' || leg.guideCompleted === true)) return true;
  const completed = new Set((guide.completedStopIds || []).map(String));
  if (!deliveries.length || completed.size < deliveries.length) return false;
  const final = deliveries.at(-1);
  return eventEntriesV105(state).some(({ event }) => (
    isDeliveryEventV105(event)
    && eventLoadRefsV105(event).includes(normalizeCanonicalLoadNoV105(guide.loadNo || guide.orderNo))
    && samePlaceV105(event, final)
  ));
}

function candidateFromGuideV105(guide = {}, state = {}) {
  const loadNo = normalizeCanonicalLoadNoV105(guide.loadNo || guide.orderNo);
  if (!loadNo || HIDDEN_STATUS_V105.test(textV105(guide.status))) return null;
  const candidate = candidateSkeletonV105(loadNo);
  candidate.id = textV105(guide.id || candidate.id);
  candidate.broker = textV105(guide.broker);
  candidate.carrierName = textV105(guide.carrierName);
  candidate.origin = textV105(guide.origin);
  candidate.destination = textV105(guide.destination);
  candidate.pickupDate = normalizeDateV105(guide.pickupDate);
  candidate.deliveryDate = normalizeDateV105(guide.deliveryDate);
  candidate.status = guideIsCompleteV105(guide, state) ? 'completed' : 'open';
  candidate.active = textV105(state.activeLoadGuideId) === textV105(guide.id);
  candidate.updatedAt = numberV105(guide.updatedAt || guide.createdAt);
  candidate.sourceKinds = ['guide'];
  candidate.stops = (Array.isArray(guide.stops) ? guide.stops : []).map(normalizeStopV105);
  addAliasV105(candidate, 'load_number', loadNo, 'guide');
  addAliasV105(candidate, 'order_number', guide.orderNo, 'guide');
  addAliasV105(candidate, 'leg_number', guide.legNo, 'guide');
  addAliasV105(candidate, 'pickup_number', guide.pickupNumber, 'guide');
  for (const value of guide.poNumbers || []) addAliasV105(candidate, 'po_number', value, 'guide');
  for (const stop of candidate.stops) {
    addAliasV105(candidate, 'po_number', stop.poNumber, `stop:${stop.id}`);
    addAliasV105(candidate, 'bol_number', stop.bolNumber, `stop:${stop.id}`);
  }
  return candidate;
}

function canonicalRefFromLegV105(leg = {}) {
  return [
    leg.loadNo,
    leg.shippingDocs,
    leg.orderNo,
    leg.pickedUpLoadNo,
  ].map(normalizeCanonicalLoadNoV105).find(Boolean) || '';
}

function candidateFromLegV105(leg = {}, state = {}, day = '') {
  const loadNo = canonicalRefFromLegV105(leg);
  if (!loadNo || HIDDEN_STATUS_V105.test(textV105(leg.status))) return null;
  const candidate = candidateSkeletonV105(loadNo);
  candidate.id = textV105(leg.loadGroupId || `load_${loadNo}`);
  candidate.broker = textV105(leg.broker);
  candidate.origin = [textV105(leg.fromCity), stateCodeV105(leg.fromState)].filter(Boolean).join(', ');
  candidate.destination = [textV105(leg.toCity), stateCodeV105(leg.toState)].filter(Boolean).join(', ');
  candidate.pickupDate = normalizeDateV105(leg.pickupDay || leg.day || day);
  candidate.deliveryDate = normalizeDateV105(leg.deliveryDay);
  candidate.status = COMPLETE_STATUS_V105.test(textV105(leg.status)) || textV105(leg.stopStatus).toLowerCase() === 'done' ? 'completed' : 'open';
  candidate.updatedAt = numberV105(leg.updatedAt);
  candidate.sourceKinds = ['route'];
  candidate.routeLegs = [leg];
  candidate.stops = [{
    id:textV105(leg.stopId || `delivery_${leg.stopSequence || 1}`),
    type:'delivery',
    sequence:Number(leg.stopSequence || 1),
    deliverySequence:Number(leg.stopSequence || 1),
    company:textV105(leg.stopCompany || leg.toFacility),
    city:textV105(leg.toCity),
    state:stateCodeV105(leg.toState),
    cityState:[textV105(leg.toCity), stateCodeV105(leg.toState)].filter(Boolean).join(', '),
    address:textV105(leg.stopAddress),
    date:normalizeDateV105(leg.deliveryDay),
    appointment:textV105(leg.appointment || leg.deliveryAppointment),
    poNumber:normalizeReferenceV105(leg.po),
    bolNumber:normalizeReferenceV105(leg.bol),
  }];
  addAliasV105(candidate, 'load_number', loadNo, 'route');
  addAliasV105(candidate, 'order_number', leg.orderNo, 'route');
  addAliasV105(candidate, 'leg_number', leg.legNo, 'route');
  addAliasV105(candidate, 'bol_number', leg.bol, 'route');
  addAliasV105(candidate, 'po_number', leg.po, 'route');
  addAliasV105(candidate, 'pickup_number', leg.pickupNumber, 'route');
  return candidate;
}

function candidateFromBusinessLoadV105(load = {}) {
  const loadNo = normalizeCanonicalLoadNoV105(load.canonicalLoadNo || load.loadNo);
  if (!loadNo || HIDDEN_STATUS_V105.test(textV105(load.status))) return null;
  const candidate = candidateSkeletonV105(loadNo);
  candidate.id = textV105(load.canonicalLoadId || load.id || candidate.id);
  candidate.broker = textV105(load.broker);
  candidate.carrierName = textV105(load.carrierName);
  candidate.origin = isDateLikePlaceV105(load.origin) ? '' : textV105(load.origin);
  candidate.destination = isDateLikePlaceV105(load.destination) ? '' : textV105(load.destination);
  candidate.pickupDate = normalizeDateV105(load.pickupDate || load.date);
  candidate.deliveryDate = normalizeDateV105(load.deliveryDate);
  candidate.status = COMPLETE_STATUS_V105.test(textV105(load.status)) ? 'completed' : 'open';
  candidate.updatedAt = numberV105(load.updatedAt || load.createdAt);
  candidate.sourceKinds = ['business'];
  candidate.stops = (Array.isArray(load.stops) ? load.stops : []).map(normalizeStopV105);
  addAliasV105(candidate, 'load_number', loadNo, 'business');
  for (const alias of load.aliases || load.references || []) {
    if (typeof alias === 'object') addAliasV105(candidate, alias.kind || 'reference', alias.value, 'business');
    else addAliasV105(candidate, 'reference', alias, 'business');
  }
  return candidate;
}

export function collectLoadCandidatesV105(state = {}, businessStore = {}) {
  const byLoad = new Map();
  function add(incoming) {
    if (!incoming?.loadNo) return;
    const key = incoming.loadNo;
    const existing = byLoad.get(key) || candidateSkeletonV105(key);
    byLoad.set(key, mergeCandidateV105(existing, incoming));
  }

  for (const guide of Object.values(state.loadGuidesById || {})) add(candidateFromGuideV105(guide, state));
  for (const { day, leg } of routeEntriesV105(state)) add(candidateFromLegV105(leg, state, day));
  for (const load of businessStore.loads || []) add(candidateFromBusinessLoadV105(load));

  const info = state.loadInfo || {};
  const infoLoadNo = normalizeCanonicalLoadNoV105(info.loadNo || info.shippingDocs || info.orderNo);
  if (infoLoadNo) {
    const infoCandidate = candidateSkeletonV105(infoLoadNo);
    infoCandidate.id = textV105(info.canonicalLoadId || `load_${infoLoadNo}`);
    const guide = info.guideId ? state.loadGuidesById?.[info.guideId] : null;
    const guideLoad = normalizeCanonicalLoadNoV105(guide?.loadNo || guide?.orderNo);
    const identityConsistent = !info.guideId || !guide || guideLoad === infoLoadNo;
    if (identityConsistent) {
      infoCandidate.broker = textV105(info.broker);
      infoCandidate.carrierName = textV105(info.carrierName);
      infoCandidate.origin = [textV105(info.pickupCity), stateCodeV105(info.pickupState)].filter(Boolean).join(', ');
      infoCandidate.destination = [textV105(info.deliveryCity), stateCodeV105(info.deliveryState)].filter(Boolean).join(', ');
      infoCandidate.pickupDate = normalizeDateV105(info.pickupDate);
      infoCandidate.deliveryDate = normalizeDateV105(info.deliveryDate);
      infoCandidate.stops = (Array.isArray(info.stops) ? info.stops : []).map(normalizeStopV105);
    }
    infoCandidate.active = true;
    infoCandidate.updatedAt = numberV105(info.updatedAt);
    infoCandidate.sourceKinds = ['load_info'];
    addAliasV105(infoCandidate, 'load_number', infoLoadNo, 'load_info');
    if (identityConsistent) {
      addAliasV105(infoCandidate, 'order_number', info.orderNo, 'load_info');
      addAliasV105(infoCandidate, 'leg_number', info.legNo, 'load_info');
      addAliasV105(infoCandidate, 'pickup_number', info.pickupNumber, 'load_info');
      addAliasV105(infoCandidate, 'bol_number', info.bol, 'load_info');
      addAliasV105(infoCandidate, 'po_number', info.po, 'load_info');
    }
    add(infoCandidate);
  }

  for (const doc of businessStore.documents || []) {
    const loadNo = normalizeCanonicalLoadNoV105(doc.canonicalLoadNo || doc.loadNo);
    const candidate = byLoad.get(loadNo);
    if (!candidate) continue;
    for (const reference of doc.references || doc.aliases || []) {
      if (typeof reference === 'object') addAliasV105(candidate, reference.kind || 'document_reference', reference.value, `document:${doc.id || ''}`);
      else addAliasV105(candidate, 'document_reference', reference, `document:${doc.id || ''}`);
    }
    addAliasV105(candidate, 'bol_number', doc.bolNo, `document:${doc.id || ''}`);
    addAliasV105(candidate, 'po_number', doc.poNumber, `document:${doc.id || ''}`);
    addAliasV105(candidate, 'sales_order', doc.salesOrder, `document:${doc.id || ''}`);
    addAliasV105(candidate, 'delivery_number', doc.deliveryNo, `document:${doc.id || ''}`);
  }

  for (const entry of eventEntriesV105(state)) {
    const refs = eventLoadRefsV105(entry.event);
    for (const loadNo of refs) {
      const candidate = byLoad.get(loadNo);
      if (!candidate) continue;
      candidate.latestActivityAt = Math.max(candidate.latestActivityAt, entry.at);
      if (isPickupEventV105(entry.event)) candidate.latestPickupAt = Math.max(candidate.latestPickupAt, entry.at);
      if (isDeliveryEventV105(entry.event)) candidate.latestDeliveryAt = Math.max(candidate.latestDeliveryAt, entry.at);
    }
  }

  const all = [...byLoad.values()].map(candidate => {
    const routeLegs = candidate.routeLegs || [];
    if (routeLegs.length) {
      const open = routeLegs.some(leg => !HIDDEN_STATUS_V105.test(textV105(leg.status)) && !COMPLETE_STATUS_V105.test(textV105(leg.status)) && textV105(leg.stopStatus).toLowerCase() !== 'done');
      if (open) candidate.status = 'open';
      else if (routeLegs.every(leg => COMPLETE_STATUS_V105.test(textV105(leg.status)) || textV105(leg.stopStatus).toLowerCase() === 'done' || HIDDEN_STATUS_V105.test(textV105(leg.status)))) candidate.status = 'completed';
    }
    candidate.active = candidate.active && candidate.status !== 'completed';
    return candidate;
  });

  return all.sort((a, b) => {
    const aOpen = a.status === 'open' ? 1 : 0;
    const bOpen = b.status === 'open' ? 1 : 0;
    return bOpen - aOpen
      || numberV105(b.latestPickupAt) - numberV105(a.latestPickupAt)
      || numberV105(b.latestActivityAt) - numberV105(a.latestActivityAt)
      || numberV105(b.updatedAt) - numberV105(a.updatedAt)
      || a.loadNo.localeCompare(b.loadNo);
  });
}

export function latestOpenLoadV105(state = {}, businessStore = {}) {
  const candidates = collectLoadCandidatesV105(state, businessStore);
  const open = candidates.filter(candidate => candidate.status === 'open');
  if (!open.length) return null;
  return [...open].sort((a, b) => (
    numberV105(b.latestPickupAt) - numberV105(a.latestPickupAt)
    || numberV105(b.latestActivityAt) - numberV105(a.latestActivityAt)
    || Number(b.active) - Number(a.active)
    || numberV105(b.updatedAt) - numberV105(a.updatedAt)
  ))[0] || null;
}

function addFieldReferenceV105(out, kind, value, source = 'ocr') {
  const reference = referenceObjectV105(kind, value, source);
  if (!reference) return;
  out.push(reference);
}

export function referencesFromDocumentV105(fields = {}, analysis = {}) {
  const f = { ...(analysis.fields || {}), ...(fields || {}) };
  const out = [];
  addFieldReferenceV105(out, 'load_number', f.loadNo);
  addFieldReferenceV105(out, 'order_number', f.orderNo);
  addFieldReferenceV105(out, 'leg_number', f.legNo);
  addFieldReferenceV105(out, 'bol_number', f.bolNo || f.billOfLadingNo);
  addFieldReferenceV105(out, 'po_number', f.poNumber || f.purchaseOrder);
  addFieldReferenceV105(out, 'sales_order', f.salesOrder || f.salesOrderNo);
  addFieldReferenceV105(out, 'delivery_number', f.deliveryNo || f.deliveryNumber);
  addFieldReferenceV105(out, 'pickup_number', f.pickupNumber);
  addFieldReferenceV105(out, 'fo_number', f.foNo || f.foNumber);
  addFieldReferenceV105(out, 'route_number', f.routeCarNo || f.routeNo);
  addFieldReferenceV105(out, 'receipt_number', f.receiptNo || f.transactionId);
  if (Array.isArray(f.references)) {
    for (const item of f.references) {
      if (typeof item === 'object') addFieldReferenceV105(out, item.kind || 'reference', item.value, item.source || 'ocr');
      else addFieldReferenceV105(out, 'reference', item, 'ocr');
    }
  }
  return uniqueV105(out);
}

function candidateAliasScoreV105(candidate, reference) {
  if (!candidate?.loadNo || !reference?.value) return { score:0, reason:'' };
  if (candidate.loadNo === reference.value) {
    const strong = ['load_number','order_number'].includes(reference.kind);
    return { score:strong ? 125 : 82, reason:strong ? 'Load number matches' : `${reference.kind.replaceAll('_', ' ')} matches the load` };
  }
  const alias = (candidate.aliases || []).find(item => item.value === reference.value);
  if (!alias) return { score:0, reason:'' };
  const weights = {
    load_number:120,
    order_number:112,
    leg_number:102,
    pickup_number:96,
    bol_number:94,
    po_number:92,
    sales_order:88,
    delivery_number:88,
    fo_number:74,
    route_number:68,
    document_reference:72,
    reference:65,
  };
  const score = Math.max(weights[reference.kind] || 64, weights[alias.kind] || 64);
  return { score, reason:`${(alias.kind || reference.kind).replaceAll('_', ' ')} matches` };
}

function documentDateFromV105(fields = {}, analysis = {}) {
  const f = { ...(analysis.fields || {}), ...(fields || {}) };
  return normalizeDateV105(f.documentDate || f.date || f.deliveryDate || f.workDate || f.pickupDate);
}

function placeCandidatesFromDocumentV105(fields = {}, analysis = {}) {
  const f = { ...(analysis.fields || {}), ...(fields || {}) };
  return uniqueV105([
    f.destination,
    f.shipToDetails,
    f.receiverAddress,
    f.cityState,
    [f.deliveryCity, f.deliveryState].filter(Boolean).join(', '),
  ].map(value => textV105(value)).filter(value => value && !isDateLikePlaceV105(value)));
}

function companyCandidatesFromDocumentV105(fields = {}, analysis = {}) {
  const f = { ...(analysis.fields || {}), ...(fields || {}) };
  return uniqueV105([
    f.receiver,
    f.consignee,
    f.shipTo,
    f.destinationCompany,
    f.merchant,
  ].map(textV105).filter(Boolean));
}

function candidateDateScoreV105(candidate, documentDate) {
  if (!documentDate) return 0;
  const dateTime = Date.parse(`${documentDate}T12:00:00`);
  const start = candidate.pickupDate ? Date.parse(`${candidate.pickupDate}T12:00:00`) : 0;
  const end = candidate.deliveryDate ? Date.parse(`${candidate.deliveryDate}T12:00:00`) : start;
  if (!Number.isFinite(dateTime)) return 0;
  const day = 86400000;
  if (start && dateTime >= start - 2 * day && dateTime <= (end || start) + 2 * day) return 16;
  return 0;
}

function matchStopV105(candidate, references, places, companies) {
  const deliveries = (candidate.stops || []).filter(stop => stop.type === 'delivery');
  let best = null;
  for (const stop of deliveries) {
    let score = 0;
    const reasons = [];
    const stopRefs = uniqueV105([
      referenceObjectV105('po_number', stop.poNumber, `stop:${stop.id}`),
      referenceObjectV105('bol_number', stop.bolNumber, `stop:${stop.id}`),
    ].filter(Boolean));
    if (references.some(reference => stopRefs.some(stopRef => stopRef.value === reference.value))) {
      score += 90;
      reasons.push('Stop reference matches');
    }
    if (places.some(place => samePlaceV105(place, stop))) {
      score += 45;
      reasons.push('Receiver city matches');
    }
    if (companies.some(company => sameWordsV105(company, stop.company))) {
      score += 34;
      reasons.push('Receiver name matches');
    }
    if (!best || score > best.score) best = { stop, score, reasons };
  }
  return best && best.score > 0 ? best : null;
}

export function matchDocumentToLoadV105({
  state = {},
  businessStore = {},
  typeId = 'other',
  fields = {},
  analysis = {},
} = {}) {
  const candidates = collectLoadCandidatesV105(state, businessStore);
  const active = latestOpenLoadV105(state, businessStore);
  const references = referencesFromDocumentV105(fields, analysis);
  const places = placeCandidatesFromDocumentV105(fields, analysis);
  const companies = companyCandidatesFromDocumentV105(fields, analysis);
  const documentDate = documentDateFromV105(fields, analysis);
  const f = { ...(analysis.fields || {}), ...(fields || {}) };
  const broker = textV105(f.broker);
  const loadLike = LOAD_DOCUMENT_TYPES_V105.has(typeId);

  const ranked = candidates.map(candidate => {
    let score = 0;
    const reasons = [];
    let strongReference = false;
    for (const reference of references) {
      const result = candidateAliasScoreV105(candidate, reference);
      if (!result.score) continue;
      score += result.score;
      reasons.push(result.reason);
      if (result.score >= 88) strongReference = true;
    }
    const stopMatch = matchStopV105(candidate, references, places, companies);
    if (stopMatch) {
      score += stopMatch.score;
      reasons.push(...stopMatch.reasons);
    } else {
      if (places.some(place => samePlaceV105(place, candidate.destination) || samePlaceV105(place, candidate.origin))) {
        score += 24;
        reasons.push('Route location matches');
      }
    }
    if (broker && candidate.broker && sameWordsV105(broker, candidate.broker)) {
      score += 28;
      reasons.push('Broker matches');
    }
    score += candidateDateScoreV105(candidate, documentDate);
    if (candidateDateScoreV105(candidate, documentDate)) reasons.push('Date fits the load');
    if (active?.loadNo === candidate.loadNo && loadLike && !strongReference) {
      score += 18;
      reasons.push('Current active load');
    }
    if (candidate.status === 'completed' && typeId === 'rate_confirmation') score -= 12;
    return {
      ...candidate,
      matchScore:Math.max(0, score),
      matchReasons:uniqueV105(reasons),
      stopMatch:stopMatch?.stop || null,
      strongReference,
    };
  }).sort((a, b) => b.matchScore - a.matchScore || b.updatedAt - a.updatedAt);

  const top = ranked[0] || null;
  const second = ranked[1] || null;
  const margin = top ? top.matchScore - Number(second?.matchScore || 0) : 0;
  let chosen = top;
  if ((!chosen || chosen.matchScore < 24) && active && loadLike) {
    chosen = {
      ...active,
      matchScore:18,
      matchReasons:['Current active load needs confirmation'],
      stopMatch:null,
      strongReference:false,
    };
  }
  const score = Number(chosen?.matchScore || 0);
  const confidence = score >= 150 ? .99 : score >= 110 ? .95 : score >= 85 ? .88 : score >= 55 ? .76 : score >= 30 ? .62 : .38;
  const automatic = Boolean(chosen && score >= 90 && margin >= 20);
  return {
    matched:Boolean(chosen?.loadNo),
    loadNo:chosen?.loadNo || '',
    canonicalLoadId:chosen?.id || '',
    broker:chosen?.broker || '',
    stop:chosen?.stopMatch || null,
    stopSequence:Number(chosen?.stopMatch?.deliverySequence || chosen?.stopMatch?.sequence || 0),
    score,
    confidence,
    automatic,
    requiresConfirmation:!automatic,
    reason:chosen?.matchReasons?.join(' · ') || (loadLike ? 'Choose the correct load' : 'No load needed'),
    candidates:ranked.slice(0, 8),
    references,
    documentDate,
  };
}

export function documentFolderV105(typeId = 'other', record = {}) {
  if (record.status === 'needs_review' || !textV105(record.canonicalLoadNo) && LOAD_DOCUMENT_TYPES_V105.has(typeId)) return 'needs_review';
  if (record.archivedAt || record.status === 'archived') return 'archived';
  if (record.canonicalLoadNo) return `load:${record.canonicalLoadNo}`;
  if (typeId === 'fuel_receipt' || typeId === 'fuel_card_statement') return 'ifta';
  if (['repair_invoice','roadside_service','tire_receipt','pm_service_record','annual_inspection'].includes(typeId)) return 'maintenance';
  if (['registration','insurance','medical_card','driver_license','ifta_license','irp_cab_card','permit'].includes(typeId)) return 'compliance';
  if (['lumper_receipt','scale_ticket','toll_parking_receipt','other_expense'].includes(typeId)) return 'expenses';
  return 'documents';
}

function titleForVaultV105(typeLabel = 'Document', loadNo = '', stop = null, fields = {}) {
  const parts = [textV105(typeLabel)];
  if (loadNo) parts.push(`Load ${loadNo}`);
  if (stop?.deliverySequence || stop?.sequence) parts.push(`Stop ${stop.deliverySequence || stop.sequence}`);
  const place = stop ? placeTextV105(stop) : textV105(fields.cityState || fields.destination || '');
  if (place && !isDateLikePlaceV105(place)) parts.push(place);
  return parts.filter(Boolean).join(' · ');
}

export function buildVaultDocumentV105({
  stored = {},
  type = {},
  fields = {},
  analysis = {},
  match = {},
  selectedLoadNo = '',
  selectedStopSequence = 0,
  selectedStop = null,
  documentDate = '',
  linkDay = '',
  linkToLogbook = false,
  userConfirmed = false,
  existing = null,
} = {}) {
  const local = stored.localDocument || stored.document || {};
  const typeId = textV105(type.id || fields.type || analysis.type?.id || 'other');
  const canonicalLoadNo = normalizeCanonicalLoadNoV105(selectedLoadNo || match.loadNo);
  const references = referencesFromDocumentV105(fields, analysis);
  const date = normalizeDateV105(documentDate || fields.date || match.documentDate);
  const stop = selectedStop || match.stop || null;
  const stopSequence = Number(selectedStopSequence || stop?.deliverySequence || stop?.sequence || 0);
  const requiresLoad = LOAD_DOCUMENT_TYPES_V105.has(typeId);
  const verified = Boolean(userConfirmed && (!requiresLoad || canonicalLoadNo));
  const id = textV105(local.local_id || local.id || existing?.id || `document_${Date.now()}`);
  const now = Date.now();
  const title = textV105(fields.title) || titleForVaultV105(type.label || typeId.replaceAll('_', ' '), canonicalLoadNo, stop, fields);
  const auditTrail = [
    ...(Array.isArray(existing?.auditTrail) ? existing.auditTrail : []),
    {
      id:`audit_${now}`,
      action:existing ? 'updated' : 'imported',
      at:now,
      detail:verified ? `Filed to ${canonicalLoadNo ? `Load ${canonicalLoadNo}` : documentFolderV105(typeId)}` : 'Saved for review',
      source:'road_ready_os_v105',
    },
  ];
  const record = {
    ...(existing || {}),
    id,
    localDocumentId:id,
    clientDocumentId:textV105(local.client_document_id || existing?.clientDocumentId),
    serverDocumentId:textV105(local.server_id || existing?.serverDocumentId),
    fileName:textV105(local.original_file_name || fields.fileName || existing?.fileName),
    mimeType:textV105(local.mime_type || existing?.mimeType),
    fileSizeBytes:numberV105(local.file_size_bytes || existing?.fileSizeBytes),
    type:typeId,
    family:typeId === 'pod' ? 'bill_of_lading' : typeId,
    subtype:typeId === 'pod' ? 'signed_bol_pod' : typeId,
    label:textV105(type.label || existing?.label || typeId.replaceAll('_', ' ')),
    title,
    documentDate:date,
    date,
    canonicalLoadNo,
    loadNo:canonicalLoadNo,
    canonicalLoadId:textV105(match.canonicalLoadId || existing?.canonicalLoadId),
    broker:textV105(match.broker || fields.broker || existing?.broker),
    stopId:textV105(stop?.id || existing?.stopId),
    stopSequence,
    stopCompany:textV105(stop?.company || existing?.stopCompany),
    stopLocation:stop ? placeTextV105(stop) : textV105(existing?.stopLocation),
    references,
    extracted:{ ...(analysis.fields || {}), ...(fields || {}) },
    classification:{
      detectedType:textV105(analysis.detectedType?.id || analysis.type?.id || typeId),
      selectedType:typeId,
      confidence:Number(analysis.confidence || 0),
      method:textV105(analysis.method),
      templateProfile:analysis.templateProfile || null,
    },
    status:verified ? 'verified' : 'needs_review',
    reviewStatus:verified ? 'verified' : 'needs_review',
    folder:documentFolderV105(typeId, { canonicalLoadNo, status:verified ? 'verified' : 'needs_review' }),
    linkDay:normalizeDateV105(linkDay),
    linkToLogbook:Boolean(linkToLogbook),
    linkedEventId:textV105(fields.linkEventId || existing?.linkedEventId),
    syncState:textV105(stored.cloud?.status || local.sync_state || existing?.syncState || 'local_only'),
    originalPreserved:true,
    auditTrail,
    createdAt:numberV105(existing?.createdAt || Date.parse(local.created_at || '') || now),
    updatedAt:now,
    foundationVersion:ROAD_READY_OS_FOUNDATION_VERSION_V105,
  };
  return record;
}

function cleanLegacyDocumentV105(document = {}, state = {}, businessStore = {}) {
  const candidates = collectLoadCandidatesV105(state, businessStore);
  const candidateLoads = new Set(candidates.map(candidate => candidate.loadNo));
  const rawLoad = textV105(document.canonicalLoadNo || document.loadNo);
  const normalizedLoad = normalizeCanonicalLoadNoV105(rawLoad);
  const canonicalLoadNo = normalizedLoad && candidateLoads.has(normalizedLoad) ? normalizedLoad : '';
  const type = textV105(document.type || document.documentType || 'other');
  const date = normalizeDateV105(document.documentDate || document.date);
  const invalidPlace = isDateLikePlaceV105(document.origin) || isDateLikePlaceV105(document.destination);
  const requiresLoad = LOAD_DOCUMENT_TYPES_V105.has(type);
  const invalidLoad = Boolean(requiresLoad && rawLoad && !canonicalLoadNo);
  const invalidDate = Boolean(requiresLoad && date && !plausibleCurrentOperationalDateV105(date));
  const status = document.archivedAt
    ? 'archived'
    : (document.status === 'verified' && (!requiresLoad || canonicalLoadNo) && !invalidDate
      ? 'verified'
      : (invalidLoad || invalidPlace || invalidDate || document.reviewStatus === 'needs_review' ? 'needs_review' : (canonicalLoadNo || !requiresLoad ? 'verified' : 'needs_review')));
  const now = Date.now();
  return {
    ...document,
    id:textV105(document.id || document.localDocumentId || `legacy_document_${now}_${Math.random().toString(36).slice(2, 7)}`),
    localDocumentId:textV105(document.localDocumentId || document.local_id),
    clientDocumentId:textV105(document.clientDocumentId || document.client_document_id),
    fileName:textV105(document.fileName || document.originalFileName),
    type,
    label:textV105(document.label || type.replaceAll('_', ' ')),
    title:textV105(document.title || document.label || type.replaceAll('_', ' ')),
    documentDate:date,
    date,
    legacyLoadReference:rawLoad,
    canonicalLoadNo,
    loadNo:canonicalLoadNo,
    status,
    reviewStatus:status === 'verified' ? 'verified' : 'needs_review',
    reviewReason:invalidDate ? 'Document date is outside the active operating period.' : invalidLoad ? 'Legacy reference is not a verified Load number.' : invalidPlace ? 'Location contains date text.' : document.reviewReason,
    folder:documentFolderV105(type, { canonicalLoadNo, status }),
    originalPreserved:true,
    references:uniqueV105([
      ...(Array.isArray(document.references) ? document.references : []),
      referenceObjectV105('legacy_reference', rawLoad, 'legacy'),
      referenceObjectV105('bol_number', document.bolNo, 'legacy'),
      referenceObjectV105('po_number', document.poNumber, 'legacy'),
    ].filter(Boolean)),
    foundationVersion:ROAD_READY_OS_FOUNDATION_VERSION_V105,
    updatedAt:numberV105(document.updatedAt || now),
    createdAt:numberV105(document.createdAt || now),
  };
}

export function migrateBusinessStoreV105(store = {}, state = {}) {
  const base = {
    loads:Array.isArray(store.loads) ? [...store.loads] : [],
    settlements:Array.isArray(store.settlements) ? [...store.settlements] : [],
    fuel:Array.isArray(store.fuel) ? [...store.fuel] : [],
    maintenance:Array.isArray(store.maintenance) ? [...store.maintenance] : [],
    expenses:Array.isArray(store.expenses) ? [...store.expenses] : [],
    documents:Array.isArray(store.documents) ? [...store.documents] : [],
    updatedAt:numberV105(store.updatedAt),
  };
  const candidateStore = { ...base, documents:[] };
  const documents = base.documents.map(document => {
    let migrated = cleanLegacyDocumentV105(document, state, candidateStore);
    if (migrated.status === 'needs_review' && LOAD_DOCUMENT_TYPES_V105.has(migrated.type) && !migrated.canonicalLoadNo) {
      const smartMatch = matchDocumentToLoadV105({
        state,
        businessStore:candidateStore,
        typeId:migrated.type,
        fields:{ ...(document.extracted || {}), ...document },
        analysis:{ fields:document.extracted || {}, confidence:document.confidence || document.classification?.confidence || 0 },
      });
      if (smartMatch.automatic && smartMatch.loadNo) {
        migrated = {
          ...migrated,
          canonicalLoadNo:smartMatch.loadNo,
          loadNo:smartMatch.loadNo,
          canonicalLoadId:smartMatch.canonicalLoadId,
          broker:smartMatch.broker || migrated.broker,
          stopId:smartMatch.stop?.id || migrated.stopId || '',
          stopSequence:Number(smartMatch.stopSequence || migrated.stopSequence || 0),
          stopCompany:smartMatch.stop?.company || migrated.stopCompany || '',
          stopLocation:smartMatch.stop ? placeTextV105(smartMatch.stop) : migrated.stopLocation || '',
          status:'verified',
          reviewStatus:'verified',
          reviewReason:'',
          folder:`load:${smartMatch.loadNo}`,
          migrationMatchReason:smartMatch.reason,
        };
      }
    }
    return migrated;
  });
  const exactSeen = new Map();
  for (const document of documents) {
    const exactKey = textV105(document.clientDocumentId || document.localDocumentId || document.id);
    if (exactKey && exactSeen.has(exactKey)) {
      document.duplicateOf = exactSeen.get(exactKey);
      document.reviewStatus = 'duplicate';
      document.status = document.status === 'archived' ? 'archived' : 'needs_review';
      document.folder = document.status === 'archived' ? 'archived' : 'needs_review';
    } else if (exactKey) {
      exactSeen.set(exactKey, document.id);
    }
  }
  return { ...base, documents, updatedAt:Math.max(base.updatedAt, Date.now()) };
}

export function upsertVaultDocumentV105(store = {}, record = {}, state = {}) {
  const migrated = migrateBusinessStoreV105(store, state);
  const index = migrated.documents.findIndex(document => (
    document.id === record.id
    || record.clientDocumentId && document.clientDocumentId === record.clientDocumentId
    || record.localDocumentId && document.localDocumentId === record.localDocumentId
  ));
  const documents = [...migrated.documents];
  if (index >= 0) documents[index] = { ...documents[index], ...record, id:documents[index].id || record.id, updatedAt:Date.now() };
  else documents.unshift(record);
  return { ...migrated, documents, updatedAt:Date.now() };
}

export function upsertBusinessLoadV105(store = {}, loadPatch = {}) {
  const loadNo = normalizeCanonicalLoadNoV105(loadPatch.canonicalLoadNo || loadPatch.loadNo);
  if (!loadNo) return store;
  const loads = Array.isArray(store.loads) ? [...store.loads] : [];
  const index = loads.findIndex(load => normalizeCanonicalLoadNoV105(load.canonicalLoadNo || load.loadNo) === loadNo);
  const now = Date.now();
  const safeOrigin = isDateLikePlaceV105(loadPatch.origin) ? '' : textV105(loadPatch.origin);
  const safeDestination = isDateLikePlaceV105(loadPatch.destination) ? '' : textV105(loadPatch.destination);
  const patch = {
    ...(index >= 0 ? loads[index] : {}),
    ...loadPatch,
    id:index >= 0 ? loads[index].id : textV105(loadPatch.id || `load_${loadNo}_${now}`),
    canonicalLoadId:textV105(loadPatch.canonicalLoadId || (index >= 0 ? loads[index].canonicalLoadId : '') || `load_${loadNo}`),
    canonicalLoadNo:loadNo,
    loadNo,
    origin:safeOrigin || (index >= 0 ? loads[index].origin : ''),
    destination:safeDestination || (index >= 0 ? loads[index].destination : ''),
    status:textV105(loadPatch.status || (index >= 0 ? loads[index].status : 'booked')),
    updatedAt:now,
    createdAt:numberV105(index >= 0 ? loads[index].createdAt : now),
    foundationVersion:ROAD_READY_OS_FOUNDATION_VERSION_V105,
  };
  if (index >= 0) loads[index] = patch; else loads.unshift(patch);
  return { ...store, loads, updatedAt:now };
}

export function loadDocumentSummaryV105(store = {}, loadNo = '') {
  const canonical = normalizeCanonicalLoadNoV105(loadNo);
  const documents = (Array.isArray(store.documents) ? store.documents : []).filter(document => (
    document.status !== 'archived'
    && normalizeCanonicalLoadNoV105(document.canonicalLoadNo || document.loadNo) === canonical
  ));
  const types = new Set(documents.map(document => textV105(document.type)));
  const podByStop = {};
  for (const document of documents.filter(document => document.type === 'pod')) {
    const sequence = Number(document.stopSequence || 0);
    if (sequence) podByStop[sequence] = document.id;
  }
  return {
    loadNo:canonical,
    documents,
    count:documents.length,
    rateConfirmationPresent:types.has('rate_confirmation'),
    bolPresent:types.has('bol') || types.has('pod'),
    podPresent:types.has('pod'),
    finalPodPresent:documents.some(document => document.type === 'pod' && (document.isFinalStop || document.finalStop || document.stopSequence === document.stopCount)),
    podByStop,
    needsReview:documents.filter(document => document.reviewStatus === 'needs_review' || document.status === 'needs_review').length,
  };
}

export function doesLoadHaveDocumentV105(store = {}, loadNo = '', type = '', stopSequence = 0) {
  const summary = loadDocumentSummaryV105(store, loadNo);
  if (!type) return summary.count > 0;
  if (type === 'bol') return summary.bolPresent;
  if (type === 'pod' && stopSequence) return Boolean(summary.podByStop[Number(stopSequence)]);
  if (type === 'pod') return summary.podPresent;
  return summary.documents.some(document => textV105(document.type) === textV105(type));
}

export function searchVaultDocumentsV105(documents = [], query = '') {
  const needle = textV105(query).toLowerCase();
  if (!needle) return [...documents];
  return documents.filter(document => {
    const references = (document.references || []).map(item => typeof item === 'object' ? item.value : item).join(' ');
    const body = [
      document.title,
      document.label,
      document.type,
      document.canonicalLoadNo,
      document.legacyLoadReference,
      document.broker,
      document.stopCompany,
      document.stopLocation,
      document.documentDate,
      document.fileName,
      references,
    ].map(textV105).join(' ').toLowerCase();
    return body.includes(needle);
  });
}

export function vaultFoldersV105(documents = []) {
  const active = documents.filter(document => document.status !== 'archived');
  const loads = new Map();
  const brokers = new Map();
  for (const document of active) {
    const loadNo = normalizeCanonicalLoadNoV105(document.canonicalLoadNo || document.loadNo);
    if (loadNo) {
      const folder = loads.get(loadNo) || { id:`load:${loadNo}`, kind:'load', label:`Load ${loadNo}`, loadNo, broker:textV105(document.broker), count:0, needsReview:0, updatedAt:0 };
      folder.count += 1;
      folder.needsReview += document.status === 'needs_review' ? 1 : 0;
      folder.updatedAt = Math.max(folder.updatedAt, numberV105(document.updatedAt || document.createdAt));
      if (!folder.broker && document.broker) folder.broker = textV105(document.broker);
      loads.set(loadNo, folder);
    }
    if (document.broker) {
      const key = textV105(document.broker).toLowerCase();
      const folder = brokers.get(key) || { id:`broker:${key}`, kind:'broker', label:textV105(document.broker), broker:textV105(document.broker), count:0, needsReview:0, updatedAt:0 };
      folder.count += 1;
      folder.needsReview += document.status === 'needs_review' ? 1 : 0;
      folder.updatedAt = Math.max(folder.updatedAt, numberV105(document.updatedAt || document.createdAt));
      brokers.set(key, folder);
    }
  }
  return {
    needsReview:{ id:'needs_review', kind:'system', label:'Needs Review', count:active.filter(document => document.status === 'needs_review').length },
    recent:{ id:'recent', kind:'system', label:'Recent', count:active.length },
    loads:[...loads.values()].sort((a, b) => b.updatedAt - a.updatedAt || a.loadNo.localeCompare(b.loadNo)),
    brokers:[...brokers.values()].sort((a, b) => b.updatedAt - a.updatedAt || a.label.localeCompare(b.label)),
  };
}

function documentSummaryForStateV105(record = {}) {
  return {
    id:textV105(record.id),
    clientDocumentId:textV105(record.clientDocumentId),
    type:textV105(record.type),
    title:textV105(record.title),
    date:normalizeDateV105(record.documentDate || record.date),
    loadNo:normalizeCanonicalLoadNoV105(record.canonicalLoadNo || record.loadNo),
    canonicalLoadNo:normalizeCanonicalLoadNoV105(record.canonicalLoadNo || record.loadNo),
    broker:textV105(record.broker),
    stopId:textV105(record.stopId),
    stopSequence:Number(record.stopSequence || 0),
    fileName:textV105(record.fileName),
    confidence:Number(record.classification?.confidence || 0),
    reviewStatus:textV105(record.reviewStatus || record.status),
    linkedAt:Date.now(),
    foundationVersion:ROAD_READY_OS_FOUNDATION_VERSION_V105,
  };
}

function upsertStateDocumentV105(state = {}, day = '', summary = {}) {
  if (!day) return state.documentsByDay || {};
  const map = { ...(state.documentsByDay || {}) };
  const list = [...(map[day] || [])];
  const index = list.findIndex(item => item?.id === summary.id);
  if (index >= 0) list[index] = { ...list[index], ...summary };
  else list.push(summary);
  map[day] = list.slice(-250);
  return map;
}

function guideForLoadV105(state = {}, loadNo = '') {
  const canonical = normalizeCanonicalLoadNoV105(loadNo);
  return Object.values(state.loadGuidesById || {}).find(guide => (
    normalizeCanonicalLoadNoV105(guide?.loadNo || guide?.orderNo) === canonical
  )) || null;
}

export function applyVaultDocumentCommitV105(state = {}, payload = {}) {
  const record = payload.record || payload.document || {};
  const loadNo = normalizeCanonicalLoadNoV105(record.canonicalLoadNo || record.loadNo);
  const day = normalizeDateV105(record.linkDay || record.documentDate || state.activeDay);
  const summary = documentSummaryForStateV105(record);
  const documentsByDay = upsertStateDocumentV105(state, day, summary);
  let loadGuidesById = state.loadGuidesById || {};
  const guide = loadNo ? guideForLoadV105(state, loadNo) : null;
  if (guide) {
    const documents = { ...(guide.documents || {}) };
    const ids = uniqueV105([...(documents.documentIds || []), record.id]);
    documents.documentIds = ids;
    if (record.type === 'rate_confirmation') documents.rateConfirmationDocumentId = record.id;
    if (record.type === 'bol') documents.bolDocumentId = record.id;
    if (record.type === 'pod') {
      const podByStop = { ...(documents.podByStop || {}) };
      const sequence = Number(record.stopSequence || 0);
      if (sequence) podByStop[String(sequence)] = record.id;
      documents.podByStop = podByStop;
      const deliveryCount = Number(guide.deliveryCount || (guide.stops || []).filter(stop => stop?.type === 'delivery').length || 0);
      if (!sequence || !deliveryCount || sequence >= deliveryCount) documents.podDocumentId = record.id;
    }
    loadGuidesById = {
      ...loadGuidesById,
      [guide.id]:{
        ...guide,
        documents,
        documentChecklistVersion:ROAD_READY_OS_FOUNDATION_VERSION_V105,
        updatedAt:Date.now(),
      },
    };
  }

  const existingInfoLoad = normalizeCanonicalLoadNoV105(state.loadInfo?.loadNo || state.loadInfo?.shippingDocs);
  const loadInfo = loadNo && existingInfoLoad === loadNo
    ? {
      ...(state.loadInfo || {}),
      documentIds:uniqueV105([...(state.loadInfo?.documentIds || []), record.id]),
      documentChecklistVersion:ROAD_READY_OS_FOUNDATION_VERSION_V105,
      updatedAt:Date.now(),
    }
    : state.loadInfo || {};

  return {
    ...state,
    documentsByDay,
    loadGuidesById,
    loadInfo,
    lastDocumentLink:{
      day,
      documentId:record.id,
      type:record.type,
      loadNo,
      stopSequence:Number(record.stopSequence || 0),
      at:Date.now(),
      source:'document_vault_v105',
    },
  };
}

export function dispatchVaultDocumentCommitV105(payload = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ROAD_READY_DOCUMENT_COMMIT_EVENT_V105, { detail:payload }));
}

function guideRouteLegsV105(state = {}, guide = {}) {
  const canonical = normalizeCanonicalLoadNoV105(guide.loadNo || guide.orderNo);
  return routeEntriesV105(state).map(entry => entry.leg).filter(leg => (
    leg?.loadGroupId === guide.id
    || canonical && canonicalRefFromLegV105(leg) === canonical
  ));
}

function guideHasInvalidStopsV105(guide = {}) {
  return (guide.stops || []).some(stop => (
    isDateLikePlaceV105(stop?.city)
    || isDateLikePlaceV105(stop?.cityState)
    || isDateLikePlaceV105(stop?.address)
  ));
}

function cleanDeliveryPretripNoteV105(note = '') {
  const parts = textV105(note).split(/\s*[·•|]\s*/g).map(textV105).filter(Boolean);
  const hasDelivery = parts.some(part => /delivery|unloading/i.test(part));
  const hasPretrip = parts.some(part => /pre[- ]?trip|inspection/i.test(part));
  if (!hasDelivery || !hasPretrip) return textV105(note);
  const kept = parts.filter(part => !/pre[- ]?trip|inspection/i.test(part));
  return kept.join(' · ') || 'Delivery / Unloading';
}

function repairDeliveryPretripContaminationV105(state = {}) {
  let changed = false;
  const changedDays = [];
  const eventsByDay = {};
  const inspectionByDay = { ...(state.inspectionByDay || {}) };
  const certifyStatus = { ...(state.certifyStatus || {}) };
  const signatureByDay = { ...(state.signatureByDay || {}) };
  const now = Date.now();

  for (const [day, rows] of Object.entries(state.eventsByDay || {})) {
    eventsByDay[day] = (Array.isArray(rows) ? rows : []).map(event => {
      const cleaned = cleanDeliveryPretripNoteV105(event?.note || '');
      if (cleaned === textV105(event?.note || '')) return event;
      changed = true;
      if (!changedDays.includes(day)) changedDays.push(day);
      const inspection = inspectionByDay[day] || {};
      if (/^auto_on_duty_pretrip/i.test(textV105(inspection.source)) && textV105(inspection.sourceEventId) === textV105(event.id)) {
        delete inspectionByDay[day];
      }
      if (certifyStatus[day] === 'Certified' || signatureByDay[day]?.signed) {
        certifyStatus[day] = 'Needs Recertification';
        signatureByDay[day] = {
          ...(signatureByDay[day] || {}),
          needsRecertification:true,
          changedAfterSignAt:now,
          integrityRepairReason:'Removed a hidden Pre-trip label from a Delivery / Unloading event. Duty time, status and location were preserved.',
        };
      }
      return {
        ...event,
        note:cleaned,
        logTextRepairVersion:ROAD_READY_OS_FOUNDATION_VERSION_V105,
        logTextRepairedAt:now,
      };
    });
  }
  return { changed, changedDays, eventsByDay, inspectionByDay, certifyStatus, signatureByDay };
}

function latestOpenRouteV105(state = {}) {
  const entries = routeEntriesV105(state)
    .filter(({ leg }) => {
      const loadNo = canonicalRefFromLegV105(leg);
      if (!loadNo || HIDDEN_STATUS_V105.test(textV105(leg.status))) return false;
      return !COMPLETE_STATUS_V105.test(textV105(leg.status)) && textV105(leg.stopStatus).toLowerCase() !== 'done';
    })
    .sort((a, b) => (
      numberV105(b.leg.updatedAt) - numberV105(a.leg.updatedAt)
      || b.at - a.at
      || Number(b.leg.stopSequence || 0) - Number(a.leg.stopSequence || 0)
    ));
  return entries[0] || null;
}

function latestOpenPickupEventV105(state = {}, openLoads = new Set()) {
  const entries = eventEntriesV105(state).filter(({ event }) => isPickupEventV105(event));
  return [...entries].reverse().find(({ event }) => {
    const refs = eventLoadRefsV105(event);
    return refs.some(loadNo => !openLoads.size || openLoads.has(loadNo));
  }) || null;
}

function matchingGuideV105(state = {}, loadNo = '') {
  const canonical = normalizeCanonicalLoadNoV105(loadNo);
  return Object.values(state.loadGuidesById || {}).find(guide => normalizeCanonicalLoadNoV105(guide?.loadNo || guide?.orderNo) === canonical) || null;
}

function safeLoadInfoV105(state = {}, loadNo = '', routeEntry = null, pickupEntry = null, guide = null) {
  const current = state.loadInfo || {};
  const leg = routeEntry?.leg || null;
  const pickup = pickupEntry?.event || null;
  const canonical = normalizeCanonicalLoadNoV105(loadNo);
  const sourcePlace = pickup ? normalizePlaceV105(pickup) : normalizePlaceV105({ city:leg?.fromCity, state:leg?.fromState });
  const finalStop = (guide?.stops || []).filter(stop => stop?.type === 'delivery').at(-1) || null;
  const destinationPlace = leg
    ? normalizePlaceV105({ city:leg.toCity, state:leg.toState })
    : normalizePlaceV105(finalStop || {});
  const consistentExisting = normalizeCanonicalLoadNoV105(current.loadNo || current.shippingDocs || current.orderNo) === canonical
    && (!current.guideId || normalizeCanonicalLoadNoV105(state.loadGuidesById?.[current.guideId]?.loadNo || state.loadGuidesById?.[current.guideId]?.orderNo) === canonical);
  const neutral = {
    truck:textV105(current.truck || state.driver?.truck),
    equipmentContainer:textV105(current.equipmentContainer || state.equipment?.container),
    equipmentChassis:textV105(current.equipmentChassis || state.equipment?.chassis),
    equipmentSeal:textV105(current.equipmentSeal || state.equipment?.seal),
    currentMoveKind:textV105(leg?.kind || current.currentMoveKind || 'loaded'),
    noLoadDeclared:false,
    noLoadNote:'',
  };
  return {
    ...neutral,
    loadNo:canonical,
    shippingDocs:canonical,
    bol:normalizeCanonicalLoadNoV105(pickup?.bol || leg?.bol) || canonical,
    po:normalizeReferenceV105(pickup?.po || leg?.po || ''),
    guideId:textV105(guide?.id),
    canonicalLoadId:textV105(guide?.id || leg?.loadGroupId || `load_${canonical}`),
    orderNo:textV105(guide?.orderNo || leg?.orderNo || canonical),
    legNo:textV105(guide?.legNo || leg?.legNo),
    broker:textV105(guide?.broker || leg?.broker || (consistentExisting ? current.broker : '')),
    carrierName:textV105(guide?.carrierName || (consistentExisting ? current.carrierName : '')),
    rate:numberV105(guide?.rate || leg?.rate || (consistentExisting ? current.rate : 0)),
    gross:numberV105(guide?.rate || leg?.rate || (consistentExisting ? current.gross : 0)),
    equipment:textV105(guide?.equipment || leg?.equipment || (consistentExisting ? current.equipment : state.equipment?.type)),
    pickupNumber:textV105(guide?.pickupNumber || leg?.pickupNumber || (consistentExisting ? current.pickupNumber : '')),
    pickupCity:sourcePlace.city,
    pickupState:sourcePlace.state,
    deliveryCity:destinationPlace.city,
    deliveryState:destinationPlace.state,
    pickupDate:normalizeDateV105(guide?.pickupDate || leg?.pickupDay || pickupEntry?.day),
    deliveryDate:normalizeDateV105(guide?.deliveryDate || leg?.deliveryDay),
    stops:guide && !guideHasInvalidStopsV105(guide) ? (guide.stops || []) : [],
    stopCount:guide && !guideHasInvalidStopsV105(guide) ? Number(guide.stopCount || guide.stops?.length || 0) : (leg ? 1 : 0),
    deliveryCount:guide && !guideHasInvalidStopsV105(guide) ? Number(guide.deliveryCount || (guide.stops || []).filter(stop => stop?.type === 'delivery').length || 0) : (leg ? 1 : 0),
    sourceEventId:textV105(pickup?.id || leg?.pickupEventId || leg?.deliveryEventId),
    sourceEventDay:textV105(pickupEntry?.day || leg?.pickupDay || routeEntry?.day),
    sourceEventReason:textV105(pickup?.note || pickup?.description || 'Pickup / Loading'),
    routeSource:textV105(leg?.source || 'canonical_foundation_v105'),
    source:'canonical_load_v105',
    updatedAt:Date.now(),
    foundationVersion:ROAD_READY_OS_FOUNDATION_VERSION_V105,
  };
}

export function repairRoadReadyFoundationV105(inputState = {}, options = {}) {
  if (!inputState || typeof inputState !== 'object') return inputState;
  const state = { ...inputState };
  const logRepair = repairDeliveryPretripContaminationV105(state);
  if (logRepair.changed) {
    state.eventsByDay = logRepair.eventsByDay;
    state.inspectionByDay = logRepair.inspectionByDay;
    state.certifyStatus = logRepair.certifyStatus;
    state.signatureByDay = logRepair.signatureByDay;
  }

  let guideChanged = false;
  const loadGuidesById = {};
  for (const [id, guide] of Object.entries(state.loadGuidesById || {})) {
    const complete = guideIsCompleteV105(guide, state);
    const invalidStops = guideHasInvalidStopsV105(guide);
    const nextStatus = complete ? 'completed' : guide.status;
    const next = {
      ...guide,
      status:nextStatus,
      reviewStatus:invalidStops ? 'needs_review' : (guide.reviewStatus || 'verified'),
      foundationVersion:ROAD_READY_OS_FOUNDATION_VERSION_V105,
      ...(invalidStops ? { reviewReason:'Route contains date text or invalid location fields. Original document is preserved for review.' } : {}),
    };
    if (nextStatus !== guide.status || next.reviewStatus !== guide.reviewStatus || next.foundationVersion !== guide.foundationVersion) guideChanged = true;
    loadGuidesById[id] = next;
  }
  state.loadGuidesById = loadGuidesById;

  const openRoute = latestOpenRouteV105(state);
  const openLoadSet = new Set(routeEntriesV105(state)
    .filter(({ leg }) => !HIDDEN_STATUS_V105.test(textV105(leg.status)) && !COMPLETE_STATUS_V105.test(textV105(leg.status)) && textV105(leg.stopStatus).toLowerCase() !== 'done')
    .map(({ leg }) => canonicalRefFromLegV105(leg))
    .filter(Boolean));
  const pickupEntry = latestOpenPickupEventV105(state, openLoadSet);
  const pickupRef = pickupEntry ? eventLoadRefsV105(pickupEntry.event).find(loadNo => !openLoadSet.size || openLoadSet.has(loadNo)) : '';
  const routeRef = openRoute ? canonicalRefFromLegV105(openRoute.leg) : '';
  const canonicalLoadNo = pickupRef || routeRef || '';
  let identityChanged = false;

  if (canonicalLoadNo) {
    const guide = matchingGuideV105(state, canonicalLoadNo);
    const safeInfo = safeLoadInfoV105(state, canonicalLoadNo, openRoute && routeRef === canonicalLoadNo ? openRoute : null, pickupEntry && pickupRef === canonicalLoadNo ? pickupEntry : null, guide && !guideIsCompleteV105(guide, state) ? guide : null);
    const oldIdentity = {
      loadNo:normalizeCanonicalLoadNoV105(state.loadInfo?.loadNo || state.loadInfo?.shippingDocs),
      guideId:textV105(state.loadInfo?.guideId),
      activeGuide:textV105(state.activeLoadGuideId),
    };
    state.loadInfo = safeInfo;
    state.activeLoadGuideId = safeInfo.guideId || '';
    identityChanged = oldIdentity.loadNo !== canonicalLoadNo
      || oldIdentity.guideId !== safeInfo.guideId
      || oldIdentity.activeGuide !== state.activeLoadGuideId
      || normalizeCanonicalLoadNoV105(inputState.loadInfo?.orderNo) !== normalizeCanonicalLoadNoV105(safeInfo.orderNo);
  } else {
    const activeGuide = Object.values(loadGuidesById).find(guide => !HIDDEN_STATUS_V105.test(textV105(guide.status)) && !guideIsCompleteV105(guide, state) && !guideHasInvalidStopsV105(guide));
    if (activeGuide) {
      const canonical = normalizeCanonicalLoadNoV105(activeGuide.loadNo || activeGuide.orderNo);
      state.loadInfo = safeLoadInfoV105(state, canonical, null, null, activeGuide);
      state.activeLoadGuideId = activeGuide.id;
    } else if (state.activeLoadGuideId && guideIsCompleteV105(loadGuidesById[state.activeLoadGuideId] || {}, state)) {
      state.activeLoadGuideId = '';
      identityChanged = true;
    }
  }

  const changed = logRepair.changed || guideChanged || identityChanged;
  if (!changed && state.roadReadyFoundationV105?.version === ROAD_READY_OS_FOUNDATION_VERSION_V105) return state;
  state.roadReadyFoundationV105 = {
    version:ROAD_READY_OS_FOUNDATION_VERSION_V105,
    source:textV105(options.source || 'runtime'),
    repairedAt:Date.now(),
    activeLoadNo:normalizeCanonicalLoadNoV105(state.loadInfo?.loadNo || state.loadInfo?.shippingDocs),
    activeGuideId:textV105(state.activeLoadGuideId),
    logTextDaysRepaired:logRepair.changedDays,
    canonicalIdentityChanged:identityChanged,
    guideStatusReviewed:guideChanged,
    dutyTimesChanged:false,
    dutyStatusesChanged:false,
    dutyLocationsChanged:false,
    documentOriginalsChanged:false,
  };
  return state;
}
