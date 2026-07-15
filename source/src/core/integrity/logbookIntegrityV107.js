const TERMINAL_ROUTE_STATUS = /^(?:delivered|completed|closed|cancelled|canceled|superseded|archived|dismissed)$/i;
const HIDDEN_ROUTE_STATUS = /^(?:cancelled|canceled|superseded|archived|dismissed)$/i;
const CITY_ALIASES = new Map([
  ['willmington', 'wilmington'],
  ['chashier', 'cheshire'],
  ['saint cloud', 'st cloud'],
]);

function text(value = '') {
  return value === 0 ? '0' : String(value || '').trim();
}

function upper(value = '') {
  return text(value).toUpperCase();
}

function ref(value = '') {
  return upper(value).replace(/[^A-Z0-9-]/g, '');
}

function unique(values = []) {
  return [...new Set((values || []).map(text).filter(Boolean))];
}

function validDay(value = '') {
  return /^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? text(value) : '';
}

function minute(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1440, Math.round(number))) : fallback;
}

function minuteFromTime(value = '') {
  const match = text(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return Math.max(0, Math.min(1439, Number(match[1]) * 60 + Number(match[2])));
}

function normalizeCity(value = '') {
  const city = text(value).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  return CITY_ALIASES.get(city) || city;
}

function samePlace(a = {}, b = {}) {
  const ac = normalizeCity(a.city || a.fromCity || a.toCity);
  const bc = normalizeCity(b.city || b.fromCity || b.toCity);
  const as = upper(a.state || a.fromState || a.toState).slice(0, 2);
  const bs = upper(b.state || b.fromState || b.toState).slice(0, 2);
  if (!ac || !bc || !as || !bs || as !== bs) return false;
  return ac === bc || ac.includes(bc) || bc.includes(ac);
}

function eventText(event = {}) {
  return `${event.note || ''} ${event.description || ''}`.toLowerCase();
}

function isDeliveryEvent(event = {}) {
  return event.status === 'ON' && /delivery|unloading|delivered|drop\s*off|dropped/.test(eventText(event));
}

function isPreTripEvent(event = {}) {
  return event.status === 'ON' && /pre[- ]?trip|inspection/.test(eventText(event));
}

function refsFrom(value = {}) {
  return unique([
    value.shippingDocs,
    value.loadNo,
    value.bol,
    value.bolNo,
    value.orderNo,
    value.legNo,
    value.pickedUpLoadNo,
    value.deliveredLoadNo,
    ...(Array.isArray(value.transitionLoadNos) ? value.transitionLoadNos : []),
  ].map(ref).filter(Boolean));
}

function refsIntersect(a = {}, b = {}) {
  const left = new Set(refsFrom(a));
  return refsFrom(b).some(value => left.has(value));
}

function eventEntries(state = {}) {
  return Object.entries(state.eventsByDay || {}).flatMap(([day, events]) => (
    (Array.isArray(events) ? events : []).map(event => ({ day, event }))
  )).sort((a, b) => String(a.day).localeCompare(String(b.day)) || minute(a.event.startMin) - minute(b.event.startMin));
}

function routeEntries(state = {}) {
  return Object.entries(state.routeLegsByDay || {}).flatMap(([homeDay, legs]) => (
    (Array.isArray(legs) ? legs : []).map(leg => ({ homeDay, leg }))
  ));
}

function dayBefore(a = '', b = '') {
  return validDay(a) && validDay(b) && String(a) < String(b);
}

function hasActualBolDocument(state = {}, guide = {}, loadInfo = {}) {
  if (guide?.documents?.bolDocumentId || loadInfo.shippingDocumentType === 'bol') return true;
  const guideRefs = new Set(unique([guide?.loadNo, guide?.orderNo, loadInfo.loadNo].map(ref).filter(Boolean)));
  return Object.values(state.documentsByDay || {}).flatMap(rows => Array.isArray(rows) ? rows : []).some(document => {
    if (document?.type !== 'bol') return false;
    const documentRef = ref(document.loadNo || document.bolNo || '');
    return !guideRefs.size || (documentRef && guideRefs.has(documentRef));
  });
}

function markDayRecertification(state = {}, day = '', reason = '') {
  if (!day) return;
  const signature = state.signatureByDay?.[day];
  if (!signature?.signed && state.certifyStatus?.[day] !== 'Certified') return;
  state.certifyStatus = { ...(state.certifyStatus || {}), [day]:'Needs Recertification' };
  if (signature) {
    state.signatureByDay = {
      ...(state.signatureByDay || {}),
      [day]:{
        ...signature,
        needsRecertification:true,
        changedAfterSignAt:signature.changedAfterSignAt || Date.now(),
        integrityRepairReason:reason || signature.integrityRepairReason || 'Log integrity repair',
      },
    };
  }
}

function repairSmallOverlaps(state = {}, changes = []) {
  const nextMap = { ...(state.eventsByDay || {}) };
  Object.entries(nextMap).forEach(([day, rows]) => {
    const events = [...(Array.isArray(rows) ? rows : [])].sort((a, b) => minute(a.startMin) - minute(b.startMin) || minute(a.endMin) - minute(b.endMin));
    let changed = false;
    for (let index = 1; index < events.length; index += 1) {
      const previous = events[index - 1];
      const current = events[index];
      const overlap = minute(previous.endMin) - minute(current.startMin);
      if (overlap <= 0 || overlap > 2 || previous.status === current.status) continue;
      const newEnd = minute(current.startMin);
      if (newEnd <= minute(previous.startMin)) continue;
      events[index - 1] = { ...previous, endMin:newEnd, integrityTrimmedOverlapMin:overlap };
      changed = true;
      changes.push({ code:'trim_small_status_overlap', day, eventId:previous.id || '', nextEventId:current.id || '', overlapMin:overlap });
      markDayRecertification(state, day, 'Resolved overlapping duty-status transitions.');
    }
    if (changed) nextMap[day] = events;
  });
  state.eventsByDay = nextMap;
}

function repairInspectionLinks(state = {}, changes = []) {
  const next = { ...(state.inspectionByDay || {}) };
  Object.entries(next).forEach(([day, inspection]) => {
    if (!inspection?.complete) return;
    const events = Array.isArray(state.eventsByDay?.[day]) ? state.eventsByDay[day] : [];
    const source = events.find(event => event?.id === inspection.sourceEventId) || null;
    if (source && isPreTripEvent(source)) return;
    const candidates = events.filter(isPreTripEvent);
    if (!candidates.length) {
      if (inspection.sourceEventId && /auto_on_duty/i.test(text(inspection.source))) {
        const repaired = { ...inspection, source:'manual_inspection_form', updatedAt:Date.now() };
        delete repaired.sourceEventId;
        delete repaired.sourceEventChainId;
        delete repaired.sourceStartMin;
        delete repaired.sourceEndMin;
        next[day] = repaired;
        changes.push({ code:'clear_invalid_inspection_link', day, oldSourceEventId:inspection.sourceEventId });
      }
      return;
    }
    const targetMin = Number.isFinite(Number(inspection.sourceStartMin)) ? Number(inspection.sourceStartMin) : null;
    const candidate = targetMin == null
      ? candidates[0]
      : [...candidates].sort((a, b) => Math.abs(minute(a.startMin) - targetMin) - Math.abs(minute(b.startMin) - targetMin))[0];
    next[day] = {
      ...inspection,
      source:'auto_on_duty_pretrip_event',
      sourceEventId:candidate.id || '',
      sourceStartMin:minute(candidate.startMin),
      sourceEndMin:minute(candidate.endMin, minute(candidate.startMin) + 1),
      city:candidate.city || inspection.city || '',
      state:candidate.state || inspection.state || '',
      locationSource:candidate.locationSource || inspection.locationSource || 'manual',
      updatedAt:Date.now(),
    };
    changes.push({ code:'relink_inspection_pretrip', day, oldSourceEventId:inspection.sourceEventId || '', newSourceEventId:candidate.id || '' });
  });
  state.inspectionByDay = next;
}

function findEvent(state = {}, day = '', eventId = '') {
  if (!day || !eventId) return null;
  return (state.eventsByDay?.[day] || []).find(event => event?.id === eventId) || null;
}

function repairOpenLegacyRoutes(state = {}, changes = []) {
  const entries = eventEntries(state);
  const routeMap = {};
  Object.entries(state.routeLegsByDay || {}).forEach(([day, legs]) => {
    routeMap[day] = (Array.isArray(legs) ? legs : []).map(leg => ({ ...leg }));
  });

  const all = Object.entries(routeMap).flatMap(([day, legs]) => legs.map(leg => ({ day, leg })));

  for (const entry of all) {
    const leg = entry.leg;
    if (TERMINAL_ROUTE_STATUS.test(text(leg.status)) || /^rate_confirmation_guide/i.test(text(leg.source))) continue;
    const pickupDay = validDay(leg.pickupDay || leg.day || entry.day);
    const pickupMin = minute(leg.pickupMin, 0);
    const candidates = entries.filter(({ day, event }) => {
      if (pickupDay && (day < pickupDay || (day === pickupDay && minute(event.startMin) < pickupMin))) return false;
      if (!samePlace({ city:leg.toCity, state:leg.toState }, event)) return false;
      const exactRef = refsIntersect(leg, event);
      return exactRef || isDeliveryEvent(event);
    });
    const candidate = candidates[0] || null;
    if (!candidate) continue;
    const exactCandidateRef = refsIntersect(leg, candidate.event);
    const genericOnDuty = candidate.event.status === 'ON' && /^(?:on\s*duty|on duty)$/i.test(text(candidate.event.note)) && !/fuel|pre[- ]?trip|inspection|waiting|break/i.test(eventText(candidate.event));
    if (exactCandidateRef && genericOnDuty) {
      const rows = [...(state.eventsByDay?.[candidate.day] || [])];
      const eventIndex = rows.findIndex(event => event?.id === candidate.event.id);
      if (eventIndex >= 0) {
        const loadNo = text(leg.loadNo || leg.shippingDocs || candidate.event.loadNo || candidate.event.shippingDocs);
        rows[eventIndex] = {
          ...candidate.event,
          note:'Delivery / Unloading',
          description:[loadNo ? `Load ${loadNo}` : '', 'Delivery completed', [candidate.event.city, candidate.event.state].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
          deliveredLoadNo:loadNo,
          transitionLoadNos:unique([...(candidate.event.transitionLoadNos || []), loadNo]),
          integrityRepairedAt:Date.now(),
        };
        state.eventsByDay = { ...(state.eventsByDay || {}), [candidate.day]:rows };
        candidate.event = rows[eventIndex];
        markDayRecertification(state, candidate.day, 'Classified the confirmed destination event as delivery/unloading.');
        changes.push({ code:'classify_generic_destination_as_delivery', day:candidate.day, eventId:candidate.event.id || '', loadNo });
      }
    }
    Object.assign(leg, {
      deliveryDay:candidate.day,
      deliveryEventId:candidate.event.id || leg.deliveryEventId || '',
      deliveryMin:minute(candidate.event.startMin),
      status:'delivered',
      stopStatus:leg.stopSequence ? 'done' : leg.stopStatus,
      deliveredLoadNo:text(leg.loadNo || leg.shippingDocs || leg.deliveredLoadNo),
      integrityRepairedAt:Date.now(),
    });
    changes.push({ code:'close_open_route_from_delivery_evidence', routeLegId:leg.id || '', loadNo:leg.loadNo || leg.shippingDocs || '', deliveryDay:candidate.day, deliveryEventId:candidate.event.id || '' });
  }

  const groups = new Map();
  Object.entries(routeMap).forEach(([day, legs]) => {
    legs.forEach(leg => {
      const load = ref(leg.loadNo || leg.shippingDocs);
      if (!load || HIDDEN_ROUTE_STATUS.test(text(leg.status))) return;
      const key = `${load}|${normalizeCity(leg.toCity)}|${upper(leg.toState).slice(0, 2)}|${leg.deliveryEventId || ''}`;
      const list = groups.get(key) || [];
      list.push({ day, leg });
      groups.set(key, list);
    });
  });
  groups.forEach(list => {
    if (list.length < 2) return;
    const ranked = [...list].sort((a, b) => {
      const score = item => (item.leg.loadGroupId ? 8 : 0) + (item.leg.deliveryEventId ? 4 : 0) + (item.leg.pickupEventId ? 2 : 0) + (item.leg.stopSequence ? 2 : 0) + (item.leg.status === 'delivered' ? 3 : 0);
      return score(b) - score(a) || Number(b.leg.updatedAt || 0) - Number(a.leg.updatedAt || 0);
    });
    const keep = ranked[0].leg;
    ranked.slice(1).forEach(({ leg }) => {
      if (leg.id === keep.id || HIDDEN_ROUTE_STATUS.test(text(leg.status))) return;
      leg.status = 'superseded';
      leg.supersededBy = keep.id || '';
      leg.integrityRepairedAt = Date.now();
      changes.push({ code:'supersede_duplicate_route', routeLegId:leg.id || '', supersededBy:keep.id || '' });
    });
  });

  Object.values(routeMap).flat().forEach(leg => {
    if (TERMINAL_ROUTE_STATUS.test(text(leg.status))) return;
    if (!samePlace({ city:leg.fromCity, state:leg.fromState }, { city:leg.toCity, state:leg.toState })) return;
    const load = ref(leg.loadNo || leg.shippingDocs);
    const completed = Object.values(routeMap).flat().find(other => other.id !== leg.id
      && ref(other.loadNo || other.shippingDocs) === load
      && other.status === 'delivered'
      && samePlace({ city:other.toCity, state:other.toState }, { city:leg.toCity, state:leg.toState }));
    if (!completed) return;
    leg.status = 'superseded';
    leg.supersededBy = completed.id || '';
    leg.integrityRepairedAt = Date.now();
    changes.push({ code:'supersede_zero_distance_route', routeLegId:leg.id || '', supersededBy:completed.id || '' });
  });

  state.routeLegsByDay = Object.fromEntries(Object.entries(routeMap).filter(([, legs]) => legs.length));
}

function buildGuideLegs(state = {}, guide = {}) {
  const stops = Array.isArray(guide.stops) ? guide.stops : [];
  const pickup = stops.find(stop => stop?.type === 'pickup') || stops[0] || null;
  const deliveries = stops.filter(stop => stop?.type === 'delivery');
  if (!pickup || !deliveries.length) return [];
  const existing = routeEntries(state).map(entry => entry.leg).filter(leg => leg?.loadGroupId === guide.id || (/^rate_confirmation_guide/i.test(text(leg?.source)) && ref(leg?.loadNo) === ref(guide.loadNo)));
  const existingBySequence = new Map(existing.map(leg => [Number(leg.stopSequence || 0), leg]));
  const sourceDay = validDay(state.loadInfo?.sourceEventDay || guide.pickupDate || pickup.date);
  const sourceEventId = text(state.loadInfo?.guideId) === text(guide.id) ? text(state.loadInfo?.sourceEventId) : '';
  let previous = pickup;
  return deliveries.map((stop, index) => {
    const sequence = index + 1;
    const old = existingBySequence.get(sequence) || {};
    const pickupDay = validDay(previous?.date || pickup.date || guide.pickupDate) || validDay(guide.pickupDate);
    const deliveryDay = validDay(stop.date || guide.deliveryDate);
    const pickupEventId = sequence === 1 ? (sourceEventId || old.pickupEventId || '') : (old.pickupEventId || '');
    const pickupEvent = pickupEventId ? findEvent(state, sourceDay || pickupDay, pickupEventId) : null;
    const status = TERMINAL_ROUTE_STATUS.test(text(old.status))
      ? old.status
      : (sequence === 1 && pickupEventId ? 'open' : 'planned');
    const leg = {
      ...old,
      id:`${guide.id}_leg_${sequence}`,
      loadGroupId:guide.id,
      day:pickupDay,
      pickupDay,
      deliveryDay,
      pickupEventId,
      deliveryEventId:old.deliveryEventId || '',
      pickupMin:sequence === 1 && pickupEvent ? minute(pickupEvent.startMin) : minuteFromTime(previous?.time),
      deliveryMin:minuteFromTime(stop.time),
      fromCity:previous?.city || pickup.city || '',
      fromState:previous?.state || pickup.state || '',
      toCity:stop.city || '',
      toState:stop.state || '',
      shippingDocs:text(guide.loadNo || guide.orderNo),
      loadNo:text(guide.loadNo || guide.orderNo),
      orderNo:text(guide.orderNo || guide.loadNo),
      legNo:text(guide.legNo),
      broker:text(guide.broker),
      rate:Number(guide.rate || 0) || 0,
      equipment:text(guide.equipment),
      pickupNumber:text(guide.pickupNumber),
      appointment:text(stop.appointment || [stop.date, stop.time].filter(Boolean).join(' ')),
      stopSequence:sequence,
      stopCount:deliveries.length,
      stopCompany:text(stop.company),
      stopAddress:text(stop.address || stop.cityState),
      po:text(stop.poNumber),
      pieces:Number(stop.pieces || 0) || 0,
      weight:Number(stop.weight || 0) || 0,
      commodity:text(stop.commodity || guide.commodity),
      kind:'loaded',
      status,
      source:'rate_confirmation_guide_v107',
      pickedUpLoadNo:text(guide.loadNo || guide.orderNo),
      transitionLoadNos:unique([guide.loadNo || guide.orderNo]),
      updatedAt:Date.now(),
    };
    previous = stop;
    return leg;
  });
}

function repairGuideRoutes(state = {}, changes = []) {
  const guides = Object.values(state.loadGuidesById || {}).filter(guide => guide && !TERMINAL_ROUTE_STATUS.test(text(guide.status)));
  if (!guides.length) return;
  const routeMap = {};
  Object.entries(state.routeLegsByDay || {}).forEach(([day, legs]) => {
    routeMap[day] = (Array.isArray(legs) ? legs : []).map(leg => ({ ...leg }));
  });

  guides.forEach(guide => {
    const built = buildGuideLegs({ ...state, routeLegsByDay:routeMap }, guide);
    if (!built.length) return;
    const guideLoad = ref(guide.loadNo || guide.orderNo);
    const firstPickupEventId = built[0]?.pickupEventId || '';
    const removed = [];
    Object.entries(routeMap).forEach(([day, legs]) => {
      routeMap[day] = legs.filter(leg => {
        const sameGeneratedGuide = leg?.loadGroupId === guide.id || (/^rate_confirmation_guide/i.test(text(leg?.source)) && ref(leg?.loadNo) === guideLoad);
        const duplicatePickup = firstPickupEventId && leg?.pickupEventId === firstPickupEventId && (ref(leg?.loadNo || leg?.shippingDocs) === guideLoad || /^pickup_event$/i.test(text(leg?.source)));
        if (sameGeneratedGuide || duplicatePickup) {
          removed.push(leg.id || '');
          return false;
        }
        return true;
      });
      if (!routeMap[day].length) delete routeMap[day];
    });
    built.forEach(leg => {
      routeMap[leg.pickupDay] = [...(routeMap[leg.pickupDay] || []), leg];
    });
    changes.push({ code:'rebuild_rate_confirmation_route_days', guideId:guide.id || '', removedRouteIds:removed, routeIds:built.map(leg => leg.id) });

    const nextSteps = (guide.steps || []).map(step => step?.id === 'pretrip'
      ? { ...step, detail:'Before leaving for pickup', city:'', state:'', location:'' }
      : step);
    state.loadGuidesById = {
      ...(state.loadGuidesById || {}),
      [guide.id]:{ ...guide, steps:nextSteps, updatedAt:Date.now(), integrityRepairedAt:Date.now() },
    };
  });
  state.routeLegsByDay = routeMap;
}

function repairActiveLoadFromGuide(state = {}, changes = []) {
  const guideId = text(state.activeLoadGuideId || state.loadInfo?.guideId);
  const guide = guideId ? state.loadGuidesById?.[guideId] : null;
  if (!guide || TERMINAL_ROUTE_STATUS.test(text(guide.status))) return;
  const stops = Array.isArray(guide.stops) ? guide.stops : [];
  const pickup = stops.find(stop => stop?.type === 'pickup') || stops[0] || null;
  const deliveries = stops.filter(stop => stop?.type === 'delivery');
  const completed = new Set((guide.completedStopIds || []).map(String));
  const guideLegs = routeEntries(state).map(entry => entry.leg)
    .filter(leg => leg?.loadGroupId === guide.id && !HIDDEN_ROUTE_STATUS.test(text(leg.status)));
  const nextDelivery = deliveries.find((stop, index) => {
    if (completed.has(String(index + 1))) return false;
    const leg = guideLegs.find(item => Number(item.stopSequence || 0) === index + 1);
    return !leg || !/^(?:delivered|completed|closed)$/i.test(text(leg.status));
  }) || deliveries.at(-1) || null;
  const old = state.loadInfo || {};
  const actualBol = hasActualBolDocument(state, guide, old);
  const loadNo = text(guide.loadNo || guide.orderNo || old.loadNo);
  const sourceDay = validDay(old.sourceEventDay || guide.pickupDate || pickup?.date);
  const sourceEventId = text(old.sourceEventId);
  const sourceEvent = sourceDay && sourceEventId ? findEvent(state, sourceDay, sourceEventId) : null;
  state.loadInfo = {
    ...old,
    guideId:guide.id,
    loadNo,
    shippingDocs:loadNo,
    orderNo:text(guide.orderNo || loadNo),
    legNo:text(guide.legNo),
    broker:text(guide.broker || old.broker),
    carrierName:text(guide.carrierName || old.carrierName),
    mcNumber:text(guide.mcNumber || old.mcNumber),
    rate:Number(guide.rate || old.rate || 0) || 0,
    gross:Number(guide.rate || old.gross || 0) || 0,
    equipment:text(guide.equipment || old.equipment),
    pickupNumber:text(guide.pickupNumber || old.pickupNumber),
    pickupCity:text(pickup?.city || old.pickupCity),
    pickupState:upper(pickup?.state || old.pickupState).slice(0, 2),
    deliveryCity:text(deliveries.at(-1)?.city || old.deliveryCity),
    deliveryState:upper(deliveries.at(-1)?.state || old.deliveryState).slice(0, 2),
    pickupDate:validDay(guide.pickupDate || pickup?.date),
    deliveryDate:validDay(guide.deliveryDate || deliveries.at(-1)?.date),
    nextStop:[nextDelivery?.city, nextDelivery?.state].filter(Boolean).join(', '),
    appointment:text(nextDelivery?.appointment || [nextDelivery?.date, nextDelivery?.time].filter(Boolean).join(' ')),
    bol:actualBol ? text(old.bol) : (ref(old.bol) === ref(loadNo) ? '' : text(old.bol)),
    po:ref(old.po) === ref(loadNo) ? '' : text(old.po),
    currentMoveKind:'loaded',
    source:'rate_confirmation_guide_v107',
    updatedAt:Date.now(),
  };

  if (sourceEvent && sourceEvent.status === 'ON') {
    const events = [...(state.eventsByDay?.[sourceDay] || [])];
    const index = events.findIndex(event => event?.id === sourceEventId);
    if (index >= 0) {
      const destination = [nextDelivery?.city || deliveries.at(-1)?.city, nextDelivery?.state || deliveries.at(-1)?.state].filter(Boolean).join(', ');
      const staleDescription = /\bBOL\s+[A-Z0-9-]+/i.test(text(sourceEvent.description)) && !new RegExp(`\\b${loadNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text(sourceEvent.description));
      const genericOn = /^on\s*duty$/i.test(text(sourceEvent.note)) || !text(sourceEvent.note);
      const repairedEvent = {
        ...sourceEvent,
        shippingDocs:loadNo,
        loadNo,
        bol:actualBol ? sourceEvent.bol || '' : (ref(sourceEvent.bol) === ref(loadNo) ? '' : sourceEvent.bol || ''),
        po:ref(sourceEvent.po) === ref(loadNo) ? '' : sourceEvent.po || '',
        pickedUpLoadNo:loadNo,
        transitionLoadNos:[loadNo],
        transitionSummary:`Picked up ${loadNo}`,
        displayShippingDocs:`Load ${loadNo}`,
        destination:destination || sourceEvent.destination || '',
        destinationState:upper(nextDelivery?.state || sourceEvent.destinationState).slice(0, 2),
        note:genericOn ? 'Pickup / Loading' : sourceEvent.note,
        description:staleDescription || !text(sourceEvent.description)
          ? [`Load ${loadNo}`, 'Pickup / Loading', destination ? `To ${destination}` : ''].filter(Boolean).join(' · ')
          : sourceEvent.description,
        loadDetailsExplicit:true,
        integrityRepairedAt:Date.now(),
      };
      if (JSON.stringify(repairedEvent) !== JSON.stringify(sourceEvent)) {
        events[index] = repairedEvent;
        state.eventsByDay = { ...(state.eventsByDay || {}), [sourceDay]:events };
        changes.push({ code:'repair_active_pickup_reference', day:sourceDay, eventId:sourceEventId, loadNo });
      }
    }
  }
  changes.push({ code:'align_active_load_with_driver_guide', guideId:guide.id || '', loadNo, nextStop:state.loadInfo.nextStop || '' });
}

function repairCertificationState(state = {}, nowDay = '', changes = []) {
  const next = { ...(state.certifyStatus || {}) };
  Object.entries(state.signatureByDay || {}).forEach(([day, signature]) => {
    if (signature?.needsRecertification || signature?.changedAfterSignAt) {
      if (next[day] === 'Certified') {
        next[day] = 'Needs Recertification';
        changes.push({ code:'normalize_needs_recertification', day });
      }
    }
  });
  Object.entries(state.eventsByDay || {}).forEach(([day, events]) => {
    if (!validDay(nowDay) || !dayBefore(day, nowDay) || !(events || []).length) return;
    if (/active day/i.test(text(next[day]))) {
      next[day] = state.signatureByDay?.[day]?.signed ? 'Needs Recertification' : 'Needs signature';
      changes.push({ code:'close_completed_active_day', day, status:next[day] });
    }
  });
  state.certifyStatus = next;
}

export function repairRoadReadyStateV107(input = {}, options = {}) {
  if (!input || typeof input !== 'object') return input;
  const state = {
    ...input,
    eventsByDay:Object.fromEntries(Object.entries(input.eventsByDay || {}).map(([day, rows]) => [day, (Array.isArray(rows) ? rows : []).map(row => ({ ...row }))])),
    routeLegsByDay:Object.fromEntries(Object.entries(input.routeLegsByDay || {}).map(([day, rows]) => [day, (Array.isArray(rows) ? rows : []).map(row => ({ ...row }))])),
    inspectionByDay:Object.fromEntries(Object.entries(input.inspectionByDay || {}).map(([day, row]) => [day, row && typeof row === 'object' ? { ...row } : row])),
    signatureByDay:Object.fromEntries(Object.entries(input.signatureByDay || {}).map(([day, row]) => [day, row && typeof row === 'object' ? { ...row } : row])),
    certifyStatus:{ ...(input.certifyStatus || {}) },
    loadInfo:{ ...(input.loadInfo || {}) },
    loadGuidesById:Object.fromEntries(Object.entries(input.loadGuidesById || {}).map(([id, guide]) => [id, guide && typeof guide === 'object' ? {
      ...guide,
      stops:Array.isArray(guide.stops) ? guide.stops.map(stop => ({ ...stop })) : [],
      steps:Array.isArray(guide.steps) ? guide.steps.map(step => ({ ...step, checklist:Array.isArray(step.checklist) ? step.checklist.map(item => ({ ...item })) : step.checklist })) : [],
      manualDone:{ ...(guide.manualDone || {}) },
      completedStopIds:[...(guide.completedStopIds || [])],
      documents:{ ...(guide.documents || {}) },
    } : guide])),
  };
  const changes = [];
  const nowDay = validDay(options.nowDay || options.today || '');

  repairSmallOverlaps(state, changes);
  repairInspectionLinks(state, changes);
  repairOpenLegacyRoutes(state, changes);
  repairGuideRoutes(state, changes);
  repairActiveLoadFromGuide(state, changes);
  repairCertificationState(state, nowDay, changes);
  if (options.repairNavigation === true && nowDay && state.view === 'backup') {
    state.view = 'logbook';
    state.activeDay = nowDay;
    state.sheet = null;
    changes.push({ code:'return_export_snapshot_to_current_logbook', day:nowDay });
  }

  if (!changes.length) return input;
  state._integrityRepairV107 = {
    version:'100.7.0',
    repairedAt:new Date().toISOString(),
    source:text(options.source || 'state_normalization'),
    changeCount:changes.length,
    changes,
  };
  return state;
}

export function repairBusinessStoreV107(input = {}, state = {}) {
  const store = {
    ...input,
    loads:(Array.isArray(input.loads) ? input.loads : []).map(record => ({ ...record })),
    settlements:(Array.isArray(input.settlements) ? input.settlements : []).map(record => ({ ...record })),
    fuel:(Array.isArray(input.fuel) ? input.fuel : []).map(record => ({ ...record })),
    maintenance:(Array.isArray(input.maintenance) ? input.maintenance : []).map(record => ({ ...record })),
    expenses:(Array.isArray(input.expenses) ? input.expenses : []).map(record => ({ ...record })),
    documents:(Array.isArray(input.documents) ? input.documents : []).map(record => ({ ...record })),
  };
  const guideId = text(state.activeLoadGuideId || state.loadInfo?.guideId);
  const guide = guideId ? state.loadGuidesById?.[guideId] : null;
  const guideRefs = new Set(unique([guide?.loadNo, guide?.orderNo, guide?.legNo].map(ref).filter(Boolean)));
  if (guideRefs.size) {
    store.loads = store.loads.map(record => {
      const refs = unique([record.loadNo, record.orderNo, record.legNo].map(ref).filter(Boolean));
      if (!refs.some(value => guideRefs.has(value))) return record;
      const terminal = TERMINAL_ROUTE_STATUS.test(text(guide?.status));
      return {
        ...record,
        loadNo:text(guide.loadNo || guide.orderNo || record.loadNo),
        orderNo:text(guide.orderNo || guide.loadNo || record.orderNo),
        legNo:text(guide.legNo || record.legNo),
        status:terminal ? (text(guide?.status) || 'completed') : 'in_progress',
        updatedAt:Date.now(),
        integrityRepairedAt:Date.now(),
      };
    });
  }
  store.documents = store.documents.map(record => {
    const confidence = Number(record.confidence || 0);
    const scannedShippingDoc = /^(?:bol|pod)$/i.test(text(record.type)) && /smart_scan/i.test(text(record.source));
    const unverified = record.driverVerified !== true && confidence > 0 && confidence < .78;
    if (!scannedShippingDoc || !unverified) return record;
    return {
      ...record,
      status:'needs_review',
      loadNo:record.linkDay ? record.loadNo || '' : '',
      autoLinkBlocked:true,
      integrityRepairedAt:Date.now(),
    };
  });
  store.updatedAt = Date.now();
  return store;
}

export function primaryRouteReferencesV107(value = {}) {
  return unique([
    value.shippingDocs,
    value.loadNo,
    value.orderNo,
    value.legNo,
    value.pickupNumber,
    value.pickedUpLoadNo,
    value.deliveredLoadNo,
    ...(Array.isArray(value.transitionLoadNos) ? value.transitionLoadNos : []),
  ].map(ref).filter(Boolean));
}
