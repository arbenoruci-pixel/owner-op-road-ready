import { localDayKey } from '../../shared/utils/date.js';
import {
  applySmartDocumentLinkV100,
  dispatchSmartDocumentLinkV100,
  SMART_DOCUMENT_LINK_EVENT,
  suggestSmartDocumentLinkV100,
} from '../scan/smartDocumentLinkV100.js';

export { SMART_DOCUMENT_LINK_EVENT, dispatchSmartDocumentLinkV100, suggestSmartDocumentLinkV100 };
export const LOAD_GUIDE_ACTION_EVENT_V103 = 'road-ready-load-guide-action-v103';

function text(value = '') {
  return String(value || '').trim();
}

function ref(value = '') {
  return text(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function number(value = 0) {
  const parsed = Number(String(value ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function unique(values = []) {
  return [...new Set(values.map(value => text(value)).filter(Boolean))];
}

function dayKey(value = '') {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (!match) return '';
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${String(match[1]).padStart(2, '0')}-${String(match[2]).padStart(2, '0')}`;
}

function minuteOfDay(value = '') {
  const match = text(value).match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = String(match[3] || '').toUpperCase();
  if (suffix === 'PM' && hour < 12) hour += 12;
  if (suffix === 'AM' && hour === 12) hour = 0;
  const total = hour * 60 + minute;
  return Number.isFinite(total) && total >= 0 && total <= 1440 ? total : null;
}

function cityState(city = '', state = '') {
  return [text(city), text(state).toUpperCase()].filter(Boolean).join(', ');
}

function parseCityState(value = '') {
  const raw = text(value);
  if (!raw) return { city:'', state:'' };
  const match = raw.match(/([A-Za-z][A-Za-z .'-]{1,50}),\s*([A-Za-z]{2})\b/);
  if (match) return { city:text(match[1]), state:match[2].toUpperCase() };
  const trailing = raw.match(/^(.+?)\s+([A-Za-z]{2})$/);
  return trailing ? { city:text(trailing[1]), state:trailing[2].toUpperCase() } : { city:raw, state:'' };
}

function normalizedStops(fields = {}) {
  const source = Array.isArray(fields.stops) ? fields.stops : [];
  if (source.length) {
    return source.map((stop, index) => {
      const place = stop.city || stop.state ? { city:text(stop.city), state:text(stop.state).toUpperCase() } : parseCityState(stop.cityState || stop.address || '');
      const type = stop.type === 'pickup' || index === 0 ? 'pickup' : 'delivery';
      return {
        ...stop,
        id:stop.id || `${type}_${index + 1}`,
        type,
        sequence:index,
        company:text(stop.company),
        street:text(stop.street),
        city:place.city,
        state:place.state,
        zip:text(stop.zip),
        cityState:cityState(place.city, place.state),
        address:text(stop.address) || [text(stop.street), cityState(place.city, place.state)].filter(Boolean).join(', '),
        date:dayKey(stop.date || stop.latestDate || ''),
        time:text(stop.time || stop.latestTime),
        appointment:text(stop.appointment) || [text(stop.date), text(stop.time)].filter(Boolean).join(' '),
        pieces:number(stop.pieces),
        weight:number(stop.weight),
        pickupNumber:text(stop.pickupNumber || fields.pickupNumber),
        poNumber:text(stop.poNumber),
        commodity:text(stop.commodity || fields.commodity),
        phone:text(stop.phone),
      };
    }).filter(stop => stop.company || stop.cityState || stop.date);
  }

  const pickup = parseCityState(fields.origin || '');
  const delivery = parseCityState(fields.destination || '');
  const fallback = [];
  if (pickup.city || pickup.state) fallback.push({
    id:'pickup_1', type:'pickup', sequence:0, company:'Pickup', city:pickup.city, state:pickup.state,
    cityState:cityState(pickup.city, pickup.state), date:dayKey(fields.pickupDate || fields.date), time:'', appointment:'',
    pickupNumber:text(fields.pickupNumber), poNumber:'', commodity:text(fields.commodity), pieces:number(fields.totalPieces), weight:number(fields.weight),
  });
  if (delivery.city || delivery.state) fallback.push({
    id:'delivery_1', type:'delivery', sequence:1, company:'Delivery', city:delivery.city, state:delivery.state,
    cityState:cityState(delivery.city, delivery.state), date:dayKey(fields.deliveryDate), time:'', appointment:'',
    pickupNumber:text(fields.pickupNumber), poNumber:'', commodity:text(fields.commodity), pieces:0, weight:0,
  });
  return fallback;
}

export function inferDriverRequirementsV103(sourceText = '', fields = {}) {
  const source = String(sourceText || '');
  const trackingProvider = text(fields.trackingProvider) || (/\bFourKites\b/i.test(source) ? 'FourKites' : (/\bMacroPoint\b/i.test(source) ? 'MacroPoint' : ''));
  const preCool = source.match(/pre[- ]?cooled?\s+to\s+(\d{1,3})\s*F/i)?.[1] || '';
  const paperworkHours = source.match(/paperwork[\s\S]{0,100}?within\s+(\d{1,3})\s+hours?/i)?.[1]
    || source.match(/within\s+(\d{1,3})\s+hours?[\s\S]{0,100}?paperwork/i)?.[1]
    || '';
  return {
    trackingProvider,
    trackingRequired:!!trackingProvider && /tracking[\s\S]{0,100}mandatory|mandatory[\s\S]{0,100}tracking/i.test(source),
    driverLicenseRequired:/valid\s+drivers?\s+license/i.test(source),
    hiVisRequired:/hi[- ]?visibility|hi[- ]?vis/i.test(source),
    trailerCleanRequired:/trailer\s+must\s+be\s+clean|washed\s+out/i.test(source),
    trailerDamageFreeRequired:/damage\s+free/i.test(source),
    preCoolTemperature:preCool ? Number(preCool) : 0,
    sealRecordRequired:/continuous\s+seal\s+record|seal\s+number\s+signed\s+in|reseal/i.test(source),
    temperaturePerBol:/temp\s+per\/?bol|temperature\s+stated\s+on\s+the\s+bills?\s+of\s+lading/i.test(source),
    detentionTimesRequired:/in\s+and\s+out\s+times[\s\S]{0,80}detention|detention[\s\S]{0,80}in\s+and\s+out\s+times/i.test(source),
    checkCallsRequired:/check\s+calls|6\s*am\s*CST[\s\S]{0,60}noon\s*CST/i.test(source),
    osdCallBeforeLeaving:/do\s+not\s+leave\s+the\s+receivers|prior\s+to\s+leaving\s+the\s+customer/i.test(source),
    paperworkDeadlineHours:paperworkHours ? Number(paperworkHours) : 0,
  };
}

function pickupChecklist(requirements = {}, fields = {}, pickup = {}) {
  const items = [];
  if (requirements.trackingRequired) items.push(`Accept ${requirements.trackingProvider || 'load'} tracking`);
  if (requirements.driverLicenseRequired) items.push('Bring valid driver license');
  if (requirements.hiVisRequired) items.push('Wear Class 2 hi-vis');
  if (requirements.trailerCleanRequired) items.push('Trailer clean and sanitary');
  if (requirements.trailerDamageFreeRequired) items.push('Trailer damage-free');
  if (requirements.preCoolTemperature) items.push(`Pre-cool trailer to ${requirements.preCoolTemperature}°F`);
  if (pickup.pickupNumber || fields.pickupNumber) items.push(`Pickup # ${pickup.pickupNumber || fields.pickupNumber}`);
  if (fields.equipment) items.push(`Equipment: ${fields.equipment}`);
  return unique(items);
}

function deliveryChecklist(requirements = {}, stop = {}) {
  const items = [];
  if (requirements.detentionTimesRequired) items.push('Record signed in/out times');
  if (requirements.sealRecordRequired) items.push('Verify and sign continuous seal record');
  if (requirements.temperaturePerBol) items.push('Follow BOL temperature');
  if (requirements.osdCallBeforeLeaving) items.push('Report OS&D before leaving');
  items.push('Collect signed POD');
  if (stop.poNumber) items.push(`PO ${stop.poNumber}`);
  return unique(items);
}

function guideStep(id, kind, title, detail = '', options = {}) {
  return {
    id,
    kind,
    title,
    detail:text(detail),
    phase:options.phase || 'load',
    day:options.day || '',
    time:options.time || '',
    city:options.city || '',
    state:options.state || '',
    location:options.location || cityState(options.city, options.state),
    status:options.status || '',
    reason:options.reason || '',
    loadNo:options.loadNo || '',
    destination:options.destination || '',
    stopSequence:Number(options.stopSequence || 0),
    checklist:Array.isArray(options.checklist) ? options.checklist : [],
    documentType:options.documentType || '',
    action:options.action || kind,
  };
}

export function buildDriverLoadGuideV103(fields = {}, options = {}) {
  const stops = normalizedStops(fields);
  const pickup = stops.find(stop => stop.type === 'pickup') || stops[0] || null;
  const deliveries = stops.filter(stop => stop.type === 'delivery');
  const loadNo = text(fields.orderNo || fields.loadNo || fields.legNo).toUpperCase();
  const guideId = `load_guide_${ref(loadNo || fields.legNo || Date.now())}`;
  const requirements = options.requirements || inferDriverRequirementsV103(options.sourceText || '', fields);
  const steps = [];
  const pickupLocation = pickup?.cityState || text(fields.origin);
  const finalDestination = deliveries.at(-1)?.cityState || text(fields.destination);

  steps.push(guideStep('review_load', 'manual', 'Review load and route', `${stops.length || 0} stops · ${fields.equipment || 'Equipment not listed'}${number(fields.total || fields.grossPay) ? ` · $${number(fields.total || fields.grossPay).toLocaleString()}` : ''}`, {
    phase:'before_pickup', loadNo, checklist:unique([fields.broker ? `Broker: ${fields.broker}` : '', fields.legNo ? `Leg # ${fields.legNo}` : '', fields.pickupNumber ? `Pickup # ${fields.pickupNumber}` : '']),
  }));

  if (requirements.trackingRequired || requirements.trackingProvider) {
    steps.push(guideStep('accept_tracking', 'manual', `Accept ${requirements.trackingProvider || 'load'} tracking`, requirements.trackingRequired ? 'Tracking is required before pickup.' : 'Confirm tracking is connected.', {
      phase:'before_pickup', loadNo,
    }));
  }

  steps.push(guideStep('pretrip', 'status', 'Complete pre-trip inspection', pickupLocation || 'Before leaving for pickup', {
    phase:'before_pickup', day:pickup?.date || dayKey(fields.pickupDate || fields.date), city:pickup?.city || '', state:pickup?.state || '', status:'ON', reason:'Pre-trip inspection', loadNo, destination:pickupLocation,
  }));

  steps.push(guideStep('route_pickup', 'route', 'Navigate to pickup', pickup?.company || pickupLocation || 'Pickup', {
    phase:'pickup', day:pickup?.date || '', time:pickup?.time || '', city:pickup?.city || '', state:pickup?.state || '', location:pickupLocation, loadNo,
  }));

  steps.push(guideStep('arrive_pickup', 'status', 'Log arrival at pickup', pickup?.appointment ? `${pickup.company || pickupLocation} · ${pickup.appointment}` : (pickup?.company || pickupLocation), {
    phase:'pickup', day:pickup?.date || '', time:pickup?.time || '', city:pickup?.city || '', state:pickup?.state || '', status:'ON', reason:'Pickup / Loading', loadNo, destination:finalDestination,
  }));

  const pickupReady = pickupChecklist(requirements, fields, pickup || {});
  if (pickupReady.length) {
    steps.push(guideStep('pickup_ready', 'manual', 'Pickup ready checklist', 'Confirm these items before loading.', {
      phase:'pickup', day:pickup?.date || '', city:pickup?.city || '', state:pickup?.state || '', loadNo, checklist:pickupReady,
    }));
  }

  steps.push(guideStep('pickup_bol', 'document', 'Capture BOL and seal', 'Scan the BOL, verify pieces/weight, and save the seal number.', {
    phase:'pickup', day:pickup?.date || '', city:pickup?.city || '', state:pickup?.state || '', loadNo, documentType:'bol', action:'scan_bol',
  }));

  steps.push(guideStep('depart_pickup', 'status', 'Depart pickup loaded', finalDestination ? `Start Driving toward ${deliveries[0]?.cityState || finalDestination}` : 'Start Driving when the truck is moving.', {
    phase:'pickup', day:pickup?.date || '', city:pickup?.city || '', state:pickup?.state || '', status:'D', reason:'Driving', loadNo, destination:deliveries[0]?.cityState || finalDestination,
  }));

  deliveries.forEach((stop, index) => {
    const sequence = index + 1;
    const phase = `delivery_${sequence}`;
    const name = stop.company || stop.cityState || `Delivery ${sequence}`;
    steps.push(guideStep(`route_delivery_${sequence}`, 'route', `Route to stop ${sequence}`, name, {
      phase, day:stop.date, time:stop.time, city:stop.city, state:stop.state, location:stop.cityState, loadNo, stopSequence:sequence,
    }));
    steps.push(guideStep(`arrive_delivery_${sequence}`, 'status', `Log arrival at stop ${sequence}`, stop.appointment ? `${name} · ${stop.appointment}` : name, {
      phase, day:stop.date, time:stop.time, city:stop.city, state:stop.state, status:'ON', reason:'Delivery / Unloading', loadNo, stopSequence:sequence, destination:stop.cityState,
    }));
    steps.push(guideStep(`delivery_docs_${sequence}`, 'manual', `Finish stop ${sequence} paperwork`, 'Complete the receiver paperwork before leaving.', {
      phase, day:stop.date, city:stop.city, state:stop.state, loadNo, stopSequence:sequence, checklist:deliveryChecklist(requirements, stop),
    }));
    steps.push(guideStep(`complete_stop_${sequence}`, 'complete_stop', `Complete stop ${sequence}`, `${name}${stop.poNumber ? ` · PO ${stop.poNumber}` : ''}`, {
      phase, day:stop.date, city:stop.city, state:stop.state, loadNo, stopSequence:sequence,
    }));
    if (index < deliveries.length - 1) {
      const nextStop = deliveries[index + 1];
      steps.push(guideStep(`depart_delivery_${sequence}`, 'status', `Depart for stop ${sequence + 1}`, nextStop?.cityState ? `Start Driving toward ${nextStop.cityState}` : 'Start Driving to the next stop.', {
        phase, day:stop.date, city:stop.city, state:stop.state, status:'D', reason:'Driving', loadNo, stopSequence:sequence, destination:nextStop?.cityState || '',
      }));
    }
  });

  if (deliveries.length) {
    const final = deliveries.at(-1);
    steps.push(guideStep('final_pod', 'document', 'Upload final POD', requirements.paperworkDeadlineHours ? `Send all paperwork within ${requirements.paperworkDeadlineHours} hours.` : 'Save the signed POD and close the load for billing.', {
      phase:'closeout', day:final?.date || '', city:final?.city || '', state:final?.state || '', loadNo, documentType:'pod', action:'scan_pod',
    }));
  }

  return {
    id:guideId,
    loadNo,
    orderNo:text(fields.orderNo || loadNo),
    legNo:text(fields.legNo),
    broker:text(fields.broker),
    carrierName:text(fields.carrierName),
    mcNumber:text(fields.mcNumber),
    rate:number(fields.total || fields.grossPay || fields.gross),
    linehaul:number(fields.linehaul),
    equipment:text(fields.equipment),
    trackingProvider:requirements.trackingProvider || text(fields.trackingProvider),
    pickupNumber:text(fields.pickupNumber),
    poNumbers:unique(Array.isArray(fields.poNumbers) ? fields.poNumbers : text(fields.poNumbersText || fields.poNumber).split(/[·,|]/)),
    commodity:text(fields.commodity),
    pieces:number(fields.totalPieces),
    weight:number(fields.weight),
    origin:pickupLocation || text(fields.origin),
    destination:finalDestination || text(fields.destination),
    pickupDate:pickup?.date || dayKey(fields.pickupDate || fields.date),
    deliveryDate:deliveries.at(-1)?.date || dayKey(fields.deliveryDate),
    stops,
    stopCount:stops.length,
    deliveryCount:deliveries.length,
    requirements,
    steps,
    status:'active',
    source:'rate_confirmation_import_v103',
    sourceDocumentId:options.documentId || '',
    createdAt:options.createdAt || Date.now(),
    updatedAt:Date.now(),
    manualDone:{},
  };
}

function plannedRouteLegs(guide = {}, eventId = '') {
  const pickup = guide.stops.find(stop => stop.type === 'pickup') || guide.stops[0] || null;
  const deliveries = guide.stops.filter(stop => stop.type === 'delivery');
  let previous = pickup;
  return deliveries.map((stop, index) => {
    const sequence = index + 1;
    const pickupDay = pickup?.date || guide.pickupDate || localDayKey();
    const from = previous || pickup || {};
    const leg = {
      id:`${guide.id}_leg_${sequence}`,
      loadGroupId:guide.id,
      day:pickupDay,
      pickupDay,
      deliveryDay:stop.date || '',
      pickupEventId:index === 0 ? eventId : '',
      deliveryEventId:'',
      pickupMin:index === 0 ? minuteOfDay(pickup?.time) : minuteOfDay(previous?.time),
      deliveryMin:minuteOfDay(stop.time),
      fromCity:from?.city || pickup?.city || '',
      fromState:from?.state || pickup?.state || '',
      toCity:stop.city || '',
      toState:stop.state || '',
      shippingDocs:guide.loadNo,
      loadNo:guide.loadNo,
      orderNo:guide.orderNo,
      legNo:guide.legNo,
      broker:guide.broker,
      rate:guide.rate,
      equipment:guide.equipment,
      pickupNumber:guide.pickupNumber,
      appointment:stop.appointment || '',
      stopSequence:sequence,
      stopCount:deliveries.length,
      stopCompany:stop.company || '',
      stopAddress:stop.address || '',
      po:stop.poNumber || '',
      pieces:stop.pieces || 0,
      weight:stop.weight || 0,
      commodity:stop.commodity || guide.commodity || '',
      kind:'loaded',
      status:'planned',
      source:'rate_confirmation_guide_v103',
      updatedAt:Date.now(),
    };
    previous = stop;
    return leg;
  });
}

function mergePlannedRouteLegs(routeLegsByDay = {}, guide = {}, eventId = '') {
  const next = {};
  Object.entries(routeLegsByDay || {}).forEach(([day, legs]) => {
    const cleaned = (Array.isArray(legs) ? legs : []).filter(leg => leg?.loadGroupId !== guide.id && !(leg?.source === 'rate_confirmation_guide_v103' && ref(leg?.loadNo) === ref(guide.loadNo)));
    if (cleaned.length) next[day] = cleaned;
  });
  for (const leg of plannedRouteLegs(guide, eventId)) {
    const day = leg.pickupDay || guide.pickupDate || localDayKey();
    next[day] = [...(next[day] || []), leg];
  }
  return next;
}

function guideReferenceValues(guide = {}) {
  return unique([guide.loadNo, guide.orderNo, guide.legNo, guide.pickupNumber, ...(guide.poNumbers || [])].map(ref));
}

function payloadReferenceValues(payload = {}) {
  const fields = payload.fields || {};
  return unique([fields.loadNo, fields.orderNo, fields.legNo, fields.bolNo, fields.poNumber, fields.pickupNumber].map(ref));
}

function matchingGuide(state = {}, payload = {}) {
  const refs = payloadReferenceValues(payload);
  if (!refs.length) return null;
  return Object.values(state.loadGuidesById || {}).find(guide => guideReferenceValues(guide).some(value => refs.includes(value))) || null;
}

function attachRateConfirmationGuide(state = {}, payload = {}) {
  const fields = payload.fields || {};
  const documentId = payload.localDocument?.local_id || payload.localDocument?.id || '';
  const previous = Object.values(state.loadGuidesById || {}).find(guide => guideReferenceValues(guide).some(value => payloadReferenceValues(payload).includes(value))) || null;
  const guide = buildDriverLoadGuideV103(fields, {
    sourceText:payload.analysis?.text || '',
    documentId,
    requirements:inferDriverRequirementsV103(payload.analysis?.text || '', fields),
    createdAt:previous?.createdAt || Date.now(),
  });
  const mergedGuide = {
    ...guide,
    manualDone:{ ...(previous?.manualDone || {}), ...(guide.manualDone || {}) },
    completedStopIds:[...(previous?.completedStopIds || [])],
    status:previous?.status === 'completed' ? 'active' : (previous?.status || 'active'),
    documents:{ ...(previous?.documents || {}), rateConfirmationDocumentId:documentId || previous?.documents?.rateConfirmationDocumentId || '' },
    updatedAt:Date.now(),
  };
  const linkDay = fields.linkDay || guide.pickupDate || state.activeDay || localDayKey();
  const eventId = fields.linkEventId || state.lastDocumentLink?.eventId || '';
  const routeLegsByDay = mergePlannedRouteLegs(state.routeLegsByDay || {}, mergedGuide, eventId);
  const loadInfo = {
    ...(state.loadInfo || {}),
    guideId:mergedGuide.id,
    loadNo:mergedGuide.loadNo || state.loadInfo?.loadNo || '',
    shippingDocs:mergedGuide.loadNo || state.loadInfo?.shippingDocs || '',
    orderNo:mergedGuide.orderNo,
    legNo:mergedGuide.legNo,
    broker:mergedGuide.broker || state.loadInfo?.broker || '',
    carrierName:mergedGuide.carrierName || state.loadInfo?.carrierName || '',
    mcNumber:mergedGuide.mcNumber || state.loadInfo?.mcNumber || '',
    rate:mergedGuide.rate || state.loadInfo?.rate || 0,
    gross:mergedGuide.rate || state.loadInfo?.gross || 0,
    equipment:mergedGuide.equipment || state.loadInfo?.equipment || '',
    pickupNumber:mergedGuide.pickupNumber || state.loadInfo?.pickupNumber || '',
    pickupCity:mergedGuide.stops.find(stop => stop.type === 'pickup')?.city || state.loadInfo?.pickupCity || '',
    pickupState:mergedGuide.stops.find(stop => stop.type === 'pickup')?.state || state.loadInfo?.pickupState || '',
    deliveryCity:mergedGuide.stops.filter(stop => stop.type === 'delivery').at(-1)?.city || state.loadInfo?.deliveryCity || '',
    deliveryState:mergedGuide.stops.filter(stop => stop.type === 'delivery').at(-1)?.state || state.loadInfo?.deliveryState || '',
    pickupDate:mergedGuide.pickupDate,
    deliveryDate:mergedGuide.deliveryDate,
    stops:mergedGuide.stops,
    routeSummary:fields.routeSummary || mergedGuide.steps.filter(step => step.kind === 'route').map(step => step.title).join(' · '),
    stopCount:mergedGuide.stopCount,
    deliveryCount:mergedGuide.deliveryCount,
    trackingProvider:mergedGuide.trackingProvider,
    driverRequirements:mergedGuide.requirements,
    pieces:mergedGuide.pieces || state.loadInfo?.pieces || 0,
    weight:mergedGuide.weight || state.loadInfo?.weight || 0,
    commodity:mergedGuide.commodity || state.loadInfo?.commodity || '',
    rateConfirmationDocumentId:documentId || state.loadInfo?.rateConfirmationDocumentId || '',
    sourceEventDay:linkDay,
    sourceEventId:eventId || state.loadInfo?.sourceEventId || '',
    source:'rate_confirmation_guide_v103',
    updatedAt:Date.now(),
  };
  return {
    ...state,
    routeLegsByDay,
    loadInfo,
    loadGuidesById:{ ...(state.loadGuidesById || {}), [mergedGuide.id]:mergedGuide },
    activeLoadGuideId:mergedGuide.id,
    lastLoadGuideUpdate:{ guideId:mergedGuide.id, source:'rate_confirmation', at:Date.now() },
  };
}

function attachGuideDocument(state = {}, payload = {}) {
  const guide = matchingGuide(state, payload);
  if (!guide) return state;
  const typeId = payload.type?.id || payload.typeId || payload.fields?.type || 'other';
  const documentId = payload.localDocument?.local_id || payload.localDocument?.id || '';
  const documents = { ...(guide.documents || {}) };
  if (typeId === 'bol') documents.bolDocumentId = documentId;
  if (typeId === 'pod') documents.podDocumentId = documentId;
  const nextGuide = { ...guide, documents, updatedAt:Date.now() };
  return {
    ...state,
    loadGuidesById:{ ...(state.loadGuidesById || {}), [guide.id]:nextGuide },
    activeLoadGuideId:guide.id,
  };
}

export function applySmartDocumentLinkV103(state = {}, payload = {}) {
  const linked = applySmartDocumentLinkV100(state, payload);
  const typeId = payload.type?.id || payload.typeId || payload.fields?.type || 'other';
  if (typeId === 'rate_confirmation') return attachRateConfirmationGuide(linked, payload);
  if (typeId === 'bol' || typeId === 'pod') return attachGuideDocument(linked, payload);
  return linked;
}

export function dispatchLoadGuideActionV103(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LOAD_GUIDE_ACTION_EVENT_V103, { detail }));
}

function markRouteStopComplete(routeLegsByDay = {}, guideId = '', stopSequence = 0, done = true) {
  const next = {};
  Object.entries(routeLegsByDay || {}).forEach(([day, legs]) => {
    next[day] = (Array.isArray(legs) ? legs : []).map(leg => {
      if (leg?.loadGroupId !== guideId || Number(leg?.stopSequence || 0) !== Number(stopSequence || 0)) return leg;
      return {
        ...leg,
        status:done ? 'delivered' : 'planned',
        guideCompleted:done,
        guideCompletedAt:done ? Date.now() : null,
        updatedAt:Date.now(),
      };
    });
  });
  return next;
}

export function applyLoadGuideActionV103(state = {}, detail = {}) {
  const guideId = detail.guideId || state.activeLoadGuideId || '';
  const guide = state.loadGuidesById?.[guideId];
  if (!guide) return state;
  const stepId = text(detail.stepId || detail.step?.id);
  const action = detail.action || 'toggle_done';
  const manualDone = { ...(guide.manualDone || {}) };
  let routeLegsByDay = state.routeLegsByDay || {};
  let completedStopIds = [...(guide.completedStopIds || [])];

  if (action === 'toggle_done' || action === 'complete_stop') {
    const done = detail.done !== false && !manualDone[stepId];
    if (done) manualDone[stepId] = Date.now(); else delete manualDone[stepId];
    if (action === 'complete_stop') {
      const stopSequence = Number(detail.step?.stopSequence || detail.stopSequence || 0);
      const stopKey = String(stopSequence || stepId);
      completedStopIds = done ? unique([...completedStopIds, stopKey]) : completedStopIds.filter(value => value !== stopKey);
      routeLegsByDay = markRouteStopComplete(routeLegsByDay, guideId, stopSequence, done);
    }
  }

  const status = action === 'complete_guide' ? 'completed' : action === 'reopen_guide' ? 'active' : guide.status;
  const nextGuide = {
    ...guide,
    manualDone,
    completedStopIds,
    status,
    lastAction:{ action, stepId, at:Date.now() },
    updatedAt:Date.now(),
  };
  return {
    ...state,
    routeLegsByDay,
    loadGuidesById:{ ...(state.loadGuidesById || {}), [guideId]:nextGuide },
    activeLoadGuideId:status === 'completed' ? state.activeLoadGuideId : guideId,
    lastLoadGuideUpdate:{ guideId, action, stepId, at:Date.now() },
  };
}

export function getActiveLoadGuideV103(state = {}) {
  const exact = state.loadGuidesById?.[state.activeLoadGuideId];
  if (exact && exact.status !== 'dismissed') return exact;
  return Object.values(state.loadGuidesById || {})
    .filter(guide => guide && guide.status !== 'dismissed')
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0] || null;
}

function samePlace(event = {}, step = {}) {
  const city = text(step.city).toLowerCase();
  const state = text(step.state).toUpperCase();
  if (!city && !state) return true;
  const eventCity = text(event.city).toLowerCase();
  const eventState = text(event.state).toUpperCase();
  const cityOk = !city || eventCity.includes(city) || city.includes(eventCity);
  const stateOk = !state || eventState === state;
  return cityOk && stateOk;
}

function eventsForStep(state = {}, step = {}) {
  const preferredDay = step.day || '';
  const days = unique([preferredDay, localDayKey(), ...Object.keys(state.eventsByDay || {})]);
  return days.flatMap(day => (state.eventsByDay?.[day] || []).map(event => ({ ...event, _day:day })));
}

function statusStepComplete(state = {}, step = {}) {
  const events = eventsForStep(state, step);
  const reason = text(step.reason).toLowerCase();
  return events.some(event => {
    if (step.status && event.status !== step.status) return false;
    const eventText = `${event.note || ''} ${event.description || ''}`.toLowerCase();
    if (/pre[- ]?trip|inspection/.test(reason) && !/pre[- ]?trip|inspection/.test(eventText)) return false;
    if (/pickup|loading/.test(reason) && !/pickup|loading/.test(eventText)) return false;
    if (/delivery|unloading/.test(reason) && !/delivery|unloading/.test(eventText)) return false;
    if (step.status !== 'D' && !samePlace(event, step)) return false;
    return true;
  });
}

function documentStepComplete(state = {}, guide = {}, step = {}) {
  const expected = step.documentType;
  if (!expected) return false;
  if (expected === 'bol' && guide.documents?.bolDocumentId) return true;
  if (expected === 'pod' && guide.documents?.podDocumentId) return true;
  const guideRefs = guideReferenceValues(guide);
  return Object.values(state.documentsByDay || {}).flatMap(list => Array.isArray(list) ? list : []).some(document => {
    if (document?.type !== expected) return false;
    const docRef = ref(document.loadNo || '');
    return !guideRefs.length || (docRef && guideRefs.includes(docRef));
  });
}

export function resolveDriverGuideV103(state = {}, guideInput = null) {
  const guide = guideInput || getActiveLoadGuideV103(state);
  if (!guide) return { guide:null, steps:[], completed:0, total:0, percent:0, currentStep:null, complete:false };
  const steps = (guide.steps || []).map(step => {
    const manual = !!guide.manualDone?.[step.id];
    const complete = manual || (step.kind === 'status' ? statusStepComplete(state, step) : step.kind === 'document' ? documentStepComplete(state, guide, step) : false);
    return { ...step, complete, completedAt:guide.manualDone?.[step.id] || null };
  });
  const completed = steps.filter(step => step.complete).length;
  const total = steps.length;
  const currentStep = steps.find(step => !step.complete) || null;
  return {
    guide,
    steps,
    completed,
    total,
    percent:total ? Math.round((completed / total) * 100) : 0,
    currentStep,
    complete:total > 0 && completed === total,
  };
}
