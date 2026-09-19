import {parseRecordedActivities, composeRecordedActivities} from '../../shared/duty/dutyActivities.js';
import {homeTerminalDayKey, homeTerminalMinute, getHomeTerminalTimeZone} from '../time/homeTerminalTime.js';

const legacyActions = ['Drop Off', 'Drop & Hook'];
const trailerActions = ['Drop Load / Trailer', 'Hook / Pickup Trailer'];
const text = value => String(value ?? '').trim();
const key = value => text(value).toUpperCase().replace(/\s+/g, ' ');
const equipment = value => /^(?:NO (?:TRAILER|EQUIPMENT)|NONE|N\/A)$/i.test(text(value)) ? '' : key(value);
const activity = event => parseRecordedActivities(event?.note, event?.reasons).selected;
const real = event => event && !['voided','deleted','synthetic','syntheticCoverage','displayOnly','carriedFromPreviousDay','continuityGenerated'].some(k => event[k]);
const referenceFields = ['shippingDocs','loadNo','bol','po','destination','destinationState','pickedUpLoadNo','deliveredLoadNo'];
const equipmentFields = ['droppedTrailer','hookedTrailer','droppedContainer','hookedContainer','droppedChassis','hookedChassis'];

function editableHandoff(state, day) {
  if (state.currentStatus !== 'ON') return null;
  const rows = (state.eventsByDay?.[day] || []).filter(real).slice().sort((a,b) => a.startMin-b.startMin);
  const previous = rows.at(-1);
  if (previous && rows.filter(e => e.id === previous.id).length !== 1) return null;
  if (!previous || previous.status !== 'ON' || previous.source !== 'live_status' || previous.paperLogEndV110315) return null;
  if (!Number.isInteger(previous.startMin) || !Number.isInteger(previous.endMin) || previous.endMin <= previous.startMin) return null;
  if (rows.slice(0,-1).some(e => e.endMin > previous.startMin)) return null;
  const selected = activity(previous);
  const legacy = selected.some(r => legacyActions.includes(r));
  const trailer = selected.includes('Drop Load / Trailer') && !selected.includes('Hook / Pickup Trailer');
  if ((!legacy && !trailer) || (legacy && selected.some(r => trailerActions.includes(r)))) return null;
  // A completed pickup or a linked load is a recorded fact with its own start.
  if (referenceFields.some(k => text(previous[k])) || previous.loadDetailsExplicit || previous.integrityRepairedAt) return null;
  if (['hookedTrailer','hookedContainer','hookedChassis'].some(k => equipment(previous[k]))) return null;
  if (text(previous.description) && /\b(?:load|BOL|order)\b|\bTo\s+.+,\s*[A-Z]{2}\b/i.test(previous.description)) return null;
  const routeBuckets = [state.routeLegsByDay, state.loadInfo?.routeLegsByDay];
  if (routeBuckets.some(bucket => Object.values(bucket || {}).some(legs => (Array.isArray(legs) ? legs : []).some(leg => leg?.pickupEventId === previous.id || leg?.deliveryEventId === previous.id)))) return null;
  if (state.loadInfo?.sourceEventId === previous.id) return null;
  return previous;
}

export function currentOnDutyHandoff(state, at = new Date()) {
  return editableHandoff(state, homeTerminalDayKey(at, getHomeTerminalTimeZone(state)));
}

export function toggleHandoffActivity(selected, value) {
  if (selected.includes(value)) return selected.filter(r => r !== value);
  // Drop & Hook already includes Drop Off. The last explicit choice wins.
  return [...selected.filter(r => !legacyActions.includes(value) || !legacyActions.includes(r)), value];
}

export function prepareOnDutyHandoffUpdate(state, day, incoming, {at = new Date(), backdateMinutes = 0} = {}) {
  const zone = getHomeTerminalTimeZone(state);
  if (day !== homeTerminalDayKey(at, zone) || Number(backdateMinutes) !== 0 || incoming.status !== 'ON') return null;
  const previous = editableHandoff(state, day);
  if (!previous || !incoming.id || incoming.startMin < previous.startMin || incoming.startMin !== homeTerminalMinute(at, zone)) return null;
  if (!Number.isInteger(incoming.endMin) || incoming.endMin <= incoming.startMin || incoming.endMin > 1440 || previous.endMin > incoming.endMin) return null;
  // Starting a new recorded pickup is a separate fact, even at the same stop.
  if (incoming.loadDetailsExplicit || activity(incoming).some(r => ['Pickup / Loading','Delivery / Unloading','Hook / Pickup Trailer','Hook Empty / Reposition'].includes(r))) return null;
  if (referenceFields.some(k => text(incoming[k])) || ['hookedTrailer','hookedContainer','hookedChassis'].some(k => equipment(incoming[k]))) return null;
  if (!text(previous.city) || !text(previous.state) || key(previous.city) !== key(incoming.city) || key(previous.state) !== key(incoming.state)) return null;
  const old = activity(previous), selected = activity(incoming);
  const legacy = old.some(r => legacyActions.includes(r));
  const newLegacy = selected.filter(r => legacyActions.includes(r));
  if (legacy ? newLegacy.length !== 1 || selected.some(r => trailerActions.includes(r)) : !selected.includes('Drop Load / Trailer') || newLegacy.length) return null;
  for (const field of ['droppedTrailer','droppedContainer','droppedChassis']) {
    if (equipment(previous[field]) && equipment(incoming[field]) && equipment(previous[field]) !== equipment(incoming[field])) return null;
  }
  const details = [...new Set([...parseRecordedActivities(previous.note, []).details, ...parseRecordedActivities(incoming.note, []).details])];
  const event = {...previous, ...incoming, id:previous.id, loadLinkId:previous.loadLinkId || previous.id,
    startMin:previous.startMin, endMin:Math.max(previous.endMin, incoming.endMin), onDutyHandoffUpdatedAt:at.toISOString(),
    reasons:selected, note:composeRecordedActivities(selected, details),
    description:text(incoming.description) ? incoming.description : previous.description,
    city:previous.city, state:previous.state,
    lat:previous.lat, lng:previous.lng, gpsAccuracy:previous.gpsAccuracy, locationSource:previous.locationSource,
  };
  for (const field of equipmentFields) if (!equipment(incoming[field]) && equipment(previous[field])) event[field] = previous[field];
  return {event, previous, incomingEventId:incoming.id, events:(state.eventsByDay?.[day] || []).map(e => e.id === previous.id ? event : e)};
}

export function handoffPreview(state, payload, at = new Date()) {
  const zone = getHomeTerminalTimeZone(state), day = homeTerminalDayKey(at, zone), minute = homeTerminalMinute(at, zone);
  return prepareOnDutyHandoffUpdate(state, day, {...payload, id:'handoff-draft', source:'live_status', note:payload.reason,
    startMin:minute, endMin:Math.min(1440, minute+1),
    droppedContainer:payload.dropHook?.droppedContainer, droppedChassis:payload.dropHook?.droppedChassis,
    hookedContainer:payload.dropHook?.hookedContainer, hookedChassis:payload.dropHook?.hookedChassis},
    {at, backdateMinutes:payload.backdateMinutes});
}

export function recordOnDutyHandoffUpdate(before, after, day, update, at = new Date()) {
  if (!update) return after;
  const entry = {kind:'edit', source:'ongoing_on_duty_handoff', targetId:update.previous.id,
    incomingEventId:update.incomingEventId, editedAt:at.toISOString(), changedIds:[update.previous.id],
    beforeEvents:structuredClone(before.eventsByDay?.[day] || []), afterEvents:structuredClone(after.eventsByDay?.[day] || []),
    beforeRouteLegs:structuredClone(before.routeLegsByDay?.[day] || []), afterRouteLegs:structuredClone(after.routeLegsByDay?.[day] || []),
    beforeInspection:structuredClone(before.inspectionByDay?.[day] || null), afterInspection:structuredClone(after.inspectionByDay?.[day] || null)};
  return {...after, logbookEditHistoryByDay:{...after.logbookEditHistoryByDay, [day]:[...(before.logbookEditHistoryByDay?.[day] || []), entry]}};
}
