// A delivery closes an identified shipment/stop. Physical GPS cities and
// broker numbers alone never identify a different pickup.
import {routeHistoryIndex, routeHistoryWindow} from './shipmentCarryover.js';
import {sameFreightReference} from './teamPickupV110445.js';
import {applyDeliveryContextToPayloadV1034,resolveDeliveryContextV1034} from '../../modules/loads/multiStopDeliveryV1034.js';

const text = value => String(value ?? '').trim();
const list = value => Array.isArray(value) ? value : [];
const hidden = leg => /^(cancelled|canceled|archived|superseded|dismissed)$/i.test(text(leg.status));
const closed = leg => /^(delivered|completed|closed)$/i.test(text(leg.status));
const docs = leg => text(leg.shippingDocs || leg.bol || leg.loadNo);
const loaded = leg => !hidden(leg) && !leg.noLoadDeclared && !/empty|reposition|bobtail|deadhead/i.test(text(leg.kind)) && !/^(empty|mt|empty\/mt|bobtail)$/i.test(docs(leg));
const delivery = payload => payload.status === 'ON' && /\b(delivery|unloading|delivered)\b/i.test([payload.reason, payload.note, ...list(payload.reasons)].map(text).join(' '));
const before = (day, minute, otherDay, otherMinute) => day < otherDay || day === otherDay && Number(minute) <= Number(otherMinute);

function selectedGuideState(state, leg) {
  const guide = leg?.loadGroupId && state.loadGuidesById?.[leg.loadGroupId];
  return {...state, activeLoadGuideId:guide?.id || '', loadInfo:{guideId:guide?.id || ''}, loadGuidesById:guide ? {[guide.id]:guide} : {}};
}

export function deliveryRouteInfo(state, leg) {
  if (!leg) return {loadNo:'', destination:'', context:null};
  const context = resolveDeliveryContextV1034(selectedGuideState(state,leg),{deliveryStopSequence:leg.stopSequence});
  return {loadNo:text(context?.loadNo || leg.loadNo || docs(leg)),
    destination:[leg.toCity,leg.toState].filter(Boolean).join(', ') || context?.currentStopText || '', context};
}

export function deliveryRouteChoices(state, {day, minute = 1440}) {
  const index = routeHistoryIndex(state);
  return index.routes.filter(loaded).filter(leg => {
    const window = routeHistoryWindow(leg, index);
    return window.recordedPickup && !window.undatedClosed && before(window.startDay, window.startMin, day, minute)
      && !(window.endDay && before(window.endDay, window.endMin, day, minute));
  }).sort((a, b) => Number(a.stopSequence || 1) - Number(b.stopSequence || 1));
}

export function deliveryRouteMatch(state, payload, {day, minute = 1440, eventId = ''}) {
  const index = routeHistoryIndex(state);
  const all = index.routes.filter(loaded);
  const currentIds = new Set(deliveryRouteChoices(state, {day,minute}).map(leg => leg.id));
  const eligible = all.filter(leg => currentIds.has(leg.id) || eventId && leg.deliveryEventId === eventId);
  if (payload.deliveryRouteId) {
    const chosen = eligible.filter(leg => leg.id === payload.deliveryRouteId);
    const current = currentIds.has(payload.deliveryRouteId);
    const editing = eventId && chosen[0]?.deliveryEventId === eventId;
    if (chosen.length !== 1 || !current && !editing) throw new Error('The selected load changed. Reopen Delivery / Unloading and choose its load.');
    return chosen[0];
  }
  const linked = eventId && eligible.filter(leg => leg.deliveryEventId === eventId);
  if (linked?.length === 1) return linked[0];
  let matches = eligible.filter(leg => sameFreightReference(leg, payload, index, leg.pickupDay || leg.day));
  if (Number(payload.deliveryStopSequence) > 0) matches = matches.filter(leg => Number(leg.stopSequence) === Number(payload.deliveryStopSequence));
  return matches.length === 1 ? matches[0] : null;
}

export function prepareDeliveryPayload(state, payload, at) {
  if (!delivery(payload)) return payload;
  const choices = deliveryRouteChoices(state, at);
  const selected = payload.deliveryRouteId || (choices.length === 1 ? choices[0].id : '');
  const leg = deliveryRouteMatch(state, {...payload, deliveryRouteId:selected}, at);
  if (!leg && choices.length) throw new Error('Choose the load being unloaded before saving.');
  if (!leg) return {...payload, deliveryCompleted:true};
  // Scope the old guide helper to the chosen shipment, so a stale global guide
  // cannot replace a driver's selected delivery or its references.
  const scoped = selectedGuideState(state,leg);
  const context = applyDeliveryContextToPayloadV1034(scoped, {...payload, deliveryStopSequence:leg.stopSequence});
  return {...context,
    shippingDocs:docs(leg), bol:text(leg.bol || docs(leg)),
    loadNo:text(payload.loadNo || context.loadNo || docs(leg)),
    deliveryRouteId:leg.id, deliveryCompleted:true,
    destination:payload.destination || [leg.toCity, leg.toState].filter(Boolean).join(', '),
    destinationState:payload.destinationState || leg.toState || '',
  };
}

export function completeDeliveryRoute(routeLegsByDay, day, payload, eventId, minute, context = {}) {
  if (!delivery(payload)) return null;
  const state = {...context, routeLegsByDay};
  const leg = deliveryRouteMatch(state, payload, {day, minute, eventId});
  if (!leg) return null;
  const updatedAt = Date.now();
  const next = Object.fromEntries(Object.entries(routeLegsByDay).map(([homeDay, copies]) => [homeDay,list(copies).map(row => row.id !== leg.id ? row : {
    ...row, deliveryDay:day, deliveryMin:minute, deliveryEventId:eventId,
    deliveredLoadNo:text(payload.loadNo || payload.shippingDocs),
    deliveryCompleted:true, status:'delivered', stopStatus:'done', updatedAt,
  })]));
  return next;
}

export function finishDeliveryState(state, payload, eventId) {
  if (!delivery(payload) || !payload.deliveryRouteId) return state;
  const all = routeHistoryIndex(state).routes, delivered = all.find(leg => leg.id === payload.deliveryRouteId && leg.deliveryEventId === eventId);
  if (!delivered || !closed(delivered)) return state;
  const group = delivered.loadGroupId;
  const guide = group && state.loadGuidesById?.[group];
  const related = group ? all.filter(leg => leg.loadGroupId === group && loaded(leg)) : [delivered];
  const remaining = related.filter(leg => !closed(leg));
  const expected = Math.max(list(guide?.stops).filter(stop => stop.type === 'delivery').length, Number(guide?.deliveryCount) || 0, related.length);
  const complete = !remaining.length && related.length >= expected;
  let next = state;
  if (guide) next = {...next, loadGuidesById:{...state.loadGuidesById, [group]:{
    ...guide, status:complete ? 'completed' : guide.status,
    completedStopIds:[...new Set([...list(guide.completedStopIds), payload.deliveryStopId].filter(Boolean))],
    ...(complete ? {completedAt:Date.now()} : {}),
  }}, ...(complete && state.activeLoadGuideId === group ? {activeLoadGuideId:''} : {})};
  const index = routeHistoryIndex(next);
  const ownsCurrent = sameFreightReference(delivered, next.loadInfo || {}, index)
    || next.loadInfo?.sourceEventId === eventId && !deliveryRouteChoices(next, {day:delivered.deliveryDay,minute:delivered.deliveryMin}).length
    || group && next.loadInfo?.guideId === group;
  if (complete && ownsCurrent) next = {...next, loadInfo:{...next.loadInfo,
    status:'delivered', currentMoveKind:'empty/reposition', loadNo:'', shippingDocs:'', bol:'', po:'',
    pickupCity:'', pickupState:'', deliveryCity:'', deliveryState:'', guideId:'',
  }};
  return next;
}
