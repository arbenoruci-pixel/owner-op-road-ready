function text(value = '') {
  return String(value || '').trim();
}

function number(value = 0) {
  const parsed = Number(String(value ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function cityState(city = '', state = '') {
  return [text(city), text(state).toUpperCase()].filter(Boolean).join(', ');
}

function terminalStatus(value = '') {
  return /^(?:delivered|completed|closed|cancelled|canceled|superseded|archived|dismissed)$/i.test(text(value));
}

function matchingBusinessLoad(store = {}, guide = {}) {
  const refs = [guide.loadNo, guide.orderNo, guide.legNo].map(value => text(value).toUpperCase()).filter(Boolean);
  return (store.loads || []).find(record => refs.includes(text(record.loadNo || record.orderNo || record.legNo).toUpperCase())) || null;
}

export function activeGuideLoadSummaryV105(state = {}, businessStore = {}) {
  const guideId = text(state.activeLoadGuideId || state.loadInfo?.guideId);
  const guide = guideId ? state.loadGuidesById?.[guideId] : null;
  if (!guide || terminalStatus(guide.status)) return null;

  const stops = Array.isArray(guide.stops) ? guide.stops : [];
  const pickup = stops.find(stop => stop?.type === 'pickup') || stops[0] || null;
  const deliveries = stops.filter(stop => stop?.type === 'delivery');
  const completedSet = new Set((guide.completedStopIds || []).map(value => String(value)));
  const routeLegs = Object.values(state.routeLegsByDay || {})
    .flatMap(legs => Array.isArray(legs) ? legs : [])
    .filter(leg => leg?.loadGroupId === guide.id)
    .filter(leg => !/^(?:cancelled|canceled|superseded|archived)$/i.test(text(leg.status)))
    .sort((a, b) => Number(a.stopSequence || 0) - Number(b.stopSequence || 0));

  const completedFromLegs = routeLegs.filter(leg => /^(?:delivered|completed|closed)$/i.test(text(leg.status))).length;
  const completedStops = Math.max(completedSet.size, completedFromLegs);
  const nextDelivery = deliveries.find((stop, index) => {
    const sequence = String(index + 1);
    if (completedSet.has(sequence)) return false;
    const leg = routeLegs.find(item => Number(item.stopSequence || 0) === index + 1);
    return !leg || !/^(?:delivered|completed|closed)$/i.test(text(leg.status));
  }) || deliveries.at(-1) || null;

  const business = matchingBusinessLoad(businessStore, guide);
  const bolDocumentId = text(guide.documents?.bolDocumentId);
  const actualDocs = bolDocumentId ? [bolDocumentId] : [];
  const origin = guide.origin || cityState(pickup?.city, pickup?.state);
  const destination = guide.destination || cityState(deliveries.at(-1)?.city, deliveries.at(-1)?.state);
  const nextDestination = cityState(nextDelivery?.city, nextDelivery?.state) || destination;

  return {
    id:guide.id,
    guideId:guide.id,
    loadNo:text(guide.loadNo || guide.orderNo || state.loadInfo?.loadNo),
    origin,
    destination,
    nextDestination,
    docs:actualDocs,
    stopCount:deliveries.length,
    completedStops:Math.min(deliveries.length, completedStops),
    currentStop:deliveries.length ? Math.min(deliveries.length, completedStops + 1) : 0,
    gross:number(guide.rate || business?.gross || state.loadInfo?.gross || state.loadInfo?.rate),
    loadedMiles:number(business?.loadedMiles || state.loadInfo?.loadedMiles || state.loadInfo?.miles),
    deadheadMiles:number(business?.deadheadMiles || state.loadInfo?.deadheadMiles),
    appointment:text(nextDelivery?.appointment || nextDelivery?.date || state.loadInfo?.appointment),
    legs:routeLegs,
    source:'driver_load_guide_v105',
  };
}
