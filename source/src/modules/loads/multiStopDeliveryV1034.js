const HIDDEN_ROUTE_STATUS_V1034 = /^(?:cancelled|canceled|superseded|archived|dismissed)$/i;
const COMPLETE_ROUTE_STATUS_V1034 = /^(?:delivered|completed|closed)$/i;
const CITY_ALIASES_V1034 = new Map([
  ['saint cloud', 'st cloud'],
  ['st cloud', 'st cloud'],
]);

function textV1034(value = '') {
  return value === 0 ? '0' : String(value || '').trim();
}

function upperV1034(value = '') {
  return textV1034(value).toUpperCase();
}

function refV1034(value = '') {
  return upperV1034(value).replace(/[^A-Z0-9-]/g, '');
}

function normalizeCityV1034(value = '') {
  const city = textV1034(value).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  return CITY_ALIASES_V1034.get(city) || city;
}

function stateCodeV1034(value = '') {
  return upperV1034(value).slice(0, 2);
}

function samePlaceV1034(a = {}, b = {}) {
  const ac = normalizeCityV1034(a.city || a.deliveryCity || a.toCity);
  const bc = normalizeCityV1034(b.city || b.deliveryCity || b.toCity);
  const as = stateCodeV1034(a.state || a.deliveryState || a.toState);
  const bs = stateCodeV1034(b.state || b.deliveryState || b.toState);
  return Boolean(ac && bc && as && bs && as === bs && (ac === bc || ac.includes(bc) || bc.includes(ac)));
}

function placeTextV1034(value = {}) {
  return [textV1034(value.city || value.deliveryCity || value.toCity), stateCodeV1034(value.state || value.deliveryState || value.toState)].filter(Boolean).join(', ');
}

function validDayV1034(value = '') {
  const raw = textV1034(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[3]}-${String(match[1]).padStart(2, '0')}-${String(match[2]).padStart(2, '0')}` : '';
}

function minuteFromTimeV1034(value = '') {
  const match = textV1034(value).match(/^(\d{1,2}):(\d{2})/);
  return match ? Math.max(0, Math.min(1439, Number(match[1]) * 60 + Number(match[2]))) : 0;
}

function isDeliveryReasonV1034(value = '') {
  return /delivery|unloading/i.test(textV1034(value));
}

function isPickupReasonV1034(value = '') {
  return /pickup|loading/i.test(textV1034(value));
}

function guideRefsV1034(guide = {}) {
  return new Set([guide.loadNo, guide.orderNo, guide.legNo].map(refV1034).filter(Boolean));
}

function eventRefsV1034(event = {}) {
  return [event.shippingDocs, event.loadNo, event.orderNo, event.legNo, event.bol, event.po, event.pickedUpLoadNo, event.deliveredLoadNo]
    .map(refV1034)
    .filter(Boolean);
}

function eventBelongsToGuideV1034(event = {}, guide = {}) {
  const refs = guideRefsV1034(guide);
  if (eventRefsV1034(event).some(value => refs.has(value))) return true;
  const body = `${event.note || ''} ${event.description || ''}`;
  return [...refs].some(value => value && new RegExp(`\\b${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(body));
}

export function activeLoadGuideV1034(state = {}) {
  const guides = state.loadGuidesById || {};
  const preferredId = textV1034(state.activeLoadGuideId || state.loadInfo?.guideId);
  if (preferredId && guides[preferredId]) return guides[preferredId];
  const currentLoad = refV1034(state.loadInfo?.loadNo || state.loadInfo?.orderNo);
  return Object.values(guides).find(guide => {
    if (!guide || /^(?:delivered|completed|closed|cancelled|canceled|archived)$/i.test(textV1034(guide.status))) return false;
    return !currentLoad || [guide.loadNo, guide.orderNo].map(refV1034).includes(currentLoad);
  }) || null;
}

export function deliveryStopsV1034(guide = {}) {
  return (Array.isArray(guide.stops) ? guide.stops : [])
    .filter(stop => stop?.type === 'delivery')
    .map((stop, index) => ({ ...stop, deliverySequence:index + 1 }));
}

function routeLegsForGuideV1034(state = {}, guide = {}) {
  return Object.values(state.routeLegsByDay || {}).flatMap(rows => Array.isArray(rows) ? rows : [])
    .filter(leg => leg?.loadGroupId === guide.id && !HIDDEN_ROUTE_STATUS_V1034.test(textV1034(leg.status)));
}

export function resolveDeliveryContextV1034(state = {}, input = {}) {
  const guide = input.guide || activeLoadGuideV1034(state);
  if (!guide) return null;
  const stops = deliveryStopsV1034(guide);
  if (!stops.length) return null;
  const explicitSequence = Number(input.deliveryStopSequence || input.stopSequence || input.event?.deliveryStopSequence || 0);
  const currentPlace = {
    city:input.city || input.event?.city || state.currentLocation?.city,
    state:input.state || input.event?.state || state.currentLocation?.state,
  };
  const explicitDestination = input.destination ? (() => {
    const parts = textV1034(input.destination).split(',');
    return { city:parts.slice(0, -1).join(',').trim() || parts[0]?.trim(), state:parts.length > 1 ? parts.at(-1).trim() : input.destinationState || '' };
  })() : null;
  let currentStop = explicitSequence ? stops.find(stop => stop.deliverySequence === explicitSequence) : null;
  if (!currentStop && currentPlace.city && currentPlace.state) currentStop = stops.find(stop => samePlaceV1034(currentPlace, stop)) || null;
  if (!currentStop && explicitDestination?.city) currentStop = stops.find(stop => samePlaceV1034(explicitDestination, stop)) || null;

  const completed = new Set((guide.completedStopIds || []).map(String));
  const guideLegs = routeLegsForGuideV1034(state, guide);
  if (!currentStop) {
    currentStop = stops.find(stop => {
      if (completed.has(String(stop.deliverySequence))) return false;
      const leg = guideLegs.find(item => Number(item.stopSequence || 0) === stop.deliverySequence);
      return !leg || !COMPLETE_ROUTE_STATUS_V1034.test(textV1034(leg.status));
    }) || stops.at(-1);
  }
  const index = Math.max(0, stops.findIndex(stop => stop.deliverySequence === currentStop.deliverySequence));
  const nextStop = stops[index + 1] || null;
  const loadNo = textV1034(guide.loadNo || guide.orderNo || state.loadInfo?.loadNo);
  const orderNo = textV1034(guide.orderNo || loadNo);
  const legNo = textV1034(guide.legNo || state.loadInfo?.legNo);
  return {
    guide,
    stops,
    currentStop,
    nextStop,
    loadNo,
    orderNo,
    legNo,
    po:textV1034(currentStop.poNumber),
    currentStopText:placeTextV1034(currentStop),
    nextStopText:nextStop ? placeTextV1034(nextStop) : '',
    currentSequence:currentStop.deliverySequence,
    nextSequence:nextStop?.deliverySequence || null,
    stopCount:stops.length,
  };
}

export function deliveryDescriptionV1034(context = {}) {
  if (!context?.currentStop) return '';
  return [
    context.loadNo ? `Load ${context.loadNo}` : '',
    context.legNo ? `Leg ${context.legNo}` : '',
    context.po ? `PO ${context.po}` : '',
    context.currentStopText ? `Unloading at ${context.currentStopText}` : '',
    context.nextStopText ? `Next ${context.nextStopText}` : '',
  ].filter(Boolean).join(' · ');
}

export function applyDeliveryContextToPayloadV1034(state = {}, payload = {}) {
  if (!isDeliveryReasonV1034(payload.reason || payload.note)) return payload;
  const context = resolveDeliveryContextV1034(state, payload);
  if (!context) return payload;
  return {
    ...payload,
    shippingDocs:context.loadNo || payload.shippingDocs || payload.loadNo || '',
    loadNo:context.loadNo || payload.loadNo || payload.shippingDocs || '',
    orderNo:context.orderNo,
    legNo:context.legNo,
    po:context.po,
    stopPo:context.po,
    destination:context.currentStopText,
    destinationState:stateCodeV1034(context.currentStop.state),
    deliveryCity:textV1034(context.currentStop.city),
    deliveryState:stateCodeV1034(context.currentStop.state),
    deliveryCompany:textV1034(context.currentStop.company),
    deliveryAddress:textV1034(context.currentStop.address || context.currentStop.cityState),
    deliveryStopId:textV1034(context.currentStop.id || `delivery_${context.currentSequence}`),
    deliveryStopSequence:context.currentSequence,
    deliveryStopCount:context.stopCount,
    nextStop:context.nextStopText,
    nextStopSequence:context.nextSequence,
    nextDestination:context.nextStopText,
    nextDestinationState:stateCodeV1034(context.nextStop?.state),
    nextStopCompany:textV1034(context.nextStop?.company),
    nextStopAppointment:textV1034(context.nextStop?.appointment),
    deliveryDescription:deliveryDescriptionV1034(context),
    multiStopContextVersion:'103.4.0',
  };
}

function allEventEntriesV1034(state = {}) {
  return Object.entries(state.eventsByDay || {}).flatMap(([day, rows]) => (Array.isArray(rows) ? rows : []).map(event => ({ day, event })));
}

function matchingPickupEventV1034(state = {}, guide = {}, pickup = {}) {
  return allEventEntriesV1034(state).find(({ event }) => event?.status === 'ON'
    && isPickupReasonV1034(`${event.note || ''} ${event.description || ''}`)
    && samePlaceV1034(event, pickup)
    && eventBelongsToGuideV1034(event, guide)) || null;
}

function matchingDeliveryEventsV1034(state = {}, guide = {}, stops = []) {
  const matches = new Map();
  for (const entry of allEventEntriesV1034(state)) {
    const event = entry.event || {};
    if (event.status !== 'ON' || !isDeliveryReasonV1034(`${event.note || ''} ${event.description || ''}`)) continue;
    const stop = stops.find(item => samePlaceV1034(event, item));
    if (!stop) continue;
    if (!eventBelongsToGuideV1034(event, guide) && !textV1034(state.activeLoadGuideId) === textV1034(guide.id)) continue;
    const existing = matches.get(stop.deliverySequence);
    if (!existing || String(entry.day).localeCompare(existing.day) >= 0) matches.set(stop.deliverySequence, entry);
  }
  return matches;
}

function repairGuideV1034(state = {}, guide = {}, changes = []) {
  const stops = deliveryStopsV1034(guide);
  const pickup = (guide.stops || []).find(stop => stop?.type === 'pickup') || guide.stops?.[0] || null;
  if (!pickup || !stops.length) return;
  const pickupMatch = matchingPickupEventV1034(state, guide, pickup);
  const deliveryMatches = matchingDeliveryEventsV1034(state, guide, stops);
  const completed = new Set((guide.completedStopIds || []).map(String));
  const currentPlace = state.currentLocation || {};
  const currentStop = stops.find(stop => samePlaceV1034(currentPlace, stop))
    || stops.find(stop => !completed.has(String(stop.deliverySequence)))
    || stops.at(-1);
  const currentSequence = currentStop.deliverySequence;
  const nextStop = stops[currentSequence] || null;
  const loadNo = textV1034(guide.loadNo || guide.orderNo);
  const orderNo = textV1034(guide.orderNo || loadNo);
  const legNo = textV1034(guide.legNo);

  const nextEventsByDay = { ...(state.eventsByDay || {}) };
  deliveryMatches.forEach((entry, sequence) => {
    const stop = stops.find(item => item.deliverySequence === sequence);
    const following = stops[sequence] || null;
    const rows = [...(nextEventsByDay[entry.day] || [])];
    const index = rows.findIndex(event => event?.id === entry.event.id);
    if (index < 0) return;
    const old = rows[index];
    const context = { guide, currentStop:stop, nextStop:following, loadNo, orderNo, legNo, po:textV1034(stop.poNumber), currentStopText:placeTextV1034(stop), nextStopText:following ? placeTextV1034(following) : '', currentSequence:sequence, nextSequence:following?.deliverySequence || null, stopCount:stops.length };
    const repaired = {
      ...old,
      shippingDocs:loadNo,
      loadNo,
      bol:[loadNo, legNo].map(refV1034).includes(refV1034(old.bol)) ? '' : old.bol || '',
      orderNo,
      legNo,
      po:textV1034(stop.poNumber),
      stopPo:textV1034(stop.poNumber),
      destination:context.currentStopText,
      destinationState:stateCodeV1034(stop.state),
      deliveryCity:textV1034(stop.city),
      deliveryState:stateCodeV1034(stop.state),
      deliveryCompany:textV1034(stop.company),
      deliveryAddress:textV1034(stop.address || stop.cityState),
      deliveryStopId:textV1034(stop.id || `delivery_${sequence}`),
      deliveryStopSequence:sequence,
      deliveryStopCount:stops.length,
      nextStop:context.nextStopText,
      nextStopSequence:context.nextSequence,
      nextDestination:context.nextStopText,
      nextDestinationState:stateCodeV1034(following?.state),
      nextStopCompany:textV1034(following?.company),
      nextStopAppointment:textV1034(following?.appointment),
      note:textV1034(old.note).replace(/\s*[·|]\s*ON DUTY\s*$/i, ''),
      description:deliveryDescriptionV1034(context),
      loadDetailsExplicit:true,
      multiStopContextVersion:'103.4.0',
      routeDetailsUpdatedAt:Date.now(),
    };
    if (JSON.stringify(repaired) !== JSON.stringify(old)) {
      rows[index] = repaired;
      nextEventsByDay[entry.day] = rows;
      changes.push({ code:'repair_multistop_delivery_event', day:entry.day, eventId:old.id || '', stopSequence:sequence, loadNo });
    }
  });
  if (pickupMatch) {
    const rows = [...(nextEventsByDay[pickupMatch.day] || [])];
    const index = rows.findIndex(event => event?.id === pickupMatch.event.id);
    if (index >= 0) rows[index] = { ...rows[index], orderNo, legNo, po:textV1034(pickup.poNumber), nextStop:placeTextV1034(stops[0]), nextStopSequence:1, multiStopContextVersion:'103.4.0' };
    nextEventsByDay[pickupMatch.day] = rows;
  }
  state.eventsByDay = nextEventsByDay;

  const deliveryEventIds = new Set([...deliveryMatches.values()].map(entry => entry.event?.id).filter(Boolean));
  const pickupEventId = pickupMatch?.event?.id || '';
  const routeMap = {};
  Object.entries(state.routeLegsByDay || {}).forEach(([day, rows]) => {
    const kept = (Array.isArray(rows) ? rows : []).filter(leg => {
      const sameGuide = leg?.loadGroupId === guide.id || (/^rate_confirmation_guide/i.test(textV1034(leg?.source)) && refV1034(leg?.loadNo) === refV1034(loadNo));
      const duplicate = [loadNo, legNo].map(refV1034).includes(refV1034(leg?.loadNo || leg?.shippingDocs))
        && /^(?:pickup_event|delivery_event)$/i.test(textV1034(leg?.source))
        && (deliveryEventIds.has(leg?.pickupEventId) || deliveryEventIds.has(leg?.deliveryEventId) || leg?.pickupEventId === pickupEventId);
      return !sameGuide && !duplicate;
    });
    if (kept.length) routeMap[day] = kept;
  });

  let previous = pickup;
  stops.forEach(stop => {
    const sequence = stop.deliverySequence;
    const match = deliveryMatches.get(sequence) || null;
    const isComplete = completed.has(String(sequence));
    const isCurrent = sequence === currentSequence && match && !isComplete;
    const status = isComplete ? 'delivered' : (isCurrent ? 'in_progress' : 'planned');
    const homeDay = validDayV1034(previous?.date || pickup.date || guide.pickupDate) || validDayV1034(guide.pickupDate);
    const deliveryDay = validDayV1034(stop.date || guide.deliveryDate);
    const leg = {
      id:`${guide.id}_leg_${sequence}`,
      loadGroupId:guide.id,
      day:homeDay,
      pickupDay:homeDay,
      deliveryDay,
      pickupEventId:sequence === 1 ? pickupEventId : '',
      deliveryEventId:match?.event?.id || '',
      pickupMin:sequence === 1 && pickupMatch ? Number(pickupMatch.event.startMin || 0) : minuteFromTimeV1034(previous?.time),
      deliveryMin:match ? Number(match.event.startMin || 0) : minuteFromTimeV1034(stop.time),
      fromCity:textV1034(previous?.city || pickup.city),
      fromState:stateCodeV1034(previous?.state || pickup.state),
      toCity:textV1034(stop.city),
      toState:stateCodeV1034(stop.state),
      shippingDocs:loadNo,
      loadNo,
      orderNo,
      legNo,
      broker:textV1034(guide.broker),
      rate:Number(guide.rate || 0) || 0,
      equipment:textV1034(guide.equipment),
      pickupNumber:textV1034(guide.pickupNumber),
      appointment:textV1034(stop.appointment || [stop.date, stop.time].filter(Boolean).join(' ')),
      stopSequence:sequence,
      stopCount:stops.length,
      stopCompany:textV1034(stop.company),
      stopAddress:textV1034(stop.address || stop.cityState),
      po:textV1034(stop.poNumber),
      pieces:Number(stop.pieces || 0) || 0,
      weight:Number(stop.weight || 0) || 0,
      commodity:textV1034(stop.commodity || guide.commodity),
      kind:'loaded',
      status,
      stopStatus:isComplete ? 'done' : (isCurrent ? 'in_progress' : 'planned'),
      source:'rate_confirmation_guide_v1034',
      pickedUpLoadNo:loadNo,
      deliveredLoadNo:isComplete ? loadNo : '',
      transitionLoadNos:[loadNo],
      multiStopContextVersion:'103.4.0',
      updatedAt:Date.now(),
    };
    routeMap[homeDay] = [...(routeMap[homeDay] || []), leg];
    previous = stop;
  });
  state.routeLegsByDay = routeMap;

  const oldLoad = state.loadInfo || {};
  state.loadInfo = {
    ...oldLoad,
    guideId:guide.id,
    loadNo,
    shippingDocs:loadNo,
    orderNo,
    legNo,
    pickupCity:textV1034(pickup.city),
    pickupState:stateCodeV1034(pickup.state),
    deliveryCity:textV1034(stops.at(-1)?.city),
    deliveryState:stateCodeV1034(stops.at(-1)?.state),
    currentStopSequence:currentSequence,
    activeStopSequence:currentSequence,
    currentStop:placeTextV1034(currentStop),
    currentStopCity:textV1034(currentStop.city),
    currentStopState:stateCodeV1034(currentStop.state),
    currentStopCompany:textV1034(currentStop.company),
    currentStopPo:textV1034(currentStop.poNumber),
    po:textV1034(currentStop.poNumber),
    nextStopSequence:nextStop?.deliverySequence || null,
    nextStop:nextStop ? placeTextV1034(nextStop) : '',
    nextStopCity:textV1034(nextStop?.city),
    nextStopState:stateCodeV1034(nextStop?.state),
    nextStopCompany:textV1034(nextStop?.company),
    appointment:textV1034(nextStop?.appointment || currentStop.appointment),
    routeSource:'rate_confirmation_guide_v1034',
    multiStopContextVersion:'103.4.0',
    updatedAt:Date.now(),
  };
  const currentMatch = deliveryMatches.get(currentSequence);
  if (currentMatch) {
    state.loadInfo.sourceEventId = currentMatch.event.id || '';
    state.loadInfo.sourceEventDay = currentMatch.day;
    state.loadInfo.sourceEventReason = currentMatch.event.note || '';
  }
  state.loadGuidesById = {
    ...(state.loadGuidesById || {}),
    [guide.id]:{
      ...guide,
      currentStopSequence:currentSequence,
      currentStopId:textV1034(currentStop.id || `delivery_${currentSequence}`),
      nextStopSequence:nextStop?.deliverySequence || null,
      nextStopId:textV1034(nextStop?.id),
      multiStopContextVersion:'103.4.0',
      integrityRepairedAt:Date.now(),
      updatedAt:Date.now(),
    },
  };
}

export function repairMultiStopDeliveryStateV1034(inputState = {}, options = {}) {
  if (!inputState || typeof inputState !== 'object') return inputState;
  const state = {
    ...inputState,
    eventsByDay:{ ...(inputState.eventsByDay || {}) },
    routeLegsByDay:{ ...(inputState.routeLegsByDay || {}) },
    loadInfo:{ ...(inputState.loadInfo || {}) },
    loadGuidesById:{ ...(inputState.loadGuidesById || {}) },
  };
  const guide = activeLoadGuideV1034(state);
  if (!guide || deliveryStopsV1034(guide).length < 2) return inputState;
  const changes = [];
  repairGuideV1034(state, guide, changes);
  if (!changes.length && state.loadInfo?.multiStopContextVersion === '103.4.0') return state;
  state.multiStopDeliveryRepairV1034 = {
    version:'103.4.0',
    source:textV1034(options.source || 'runtime'),
    repairedAt:Date.now(),
    loadNo:textV1034(guide.loadNo || guide.orderNo),
    changes,
    dutyTimesChanged:false,
    dutyStatusesChanged:false,
    locationsChanged:false,
  };
  return state;
}
