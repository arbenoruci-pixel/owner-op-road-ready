import { addDays } from '../../shared/utils/date.js';
import { rawStoredEventsForDay } from '../compliance/rawRodsChecks.js';
import { normalizeLogEvents } from './timelineEngine.js';
import { applyManualDrivingMidnightContinuity } from './manualDrivingContinuity.js';

export const USER_CONFIRMED_STOP_REPAIR_VERSION = '96.1.0';

function normalizedCity(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/,?\s+[a-z]{2}$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sameText(a = '', b = '') {
  return normalizedCity(a) === normalizedCity(b);
}

function sameState(a = '', b = '') {
  return String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();
}

function candidateDays(state = {}) {
  return Object.keys(state.eventsByDay || {}).sort().reverse();
}

function findReportedSleeperStop(state = {}) {
  for (const day of candidateDays(state)) {
    const current = rawStoredEventsForDay(state.eventsByDay || {}, day);
    const target = current.find(event => (
      event.status === 'SB'
      && Number(event.startMin) >= 50
      && Number(event.startMin) <= 52
      && sameText(event.city, 'Youngstown')
      && sameState(event.state, 'OH')
      && /sleeper|rest/i.test(`${event.note || ''} ${event.description || ''}`)
    ));
    if (!target) continue;

    const previousDay = addDays(day, -1);
    const previous = rawStoredEventsForDay(state.eventsByDay || {}, previousDay);
    const lastPrevious = previous[previous.length - 1] || null;
    if (!lastPrevious || lastPrevious.status !== 'D') continue;

    return { day, previousDay, target, current };
  }
  return null;
}

/**
 * One-time data correction for the driver-confirmed stop shown in the supplied
 * screenshot: the 12:51 AM Sleeper change happened in Hubbard, OH, while the
 * saved row incorrectly reused the Driving start location (Youngstown, OH).
 * The match is intentionally exact and leaves every other event untouched.
 */
export function applyUserConfirmedHubbardSleeperStopRepair(state = {}) {
  const match = findReportedSleeperStop(state);
  if (!match) return state;

  const priorMarker = state.userConfirmedStopRepairs?.[match.day];
  if (priorMarker?.version === USER_CONFIRMED_STOP_REPAIR_VERSION) return state;

  const continuity = applyManualDrivingMidnightContinuity(state, {
    currentDay:match.day,
    previousDay:match.previousDay,
    nowMinute:Number(match.target.startMin || 0),
    allowClosedGapRepair:true,
    forceActiveDriving:false,
    reason:'user_confirmed_hubbard_sleeper_stop',
  });

  const before = rawStoredEventsForDay(continuity.eventsByDay || {}, match.day);
  const repaired = normalizeLogEvents(before.map(event => (
    event.id === match.target.id
      ? {
        ...event,
        city:'Hubbard',
        state:'OH',
        lat:null,
        lng:null,
        gpsAccuracy:null,
        locationSource:'user_confirmed',
        correctedStopLocation:true,
        correctedStopLocationAt:Date.now(),
      }
      : event
  )));

  const targetIsLatest = repaired[repaired.length - 1]?.id === match.target.id;
  const currentStatus = targetIsLatest ? 'SB' : continuity.currentStatus;
  const currentReason = targetIsLatest
    ? (match.target.note || match.target.description || 'Sleeper Berth')
    : continuity.currentReason;
  const currentLocation = targetIsLatest
    ? {
      city:'Hubbard',
      state:'OH',
      lat:null,
      lng:null,
      gpsAccuracy:null,
      locationSource:'user_confirmed',
    }
    : continuity.currentLocation;
  const manualDrivingSession = targetIsLatest && continuity.manualDrivingSession
    ? {
      ...continuity.manualDrivingSession,
      active:false,
      endedDay:match.day,
      endedMin:Number(match.target.startMin || 0),
      endedByStatus:'SB',
      endedAt:new Date().toISOString(),
    }
    : continuity.manualDrivingSession;
  const gpsTrip = continuity.gpsTrip?.status === 'active'
    ? {
      ...continuity.gpsTrip,
      status:'stale',
      staleReason:'user_confirmed_hubbard_sleeper_stop',
      staleAt:Date.now(),
    }
    : continuity.gpsTrip;

  return {
    ...continuity,
    eventsByDay:{ ...(continuity.eventsByDay || {}), [match.day]:repaired },
    currentStatus,
    currentReason,
    currentLocation,
    manualDrivingSession,
    gpsTrip,
    certifyStatus:{
      ...(continuity.certifyStatus || {}),
      [match.day]:continuity.certifyStatus?.[match.day] === 'Certified'
        ? 'Needs Recertification'
        : (continuity.certifyStatus?.[match.day] || 'Active day / Not certified yet'),
    },
    userConfirmedStopRepairBackupByDay:{
      ...(continuity.userConfirmedStopRepairBackupByDay || {}),
      [match.day]:{
        events:match.current.map(event => ({ ...event })),
        savedAt:Date.now(),
        reason:'before_user_confirmed_hubbard_sleeper_stop_v961',
      },
    },
    userConfirmedStopRepairs:{
      ...(continuity.userConfirmedStopRepairs || {}),
      [match.day]:{
        version:USER_CONFIRMED_STOP_REPAIR_VERSION,
        eventId:match.target.id,
        startMin:Number(match.target.startMin || 0),
        from:'Youngstown, OH',
        to:'Hubbard, OH',
        repairedAt:Date.now(),
      },
    },
  };
}
