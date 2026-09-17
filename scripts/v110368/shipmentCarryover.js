// Read-only shipment context. Never copy a pickup into the duty timeline or
// consult today's active load when displaying a recorded historical trip.
import {newestRouteCopies} from './routeProjectionV110352.js';
const text = value => String(value ?? '').trim();
const dayKey = value => /^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? text(value) : '';
const minute = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const closed = leg => /^(delivered|completed|closed)$/i.test(text(leg.status));
const real = event => event && !event.voided && !event.deleted && !event.deletedAt
  && !event.synthetic && !event.syntheticCoverage && !event.displayOnly
  && !event.carriedFromPreviousDay && !event.continuityGenerated
  && !/^(carryover|timeline_continuity|display|display_timeline)$/i.test(text(event.source));
const activity = event => [event?.note, event?.description, ...(Array.isArray(event?.reasons) ? event.reasons : [])].map(text).join(' ');
const docs = leg => text(leg.shippingDocs || leg.loadNo || leg.bol || leg.po);
const noLoad = leg => leg.noLoadDeclared || /empty|reposition|bobtail|deadhead/i.test(text(leg.kind))
  || /^(empty|mt|empty\/mt|bobtail)$/i.test(docs(leg));

export function routeHistoryIndex(state = {}) {
  const index = new Map();
  for (const [day, events] of Object.entries(state.eventsByDay || {})) {
    if (!dayKey(day) || !Array.isArray(events)) continue;
    for (const event of events) {
      if (!real(event) || !text(event.id)) continue;
      const id = text(event.id);
      index.set(id, [...(index.get(id) || []), {day, event}]);
    }
  }
  index.groups = new Map();
  const routes = newestRouteCopies(Object.entries(state.routeLegsByDay || {}).flatMap(([day, rows]) =>
    (Array.isArray(rows) ? rows : []).map(leg => ({...leg, day:leg.day || day}))));
  for (const leg of routes) {
    if (!text(leg.loadGroupId) || /^(cancelled|canceled|archived|superseded|dismissed)$/i.test(text(leg.status))) continue;
    const group = text(leg.loadGroupId);
    index.groups.set(group, [...(index.groups.get(group) || []), leg]);
  }
  index.events = [...index.values()].flat().sort(compareEntries);
  index.routes = routes;
  return index;
}

function linked(index, id, expectedDay) {
  const matches = index.get(text(id)) || [];
  const exact = matches.filter(entry => entry.day === expectedDay);
  return exact.length === 1 ? exact[0] : matches.length === 1 ? matches[0] : null;
}

function directPickup(leg, index) {
  const pickup = linked(index, leg.pickupEventId, leg.pickupDay || leg.day);
  return pickup?.event.status === 'ON'
    && /\b(pickup|pick up|loading|hook)\b/i.test(activity(pickup.event))
    && !pickup.event.noLoadDeclared ? pickup : null;
}

function recordedPickupForLeg(leg, index) {
  const direct = directPickup(leg, index);
  if (direct || text(leg.pickupEventId) || !text(leg.loadGroupId) || !docs(leg)) return direct;
  // Guide legs after stop one share shipment identity, but deliberately have no
  // pickupEventId. Inherit only one unambiguous recorded pickup in that group.
  const candidates = new Map();
  for (const other of index.groups.get(text(leg.loadGroupId)) || []) {
    if (docs(other).toUpperCase() !== docs(leg).toUpperCase() || noLoad(other)) continue;
    const pickup = directPickup(other, index);
    if (pickup) candidates.set(pickup.day + ':' + text(pickup.event.id), pickup);
  }
  return candidates.size === 1 ? [...candidates.values()][0] : null;
}

const compareEntries = (a, b) => a.day.localeCompare(b.day) || Number(a.event.startMin) - Number(b.event.startMin);
const isPickup = event => event.status === 'ON' && /\b(pickup|pick up|loading|hook)\b/i.test(activity(event))
  && !/\b(unloading|unhook)\b/i.test(activity(event));
const isDelivery = event => event.status === 'ON' && /\b(delivery|unloading|drop|dropped|unhook)\b/i.test(activity(event));
const identity = value => text(value).toUpperCase();

function inferredDelivery(leg, pickup, nextPickup, index) {
  const group = text(leg.loadGroupId);
  const multiStop = group && (index.groups.get(group) || []).filter(other => docs(other) === docs(leg)).length > 1;
  return (index.events || []).find(entry => {
    if (compareEntries(entry, pickup) <= 0 || (nextPickup && compareEntries(entry, nextPickup) > 0) || !isDelivery(entry.event)) return false;
    const event = entry.event, reference = docs(event);
    const trailer = text(event.droppedTrailer || event.trailer || event.trailerNo);
    // Explicit conflicting evidence must never close another shipment.
    if (reference && identity(reference) !== identity(docs(leg))) return false;
    if (trailer && trailerAtPickup(leg, pickup.event) && identity(trailer) !== identity(trailerAtPickup(leg, pickup.event))) return false;
    if (multiStop) {
      // An unlinked intermediate delivery belongs only to its matching stop.
      if (!text(event.city) || !text(event.state) || identity(event.city) !== identity(leg.toCity) || identity(event.state) !== identity(leg.toState)) return false;
    }
    return true;
  });
}

export function routeHistoryWindow(leg, index) {
  const pickup = recordedPickupForLeg(leg, index);
  const recordedPickup = !!pickup;
  const startDay = dayKey(recordedPickup ? pickup.day : leg.pickupDay || leg.day);
  // A later recorded pickup starts the next shipment, even if the older route
  // never received a deliveryEventId. Saved guides/appointments cannot do this.
  const nextPickup = pickup && (index.events || []).find(entry => compareEntries(entry, pickup) > 0
    && text(entry.event.id) !== text(pickup.event.id) && isPickup(entry.event));
  const linkedDelivery = linked(index, leg.deliveryEventId, leg.deliveryDay);
  // Explicit route links remain authoritative when legacy free text was edited.
  const actualDelivery = linkedDelivery
    && (!pickup || compareEntries(linkedDelivery, pickup) > 0) ? linkedDelivery : null;
  const delivery = actualDelivery || (pickup && inferredDelivery(leg, pickup, nextPickup, index));
  const boundary = [delivery, nextPickup].filter(Boolean).sort(compareEntries)[0];
  const endDay = dayKey(boundary?.day);
  return {
    startDay, endDay,
    startMin: minute(recordedPickup ? pickup.event.startMin : leg.pickupMin),
    endMin: minute(boundary?.event.startMin),
    endReason: boundary ? (boundary === nextPickup ? 'next-pickup' : 'delivery') : '',
    recordedPickup,
    pickup: recordedPickup ? pickup.event : null,
    bounded: !!startDay && !!endDay && endDay >= startDay,
    // A completed legacy row without a dated delivery has no evidence that it
    // remained aboard on later days. Retain its own pickup-day history only.
    undatedClosed: closed(leg) && !delivery,
  };
}

// null retains the existing conservative scope for unconfirmed imported rows.
export function recordedRouteDayMembership(leg, day, index) {
  if (!dayKey(day)) return false;
  const window = routeHistoryWindow(leg, index);
  if (!window.startDay || !window.recordedPickup) return null;
  if (window.undatedClosed && !window.bounded) return day === window.startDay;
  if (window.bounded) return day >= window.startDay && day <= window.endDay;
  if (day < window.startDay) return false;
  if (window.endDay) return day === window.startDay;
  return true;
}

function trailerAtPickup(leg, pickup) {
  const explicit = text(pickup?.hookedTrailer || pickup?.trailer || pickup?.trailerNo || leg.trailer || leg.trailerNo);
  // Older pickup records retained the explicitly labeled number only in notes.
  const labeled = activity(pickup).match(/(?:^|[·;])\s*Trailer\s+([A-Z0-9_-]+)(?=\s*(?:[·;]|$))/i)?.[1];
  const value = text(explicit || labeled).replace(/^Trailer\s+/i, '');
  return /^(none|no trailer|trailer|hooked)$/i.test(value) ? '' : value;
}

export function shipmentContextForEvents(state, day, events, legs) {
  const index = routeHistoryIndex(state);
  const shipments = legs.filter(leg => docs(leg) && !noLoad(leg)).map(leg => ({leg, window:routeHistoryWindow(leg, index)}))
    .filter(({window}) => window.recordedPickup);
  return events.map(event => {
    const active = [];
    for (const {leg, window} of shipments) {
      if (window.undatedClosed && !window.bounded && day !== window.startDay) continue;
      if (day < window.startDay || (window.endDay && day > window.endDay)) continue;
      const at = minute(event.startMin);
      if (at === null) continue;
      if (day === window.startDay && (window.startMin === null || at < window.startMin)) continue;
      if (day === window.endDay && (window.endMin === null || at >= window.endMin)) continue;
      // The pickup already has its exact BOL/destination line.
      if (text(event.id) === text(window.pickup?.id)) continue;
      active.push({leg, window});
    }
    // One next destination per confirmed multi-stop shipment. Later stops stay
    // on board, and become the displayed destination after prior deliveries.
    const nextStops = active.filter(({leg}) => !text(leg.loadGroupId) || !active.some(({leg:other}) =>
      text(other.loadGroupId) === text(leg.loadGroupId) && docs(other).toUpperCase() === docs(leg).toUpperCase()
      && Number(other.stopSequence || 1) < Number(leg.stopSequence || 1)));
    const contexts = nextStops.map(({leg, window}) => ({
        routeId: text(leg.id), shippingDocs:docs(leg),
        destination:[leg.toCity, leg.toState].map(text).filter(Boolean).join(', '),
        trailer:trailerAtPickup(leg, window.pickup),
    }));
    return contexts.length ? {...event, shipmentContextV110367:contexts} : event;
  });
}

export function shipmentContextLabel(contexts = []) {
  return [...new Set(contexts.map(context => [
    context.shippingDocs ? `BOL ${context.shippingDocs}` : '',
    context.trailer ? `Trailer ${context.trailer}` : '',
    context.destination ? `Going to ${context.destination}` : '',
  ].filter(Boolean).join(' · ')).filter(Boolean))].join(' / ');
}

export function routeStatusForLogDay(leg, day, state) {
  const window = routeHistoryWindow(leg, routeHistoryIndex(state));
  if (window.endReason === 'delivery' && day >= window.endDay) return 'Done';
  if (window.endReason === 'next-pickup' && day >= window.endDay) return 'Previous load';
  if (window.undatedClosed && !window.bounded) return 'Done';
  if (window.recordedPickup && day >= window.startDay
    && (!window.endDay || day < window.endDay)) return 'In transit';
  if (closed(leg)) return 'Done';
  return leg.isCurrentStop ? 'Next stop' : 'Pending';
}
