import { rawStoredEventsForDay } from '../compliance/rawRodsChecks.js';
import { normalizeLogEvents } from './timelineEngine.js';

function clampMinute(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1440, Math.round(n)));
}

function cleanToken(value = '') {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .slice(0, 80) || 'event';
}

function activeManualDrivingState(state = {}, previousDay = '') {
  const session = state.manualDrivingSession || {};
  const sessionDay = String(session.startDay || session.activeDay || '');
  const sessionActive = session.active === true
    && session.status === 'D'
    && (!sessionDay || sessionDay === previousDay);
  const currentFlag = state.currentStatus === 'D';
  const dayContext = state.activeDay === previousDay || state.view === 'driveMode';
  return sessionActive || (currentFlag && dayContext);
}

function recertificationStatus(value = '', fallback = 'Active day / Not certified yet') {
  return value === 'Certified' ? 'Needs Recertification' : (value || fallback);
}

function updateLastDrivingToMidnight(previousEvents = [], lastDriving = null) {
  if (!lastDriving) return normalizeLogEvents(previousEvents);
  return normalizeLogEvents((previousEvents || []).map(event => (
    event.id === lastDriving.id
      ? {
        ...event,
        endMin:1440,
        crossMidnightContinues:true,
      }
      : event
  )));
}

export function buildManualDrivingMidnightBridge(lastDriving = {}, {
  currentDay = '',
  previousDay = '',
  endMin = 1,
} = {}) {
  const safeEnd = Math.max(1, clampMinute(endMin, 1));
  return {
    ...lastDriving,
    id:`manual_drive_rollover_${cleanToken(currentDay)}_${cleanToken(lastDriving.id)}`,
    status:'D',
    startMin:0,
    endMin:safeEnd,
    city:lastDriving.city || 'GPS',
    state:lastDriving.state || 'UNK',
    note:'Driving',
    description:'',
    source:'manual_drive_midnight_continuation',
    locationSource:lastDriving.locationSource || 'manual',
    carriedFromPreviousDay:false,
    syntheticCoverage:false,
    displayOnly:false,
    crossMidnightFromDay:previousDay,
    crossMidnightFromEventId:lastDriving.id || '',
    crossMidnightContinuation:true,
  };
}

/**
 * Split an already-manual DRIVING status safely at midnight.
 *
 * This function never overwrites current-day duty events. It only fills a real
 * uncovered 00:00 -> first-status-change gap, or creates the current day's
 * explicit DRIVING row while an active manual Driving session is still open.
 */
export function applyManualDrivingMidnightContinuity(state = {}, {
  currentDay = '',
  previousDay = '',
  nowMinute = 0,
  allowClosedGapRepair = true,
  forceActiveDriving = false,
  reason = 'midnight_manual_driving_continuity',
} = {}) {
  if (!state || !currentDay || !previousDay || currentDay === previousDay) return state;

  const previousEvents = rawStoredEventsForDay(state.eventsByDay || {}, previousDay);
  const currentEvents = rawStoredEventsForDay(state.eventsByDay || {}, currentDay);
  const lastPrevious = previousEvents[previousEvents.length - 1] || null;
  if (!lastPrevious || lastPrevious.status !== 'D') return state;

  const firstCurrent = currentEvents[0] || null;
  if (firstCurrent && clampMinute(firstCurrent.startMin, 0) <= 0) return state;

  const activeDriving = forceActiveDriving || activeManualDrivingState(state, previousDay);
  const closedGapNeedsDriving = allowClosedGapRepair
    && !!firstCurrent
    && clampMinute(firstCurrent.startMin, 0) > 0;

  if (!activeDriving && !closedGapNeedsDriving) return state;

  const requestedEnd = firstCurrent
    ? clampMinute(firstCurrent.startMin, 0)
    : clampMinute(nowMinute, 0);
  if (requestedEnd <= 0) return state;

  const bridge = buildManualDrivingMidnightBridge(lastPrevious, {
    currentDay,
    previousDay,
    endMin:requestedEnd,
  });

  // The bridge ends at/before the first current-day event and therefore cannot
  // cover or delete any event. normalizeLogEvents only merges touching D rows.
  const nextCurrent = normalizeLogEvents([bridge, ...currentEvents]);
  const bridgeInserted = nextCurrent.some(event => event.id === bridge.id)
    || nextCurrent.some(event => (
      event.status === 'D'
      && clampMinute(event.startMin, -1) === 0
      && clampMinute(event.endMin, 0) >= requestedEnd
    ));
  if (!bridgeInserted) return state;

  const nextPrevious = updateLastDrivingToMidnight(previousEvents, lastPrevious);
  const activeDay = activeDriving && state.activeDay === previousDay
    ? currentDay
    : state.activeDay;

  const previousCertify = recertificationStatus(
    state.certifyStatus?.[previousDay],
    'Needs signature',
  );
  const currentCertify = recertificationStatus(
    state.certifyStatus?.[currentDay],
    'Active day / Not certified yet',
  );
  const manualDrivingSession = activeDriving
    ? {
      ...(state.manualDrivingSession || {}),
      active:true,
      status:'D',
      eventId:bridge.id,
      startDay:currentDay,
      rolloverFromDay:previousDay,
      rolloverFromEventId:lastPrevious.id || '',
      rolloverAt:Date.now(),
    }
    : state.manualDrivingSession;

  return {
    ...state,
    activeDay,
    manualDrivingSession,
    eventsByDay:{
      ...(state.eventsByDay || {}),
      [previousDay]:nextPrevious,
      [currentDay]:nextCurrent,
    },
    certifyStatus:{
      ...(state.certifyStatus || {}),
      [previousDay]:previousCertify,
      [currentDay]:currentCertify,
    },
    manualMidnightContinuityBackupByDay:{
      ...(state.manualMidnightContinuityBackupByDay || {}),
      [currentDay]:state.manualMidnightContinuityBackupByDay?.[currentDay] || {
        previousDay,
        previousEvents:previousEvents.map(event => ({ ...event })),
        currentEvents:currentEvents.map(event => ({ ...event })),
        savedAt:Date.now(),
        reason,
      },
    },
    manualMidnightContinuityByDay:{
      ...(state.manualMidnightContinuityByDay || {}),
      [currentDay]:{
        previousDay,
        sourceEventId:lastPrevious.id || '',
        bridgeEventId:bridge.id,
        bridgeEndMin:requestedEnd,
        activeDriving,
        repairedClosedGap:closedGapNeedsDriving,
        appliedAt:Date.now(),
        reason,
      },
    },
  };
}
