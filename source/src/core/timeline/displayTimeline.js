import { nowMin } from '../../shared/utils/time.js';
import { addDays, localDayKey } from '../../shared/utils/date.js';
import { makeContinuousLogEvents, normalizeLogEvents, sortEvents } from './timelineEngine.js';

export function sorted(events) {
  return [...events].sort((a,b)=>a.startMin-b.startMin);
}

function isDisplayOnlyCoverage(event = {}) {
  return !!event.syntheticCoverage
    || !!event.carriedFromPreviousDay
    || !!event.displayOnly
    || String(event.source || '') === 'timeline_continuity'
    || String(event.source || '') === 'carryover'
    || String(event.source || '') === 'display'
    || String(event.source || '') === 'display_timeline';
}

function realDisplayBase(events = []) {
  return sortEvents(events || [])
    .filter(Boolean)
    .filter(event => !event.voided)
    .filter(event => !isDisplayOnlyCoverage(event));
}

function safeCarryForwardStatus(status = '') {
  // A stored non-driving duty status remains in effect across midnight. A bare
  // historical D row alone is insufficient evidence to invent new Driving on
  // the following day; real active Driving rollover is owned by its session.
  return status === 'D' ? 'OFF' : (status || 'OFF');
}

function previousLastEvent(eventsByDay = {}, dayKey = '') {
  let cursor = dayKey;
  for (let i = 0; i < 14; i += 1) {
    cursor = addDays(cursor, -1);
    const events = realDisplayBase(eventsByDay?.[cursor] || []).filter(e => Number(e.endMin || 0) > Number(e.startMin || 0));
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

function emptyDayCarry(previous, day, today, options = {}) {
  if (!previous || day > today) return [];
  const isCurrentDay = day === today;
  const endMin = isCurrentDay
    ? Math.max(0, Math.min(1440, Number(options.nowMinute ?? nowMin())))
    : 1440;
  if (endMin <= 0) return [];
  const status = safeCarryForwardStatus(previous.status);
  const sameStatus = status === previous.status;
  return [{
    id:`carryover_${day}_${previous.id || status}`,
    status,
    startMin:0,
    endMin,
    city:sameStatus ? (previous.city || '') : '',
    state:sameStatus ? (previous.state || '') : '',
    note:sameStatus ? (previous.note || previous.description || '') : 'Off Duty',
    description:'',
    source:'carryover',
    syntheticCoverage:true,
    carriedFromPreviousDay:true,
    displayOnly:true,
    isLive:isCurrentDay,
    recordedEndMin:null,
  }];
}

export function displayEventsForDayFromState(eventsByDay = {}, day, options = {}) {
  const today = options.today || localDayKey();
  const raw = realDisplayBase(eventsByDay?.[day] || []);
  const first = normalizeLogEvents(raw)[0];
  const previous = previousLastEvent(eventsByDay, day);

  // Midnight is a log-day boundary, not a duty-status change. An empty new day
  // therefore displays yesterday's last non-driving status from 00:00 through
  // Now (or through 24:00 for a historical empty day). This is display-only:
  // it never mutates yesterday, creates a fake raw event, or rewrites a signed day.
  if (!raw.length) return emptyDayCarry(previous, day, today, options);

  const fillStartWith = first && Number(first.startMin || 0) > 0
    ? safeCarryForwardStatus(previous?.status || options.fallbackStartStatus || 'OFF')
    : options.fillStartWith;
  const startLocation = previous && previous.status !== 'D'
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
