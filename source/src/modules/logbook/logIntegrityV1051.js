export const LOG_INTEGRITY_VERSION_V1051 = '105.1.0';

const COMPLETE_STATUS_V1051 = /^(?:delivered|completed|closed|done|paid|invoiced)$/i;
const HIDDEN_STATUS_V1051 = /^(?:cancelled|canceled|dismissed|archived|superseded)$/i;

function textV1051(value = '') {
  return value === 0 ? '0' : String(value || '').trim();
}

function upperV1051(value = '') {
  return textV1051(value).toUpperCase();
}

function uniqueV1051(values = []) {
  return [...new Set(values.map(textV1051).filter(Boolean))];
}

function isDateLikeV1051(value = '') {
  const raw = textV1051(value);
  if (!raw) return false;
  return /^(?:(?:date|dated|on)\s*[: -]?\s*)?(?:19|20)\d{2}[\/.-]\d{1,2}[\/.-]\d{1,2}$/i.test(raw)
    || /^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}$/.test(raw)
    || /^(?:19|20)\d{6}$/.test(raw);
}

function isDateLikePlaceV1051(value = '') {
  const raw = textV1051(value);
  return isDateLikeV1051(raw)
    || /(?:^|\b)(?:date|dated|on)\s*[: -]?\s*(?:19|20)\d{2}/i.test(raw);
}

function normalizedCityV1051(value = '') {
  return textV1051(value)
    .toLowerCase()
    .replace(/\bsaint\b/g, 'st')
    .replace(/\bst[.]?\b/g, 'st')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sameCityV1051(left = '', right = '') {
  const a = normalizedCityV1051(left);
  const b = normalizedCityV1051(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function eventLoadNoV1051(event = {}) {
  return textV1051(event.loadNo || event.shippingDocs || event.orderNo);
}

function eventTextV1051(event = {}) {
  return [event.note, event.description, event.reason, ...(Array.isArray(event.reasons) ? event.reasons : [])]
    .map(textV1051)
    .filter(Boolean)
    .join(' · ');
}

function isPickupEventV1051(event = {}) {
  return upperV1051(event.status) === 'ON' && /pickup|pick up|loading|hook(ed)?/i.test(eventTextV1051(event));
}

function isDeliveryEventV1051(event = {}) {
  return upperV1051(event.status) === 'ON' && /delivery|unloading|delivered|drop\s*off/i.test(eventTextV1051(event));
}

function isPretripOnlyV1051(event = {}) {
  const body = eventTextV1051(event);
  return upperV1051(event.status) === 'ON'
    && /pre[- ]?trip|inspection/i.test(body)
    && !/pickup|loading|delivery|unloading|drop\s*&\s*hook|drop\s*off|fuel/i.test(body);
}

function routeEvidenceV1051(state = {}) {
  const pickupByEvent = new Map();
  const deliveryByEvent = new Map();
  const emptyDeliveryEvents = new Set();

  function add(map, eventId, loadNo) {
    const id = textV1051(eventId);
    const load = textV1051(loadNo);
    if (!id || !load) return;
    map.set(id, uniqueV1051([...(map.get(id) || []), load]));
  }

  for (const rows of Object.values(state.routeLegsByDay || {})) {
    for (const leg of Array.isArray(rows) ? rows : []) {
      if (!leg || HIDDEN_STATUS_V1051.test(textV1051(leg.status))) continue;
      if (leg.excludedFromActiveLoad === true || textV1051(leg.reviewStatus).toLowerCase() === 'needs_review') continue;
      const loadNo = textV1051(leg.loadNo || leg.shippingDocs || leg.orderNo || leg.pickedUpLoadNo);
      add(pickupByEvent, leg.pickupEventId, loadNo);
      add(deliveryByEvent, leg.deliveryEventId, loadNo);
      if (!loadNo && /empty|reposition/i.test(textV1051(leg.kind || leg.routeIntent))) {
        const id = textV1051(leg.deliveryEventId);
        if (id) emptyDeliveryEvents.add(id);
      }
    }
  }
  return { pickupByEvent, deliveryByEvent, emptyDeliveryEvents };
}

function guideByLoadV1051(state = {}) {
  const map = new Map();
  for (const guide of Object.values(state.loadGuidesById || {})) {
    const loadNo = textV1051(guide?.loadNo || guide?.orderNo);
    if (loadNo) map.set(loadNo, guide);
  }
  return map;
}

function guideCompletedV1051(guide = {}, state = {}) {
  if (!guide || !Object.keys(guide).length) return false;
  if (COMPLETE_STATUS_V1051.test(textV1051(guide.status))) return true;
  const deliveryCount = Number(guide.deliveryCount || (guide.stops || []).filter(stop => stop?.type === 'delivery').length || 0);
  const completed = new Set((guide.completedStopIds || []).map(String));
  if (deliveryCount && completed.size >= deliveryCount) return true;
  const legs = Object.values(state.routeLegsByDay || {}).flatMap(rows => Array.isArray(rows) ? rows : [])
    .filter(leg => textV1051(leg?.loadGroupId) === textV1051(guide.id));
  return Boolean(legs.length && legs.every(leg => (
    COMPLETE_STATUS_V1051.test(textV1051(leg.status))
    || textV1051(leg.stopStatus).toLowerCase() === 'done'
    || leg.guideCompleted === true
  )));
}

function clearDocumentLinkV1051(event = {}, keepRateConfirmation = false) {
  const next = { ...event };
  next.shippingDocumentId = '';
  next.shippingDocumentType = '';
  next.shippingDocumentDate = '';
  next.documentLinkedAt = null;
  next.seal = '';
  next.trailerNo = next.trailerNo || '';
  next.shipmentWeight = 0;
  next.shipmentPieces = 0;
  next.commodity = '';
  next.shipper = '';
  next.consignee = '';
  next.documentIds = keepRateConfirmation && next.rateConfirmationDocumentId
    ? [next.rateConfirmationDocumentId]
    : [];
  if (!keepRateConfirmation) {
    next.rateConfirmationDocumentId = '';
    next.loadRate = 0;
  }
  return next;
}

function clearLoadContextV1051(event = {}) {
  let next = { ...event };
  for (const key of [
    'shippingDocs', 'loadNo', 'bol', 'po', 'destination', 'destinationState',
    'pickedUpLoadNo', 'deliveredLoadNo', 'transitionSummary', 'displayShippingDocs',
    'orderNo', 'legNo', 'broker', 'pickupStopId', 'nextStop', 'nextDestination',
    'nextStopCompany', 'nextStopAppointment',
  ]) next[key] = '';
  next.transitionLoadNos = [];
  next.shippingDocsUpdatedAt = null;
  next.nextStopSequence = null;
  next.loadDetailsExplicit = false;
  next.noLoadDeclared = false;
  next.noLoadNote = '';
  next = clearDocumentLinkV1051(next, false);
  return next;
}

function cleanEventV1051({
  state = {},
  day = '',
  event = {},
  rows = [],
  evidence = {},
  guides = new Map(),
} = {}) {
  const original = event;
  let next = { ...event };
  const id = textV1051(next.id);
  const loadNo = eventLoadNoV1051(next);
  const guide = guides.get(loadNo) || null;
  const body = eventTextV1051(next);
  const pickup = isPickupEventV1051(next);
  const delivery = isDeliveryEventV1051(next);
  const pretripOnly = isPretripOnlyV1051(next);
  const stopSequence = Number(next.deliveryStopSequence || 0);
  const stopCount = Number(next.deliveryStopCount || 0);
  const picked = textV1051(next.pickedUpLoadNo);
  const delivered = textV1051(next.deliveredLoadNo);
  const routePickups = evidence.pickupByEvent.get(id) || [];
  const routeDeliveries = evidence.deliveryByEvent.get(id) || [];
  const guidePoNumbers = new Set((guide?.poNumbers || []).map(textV1051).filter(Boolean));

  if (isDateLikeV1051(next.bol)) next.bol = '';
  if (isDateLikePlaceV1051(next.destination)) {
    next.destination = '';
    next.destinationState = '';
    next.loadReviewStatus = 'needs_review';
    next.loadReviewReason = 'Destination contained date text and must be confirmed from the original document.';
    if (pickup && loadNo) next.description = `Load ${loadNo} · Pickup / Loading`;
  }

  if (pickup && loadNo && textV1051(next.bol) === loadNo && !textV1051(next.shippingDocumentId)) next.bol = '';
  if (pickup && loadNo && textV1051(next.po) === loadNo && !textV1051(next.shippingDocumentId)) next.po = '';

  if (pickup && guide && Number(guide.deliveryCount || 0) > 1) {
    if (guidePoNumbers.has(textV1051(next.bol))) next.bol = '';
    if (guidePoNumbers.has(textV1051(next.po))) next.po = '';
    if (textV1051(next.shippingDocumentType).toLowerCase() === 'pod') next = clearDocumentLinkV1051(next, true);
    if (textV1051(next.nextStop)) {
      next.destination = textV1051(next.nextStop);
      const stateMatch = textV1051(next.nextStop).match(/,\s*([A-Za-z]{2})\s*$/);
      next.destinationState = stateMatch ? stateMatch[1].toUpperCase() : textV1051(next.destinationState);
    }
  }

  if (stopSequence && loadNo) {
    next.pickedUpLoadNo = '';
    if (stopCount && stopSequence >= stopCount) {
      next.deliveredLoadNo = loadNo;
      next.transitionLoadNos = [loadNo];
      next.transitionSummary = `Delivered ${loadNo}`;
      next.displayShippingDocs = `Delivered ${loadNo}`;
    } else {
      next.deliveredLoadNo = '';
      next.transitionLoadNos = [];
      next.transitionSummary = '';
      next.displayShippingDocs = `Load ${loadNo}`;
    }
    if (textV1051(next.bol) && textV1051(next.bol) !== loadNo && guides.has(textV1051(next.bol))) next.bol = '';
    const wrongTransition = [picked, delivered].find(value => value && value !== loadNo);
    if (wrongTransition || Number(next.loadRate || 0) && Number(guide?.rate || 0) && Number(next.loadRate) !== Number(guide.rate)) {
      next.pickedUpLoadNo = '';
      next.deliveredLoadNo = stopCount && stopSequence >= stopCount ? loadNo : '';
      next.transitionLoadNos = next.deliveredLoadNo ? [loadNo] : [];
      next.transitionSummary = next.deliveredLoadNo ? `Delivered ${loadNo}` : '';
      next.displayShippingDocs = next.deliveredLoadNo ? `Delivered ${loadNo}` : `Load ${loadNo}`;
      next.rateConfirmationDocumentId = '';
      next.documentIds = [];
      next.broker = textV1051(guide?.broker);
      next.loadRate = Number(guide?.rate || 0);
    }
  } else if (!picked && !delivered && pickup && loadNo && routePickups.includes(loadNo)) {
    next.pickedUpLoadNo = loadNo;
    next.transitionLoadNos = [loadNo];
    next.transitionSummary = `Picked up ${loadNo}`;
    next.displayShippingDocs = `Load ${loadNo}`;
  } else if (picked && delivered && picked === delivered) {
    const routePickup = routePickups.includes(picked);
    const routeDelivery = routeDeliveries.includes(delivered);
    if (routePickup && !routeDelivery) {
      next.deliveredLoadNo = '';
      next.pickedUpLoadNo = picked;
      next.transitionLoadNos = [picked];
      next.transitionSummary = `Picked up ${picked}`;
      next.displayShippingDocs = `Load ${picked}`;
    } else if (routeDelivery && !routePickup) {
      next.pickedUpLoadNo = '';
      next.deliveredLoadNo = delivered;
      next.transitionLoadNos = [delivered];
      next.transitionSummary = `Delivered ${delivered}`;
      next.displayShippingDocs = `Delivered ${delivered}`;
    } else if (next.noLoadDeclared === true || evidence.emptyDeliveryEvents.has(id)) {
      next.pickedUpLoadNo = '';
      next.deliveredLoadNo = '';
      next.transitionLoadNos = [];
      next.transitionSummary = '';
      next.displayShippingDocs = '';
      next.staleCarryoverLoadNo = '';
    } else if (pickup && !delivery) {
      next.deliveredLoadNo = '';
      next.pickedUpLoadNo = picked;
      next.transitionLoadNos = [picked];
      next.transitionSummary = `Picked up ${picked}`;
      next.displayShippingDocs = `Load ${picked}`;
    } else if (delivery) {
      next.pickedUpLoadNo = '';
      next.deliveredLoadNo = delivered;
      next.transitionLoadNos = [delivered];
      next.transitionSummary = `Delivered ${delivered}`;
      next.displayShippingDocs = `Delivered ${delivered}`;
    }
  }

  if (next.noLoadDeclared === true) {
    const toMatch = body.match(/\bto\s+([A-Za-z][A-Za-z .'-]*?)\s*,\s*([A-Za-z]{2})\b/i);
    if (toMatch) {
      next.destinationCity = textV1051(toMatch[1]).replace(/\b\w/g, letter => letter.toUpperCase());
      next.destinationState = upperV1051(toMatch[2]);
      next.destination = `${next.destinationCity}, ${next.destinationState}`;
    }
  }

  if (pretripOnly && loadNo) {
    const eventStart = Number(next.startMin || 0);
    const laterPickup = rows.find(candidate => (
      Number(candidate?.startMin || 0) > eventStart
      && isPickupEventV1051(candidate)
      && eventLoadNoV1051(candidate)
      && eventLoadNoV1051(candidate) !== loadNo
    ));
    if (laterPickup && guideCompletedV1051(guide, state)) next = clearLoadContextV1051(next);
  }

  if (next.noLoadDeclared === true && /drop\s*off/i.test(body) && !textV1051(next.loadNo || next.shippingDocs)) {
    next.pickedUpLoadNo = '';
    next.deliveredLoadNo = '';
    next.transitionLoadNos = [];
    next.transitionSummary = '';
    next.displayShippingDocs = '';
    next.staleCarryoverLoadNo = '';
    if (isDateLikePlaceV1051(next.destination) || textV1051(next.destination)) {
      next.destination = '';
      next.destinationState = '';
      next.destinationCity = '';
    }
  }

  if (textV1051(next.city).toLowerCase() === 'mt sterling') next.city = 'Mount Sterling';

  const changed = JSON.stringify(next) !== JSON.stringify(original);
  if (!changed) return { event:original, changed:false, codes:[] };
  next.logIntegrityVersion = LOG_INTEGRITY_VERSION_V1051;
  next.logIntegrityRepairedAt = Date.now();

  const codes = [];
  if (textV1051(original.bol) !== textV1051(next.bol) || textV1051(original.po) !== textV1051(next.po)) codes.push('secondary_reference');
  if (textV1051(original.destination) !== textV1051(next.destination)) codes.push('destination');
  if (textV1051(original.pickedUpLoadNo) !== textV1051(next.pickedUpLoadNo) || textV1051(original.deliveredLoadNo) !== textV1051(next.deliveredLoadNo)) codes.push('transition');
  if (textV1051(original.loadNo || original.shippingDocs) !== textV1051(next.loadNo || next.shippingDocs)) codes.push('stale_load');
  if (textV1051(original.shippingDocumentId) !== textV1051(next.shippingDocumentId)) codes.push('document_link');
  return { event:next, changed:true, codes:uniqueV1051(codes) };
}

function cleanRouteLegsV1051(state = {}, now = Date.now()) {
  let changed = false;
  const changes = [];
  const routeLegsByDay = {};

  for (const [day, rows] of Object.entries(state.routeLegsByDay || {})) {
    routeLegsByDay[day] = (Array.isArray(rows) ? rows : []).map(leg => {
      if (!leg) return leg;
      let next = { ...leg };
      const loadNo = textV1051(next.loadNo || next.shippingDocs || next.orderNo);
      const invalidLocation = isDateLikePlaceV1051(next.fromCity) || isDateLikePlaceV1051(next.toCity) || isDateLikePlaceV1051(next.stopAddress);
      if (invalidLocation) {
        next.excludedFromActiveLoad = true;
        next.reviewStatus = 'needs_review';
        next.reviewReason = 'Route contains date text or an invalid OCR location. Confirm the original document.';
      }
      if ((invalidLocation || !textV1051(next.toCity)) && textV1051(next.bol) === loadNo) next.bol = '';
      if ((invalidLocation || !textV1051(next.toCity)) && textV1051(next.po) === loadNo) next.po = '';
      if (!textV1051(next.toCity) && loadNo && !HIDDEN_STATUS_V1051.test(textV1051(next.status))) {
        next.reviewStatus = next.reviewStatus || 'needs_review';
        next.reviewReason = next.reviewReason || 'Pickup is valid; destination is still missing.';
      }
      if (JSON.stringify(next) === JSON.stringify(leg)) return leg;
      changed = true;
      next.logIntegrityVersion = LOG_INTEGRITY_VERSION_V1051;
      next.logIntegrityRepairedAt = now;
      changes.push({ code:'route_metadata', day, routeId:textV1051(next.id), loadNo });
      return next;
    });
  }
  return { changed, routeLegsByDay, changes };
}

function cleanGuidesV1051(state = {}, now = Date.now()) {
  let changed = false;
  const changes = [];
  const loadGuidesById = {};

  for (const [id, guide] of Object.entries(state.loadGuidesById || {})) {
    const invalid = (guide?.stops || []).some(stop => (
      isDateLikePlaceV1051(stop?.city)
      || isDateLikePlaceV1051(stop?.cityState)
      || isDateLikePlaceV1051(stop?.address)
    ));
    if (!invalid) {
      loadGuidesById[id] = guide;
      continue;
    }
    const next = {
      ...guide,
      excludedFromActiveLoad:true,
      reviewStatus:'needs_review',
      reviewReason:'Pickup/delivery locations contain OCR date text. Confirm the original Rate Confirmation.',
    };
    if (JSON.stringify(next) === JSON.stringify(guide)) {
      loadGuidesById[id] = guide;
      continue;
    }
    changed = true;
    loadGuidesById[id] = {
      ...next,
      logIntegrityVersion:LOG_INTEGRITY_VERSION_V1051,
      logIntegrityRepairedAt:now,
    };
    changes.push({ code:'guide_quarantined', guideId:id, loadNo:textV1051(guide?.loadNo || guide?.orderNo) });
  }
  return { changed, loadGuidesById, changes };
}

function cleanLoadInfoV1051(loadInfo = {}, now = Date.now()) {
  if (!loadInfo || typeof loadInfo !== 'object') return { changed:false, loadInfo };
  const next = { ...loadInfo };
  const loadNo = textV1051(next.loadNo || next.shippingDocs || next.orderNo);
  if (textV1051(next.bol) === loadNo || isDateLikeV1051(next.bol)) next.bol = '';
  if (textV1051(next.po) === loadNo || isDateLikeV1051(next.po)) next.po = '';
  const validStops = (Array.isArray(next.stops) ? next.stops : []).filter(stop => (
    !isDateLikePlaceV1051(stop?.city)
    && !isDateLikePlaceV1051(stop?.cityState)
    && !isDateLikePlaceV1051(stop?.address)
  ));
  if (!textV1051(next.deliveryCity) && !textV1051(next.deliveryState) && !validStops.length) {
    next.stops = [];
    next.stopCount = 0;
    next.deliveryCount = 0;
  }
  if (JSON.stringify(next) === JSON.stringify(loadInfo)) return { changed:false, loadInfo };
  next.logIntegrityVersion = LOG_INTEGRITY_VERSION_V1051;
  next.logIntegrityRepairedAt = now;
  return { changed:true, loadInfo:next };
}

function repairCurrentLocationV1051(state = {}, eventsByDay = {}) {
  const current = state.currentLocation || {};
  if (textV1051(current.state) && !/^(?:UNK|UNKNOWN)$/i.test(textV1051(current.state))) return { changed:false, currentLocation:current };
  const entries = Object.entries(eventsByDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([day, rows]) => (Array.isArray(rows) ? rows : []).map(event => ({ day, event })));
  const city = textV1051(current.city);
  const known = [...entries].reverse().find(({ event }) => sameCityV1051(city, event?.city) && textV1051(event?.state));
  if (!known) return { changed:false, currentLocation:current };
  return {
    changed:true,
    currentLocation:{
      ...current,
      state:upperV1051(known.event.state),
      locationSource:'log_continuity_repair',
      logIntegrityVersion:LOG_INTEGRITY_VERSION_V1051,
    },
  };
}

function repairMidnightContinuationV1051(eventsByDay = {}, now = Date.now()) {
  const days = Object.keys(eventsByDay).sort();
  if (days.length < 2) return { changed:false, eventsByDay, change:null };
  const day = days.at(-1);
  const previousDay = days.at(-2);
  const rows = [...(eventsByDay[day] || [])];
  const previousRows = [...(eventsByDay[previousDay] || [])].sort((a, b) => Number(a.startMin || 0) - Number(b.startMin || 0));
  const index = rows.findIndex(event => Number(event?.startMin || 0) === 0);
  if (index < 0 || !previousRows.length) return { changed:false, eventsByDay, change:null };
  const event = rows[index];
  const previous = previousRows.at(-1);
  if (upperV1051(event?.status) !== 'OFF' || upperV1051(previous?.status) !== 'OFF') return { changed:false, eventsByDay, change:null };
  const wrongDrivingReference = /drive|driving/i.test(textV1051(event?.source))
    || textV1051(event?.crossMidnightFromEventId) !== textV1051(previous?.id)
    || !textV1051(event?.state) && sameCityV1051(event?.city, previous?.city);
  if (!wrongDrivingReference) return { changed:false, eventsByDay, change:null };
  rows[index] = {
    ...event,
    state:textV1051(event.state) || textV1051(previous.state),
    source:'off_duty_midnight_continuation',
    loadLinkId:textV1051(previous.id),
    crossMidnightFromDay:previousDay,
    crossMidnightFromEventId:textV1051(previous.id),
    crossMidnightContinuation:true,
    logIntegrityVersion:LOG_INTEGRITY_VERSION_V1051,
    logIntegrityRepairedAt:now,
  };
  return {
    changed:true,
    eventsByDay:{ ...eventsByDay, [day]:rows },
    change:{ code:'off_duty_midnight_continuation', day, eventId:textV1051(event.id) },
  };
}

export function repairLogIntegrityV1051(inputState = {}, options = {}) {
  if (!inputState || typeof inputState !== 'object') return inputState;
  const now = Date.now();
  const state = { ...inputState };
  const evidence = routeEvidenceV1051(state);
  const guides = guideByLoadV1051(state);
  const changes = [];
  const changedDays = new Set();
  let changed = false;
  const eventsByDay = {};

  for (const [day, rowsInput] of Object.entries(state.eventsByDay || {})) {
    const rows = Array.isArray(rowsInput) ? rowsInput : [];
    eventsByDay[day] = rows.map(event => {
      const result = cleanEventV1051({ state, day, event, rows, evidence, guides });
      if (!result.changed) return event;
      changed = true;
      changedDays.add(day);
      changes.push({ code:'event_metadata', day, eventId:textV1051(event?.id), fields:result.codes });
      return result.event;
    });
  }

  const midnight = repairMidnightContinuationV1051(eventsByDay, now);
  if (midnight.changed) {
    changed = true;
    eventsByDay[Object.keys(midnight.eventsByDay).sort().at(-1)] = midnight.eventsByDay[Object.keys(midnight.eventsByDay).sort().at(-1)];
    changedDays.add(midnight.change.day);
    changes.push(midnight.change);
  }
  state.eventsByDay = eventsByDay;

  const routes = cleanRouteLegsV1051(state, now);
  if (routes.changed) {
    changed = true;
    state.routeLegsByDay = routes.routeLegsByDay;
    changes.push(...routes.changes);
  }

  const guideRepair = cleanGuidesV1051(state, now);
  if (guideRepair.changed) {
    changed = true;
    state.loadGuidesById = guideRepair.loadGuidesById;
    changes.push(...guideRepair.changes);
  }

  const loadInfoRepair = cleanLoadInfoV1051(state.loadInfo || {}, now);
  if (loadInfoRepair.changed) {
    changed = true;
    state.loadInfo = loadInfoRepair.loadInfo;
    changes.push({ code:'active_load_identity', loadNo:textV1051(state.loadInfo?.loadNo || state.loadInfo?.shippingDocs) });
  }

  const currentLocation = repairCurrentLocationV1051(state, eventsByDay);
  if (currentLocation.changed) {
    changed = true;
    state.currentLocation = currentLocation.currentLocation;
    changes.push({ code:'current_location_state', city:textV1051(state.currentLocation?.city), state:textV1051(state.currentLocation?.state) });
  }

  if (!changed) return inputState;

  const certifyStatus = { ...(state.certifyStatus || {}) };
  const signatureByDay = { ...(state.signatureByDay || {}) };
  for (const day of changedDays) {
    if (!signatureByDay[day]?.signed) continue;
    certifyStatus[day] = 'Needs Recertification';
    signatureByDay[day] = {
      ...signatureByDay[day],
      needsRecertification:true,
      changedAfterSignAt:now,
      integrityRepairReason:'Corrected load/document metadata without changing duty-status time, duty status, or signed GPS location.',
    };
  }
  state.certifyStatus = certifyStatus;
  state.signatureByDay = signatureByDay;
  state.logIntegrityRepairV1051 = {
    version:LOG_INTEGRITY_VERSION_V1051,
    source:textV1051(options.source || 'runtime'),
    repairedAt:now,
    changedDays:[...changedDays].sort(),
    changes,
    dutyTimesChanged:false,
    dutyStatusesChanged:false,
    signedGpsLocationsChanged:false,
    documentOriginalsChanged:false,
  };
  return state;
}
