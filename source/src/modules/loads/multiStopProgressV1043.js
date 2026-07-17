const COMPLETE_ROUTE_STATUS_V1043 = /^(?:delivered|completed|closed|done)$/i;
const DELIVERY_ACTIVITY_V1043 = /\bdelivery\b|\bunloading\b/i;
const DRIVING_ACTIVITY_V1043 = /\bdriving\b|yard\s+move/i;
const HIDDEN_GUIDE_STATUS_V1043 = /^(?:dismissed|cancelled|canceled|archived)$/i;

const CITY_ALIASES_V1043 = new Map([
  ['saint cloud', 'st cloud'],
  ['st cloud', 'st cloud'],
  ['st  cloud', 'st cloud'],
]);

function textV1043(value = '') {
  return value === 0 ? '0' : String(value || '').trim();
}

function upperV1043(value = '') {
  return textV1043(value).toUpperCase();
}

function refV1043(value = '') {
  return upperV1043(value).replace(/[^A-Z0-9-]/g, '');
}

function stateCodeV1043(value = '') {
  return upperV1043(value).slice(0, 2);
}

function normalizeCityV1043(value = '') {
  let city = textV1043(value)
    .toLowerCase()
    .replace(/\bsaint\b/g, 'st')
    .replace(/\bst[.]?\b/g, 'st')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  city = CITY_ALIASES_V1043.get(city) || city;
  return city;
}

function placeFromTextV1043(value = '', fallbackState = '') {
  const raw = textV1043(value);
  if (!raw) return { city:'', state:stateCodeV1043(fallbackState) };
  const parts = raw.split(',');
  if (parts.length > 1) {
    const state = stateCodeV1043(parts.pop());
    return { city:textV1043(parts.join(',')), state };
  }
  const trailing = raw.match(/^(.+?)\s+([A-Za-z]{2})$/);
  return trailing
    ? { city:textV1043(trailing[1]), state:stateCodeV1043(trailing[2]) }
    : { city:raw, state:stateCodeV1043(fallbackState) };
}

function eventPlaceV1043(event = {}) {
  const direct = {
    city:event.city || event.deliveryCity || event.toCity || event.currentStopCity,
    state:event.state || event.deliveryState || event.toState || event.currentStopState,
  };
  if (textV1043(direct.city) && stateCodeV1043(direct.state)) return direct;
  return placeFromTextV1043(event.destination || event.currentStop || '', direct.state);
}

function samePlaceV1043(a = {}, b = {}) {
  const ac = normalizeCityV1043(a.city || a.deliveryCity || a.toCity || a.currentStopCity);
  const bc = normalizeCityV1043(b.city || b.deliveryCity || b.toCity || b.currentStopCity);
  const as = stateCodeV1043(a.state || a.deliveryState || a.toState || a.currentStopState);
  const bs = stateCodeV1043(b.state || b.deliveryState || b.toState || b.currentStopState);
  if (!ac || !bc) return false;
  if (as && bs && as !== bs) return false;
  return ac === bc || ac.includes(bc) || bc.includes(ac);
}

function placeTextV1043(value = {}) {
  return [textV1043(value.city || value.deliveryCity || value.toCity), stateCodeV1043(value.state || value.deliveryState || value.toState)].filter(Boolean).join(', ');
}

function activityTextV1043(event = {}) {
  const reasons = Array.isArray(event.reasons) ? event.reasons : [];
  return [...reasons, event.note, event.description, event.reason].map(textV1043).filter(Boolean).join(' · ');
}

function isDeliveryEventV1043(event = {}) {
  return upperV1043(event.status) === 'ON' && DELIVERY_ACTIVITY_V1043.test(activityTextV1043(event));
}

function isDrivingEventV1043(event = {}) {
  return upperV1043(event.status) === 'D' || DRIVING_ACTIVITY_V1043.test(activityTextV1043(event));
}

function guideRefsV1043(guide = {}) {
  return new Set([
    guide.loadNo,
    guide.orderNo,
    guide.legNo,
    guide.pickupNumber,
    ...(Array.isArray(guide.poNumbers) ? guide.poNumbers : []),
  ].map(refV1043).filter(Boolean));
}

function eventRefsV1043(event = {}) {
  return [
    event.shippingDocs,
    event.loadNo,
    event.orderNo,
    event.legNo,
    event.bol,
    event.po,
    event.stopPo,
    event.pickedUpLoadNo,
    event.deliveredLoadNo,
  ].map(refV1043).filter(Boolean);
}

function activeGuideV1043(state = {}) {
  const guides = state.loadGuidesById || {};
  const preferred = textV1043(state.activeLoadGuideId || state.loadInfo?.guideId);
  if (preferred && guides[preferred] && !HIDDEN_GUIDE_STATUS_V1043.test(textV1043(guides[preferred]?.status))) return guides[preferred];
  const activeRef = refV1043(state.loadInfo?.loadNo || state.loadInfo?.shippingDocs || state.loadInfo?.orderNo);
  return Object.values(guides).find(guide => {
    if (!guide || HIDDEN_GUIDE_STATUS_V1043.test(textV1043(guide.status))) return false;
    if (!activeRef) return true;
    return [guide.loadNo, guide.orderNo, guide.legNo].map(refV1043).includes(activeRef);
  }) || null;
}

function deliveryStopsV1043(guide = {}) {
  return (Array.isArray(guide.stops) ? guide.stops : [])
    .filter(stop => stop?.type === 'delivery')
    .map((stop, index) => ({ ...stop, deliverySequence:index + 1 }));
}

function dayTimeV1043(day = '', minute = 0) {
  const raw = textV1043(day);
  const base = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? Date.parse(`${raw}T00:00:00`) : 0;
  return (Number.isFinite(base) ? base : 0) + Math.max(0, Number(minute || 0)) * 60000;
}

function eventEntriesV1043(state = {}) {
  return Object.entries(state.eventsByDay || {}).flatMap(([day, rows]) => (
    (Array.isArray(rows) ? rows : []).filter(Boolean).map((event, index) => ({
      day,
      event,
      index,
      startTime:dayTimeV1043(day, event.startMin),
      endTime:dayTimeV1043(day, Math.max(Number(event.startMin || 0), Number(event.endMin || event.startMin || 0))),
    }))
  )).sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime || a.index - b.index);
}

function routeLegsV1043(state = {}, guide = {}) {
  const guideRef = refV1043(guide.loadNo || guide.orderNo);
  return Object.values(state.routeLegsByDay || {}).flatMap(rows => Array.isArray(rows) ? rows : []).filter(leg => (
    leg?.loadGroupId === guide.id
    || (guideRef && [leg?.loadNo, leg?.shippingDocs, leg?.orderNo].map(refV1043).includes(guideRef))
  ));
}

function eventBelongsToGuideV1043(event = {}, guide = {}, state = {}, stop = null) {
  const guideRefs = guideRefsV1043(guide);
  const refs = eventRefsV1043(event);
  if (refs.some(value => guideRefs.has(value))) return true;
  const bodyRef = refV1043(activityTextV1043(event));
  if ([...guideRefs].some(value => value && bodyRef.includes(value))) return true;
  const activeId = textV1043(state.activeLoadGuideId || state.loadInfo?.guideId);
  if (activeId && activeId === textV1043(guide.id) && stop && samePlaceV1043(eventPlaceV1043(event), stop)) return true;
  return false;
}

function stopForEventV1043(event = {}, stops = []) {
  const explicit = Number(event.deliveryStopSequence || event.stopSequence || 0);
  if (explicit) {
    const stop = stops.find(item => item.deliverySequence === explicit);
    if (stop) return stop;
  }
  const place = eventPlaceV1043(event);
  if (!textV1043(place.city)) return null;
  return stops.find(stop => samePlaceV1043(place, stop)) || null;
}

function stopForCurrentLocationV1043(state = {}, stops = []) {
  const explicit = Number(state.loadInfo?.currentStopSequence || state.loadInfo?.activeStopSequence || 0);
  const location = state.currentLocation || {};
  const byLocation = textV1043(location.city) ? stops.find(stop => samePlaceV1043(location, stop)) : null;
  if (byLocation) return byLocation;
  return explicit ? stops.find(stop => stop.deliverySequence === explicit) || null : null;
}

function laterLoadActivityV1043(entries = [], entry = null, sequence = 0, stop = null, guide = {}, state = {}, stops = []) {
  if (!entry) return false;
  return entries.some(candidate => {
    if (candidate.startTime <= entry.endTime) return false;
    const event = candidate.event || {};
    const matchedStop = stopForEventV1043(event, stops);
    const belongs = eventBelongsToGuideV1043(event, guide, state, matchedStop || stop);
    if (!belongs) return false;
    if (isDrivingEventV1043(event)) return true;
    if (isDeliveryEventV1043(event) && matchedStop && matchedStop.deliverySequence !== sequence) return true;
    if (matchedStop && stop && matchedStop.deliverySequence > sequence) return true;
    return false;
  });
}

function sortedNumbersV1043(values = []) {
  return [...new Set(values.map(Number).filter(value => Number.isFinite(value) && value > 0))].sort((a, b) => a - b);
}

export function inferMultiStopProgressV1043(state = {}, guideInput = null) {
  const guide = guideInput || activeGuideV1043(state);
  const stops = deliveryStopsV1043(guide || {});
  if (!guide || !stops.length) {
    return {
      guide:guide || null,
      stops,
      matchedBySequence:{},
      reachedSequences:[],
      completedSequences:[],
      activeSequence:0,
      currentSequence:0,
      nextSequence:0,
      highestReachedSequence:0,
      currentDeliveryEvent:null,
    };
  }

  const entries = eventEntriesV1043(state);
  const matchedBySequence = {};
  for (const entry of entries) {
    const event = entry.event || {};
    if (!isDeliveryEventV1043(event)) continue;
    const stop = stopForEventV1043(event, stops);
    if (!stop || !eventBelongsToGuideV1043(event, guide, state, stop)) continue;
    const sequence = stop.deliverySequence;
    const previous = matchedBySequence[sequence];
    if (!previous || entry.startTime >= previous.startTime) matchedBySequence[sequence] = { ...entry, stop };
  }

  const currentStop = stopForCurrentLocationV1043(state, stops);
  const latest = entries.at(-1) || null;
  const latestStop = latest && isDeliveryEventV1043(latest.event) ? stopForEventV1043(latest.event, stops) : null;
  const latestBelongs = latestStop && eventBelongsToGuideV1043(latest.event, guide, state, latestStop);
  const currentReason = `${state.currentReason || ''} ${latest?.event ? activityTextV1043(latest.event) : ''}`;
  const activeSequence = latestBelongs
    ? latestStop.deliverySequence
    : (upperV1043(state.currentStatus) === 'ON' && DELIVERY_ACTIVITY_V1043.test(currentReason) && currentStop ? currentStop.deliverySequence : 0);

  const reachedSequences = sortedNumbersV1043([
    ...Object.keys(matchedBySequence),
    activeSequence,
    currentStop?.deliverySequence || 0,
  ]);
  const highestReachedSequence = reachedSequences.at(-1) || 0;
  const completed = new Set((guide.completedStopIds || []).map(Number).filter(value => value > 0));

  for (const leg of routeLegsV1043(state, guide)) {
    const sequence = Number(leg.stopSequence || 0);
    if (sequence && (COMPLETE_ROUTE_STATUS_V1043.test(textV1043(leg.status)) || textV1043(leg.stopStatus).toLowerCase() === 'done' || leg.guideCompleted === true)) completed.add(sequence);
  }

  for (const [sequenceText, entry] of Object.entries(matchedBySequence)) {
    const sequence = Number(sequenceText);
    const laterReached = reachedSequences.some(value => value > sequence);
    const movedOn = laterLoadActivityV1043(entries, entry, sequence, entry.stop, guide, state, stops);
    const currentAhead = currentStop && currentStop.deliverySequence > sequence;
    const activeAhead = activeSequence > sequence;
    if (laterReached || movedOn || currentAhead || activeAhead) completed.add(sequence);
  }

  const completedSequences = sortedNumbersV1043([...completed]);
  let currentSequence = activeSequence && !completed.has(activeSequence) ? activeSequence : 0;
  if (!currentSequence && currentStop && !completed.has(currentStop.deliverySequence)) currentSequence = currentStop.deliverySequence;
  if (!currentSequence) {
    const reachedOpen = [...reachedSequences].reverse().find(sequence => !completed.has(sequence));
    currentSequence = reachedOpen || stops.find(stop => !completed.has(stop.deliverySequence))?.deliverySequence || stops.at(-1)?.deliverySequence || 0;
  }
  const nextSequence = stops.find(stop => stop.deliverySequence > currentSequence && !completed.has(stop.deliverySequence))?.deliverySequence || 0;
  const currentDeliveryEvent = currentSequence ? matchedBySequence[currentSequence]?.event || null : null;

  return {
    guide,
    stops,
    matchedBySequence,
    reachedSequences,
    completedSequences,
    activeSequence,
    currentSequence,
    nextSequence,
    highestReachedSequence,
    currentDeliveryEvent,
    latestEvent:latest?.event || null,
  };
}

function stepSequenceV1043(step = {}) {
  const direct = Number(step.stopSequence || 0);
  if (direct) return direct;
  const match = textV1043(step.id).match(/(?:route_delivery|arrive_delivery|delivery_docs|complete_stop|depart_delivery)_(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function autoCompleteStepV1043(step = {}, progress = {}) {
  const sequence = stepSequenceV1043(step);
  if (!sequence) return false;
  const reached = progress.reachedSequences.includes(sequence);
  const completed = progress.completedSequences.includes(sequence);
  const id = textV1043(step.id);
  if (/^route_delivery_/i.test(id) || (step.kind === 'route' && sequence)) return reached || completed;
  if (/^arrive_delivery_/i.test(id)) return Boolean(progress.matchedBySequence[sequence]) || reached || completed;
  if (/^(?:delivery_docs|complete_stop|depart_delivery)_/i.test(id)) return completed;
  return false;
}

export function enrichDriverGuideProgressV1043(state = {}, baseProgress = {}) {
  const guide = baseProgress.guide || activeGuideV1043(state);
  if (!guide) return baseProgress;
  const progress = inferMultiStopProgressV1043(state, guide);
  if (progress.stops.length < 2) return { ...baseProgress, multiStopProgressV1043:progress };
  const steps = (Array.isArray(baseProgress.steps) ? baseProgress.steps : []).map(step => {
    const autoComplete = autoCompleteStepV1043(step, progress);
    return autoComplete && !step.complete
      ? { ...step, complete:true, completionSource:'multi_stop_progress_v1043' }
      : step;
  });
  const completed = steps.filter(step => step.complete).length;
  const total = steps.length;
  return {
    ...baseProgress,
    guide,
    steps,
    completed,
    total,
    percent:total ? Math.round((completed / total) * 100) : 0,
    currentStep:steps.find(step => !step.complete) || null,
    complete:total > 0 && completed === total,
    completedStops:progress.completedSequences.length,
    completedStopIds:progress.completedSequences.map(String),
    activeStopSequence:progress.activeSequence || progress.currentSequence || 0,
    currentStopSequence:progress.currentSequence || 0,
    nextStopSequence:progress.nextSequence || 0,
    multiStopProgressV1043:progress,
  };
}

function sameArrayV1043(a = [], b = []) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function patchEventV1043(event = {}, patch = {}) {
  let changed = false;
  const next = { ...event };
  for (const [key, value] of Object.entries(patch)) {
    if (JSON.stringify(next[key]) === JSON.stringify(value)) continue;
    next[key] = value;
    changed = true;
  }
  return { event:changed ? next : event, changed };
}

export function repairMultiStopProgressStateV1043(inputState = {}, options = {}) {
  if (!inputState || typeof inputState !== 'object') return inputState;
  const guide = activeGuideV1043(inputState);
  const progress = inferMultiStopProgressV1043(inputState, guide);
  if (!guide || progress.stops.length < 2) return inputState;

  let changed = false;
  const completed = new Set(progress.completedSequences);
  const loadRef = refV1043(guide.loadNo || guide.orderNo);
  const now = Date.now();

  const routeLegsByDay = {};
  for (const [day, rows] of Object.entries(inputState.routeLegsByDay || {})) {
    routeLegsByDay[day] = (Array.isArray(rows) ? rows : []).map(leg => {
      const sameGuide = leg?.loadGroupId === guide.id || (loadRef && [leg?.loadNo, leg?.shippingDocs, leg?.orderNo].map(refV1043).includes(loadRef));
      const sequence = Number(leg?.stopSequence || 0);
      if (!sameGuide || !sequence) return leg;
      const isDone = completed.has(sequence);
      const isCurrent = !isDone && sequence === progress.currentSequence;
      const desiredStatus = isDone ? 'delivered' : (isCurrent ? 'in_progress' : 'planned');
      const desiredStopStatus = isDone ? 'done' : (isCurrent ? 'in_progress' : 'planned');
      const deliveryEventId = progress.matchedBySequence[sequence]?.event?.id || leg.deliveryEventId || '';
      const patch = {
        status:desiredStatus,
        stopStatus:desiredStopStatus,
        guideCompleted:isDone,
        guideCompletedAt:isDone ? (leg.guideCompletedAt || now) : null,
        deliveryEventId,
        deliveredLoadNo:isDone ? textV1043(guide.loadNo || guide.orderNo) : '',
        multiStopProgressVersion:'104.3.0',
      };
      const result = patchEventV1043(leg, patch);
      changed ||= result.changed;
      return result.event;
    });
  }

  const eventsByDay = {};
  for (const [day, rows] of Object.entries(inputState.eventsByDay || {})) {
    eventsByDay[day] = (Array.isArray(rows) ? rows : []).map(event => {
      const match = Object.entries(progress.matchedBySequence).find(([, entry]) => entry?.event?.id && entry.event.id === event?.id);
      if (!match) return event;
      const sequence = Number(match[0]);
      const stop = progress.stops.find(item => item.deliverySequence === sequence) || {};
      const nextStop = progress.stops.find(item => item.deliverySequence === sequence + 1) || null;
      const patch = {
        shippingDocs:textV1043(guide.loadNo || guide.orderNo),
        loadNo:textV1043(guide.loadNo || guide.orderNo),
        orderNo:textV1043(guide.orderNo || guide.loadNo),
        legNo:textV1043(guide.legNo),
        deliveryStopSequence:sequence,
        deliveryStopCount:progress.stops.length,
        deliveryStopId:textV1043(stop.id || `delivery_${sequence}`),
        deliveryCompleted:completed.has(sequence),
        nextStopSequence:nextStop?.deliverySequence || null,
        nextStop:nextStop ? placeTextV1043(nextStop) : '',
        multiStopProgressVersion:'104.3.0',
      };
      const result = patchEventV1043(event, patch);
      changed ||= result.changed;
      return result.event;
    });
  }

  const currentStop = progress.stops.find(stop => stop.deliverySequence === progress.currentSequence) || progress.stops.at(-1) || {};
  const nextStop = progress.stops.find(stop => stop.deliverySequence === progress.nextSequence) || null;
  const loadInfoResult = patchEventV1043(inputState.loadInfo || {}, {
    guideId:guide.id,
    loadNo:textV1043(guide.loadNo || guide.orderNo),
    shippingDocs:textV1043(guide.loadNo || guide.orderNo),
    orderNo:textV1043(guide.orderNo || guide.loadNo),
    legNo:textV1043(guide.legNo),
    completedStops:progress.completedSequences.length,
    currentStopSequence:progress.currentSequence,
    activeStopSequence:progress.activeSequence || progress.currentSequence,
    currentStop:placeTextV1043(currentStop),
    currentStopCity:textV1043(currentStop.city),
    currentStopState:stateCodeV1043(currentStop.state),
    currentStopCompany:textV1043(currentStop.company),
    currentStopPo:textV1043(currentStop.poNumber),
    po:textV1043(currentStop.poNumber),
    nextStopSequence:nextStop?.deliverySequence || null,
    nextStop:nextStop ? placeTextV1043(nextStop) : '',
    nextStopCity:textV1043(nextStop?.city),
    nextStopState:stateCodeV1043(nextStop?.state),
    nextStopCompany:textV1043(nextStop?.company),
    appointment:textV1043(currentStop.appointment || nextStop?.appointment),
    multiStopProgressVersion:'104.3.0',
  });
  changed ||= loadInfoResult.changed;

  const completedStopIds = progress.completedSequences.map(String);
  const guidePatch = {
    completedStopIds,
    currentStopSequence:progress.currentSequence,
    currentStopId:textV1043(currentStop.id || `delivery_${progress.currentSequence}`),
    nextStopSequence:nextStop?.deliverySequence || null,
    nextStopId:textV1043(nextStop?.id),
    multiStopProgressVersion:'104.3.0',
  };
  const guideChanged = !sameArrayV1043((guide.completedStopIds || []).map(String).sort(), completedStopIds.slice().sort())
    || Number(guide.currentStopSequence || 0) !== Number(progress.currentSequence || 0)
    || Number(guide.nextStopSequence || 0) !== Number(nextStop?.deliverySequence || 0)
    || guide.multiStopProgressVersion !== '104.3.0';
  const nextGuide = guideChanged ? { ...guide, ...guidePatch, updatedAt:now } : guide;
  changed ||= guideChanged;

  if (!changed) return inputState;
  return {
    ...inputState,
    eventsByDay,
    routeLegsByDay,
    loadInfo:loadInfoResult.event,
    loadGuidesById:{ ...(inputState.loadGuidesById || {}), [guide.id]:nextGuide },
    activeLoadGuideId:guide.id,
    multiStopProgressRepairV1043:{
      version:'104.3.0',
      source:textV1043(options.source || 'runtime'),
      repairedAt:now,
      loadNo:textV1043(guide.loadNo || guide.orderNo),
      completedStopIds,
      currentStopSequence:progress.currentSequence,
      activeStopSequence:progress.activeSequence || progress.currentSequence,
      dutyTimesChanged:false,
      dutyStatusesChanged:false,
      dutyNotesChanged:false,
      locationsChanged:false,
    },
  };
}
