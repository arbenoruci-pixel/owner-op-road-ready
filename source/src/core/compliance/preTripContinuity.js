import { addDays } from '../../shared/utils/date.js';
import { rawStoredEventsForDay } from './rawRodsChecks.js';

const MIDNIGHT_BOUNDARY_TOLERANCE_MIN = 2;
const EXPLICIT_CONTINUATION_TOLERANCE_MIN = 5;

function statusCode(event = {}) {
  const value = String(event?.status || '').trim().toUpperCase();
  if (value === 'DRIVING') return 'D';
  if (value === 'ON DUTY' || value === 'ON_DUTY') return 'ON';
  if (value === 'OFF DUTY' || value === 'OFF_DUTY') return 'OFF';
  if (value === 'SLEEPER' || value === 'SLEEPER BERTH') return 'SB';
  return value;
}

function minute(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1440, Math.round(n)));
}

function isDisplayOnlyEvent(event = {}) {
  return !!event.syntheticCoverage
    || !!event.carriedFromPreviousDay
    || !!event.displayOnly
    || !!event.synthetic
    || !!event.continuityGenerated
    || /^(carryover|timeline_continuity|display|display_timeline)$/i.test(String(event.source || '').trim());
}

function orderedCompleteEvents(events = []) {
  return [...(events || [])]
    .filter(Boolean)
    .filter(event => !isDisplayOnlyEvent(event))
    .filter(event => minute(event.endMin, 0) > minute(event.startMin, 0))
    .sort((a, b) => minute(a.startMin, 0) - minute(b.startMin, 0) || minute(a.endMin, 0) - minute(b.endMin, 0));
}

function hasExplicitMidnightContinuation(event = {}, previousDay = '') {
  const source = String(event.source || '').toLowerCase();
  const linkedDay = String(event.crossMidnightFromDay || event.rolloverFromDay || '');
  return event.crossMidnightContinuation === true
    || event.crossMidnightContinues === true
    || (linkedDay && linkedDay === previousDay)
    || /manual_drive_midnight_continuation|gps_drive_rollover|driving_rollover|midnight.*continuation/.test(source);
}

function isConnectedOnDutyBoundary(event = {}) {
  if (statusCode(event) !== 'ON') return false;
  return /pre[- ]?trip|inspection|fuel|pickup|loading|delivery|unloading|drop|hook/i.test(`${event.note || ''} ${event.description || ''}`);
}

function boundaryGapMinutes(previousEvent = {}, currentEvent = {}) {
  const previousEnd = minute(previousEvent.endMin, 0);
  const currentStart = minute(currentEvent.startMin, 0);
  return Math.max(0, 1440 - previousEnd) + currentStart;
}

/**
 * A calendar-day split at midnight does not create a new driving start.
 *
 * Manual RODS and restored data can represent the same midnight boundary as
 * 24:00 -> 00:00, 23:59 -> 00:00, or with explicit rollover metadata. This
 * helper accepts those evidence-backed representations while still refusing a
 * previous OFF/SB rest boundary or a real gap after midnight. It never edits
 * the driver's log; it only prevents the false "new pre-trip at midnight"
 * review/fix card.
 */
export function isDrivingContinuationFromPreviousDay(eventsByDay = {}, day = '', currentEventsOverride = null) {
  if (!day) return false;

  const currentEvents = orderedCompleteEvents(
    Array.isArray(currentEventsOverride)
      ? currentEventsOverride
      : rawStoredEventsForDay(eventsByDay || {}, day)
  );
  const firstCurrent = currentEvents[0] || null;
  if (!firstCurrent || statusCode(firstCurrent) !== 'D') return false;

  const previousDay = addDays(day, -1);
  const previousEvents = orderedCompleteEvents(rawStoredEventsForDay(eventsByDay || {}, previousDay));
  const lastPrevious = previousEvents.at(-1) || null;
  if (!lastPrevious) return false;

  const currentStart = minute(firstCurrent.startMin, 0);
  const explicitContinuation = hasExplicitMidnightContinuation(firstCurrent, previousDay)
    || hasExplicitMidnightContinuation(lastPrevious, previousDay);
  const maxCurrentStart = explicitContinuation
    ? EXPLICIT_CONTINUATION_TOLERANCE_MIN
    : MIDNIGHT_BOUNDARY_TOLERANCE_MIN;
  if (currentStart > maxCurrentStart) return false;

  const gap = boundaryGapMinutes(lastPrevious, firstCurrent);
  const previousStatus = statusCode(lastPrevious);

  if (previousStatus === 'D') {
    return gap <= (explicitContinuation
      ? EXPLICIT_CONTINUATION_TOLERANCE_MIN
      : MIDNIGHT_BOUNDARY_TOLERANCE_MIN);
  }

  // A one-minute ON DUTY boundary such as Fuel or Pickup immediately before
  // midnight is still the same duty tour. Do not invent a second pre-trip at
  // 00:00 when Driving resumes at the day split.
  if (isConnectedOnDutyBoundary(lastPrevious)) {
    return gap <= MIDNIGHT_BOUNDARY_TOLERANCE_MIN;
  }

  return false;
}

export function previousDayForDrivingContinuation(day = '') {
  return day ? addDays(day, -1) : '';
}
