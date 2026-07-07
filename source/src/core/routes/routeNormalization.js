const EMPTY_MOVE_KIND = 'empty/reposition';

function safeText(value = '') {
  return value === 0 ? '0' : String(value || '').trim();
}

function safeUpper(value = '') {
  return safeText(value).toUpperCase();
}

function keyText(value = '') {
  return safeText(value).toLowerCase();
}

function uniqueClean(values = []) {
  const seen = new Set();
  return (values || [])
    .map(safeText)
    .filter(Boolean)
    .filter(value => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function firstRealText(...values) {
  return values.map(safeText).find(Boolean) || '';
}

const NON_DOC_WORDS = new Set([
  'BOL', 'LOAD', 'LOADED', 'DELIVERED', 'PICKED', 'PICKUP', 'PICK', 'UP', 'DROPPED', 'DROP', 'HOOKED', 'HOOK',
  'EMPTY', 'REPOSITION', 'RETURN', 'RETURNED', 'MOVE', 'MOVEMENT', 'OFF', 'ON', 'DUTY', 'SLEEPER', 'BERTH',
  'FROM', 'TO', 'THE', 'AND', 'WITH', 'AT', 'IN', 'OUT', 'PRE', 'TRIP', 'INSPECTION', 'STATUS', 'EVENT',
]);

function normalizeDocToken(value = '') {
  return safeUpper(value)
    .replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, '')
    .replace(/[^A-Z0-9-]/g, '');
}

function isRealLoadToken(value = '') {
  const token = normalizeDocToken(value);
  if (!token || token.length < 4 || token.length > 32) return false;
  if (NON_DOC_WORDS.has(token)) return false;
  if (!/\d/.test(token)) return false;
  if (!/^[A-Z0-9][A-Z0-9-]*$/.test(token)) return false;
  return true;
}

function splitLoadTokens(value = '') {
  const normalized = String(value || '')
    .replace(/[→➡–—]/g, ' ')
    .replace(/[()\[\]{}:;#]/g, ' ')
    .replace(/\b(?:BOL|LOAD|SHIPPING\s*DOCS?|DOCS?|NUMBER|NO)\b/gi, ' ');
  return uniqueClean(normalized
    .split(/[\s,/|+·•]+/g)
    .map(normalizeDocToken)
    .filter(isRealLoadToken));
}

function explicitLoadTokensInText(value = '') {
  const text = String(value || '');
  const found = [];
  const patterns = [
    /\b(?:LOAD\s*NO|LOAD\s*#|SHIPPING\s*DOCS?|DOCS?|BOL|LOAD)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{3,31})\b/gi,
    /\b(?:BOL|LOAD)\s+([A-Z0-9][A-Z0-9-]{3,31})\b/gi,
  ];
  patterns.forEach(pattern => {
    let match = pattern.exec(text);
    while (match) {
      const token = normalizeDocToken(match[1] || '');
      if (isRealLoadToken(token)) found.push(token);
      match = pattern.exec(text);
    }
  });
  return uniqueClean(found);
}

function hasNoLoadChoice(value = '') {
  const text = safeText(value).toUpperCase();
  return text === 'EMPTY' || text === 'MT' || text === 'EMPTY/MT' || text === 'BOBTAIL';
}

function isEmptyMoveText(...values) {
  const text = values.map(safeText).join(' ').toLowerCase();
  return /\b(empty|mt|reposition|return|bobtail|deadhead|no\s+load|no\s+bol)\b/.test(text);
}

function isLoadedKind(leg = {}) {
  const docs = firstRealText(leg.shippingDocs, leg.loadNo, leg.bol, leg.po);
  const kind = keyText(leg.kind || leg.moveKind || leg.moveType);
  if (kind && isEmptyMoveText(kind)) return false;
  if (docs && !hasNoLoadChoice(docs)) return true;
  return kind === 'loaded' || kind === 'load';
}

function normalizeKind(leg = {}) {
  const docs = firstRealText(leg.shippingDocs, leg.loadNo, leg.bol, leg.po);
  const kind = keyText(leg.kind || leg.moveKind || leg.moveType);
  if (isEmptyMoveText(kind, leg.note, leg.description, leg.source, leg.status)) return EMPTY_MOVE_KIND;
  if (!docs && isEmptyMoveText(leg.hookedLoadNo, leg.shippingDocs, leg.loadNo)) return EMPTY_MOVE_KIND;
  if (!docs && (leg.hookedContainer || leg.hookedChassis || /hook_empty|reposition/i.test(String(leg.source || '')))) return EMPTY_MOVE_KIND;
  return docs ? 'loaded' : (kind || EMPTY_MOVE_KIND);
}

function legDayKey(leg = {}, fallbackDay = '') {
  return firstRealText(leg.day, leg.pickupDay, leg.deliveryDay, fallbackDay);
}

function canonicalLegId(leg = {}, fallbackDay = '') {
  const explicit = safeText(leg.id);
  if (explicit) return explicit;
  const day = legDayKey(leg, fallbackDay) || 'day';
  const docs = firstRealText(leg.shippingDocs, leg.loadNo, leg.bol, leg.po, leg.hookedLoadNo, 'empty');
  const from = [leg.fromCity, leg.fromState].map(keyText).join('_');
  const to = [leg.toCity, leg.toState].map(keyText).join('_');
  const min = safeText(leg.pickupMin ?? leg.deliveryMin ?? '');
  return `leg_${day}_${docs || 'move'}_${from}_${to}_${min}`.replace(/[^a-zA-Z0-9_-]+/g, '_');
}

function deDupeKey(leg = {}, fallbackDay = '') {
  const explicit = safeText(leg.id);
  if (explicit) return `id:${explicit}`;
  return [
    legDayKey(leg, fallbackDay),
    firstRealText(leg.shippingDocs, leg.loadNo, leg.bol, leg.po, leg.hookedLoadNo),
    leg.fromFacility,
    leg.fromCity,
    leg.fromState,
    leg.toFacility,
    leg.toCity,
    leg.toState,
    leg.pickupDay,
    leg.pickupMin,
    leg.deliveryDay,
    leg.deliveryMin,
    normalizeKind(leg),
  ].map(value => safeText(value).toLowerCase()).join('|');
}

function normalizeLoadFieldsForKind(leg = {}, kind = '') {
  const explicitDocs = firstRealText(leg.shippingDocs, leg.loadNo, leg.bol, leg.po, leg.hookedLoadNo);
  if (kind === EMPTY_MOVE_KIND && !hasNoLoadChoice(explicitDocs)) {
    return { shippingDocs:'', loadNo:'' };
  }
  return { shippingDocs: explicitDocs, loadNo: explicitDocs };
}

export function normalizeRouteLegRecord(leg = {}, fallbackDay = '') {
  const day = legDayKey(leg, fallbackDay);
  const kind = normalizeKind(leg);
  const loadFields = normalizeLoadFieldsForKind(leg, kind);
  const deliveredLoadNo = firstRealText(leg.deliveredLoadNo, leg.oldLoadNo, leg.previousLoadNo);
  const pickedUpLoadNo = firstRealText(leg.pickedUpLoadNo, leg.hookedLoadNo, leg.newLoadNo, kind === EMPTY_MOVE_KIND ? '' : loadFields.loadNo);
  const transitionLoadNos = uniqueClean([
    ...(Array.isArray(leg.transitionLoadNos) ? leg.transitionLoadNos : splitLoadTokens(leg.transitionLoadNos || '')),
    deliveredLoadNo,
    pickedUpLoadNo,
  ]);
  return {
    ...leg,
    id: canonicalLegId(leg, fallbackDay),
    day,
    pickupDay: safeText(leg.pickupDay || day),
    pickupEventId: safeText(leg.pickupEventId),
    pickupMin: Number.isFinite(Number(leg.pickupMin)) ? Number(leg.pickupMin) : null,
    deliveryDay: safeText(leg.deliveryDay),
    deliveryEventId: safeText(leg.deliveryEventId),
    deliveryMin: Number.isFinite(Number(leg.deliveryMin)) ? Number(leg.deliveryMin) : null,
    fromFacility: safeText(leg.fromFacility),
    fromCity: safeText(leg.fromCity),
    fromState: safeUpper(leg.fromState).slice(0, 2),
    toFacility: safeText(leg.toFacility),
    toCity: safeText(leg.toCity),
    toState: safeUpper(leg.toState).slice(0, 2),
    shippingDocs: loadFields.shippingDocs,
    loadNo: loadFields.loadNo,
    container: safeUpper(leg.container || leg.hookedContainer),
    chassis: safeUpper(leg.chassis || leg.hookedChassis),
    seal: safeUpper(leg.seal || leg.hookedSeal),
    droppedContainer: safeUpper(leg.droppedContainer),
    droppedChassis: safeUpper(leg.droppedChassis),
    deliveredLoadNo,
    pickedUpLoadNo,
    transitionLoadNos,
    kind,
    status: safeText(leg.status || (leg.deliveryEventId || leg.deliveryDay ? 'delivered' : 'open')),
    source: safeText(leg.source || 'route_leg'),
    updatedAt: Number(leg.updatedAt || 0) || Date.now(),
  };
}

export function routeLegsForDayCanonical(state = {}, day = '') {
  const all = Object.entries(state.routeLegsByDay || {}).flatMap(([legDay, legs]) => (
    (Array.isArray(legs) ? legs : []).map(leg => ({ ...leg, day: leg.day || legDay }))
  ));
  return all
    .filter(leg => {
      if (leg.day === day || leg.pickupDay === day || leg.deliveryDay === day) return true;
      return String(leg.pickupDay || leg.day || '') < String(day || '') && leg.status !== 'delivered' && leg.status !== 'cancelled';
    })
    .sort((a, b) => String(a.pickupDay || a.day).localeCompare(String(b.pickupDay || b.day)) || Number(a.pickupMin ?? 9999) - Number(b.pickupMin ?? 9999));
}

function primaryMilesDayForLeg(leg = {}, fallbackDay = '') {
  return firstRealText(
    leg.primaryDrivingDay,
    leg.milesDay,
    leg.drivingDay,
    leg.pickupDay,
    leg.day,
    fallbackDay
  );
}

export function routeLegsForDayMiles(state = {}, day = '') {
  return Object.entries(state.routeLegsByDay || {}).flatMap(([legDay, legs]) => (
    (Array.isArray(legs) ? legs : []).map(leg => ({ ...leg, day: leg.day || legDay }))
  ))
    .filter(leg => primaryMilesDayForLeg(leg) === day)
    .filter(leg => leg.status !== 'cancelled')
    .sort((a, b) => Number(a.pickupMin ?? 9999) - Number(b.pickupMin ?? 9999) || String(a.id || '').localeCompare(String(b.id || '')));
}

export function suggestedMilesForDayFromRoute(state = {}, day = '') {
  const legs = routeLegsForDayMiles(state, day);
  const miles = legs.reduce((sum, leg) => sum + Math.max(0, Number(leg.miles || leg.distanceMiles || leg.manualMiles || 0)), 0);
  return miles > 0 ? Number(miles.toFixed(2)) : 0;
}

function addRouteGroup(target, source = {}, sourceLabel = '') {
  const seen = new Map();
  Object.entries(target || {}).forEach(([day, legs]) => {
    (Array.isArray(legs) ? legs : []).forEach(leg => seen.set(deDupeKey(leg, day), true));
  });

  Object.entries(source || {}).forEach(([fallbackDay, legs]) => {
    if (!Array.isArray(legs)) return;
    for (const original of legs) {
      const normalized = normalizeRouteLegRecord({ ...original, legacySource: original.legacySource || sourceLabel }, fallbackDay);
      const key = deDupeKey(normalized, fallbackDay);
      if (seen.has(key)) continue;
      const day = normalized.day || fallbackDay;
      if (!target[day]) target[day] = [];
      target[day].push(normalized);
      seen.set(key, true);
    }
  });
}

function sortedRouteMap(routeLegsByDay = {}) {
  const out = {};
  Object.keys(routeLegsByDay || {}).sort().forEach(day => {
    const legs = (routeLegsByDay[day] || [])
      .map(leg => normalizeRouteLegRecord(leg, day))
      .sort((a, b) => Number(a.pickupMin ?? 9999) - Number(b.pickupMin ?? 9999) || String(a.id).localeCompare(String(b.id)));
    if (legs.length) out[day] = legs;
  });
  return out;
}

function buildEventById(eventsByDay = {}) {
  const events = new Map();
  Object.values(eventsByDay || {}).forEach(dayEvents => {
    (Array.isArray(dayEvents) ? dayEvents : []).forEach(event => {
      if (event?.id) events.set(event.id, event);
    });
  });
  return events;
}

function routeLegIndicatesEquipmentMove(leg = {}, event = {}) {
  const text = `${leg.source || ''} ${leg.kind || ''} ${event.note || ''} ${event.description || ''}`.toLowerCase();
  return /drop[_\s-]*hook|drop[_\s-]*off|hook[_\s-]*empty|reposition|return|empty/.test(text);
}

function eventExplicitNewLoadTokens(event = {}) {
  return explicitLoadTokensInText(`${event.note || ''} ${event.description || ''}`);
}

function docsMatch(a = '', b = '') {
  const left = normalizeDocToken(a);
  const right = normalizeDocToken(b);
  return !!left && !!right && left === right;
}

function blankLoadCarryoverFields(leg = {}, staleDocs = '') {
  const next = {
    ...leg,
    staleCarryoverLoadNo: firstRealText(leg.staleCarryoverLoadNo, staleDocs),
    shippingDocs:'',
    loadNo:'',
    bol:'',
    po:'',
    pickedUpLoadNo:'',
    kind:EMPTY_MOVE_KIND,
    currentMoveKind:EMPTY_MOVE_KIND,
    routeIntent:EMPTY_MOVE_KIND,
  };
  next.transitionLoadNos = uniqueClean([
    ...(Array.isArray(leg.transitionLoadNos) ? leg.transitionLoadNos : splitLoadTokens(leg.transitionLoadNos || '')),
    leg.deliveredLoadNo,
  ]);
  return next;
}

function normalizeLegacyIntermodalRouteIntent(routeLegsByDay = {}, eventsByDay = {}) {
  const eventsById = buildEventById(eventsByDay);
  const deliveredDocsByEvent = new Map();

  allRouteLegs(routeLegsByDay).forEach(leg => {
    const docs = firstRealText(leg.shippingDocs, leg.loadNo);
    if (leg.deliveryEventId && isLoadedKind(leg) && docs && leg.status !== 'cancelled') {
      deliveredDocsByEvent.set(leg.deliveryEventId, docs);
    }
  });

  const repaired = {};
  Object.entries(routeLegsByDay || {}).forEach(([day, legs]) => {
    const nextLegs = [];
    (Array.isArray(legs) ? legs : []).forEach(leg => {
      const pickupEvent = eventsById.get(leg.pickupEventId || '') || {};
      const deliveryEvent = eventsById.get(leg.deliveryEventId || '') || {};
      const anchorEvent = pickupEvent.id ? pickupEvent : deliveryEvent;
      const anchorText = `${anchorEvent.note || ''} ${anchorEvent.description || ''}`;
      const explicitTokens = eventExplicitNewLoadTokens(anchorEvent);
      const docs = firstRealText(leg.shippingDocs, leg.loadNo);
      const deliveredAtPickup = deliveredDocsByEvent.get(leg.pickupEventId || '') || '';
      const isDropOffOnly = /drop\s*off/i.test(anchorText)
        && !firstRealText(leg.container, leg.chassis, leg.hookedContainer, leg.hookedChassis)
        && (!leg.deliveryEventId || String(leg.fromCity || '').toLowerCase() === String(leg.toCity || '').toLowerCase());

      if (isDropOffOnly && !explicitTokens.length) return;

      let next = leg;
      const sourceIsEquipmentMove = routeLegIndicatesEquipmentMove(leg, anchorEvent);
      const staleDeliveredCarryover = docsMatch(docs, deliveredAtPickup);
      const noExplicitBolEntered = explicitTokens.length === 0;
      const shouldClearCarryover = sourceIsEquipmentMove
        && noExplicitBolEntered
        && docs
        && (staleDeliveredCarryover || /drop[_\s-]*off/i.test(String(leg.source || '')) || /drop\s*off|empty|reposition/i.test(anchorText));

      if (shouldClearCarryover) {
        next = blankLoadCarryoverFields(leg, docs);
      }
      nextLegs.push(next);
    });
    if (nextLegs.length) repaired[day] = nextLegs;
  });

  return sortedRouteMap(repaired);
}

export function normalizeRouteLegs(state = {}) {
  const loadInfo = state.loadInfo && typeof state.loadInfo === 'object' ? state.loadInfo : {};
  const { routeLegsByDay: legacyLoadInfoRouteLegsByDay, ...loadInfoWithoutLegacyRoute } = loadInfo;
  const canonical = {};
  addRouteGroup(canonical, state.routeLegsByDay || {}, 'state.routeLegsByDay');
  addRouteGroup(canonical, legacyLoadInfoRouteLegsByDay || {}, 'loadInfo.routeLegsByDay');
  const sorted = sortedRouteMap(canonical);
  const routeLegsByDay = normalizeLegacyIntermodalRouteIntent(sorted, state.eventsByDay || {});
  return {
    ...state,
    routeLegsByDay,
    loadInfo: loadInfoWithoutLegacyRoute,
  };
}

function allRouteLegs(routeLegsByDay = {}) {
  return Object.entries(routeLegsByDay || {}).flatMap(([day, legs]) => (legs || []).map(leg => ({ ...leg, day: leg.day || day })));
}

function latestRouteLeg(routeLegsByDay = {}) {
  return allRouteLegs(routeLegsByDay)
    .sort((a, b) => String(a.pickupDay || a.day || '').localeCompare(String(b.pickupDay || b.day || '')) || Number(a.pickupMin ?? 9999) - Number(b.pickupMin ?? 9999))
    .at(-1) || null;
}

function latestOpenLoadedRouteLeg(routeLegsByDay = {}) {
  return allRouteLegs(routeLegsByDay)
    .filter(leg => isLoadedKind(leg) && firstRealText(leg.shippingDocs, leg.loadNo) && leg.status !== 'delivered' && leg.status !== 'cancelled')
    .sort((a, b) => String(a.pickupDay || a.day || '').localeCompare(String(b.pickupDay || b.day || '')) || Number(a.pickupMin ?? 9999) - Number(b.pickupMin ?? 9999))
    .at(-1) || null;
}

export function normalizeLoadInfoFromRouteLegs(state = {}) {
  const withCanonical = normalizeRouteLegs(state);
  const load = withCanonical.loadInfo || {};
  const latestAny = latestRouteLeg(withCanonical.routeLegsByDay || {});
  const latestOpenLoaded = latestOpenLoadedRouteLeg(withCanonical.routeLegsByDay || {});
  const latestAnyIsEmptyMove = latestAny && normalizeKind(latestAny) === EMPTY_MOVE_KIND;
  const equipment = withCanonical.equipment || {};
  const noCurrentEquipment = /no\s+(equipment|trailer)/i.test(safeText(withCanonical.currentTrailer))
    || /drop[_\s-]*off/i.test(safeText(equipment.source))
    || (!safeText(equipment.container) && !safeText(equipment.chassis) && /dropped/i.test(safeText(equipment.note)));

  let nextLoad = { ...load };
  delete nextLoad.routeLegsByDay;

  if ((noCurrentEquipment && !latestOpenLoaded) || (latestAnyIsEmptyMove && !firstRealText(latestAny.shippingDocs, latestAny.loadNo))) {
    nextLoad = {
      ...nextLoad,
      loadNo:'',
      shippingDocs:'',
      bol:'',
      po:'',
      pickupCity:'',
      pickupState:'',
      deliveryCity:noCurrentEquipment ? '' : safeText(latestAny?.toCity || ''),
      deliveryState:noCurrentEquipment ? '' : safeUpper(latestAny?.toState || '').slice(0, 2),
      currentMoveKind:noCurrentEquipment ? 'no_equipment' : EMPTY_MOVE_KIND,
      routeSource:'canonical_routeLegsByDay',
    };
  } else if (latestOpenLoaded) {
    const docs = firstRealText(latestOpenLoaded.shippingDocs, latestOpenLoaded.loadNo);
    nextLoad = {
      ...nextLoad,
      loadNo:docs || nextLoad.loadNo || '',
      shippingDocs:docs || nextLoad.shippingDocs || '',
      bol:docs || '',
      po:docs || '',
      pickupCity:safeText(latestOpenLoaded.fromCity || nextLoad.pickupCity),
      pickupState:safeUpper(latestOpenLoaded.fromState || nextLoad.pickupState).slice(0, 2),
      deliveryCity:safeText(latestOpenLoaded.toCity || nextLoad.deliveryCity),
      deliveryState:safeUpper(latestOpenLoaded.toState || nextLoad.deliveryState).slice(0, 2),
      currentMoveKind:'loaded',
      routeSource:'canonical_routeLegsByDay',
    };
  }

  return { ...withCanonical, loadInfo: nextLoad };
}

export function normalizeDayCoverage(state = {}) {
  // Coverage normalization is derived at check time so stored driver records stay unchanged.
  // This marker allows import/export diagnostics and verifiers to confirm v95.74 behavior.
  return {
    ...state,
    coverageNormalization: {
      ...(state.coverageNormalization || {}),
      dayBoundaryCarryover:'derived_off_sb_cross_midnight',
      drivingEventsRemainAuthoritative:true,
    },
  };
}

export function normalizeIntermodalEquipment(state = {}) {
  const equipment = state.equipment || {};
  const intermodal = safeText(equipment.type).toLowerCase() === 'intermodal'
    || safeText(equipment.chassis)
    || safeText(equipment.container)
    || /\b(chassis|container|intermodal)\b/i.test(safeText(state.currentTrailer));
  if (!intermodal) return state;
  const currentTrailer = /^trailer\s*53$/i.test(safeText(state.currentTrailer)) ? 'No equipment' : (state.currentTrailer || 'No equipment');
  return {
    ...state,
    currentTrailer,
    equipment: {
      ...equipment,
      type:'intermodal',
      trailer:'',
      chassis:safeUpper(equipment.chassis),
      container:safeUpper(equipment.container),
      seal:safeUpper(equipment.seal),
      rail:safeUpper(equipment.rail),
      note:safeText(equipment.note),
      updatedAt:equipment.updatedAt || Date.now(),
      source:equipment.source || 'normalizer',
    },
  };
}

function routeLegsLinkedToEvent(routeLegsByDay = {}, eventId = '') {
  if (!eventId) return [];
  return allRouteLegs(routeLegsByDay).filter(leg => leg.pickupEventId === eventId || leg.deliveryEventId === eventId);
}

function transitionSummaryFromEventAndLegs(event = {}, linkedLegs = []) {
  const explicitTokens = explicitLoadTokensInText(`${event.note || ''} ${event.description || ''}`);
  const deliveryLeg = linkedLegs.find(leg => leg.deliveryEventId === event.id && isLoadedKind(leg));
  const pickupLoadedLeg = linkedLegs.find(leg => leg.pickupEventId === event.id && normalizeKind(leg) !== EMPTY_MOVE_KIND);
  const delivered = firstRealText(
    event.deliveredLoadNo,
    deliveryLeg?.shippingDocs,
    deliveryLeg?.loadNo,
    explicitTokens[0]
  );
  const picked = firstRealText(
    event.pickedUpLoadNo,
    event.hookedLoadNo,
    pickupLoadedLeg?.shippingDocs,
    pickupLoadedLeg?.loadNo,
    explicitTokens.length > 1 ? explicitTokens[explicitTokens.length - 1] : ''
  );
  return { delivered, picked, transitionLoadNos: uniqueClean([delivered, picked, ...explicitTokens]) };
}

function shouldClearEventLoadCarryover(event = {}, linkedLegs = []) {
  if (event.status === 'D') return false;
  const docs = firstRealText(event.shippingDocs, event.loadNo);
  if (!docs) return false;
  const text = `${event.note || ''} ${event.description || ''}`;
  if (eventExplicitNewLoadTokens(event).length) return false;
  const deliveryLeg = linkedLegs.find(leg => leg.deliveryEventId === event.id && isLoadedKind(leg));
  const pickupEmptyLeg = linkedLegs.find(leg => leg.pickupEventId === event.id && normalizeKind(leg) === EMPTY_MOVE_KIND);
  return /drop\s*off|empty|reposition/i.test(text)
    || (pickupEmptyLeg && !linkedLegs.some(leg => leg.pickupEventId === event.id && normalizeKind(leg) !== EMPTY_MOVE_KIND))
    || (deliveryLeg && docsMatch(docs, firstRealText(deliveryLeg.shippingDocs, deliveryLeg.loadNo)));
}

function repairEventLocationFromRoute(event = {}, day = '', routeLegs = []) {
  if (!event || event.status === 'D') return event;
  const match = routeLegs.find(leg => {
    if (!safeText(leg.toCity) && !safeText(leg.toState)) return false;
    if (leg.deliveryEventId && leg.deliveryEventId === event.id) return true;
    if (leg.deliveryDay && leg.deliveryDay !== day) return false;
    const deliveryMin = Number(leg.deliveryMin);
    if (!Number.isFinite(deliveryMin)) return false;
    return Math.abs(Number(event.startMin || 0) - deliveryMin) <= 45 || Math.abs(Number(event.endMin || 0) - deliveryMin) <= 45;
  });
  if (!match) return event;
  const nextCity = safeText(match.toCity);
  const nextState = safeUpper(match.toState).slice(0, 2);
  if (!nextCity && !nextState) return event;
  const sameCity = keyText(event.city) === keyText(nextCity);
  const sameState = safeUpper(event.state).slice(0, 2) === nextState;
  if (sameCity && sameState) return event;
  return {
    ...event,
    city: nextCity || event.city,
    state: nextState || event.state,
    staleLocationLabel: { city:event.city || '', state:event.state || '' },
    locationRepairSource:'route_leg_destination',
  };
}

export function normalizeTransitionEvents(state = {}) {
  const routeLegsByDay = state.routeLegsByDay || {};
  const eventsByDay = {};
  let changed = false;

  Object.entries(state.eventsByDay || {}).forEach(([day, events]) => {
    const routeLegs = routeLegsForDayCanonical({ routeLegsByDay }, day);
    eventsByDay[day] = (Array.isArray(events) ? events : []).map(event => {
      if (!event) return event;
      let next = repairEventLocationFromRoute(event, day, routeLegs);
      if (next !== event) changed = true;
      if (event.status === 'D') return next;
      const linked = routeLegsLinkedToEvent(routeLegsByDay, event.id || '');
      const transitionText = `${event.note || ''} ${event.description || ''}`;
      const isTransition = /drop\s*&\s*hook|drop\s*off|delivered.+picked|picked.+delivered/i.test(transitionText)
        || linked.some(leg => leg.pickupEventId === event.id) && linked.some(leg => leg.deliveryEventId === event.id);

      const clearCarryover = shouldClearEventLoadCarryover(event, linked);
      if (clearCarryover) {
        next = {
          ...next,
          staleCarryoverLoadNo:firstRealText(next.staleCarryoverLoadNo, next.shippingDocs, next.loadNo),
          shippingDocs:'',
          loadNo:'',
          bol:'',
          po:'',
        };
        changed = true;
      }

      if (!isTransition) return next;
      const summary = transitionSummaryFromEventAndLegs(next, linked);
      if (!summary.delivered && !summary.picked && !summary.transitionLoadNos.length) return next;
      changed = true;
      const transitionSummary = summary.delivered && summary.picked
        ? `Delivered ${summary.delivered} · Picked up ${summary.picked}`
        : summary.delivered
          ? `Delivered ${summary.delivered}`
          : summary.picked
            ? `Picked up ${summary.picked}`
            : summary.transitionLoadNos.join(' · ');
      return {
        ...next,
        deliveredLoadNo: summary.delivered || next.deliveredLoadNo || '',
        pickedUpLoadNo: summary.picked || next.pickedUpLoadNo || '',
        transitionLoadNos: summary.transitionLoadNos,
        transitionSummary,
        displayShippingDocs: transitionSummary,
      };
    });
  });

  return changed ? { ...state, eventsByDay } : state;
}

export function normalizeRoadReadyState(state = {}) {
  return normalizeTransitionEvents(
    normalizeIntermodalEquipment(
      normalizeDayCoverage(
        normalizeLoadInfoFromRouteLegs(state)
      )
    )
  );
}

export function drivingEventSignatureByDay(stateOrEventsByDay = {}) {
  const eventsByDay = stateOrEventsByDay.eventsByDay || stateOrEventsByDay || {};
  const out = {};
  Object.entries(eventsByDay || {}).forEach(([day, events]) => {
    out[day] = (Array.isArray(events) ? events : [])
      .filter(event => event?.status === 'D')
      .map(event => ({
        id:event.id || '',
        status:event.status,
        startMin:Number(event.startMin || 0),
        endMin:Number(event.endMin || 0),
      }));
  });
  return out;
}

export function docsTokensForTransition(value = '') {
  return splitLoadTokens(value);
}

export function transitionDocsAreExpectedDuplicate(event = {}, token = '') {
  const target = safeText(token).toLowerCase();
  if (!target) return false;
  return (event.transitionLoadNos || []).some(item => safeText(item).toLowerCase() === target)
    || safeText(event.deliveredLoadNo).toLowerCase() === target
    || safeText(event.pickedUpLoadNo).toLowerCase() === target;
}
