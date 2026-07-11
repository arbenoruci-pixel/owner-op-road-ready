import { addDays } from '../../shared/utils/date.js';
import { rawStoredEventsForDay } from './rawRodsChecks.js';

function orderedCompleteEvents(events = []) {
  return [...(events || [])]
    .filter(Boolean)
    .filter(event => Number(event.endMin || 0) > Number(event.startMin || 0))
    .sort((a, b) => Number(a.startMin || 0) - Number(b.startMin || 0) || Number(a.endMin || 0) - Number(b.endMin || 0));
}

/**
 * A calendar-day split at midnight does not create a new driving start.
 * This helper recognizes the exact manual-RODS boundary where the previous
 * log day ends in DRIVING at 24:00 and the current day begins in DRIVING at
 * 00:00. Only that exact continuous boundary suppresses the app's
 * "pre-trip before first driving" fix card.
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

  return Number(lastPrevious.endMin || 0) >= 1440;
}

export function previousDayForDrivingContinuation(day = '') {
  return day ? addDays(day, -1) : '';
}
