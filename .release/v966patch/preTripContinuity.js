import { addDays } from '../../shared/utils/date.js';
import { rawStoredEventsForDay } from './rawRodsChecks.js';

export const QUALIFYING_PRETRIP_REST_MINUTES = 10 * 60;

function orderedCompleteEvents(events = []) {
  return [...(events || [])]
    .filter(Boolean)
    .filter(event => Number(event.endMin || 0) > Number(event.startMin || 0))
    .sort((a, b) => Number(a.startMin || 0) - Number(b.startMin || 0) || Number(a.endMin || 0) - Number(b.endMin || 0));
}

function isRestStatus(status = '') {
  return status === 'OFF' || status === 'SB';
}

function isPreTripEvent(event = {}) {
  return event.status === 'ON' && /pre[- ]?trip|inspection/i.test(`${event.note || ''} ${event.description || ''}`);
}

function dayEvents(eventsByDay = {}, day = '', targetDay = '', currentEventsOverride = null) {
  if (day === targetDay && Array.isArray(currentEventsOverride)) return orderedCompleteEvents(currentEventsOverride);
  return orderedCompleteEvents(rawStoredEventsForDay(eventsByDay || {}, day));
}

function absoluteTimeline(eventsByDay = {}, targetDay = '', currentEventsOverride = null) {
  if (!targetDay) return [];
  const days = [addDays(targetDay, -2), addDays(targetDay, -1), targetDay];
  const rows = days.flatMap((day, index) => {
    const dayOffset = index - 2;
    return dayEvents(eventsByDay, day, targetDay, currentEventsOverride).map(event => ({
      ...event,
      logDay:day,
      absoluteStart:(dayOffset * 1440) + Number(event.startMin || 0),
      absoluteEnd:(dayOffset * 1440) + Number(event.endMin || 0),
    }));
  }).sort((a, b) => a.absoluteStart - b.absoluteStart || a.absoluteEnd - b.absoluteEnd);

  // Manual RODS use whole-minute boundaries. Trim only a one-minute overlap
  // artifact so rest/continuity checks read the same boundary shown on screen.
  for (let index = 0; index < rows.length - 1; index += 1) {
    const current = rows[index];
    const next = rows[index + 1];
    const overlap = current.absoluteEnd - next.absoluteStart;
    if (overlap > 0 && overlap <= 1 && next.absoluteStart > current.absoluteStart) {
      current.absoluteEnd = next.absoluteStart;
    }
  }

  return rows.filter(event => event.absoluteEnd > event.absoluteStart);
}

function restBlocksBetween(events = [], startExclusive = Number.NEGATIVE_INFINITY, endExclusive = Number.POSITIVE_INFINITY) {
  const blocks = [];
  let active = null;

  const finish = () => {
    if (active && active.end > active.start) blocks.push(active);
    active = null;
  };

  for (const event of events) {
    const start = Math.max(Number(event.absoluteStart), startExclusive);
    const end = Math.min(Number(event.absoluteEnd), endExclusive);
    if (!(end > start)) continue;

    if (!isRestStatus(event.status)) {
      finish();
      continue;
    }

    if (active && start <= active.end + 1) {
      active.end = Math.max(active.end, end);
      active.events.push(event);
      continue;
    }

    finish();
    active = { start, end, events:[event] };
  }

  finish();
  return blocks.map(block => ({ ...block, minutes:Math.max(0, block.end - block.start) }));
}

/**
 * Returns the 10-hour OFF/SB reset context for one proposed/stored DRIVING start.
 * A new pre-trip is required only when a continuous OFF/SB block of at least
 * 10 hours occurred after the previous DRIVING segment and before this start.
 * Midnight alone never creates a pre-trip requirement.
 */
export function preTripRequirementForDriving(
  eventsByDay = {},
  day = '',
  drivingStartMin = 0,
  currentEventsOverride = null,
  options = {},
) {
  if (!day) return { required:false, satisfied:true, restMinutes:0, preTripEvent:null };

  const targetStart = Math.max(0, Math.min(1440, Number(drivingStartMin || 0)));
  const timeline = absoluteTimeline(eventsByDay, day, currentEventsOverride);
  if (options.assumeLastStatusActive === true) {
    const hasStoredDrivingAtStart = timeline.some(event => (
      event.logDay === day
      && event.status === 'D'
      && Math.abs(Number(event.absoluteStart) - targetStart) <= 1
    ));
    if (!hasStoredDrivingAtStart) {
      const latestBeforeStart = [...timeline]
        .filter(event => event.absoluteStart < targetStart)
        .sort((a, b) => a.absoluteStart - b.absoluteStart || a.absoluteEnd - b.absoluteEnd)
        .at(-1) || null;
      if (latestBeforeStart && isRestStatus(latestBeforeStart.status) && latestBeforeStart.absoluteEnd < targetStart) {
        latestBeforeStart.absoluteEnd = targetStart;
      }
    }
  }
  const before = timeline.filter(event => event.absoluteStart < targetStart && event.absoluteEnd <= targetStart + 1);
  const previousDriving = [...before]
    .reverse()
    .find(event => event.status === 'D' && event.absoluteStart < targetStart) || null;
  const scanStart = previousDriving ? Number(previousDriving.absoluteEnd) : Number.NEGATIVE_INFINITY;
  const window = before.filter(event => event.absoluteEnd > scanStart && event.absoluteStart < targetStart);
  const qualifyingRest = restBlocksBetween(window, scanStart, targetStart)
    .filter(block => block.minutes >= QUALIFYING_PRETRIP_REST_MINUTES)
    .at(-1) || null;

  if (!qualifyingRest) {
    return {
      required:false,
      satisfied:true,
      restMinutes:0,
      restStart:null,
      restEnd:null,
      preTripEvent:null,
      previousDriving,
    };
  }

  const preTripEvent = window.find(event => (
    isPreTripEvent(event)
    && event.absoluteStart >= qualifyingRest.end - 1
    && event.absoluteEnd <= targetStart + 1
  )) || null;

  return {
    required:true,
    satisfied:!!preTripEvent,
    restMinutes:qualifyingRest.minutes,
    restStart:qualifyingRest.start,
    restEnd:qualifyingRest.end,
    restEvents:qualifyingRest.events,
    preTripEvent,
    previousDriving,
  };
}

export function preTripRequirementsForDay(eventsByDay = {}, day = '', currentEventsOverride = null) {
  const currentEvents = dayEvents(eventsByDay, day, day, currentEventsOverride);
  return currentEvents
    .filter(event => event.status === 'D')
    .map(drivingEvent => ({
      ...preTripRequirementForDriving(eventsByDay, day, Number(drivingEvent.startMin || 0), currentEventsOverride),
      drivingEvent,
    }))
    .filter(result => result.required);
}

export function missingPreTripRequirementsForDay(eventsByDay = {}, day = '', currentEventsOverride = null) {
  return preTripRequirementsForDay(eventsByDay, day, currentEventsOverride)
    .filter(result => !result.satisfied);
}

/**
 * Backward-compatible midnight helper. This remains useful for old recovery
 * guards, while Sign/DOT validation now uses the 10-hour reset rule above.
 */
export function isDrivingContinuationFromPreviousDay(eventsByDay = {}, day = '', currentEventsOverride = null) {
  if (!day) return false;

  const currentEvents = orderedCompleteEvents(
    Array.isArray(currentEventsOverride)
      ? currentEventsOverride
      : rawStoredEventsForDay(eventsByDay || {}, day)
  );
  const firstCurrent = currentEvents[0] || null;
  if (!firstCurrent || firstCurrent.status !== 'D' || Number(firstCurrent.startMin || 0) !== 0) return false;

  const previousDay = addDays(day, -1);
  const previousEvents = orderedCompleteEvents(rawStoredEventsForDay(eventsByDay || {}, previousDay));
  const lastPrevious = previousEvents.at(-1) || null;
  if (!lastPrevious || lastPrevious.status !== 'D') return false;

  // Accept a one-minute whole-minute storage artifact at the boundary.
  return Number(lastPrevious.endMin || 0) >= 1439;
}

export function previousDayForDrivingContinuation(day = '') {
  return day ? addDays(day, -1) : '';
}
