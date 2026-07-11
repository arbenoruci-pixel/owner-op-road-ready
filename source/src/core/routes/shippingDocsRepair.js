function text(value = '') {
  return String(value || '').trim();
}

function upperState(value = '') {
  return text(value).toUpperCase().slice(0, 2);
}

function eventText(event = {}) {
  return `${event.note || ''} ${event.description || ''}`;
}

export function isPickupLoadEvent(event = {}) {
  return event.status === 'ON' && /pickup|pick up|loading/i.test(eventText(event));
}

export function isDeliveryLoadEvent(event = {}) {
  return event.status === 'ON' && /delivery|unloading/i.test(eventText(event));
}

export function isExplicitNoLoadReference(value = '') {
  const valueText = text(value);
  return /(?:^|\b)(empty|bobtail|deadhead|no\s+load|no\s+trailer|reposition|empty\s*\/\s*mt|mt)(?:\b|$)/i.test(valueText);
}

export function eventHasNoLoadDeclaration(event = {}) {
  if (event.noLoadDeclared || isExplicitNoLoadReference(event.noLoadNote)) return true;
  if (isExplicitNoLoadReference(event.shippingDocs || event.loadNo || event.bol || event.po)) return true;
  // Free-form wording counts as an explicit no-load declaration only on the
  // ON DUTY work event itself. An unrelated OFF/SB note such as "No trailer
  // parking" must never satisfy a Pickup / Loading BOL requirement.
  return event.status === 'ON'
    && /empty|bobtail|deadhead|no\s+load|no\s+trailer|reposition/i.test(eventText(event));
}

function parseCityState(value = '', fallbackState = '') {
  const raw = text(value);
  if (!raw) return { city:'', state:'' };
  const parts = raw.split(',');
  if (parts.length >= 2) {
    const state = upperState(parts.pop());
    return { city:parts.join(',').trim(), state };
  }
  const trailing = raw.match(/^(.+?)\s+([A-Za-z]{2})$/);
  if (trailing) return { city:trailing[1].trim(), state:upperState(trailing[2]) };
  return { city:raw, state:upperState(fallbackState) };
}

function dayEvents(state = {}, day = '') {
  return Array.isArray(state.eventsByDay?.[day]) ? state.eventsByDay[day] : [];
}

function routeEntries(routeLegsByDay = {}) {
  return Object.entries(routeLegsByDay || {}).flatMap(([homeDay, legs]) => (
    (Array.isArray(legs) ? legs : []).map((leg, index) => ({ homeDay, index, leg }))
  ));
}

function docsForEvent(event = {}) {
  return text(event.shippingDocs || event.loadNo || event.bol || event.po);
}

export function findShippingDocsTargetEvent(state = {}, day = '', eventId = '') {
  const events = dayEvents(state, day);
  if (eventId) {
    const exact = events.find(event => event?.id === eventId);
    if (exact) return exact;
  }

  const candidates = events.filter(event => isPickupLoadEvent(event) || isDeliveryLoadEvent(event));
  return candidates.find(event => !docsForEvent(event) && !eventHasNoLoadDeclaration(event))
    || candidates.find(isPickupLoadEvent)
    || candidates[0]
    || null;
}

function linkedRouteEntry(routeLegsByDay = {}, eventId = '') {
  if (!eventId) return null;
  return routeEntries(routeLegsByDay).find(({ leg }) => (
    leg?.pickupEventId === eventId || leg?.deliveryEventId === eventId || leg?.id === `leg_${eventId}`
  )) || null;
}

function dayRouteCandidate(routeLegsByDay = {}, day = '') {
  const candidates = routeEntries(routeLegsByDay)
    .filter(({ leg, homeDay }) => (
      homeDay === day || leg?.day === day || leg?.pickupDay === day || leg?.deliveryDay === day
    ))
    .filter(({ leg }) => leg?.status !== 'cancelled');
  return candidates.find(({ leg }) => !text(leg.shippingDocs || leg.loadNo)) || candidates[0] || null;
}

function updateRouteEntry(routeLegsByDay = {}, entry = null, updater = leg => leg) {
  if (!entry) return routeLegsByDay || {};
  const next = { ...(routeLegsByDay || {}) };
  const list = [...(next[entry.homeDay] || [])];
  list[entry.index] = updater({ ...list[entry.index] });
  next[entry.homeDay] = list;
  return next;
}

function createPickupRouteLeg(routeLegsByDay = {}, day = '', event = {}, docs = '', noLoad = false) {
  if (!event?.id || !isPickupLoadEvent(event)) return routeLegsByDay || {};
  const destination = parseCityState(event.destination || '', event.destinationState || '');
  const next = { ...(routeLegsByDay || {}) };
  const list = [...(next[day] || [])];
  list.push({
    id:`leg_${event.id}`,
    day,
    pickupDay:day,
    pickupEventId:event.id,
    pickupMin:Number.isFinite(Number(event.startMin)) ? Number(event.startMin) : null,
    deliveryDay:'',
    deliveryEventId:'',
    deliveryMin:null,
    fromCity:text(event.city),
    fromState:upperState(event.state),
    toCity:destination.city,
    toState:destination.state,
    shippingDocs:noLoad ? '' : docs,
    loadNo:noLoad ? '' : docs,
    kind:noLoad ? 'empty/reposition' : 'loaded',
    currentMoveKind:noLoad ? 'empty/reposition' : 'loaded',
    status:'open',
    source:noLoad ? 'no_load_event' : 'pickup_event',
    updatedAt:Date.now(),
  });
  next[day] = list;
  return next;
}

/**
 * Saves a BOL/reference on the exact pickup/delivery event and its linked route
 * leg. This prevents the old sign loop where the Form field changed only the
 * global loadInfo while signing validated the route/event record. Passing
 * allowEmpty clears the same exact event/route without leaving stale global docs.
 */
export function applyShippingDocumentReference(state = {}, options = {}) {
  const day = text(options.day || state.activeDay);
  const value = text(options.value);
  const allowEmpty = options.allowEmpty === true;
  if (!day || (!value && !allowEmpty)) return state;

  const target = findShippingDocsTargetEvent(state, day, options.eventId || options.issue?.eventId || '');
  const noLoad = isExplicitNoLoadReference(value);
  const targetId = target?.id || '';
  let eventsByDay = state.eventsByDay || {};

  if (targetId) {
    const updated = dayEvents(state, day).map(event => {
      if (event?.id !== targetId) return event;
      if (noLoad) {
        return {
          ...event,
          shippingDocs:'',
          loadNo:'',
          bol:'',
          po:'',
          noLoadDeclared:true,
          noLoadNote:value,
          shippingDocsUpdatedAt:Date.now(),
        };
      }
      return {
        ...event,
        shippingDocs:value,
        loadNo:value,
        bol:value,
        noLoadDeclared:false,
        noLoadNote:'',
        shippingDocsUpdatedAt:Date.now(),
      };
    });
    eventsByDay = { ...eventsByDay, [day]:updated };
  }

  let routeLegsByDay = state.routeLegsByDay || {};
  let entry = linkedRouteEntry(routeLegsByDay, targetId);
  if (!entry && !targetId) entry = dayRouteCandidate(routeLegsByDay, day);

  if (entry) {
    routeLegsByDay = updateRouteEntry(routeLegsByDay, entry, leg => ({
      ...leg,
      shippingDocs:noLoad ? '' : value,
      loadNo:noLoad ? '' : value,
      bol:noLoad ? '' : value,
      po:noLoad ? '' : value,
      kind:noLoad ? 'empty/reposition' : (leg.kind || 'loaded'),
      currentMoveKind:noLoad ? 'empty/reposition' : (leg.currentMoveKind || 'loaded'),
      noLoadDeclared:noLoad,
      noLoadNote:noLoad ? value : '',
      source:noLoad ? 'no_load_event' : (leg.source || 'shipping_docs_fix'),
      updatedAt:Date.now(),
    }));
  } else if (target) {
    routeLegsByDay = createPickupRouteLeg(routeLegsByDay, day, target, value, noLoad);
  }

  const destination = parseCityState(target?.destination || '', target?.destinationState || '');
  const loadInfo = noLoad
    ? {
      ...(state.loadInfo || {}),
      shippingDocs:'',
      loadNo:'',
      bol:'',
      po:'',
      currentMoveKind:'empty/reposition',
      noLoadDeclared:true,
      noLoadNote:value,
      sourceEventId:targetId,
      sourceEventDay:day,
      updatedAt:Date.now(),
    }
    : {
      ...(state.loadInfo || {}),
      shippingDocs:value,
      loadNo:value,
      bol:value,
      po:value,
      noLoadDeclared:false,
      noLoadNote:'',
      sourceEventId:targetId,
      sourceEventDay:day,
      sourceEventReason:target?.note || '',
      pickupCity:isPickupLoadEvent(target) ? text(target.city) : text(state.loadInfo?.pickupCity),
      pickupState:isPickupLoadEvent(target) ? upperState(target.state) : upperState(state.loadInfo?.pickupState),
      deliveryCity:destination.city || text(state.loadInfo?.deliveryCity),
      deliveryState:destination.state || upperState(state.loadInfo?.deliveryState),
      currentMoveKind:'loaded',
      updatedAt:Date.now(),
    };

  return { ...state, eventsByDay, routeLegsByDay, loadInfo };
}

/** Give the editor the exact route values when older event records lack them. */
export function enrichLoadEventFromLinkedRoute(state = {}, day = '', event = null) {
  if (!event?.id) return event;
  const entry = linkedRouteEntry(state.routeLegsByDay || {}, event.id);
  if (!entry) return event;
  const leg = entry.leg || {};
  const pickup = leg.pickupEventId === event.id;
  const delivery = leg.deliveryEventId === event.id;
  const destination = pickup
    ? [text(leg.toCity), upperState(leg.toState)].filter(Boolean).join(', ')
    : (delivery ? [text(leg.toCity), upperState(leg.toState)].filter(Boolean).join(', ') : '');
  return {
    ...event,
    shippingDocs:event.shippingDocs || event.loadNo || leg.shippingDocs || leg.loadNo || '',
    loadNo:event.loadNo || event.shippingDocs || leg.loadNo || leg.shippingDocs || '',
    destination:event.destination || destination,
    destinationState:event.destinationState || (pickup || delivery ? upperState(leg.toState) : ''),
    loadLinkId:event.loadLinkId || leg.id || '',
    routeLegDay:entry.homeDay || day,
  };
}

/**
 * Applies an explicitly edited route leg's BOL and destination back to the
 * exact linked pickup/delivery event. This is intentionally opt-in from the
 * Form tab so normal state normalization can never rewrite historical event
 * locations or unrelated days.
 */
export function applyRouteLegDetailsToLinkedEvents(eventsByDay = {}, routeLegsByDay = {}) {
  const next = { ...(eventsByDay || {}) };
  const eventIndex = new Map();

  Object.entries(next).forEach(([day, events]) => {
    (Array.isArray(events) ? events : []).forEach((event, index) => {
      if (event?.id) eventIndex.set(event.id, { day, index, event });
    });
  });

  const changedDays = new Set();
  const updateLinkedEvent = (eventId, leg, role) => {
    const entry = eventIndex.get(eventId || '');
    if (!entry) return;

    const docs = text(leg.shippingDocs || leg.loadNo || leg.bol || leg.po);
    const noLoad = !!leg.noLoadDeclared || /empty|reposition|bobtail|deadhead|no_load/i.test(`${leg.kind || ''} ${leg.currentMoveKind || ''} ${leg.source || ''}`);
    const destination = [text(leg.toCity), upperState(leg.toState)].filter(Boolean).join(', ');
    const current = entry.event || {};
    const patch = {
      ...current,
      shippingDocs:noLoad ? '' : docs,
      loadNo:noLoad ? '' : docs,
      bol:noLoad ? '' : docs,
      po:noLoad ? '' : docs,
      noLoadDeclared:noLoad,
      noLoadNote:noLoad ? (text(leg.noLoadNote) || 'Empty / reposition') : '',
      loadLinkId:leg.id || current.loadLinkId || '',
      routeLegDay:leg.day || entry.day,
      routeDetailsUpdatedAt:Date.now(),
    };

    if (role === 'pickup') {
      patch.destination = destination;
      patch.destinationCity = text(leg.toCity);
      patch.destinationState = upperState(leg.toState);
    } else if (role === 'delivery' && destination) {
      patch.destination = destination;
      patch.destinationCity = text(leg.toCity);
      patch.destinationState = upperState(leg.toState);
    }

    if (!changedDays.has(entry.day)) {
      next[entry.day] = [...(next[entry.day] || [])];
      changedDays.add(entry.day);
    }
    next[entry.day][entry.index] = patch;
    eventIndex.set(eventId, { ...entry, event:patch });
  };

  Object.entries(routeLegsByDay || {}).forEach(([homeDay, legs]) => {
    (Array.isArray(legs) ? legs : []).forEach(leg => {
      const normalizedLeg = { ...leg, day:leg.day || homeDay };
      if (normalizedLeg.pickupEventId) updateLinkedEvent(normalizedLeg.pickupEventId, normalizedLeg, 'pickup');
      if (normalizedLeg.deliveryEventId) updateLinkedEvent(normalizedLeg.deliveryEventId, normalizedLeg, 'delivery');
    });
  });

  return next;
}
