import { nowMin } from '../../shared/utils/time.js';
import { makeContinuousLogEvents, normalizeLogEvents } from './timelineEngine.js';

export function sorted(events) {
  return [...events].sort((a,b)=>a.startMin-b.startMin);
}

export function displayEventsForDay(events, isCurrentDay=false) {
  return makeContinuousLogEvents(events, { isCurrentDay, nowMinute: nowMin() });
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
