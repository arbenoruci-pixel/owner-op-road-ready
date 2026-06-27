import { nowMin } from '../../shared/utils/time.js';
import { normalizeLogEvents } from './timelineEngine.js';

export function sorted(events) {
  return [...events].sort((a,b)=>a.startMin-b.startMin);
}

export function displayEventsForDay(events, isCurrentDay=false) {
  const evs = normalizeLogEvents(events).map(e => ({ ...e }));
  if (!evs.length) return evs;
  if (isCurrentDay) {
    const n = nowMin();
    const last = evs[evs.length - 1];
    if (last.startMin <= n) {
      last.endMin = Math.max(last.startMin + 1, n);
    }
  }
  // continuity: each event ends where next starts
  for (let i=0;i<evs.length-1;i++) {
    evs[i].endMin = Math.max(evs[i].startMin + 1, evs[i+1].startMin);
  }
  return evs;
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
