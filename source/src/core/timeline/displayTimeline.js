import { nowMin } from '../../shared/utils/time.js';
import { addDays, localDayKey } from '../../shared/utils/date.js';
import { makeContinuousLogEvents, normalizeLogEvents, sortEvents } from './timelineEngine.js';

export function sorted(events) {
  return [...events].sort((a,b)=>a.startMin-b.startMin);
}

function previousLastEvent(eventsByDay = {}, dayKey = '') {
  let cursor = dayKey;
  for (let i = 0; i < 14; i += 1) {
    cursor = addDays(cursor, -1);
    const events = sortEvents(eventsByDay?.[cursor] || []).filter(e => Number(e.endMin || 0) > Number(e.startMin || 0));
    if (events.length) return events[events.length - 1];
  }
  return null;
}

function startFillOptions(events = [], options = {}) {
  const ordered = normalizeLogEvents(events);
  if (!ordered.length) return options;
  const first = ordered[0];
  if (Number(first.startMin || 0) <= 0) return options;
  if (options.fillStartWith) return options;
  if (options.disableStartFill) return options;

  // A RODS day cannot have an uncovered period before the first event. When
  // the caller has no previous-day context, use OFF as the conservative visual
  // bridge and let RoadGuard/signing review the day if the record needs edits.
  return {
    ...options,
    fillStartWith: options.fallbackStartStatus || 'OFF',
    startLocation: options.startLocation || { city: first.city || 'GPS', state: first.state || 'UNK' },
  };
}

export function displayEventsForDay(events, isCurrentDay=false, options = {}) {
  return makeContinuousLogEvents(events, {
    ...startFillOptions(events, options),
    isCurrentDay,
    nowMinute: options.nowMinute ?? nowMin(),
  });
}

export function displayEventsForDayFromState(eventsByDay = {}, day, options = {}) {
  const today = localDayKey();
  const raw = eventsByDay?.[day] || [];
  const first = normalizeLogEvents(raw)[0];
  const previous = previousLastEvent(eventsByDay, day);
  const fillStartWith = first && Number(first.startMin || 0) > 0
    ? (previous?.status || options.fallbackStartStatus || 'OFF')
    : options.fillStartWith;
  const startLocation = previous
    ? { city: previous.city || 'GPS', state: previous.state || 'UNK' }
    : (options.startLocation || (first ? { city: first.city || 'GPS', state: first.state || 'UNK' } : null));

  return displayEventsForDay(raw, day === today, {
    ...options,
    fillStartWith,
    startLocation,
  });
}

export function currentFromEvents(events, fallbackStatus='OFF', fallbackLocation={ city:'GPS', state:'UNK' }, fallbackReason='Off Duty') {
  const evs = normalizeLogEvents(events);
  if (!evs.length) {
    return {
      status: fallbackStatus,
      reason: fallbackReason || 'Off Duty',
      location: fallbackLocation || { city:'GPS', state:'UNK' },
      trailer: null,
      event: null,
    };
  }
  const last = evs[evs.length - 1];
  return {
    status: last.status,
    reason: last.note || last.description || 'Current status',
    location: { city:last.city || fallbackLocation?.city || 'GPS', state:last.state || fallbackLocation?.state || 'UNK' },
    event: last,
  };
}
