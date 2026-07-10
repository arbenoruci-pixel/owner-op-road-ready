import { normalizeLogEvents } from './timelineEngine.js';

export const USER_CONFIRMED_REPAIR_DAY = '2026-07-10';
export const USER_CONFIRMED_REPAIR_VERSION = '95.99.0';

function minute(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1440, Math.round(n)));
}

function rawEventsForDay(state = {}, day = USER_CONFIRMED_REPAIR_DAY) {
  return normalizeLogEvents((state?.eventsByDay?.[day] || [])
    .filter(Boolean)
    .filter(event => !event.voided)
    .map(event => ({ ...event })));
}

function eventMatches(event, status, startMin, city = '', stateCode = '') {
  if (!event) return false;
  if (event.status !== status) return false;
  if (minute(event.startMin, -1) !== startMin) return false;
  if (city && String(event.city || '').trim().toLowerCase() !== city.toLowerCase()) return false;
  if (stateCode && String(event.state || '').trim().toUpperCase() !== stateCode.toUpperCase()) return false;
  return true;
}

export function hasUserConfirmedJul10Timeline(events = []) {
  const ordered = normalizeLogEvents(events || []);
  if (ordered.length < 5) return false;
  return eventMatches(ordered[0], 'D', 0, 'Youngstown', 'OH')
    && eventMatches(ordered[1], 'SB', 80, 'Cheshire', 'CT')
    && eventMatches(ordered[2], 'ON', 680, 'Cheshire', 'CT')
    && eventMatches(ordered[3], 'D', 700, 'Cheshire', 'CT')
    && eventMatches(ordered[4], 'ON', 756, 'East Hartford', 'CT');
}

export function looksLikeCollapsedJul10Timeline(events = []) {
  const ordered = normalizeLogEvents(events || []);
  if (!ordered.length) return false;
  if (hasUserConfirmedJul10Timeline(ordered)) return false;

  const first = ordered[0];
  const broadMidnightDrive = first.status === 'D'
    && minute(first.startMin, 0) <= 1
    && minute(first.endMin, 0) >= 756;
  const expectedSleeperMissing = !ordered.some(event => (
    event.status === 'SB'
    && minute(event.startMin, -1) === 80
    && minute(event.endMin, -1) >= 680
  ));
  const dayMostlyDriving = ordered
    .filter(event => event.status === 'D')
    .reduce((total, event) => total + Math.max(0, minute(event.endMin) - minute(event.startMin)), 0) >= 700;

  return broadMidnightDrive && expectedSleeperMissing && (ordered.length <= 4 || dayMostlyDriving);
}

export function buildUserConfirmedJul10Timeline(nowMinute = 757) {
  const tailEnd = Math.max(757, minute(nowMinute, 757));
  return normalizeLogEvents([
    {
      id:'repair_20260710_drive_0000',
      status:'D',
      startMin:0,
      endMin:80,
      city:'Youngstown',
      state:'OH',
      note:'Driving',
      description:'',
      source:'user_confirmed_screenshot_restore',
      locationSource:'manual',
    },
    {
      id:'repair_20260710_sleeper_0120',
      status:'SB',
      startMin:80,
      endMin:680,
      city:'Cheshire',
      state:'CT',
      note:'Sleeper Berth',
      description:'',
      source:'user_confirmed_screenshot_restore',
      locationSource:'manual',
    },
    {
      id:'repair_20260710_on_1120',
      status:'ON',
      startMin:680,
      endMin:700,
      city:'Cheshire',
      state:'CT',
      note:'ON DUTY',
      description:'',
      source:'user_confirmed_screenshot_restore',
      locationSource:'manual',
    },
    {
      id:'repair_20260710_drive_1140',
      status:'D',
      startMin:700,
      endMin:756,
      city:'Cheshire',
      state:'CT',
      note:'Driving started',
      description:'',
      source:'user_confirmed_screenshot_restore',
      locationSource:'manual',
    },
    {
      id:'repair_20260710_on_1236',
      status:'ON',
      startMin:756,
      endMin:tailEnd,
      city:'East Hartford',
      state:'CT',
      note:'Pickup / Loading',
      description:'',
      source:'user_confirmed_screenshot_restore',
      locationSource:'manual',
    },
  ]);
}

export function applyUserConfirmedJul10TimelineRepair(state = {}, {
  day = USER_CONFIRMED_REPAIR_DAY,
  nowMinute = 757,
  force = true,
} = {}) {
  if (!state || day !== USER_CONFIRMED_REPAIR_DAY) return state;

  const current = rawEventsForDay(state, day);
  const alreadyCorrect = hasUserConfirmedJul10Timeline(current);
  const alreadyMarked = state?.userConfirmedTimelineRepair?.version === USER_CONFIRMED_REPAIR_VERSION;

  if (alreadyCorrect) {
    if (alreadyMarked) return state;
    return {
      ...state,
      userConfirmedTimelineRepair:{
        version:USER_CONFIRMED_REPAIR_VERSION,
        day,
        status:'already_correct',
        checkedAt:Date.now(),
      },
    };
  }

  // v95.99 is an explicit user-requested data repair for Jul 10. The earlier
  // v95.98 migration only ran when the current rows matched one narrow
  // corruption signature. Recovery history can leave extra fragments, and a
  // previous migration marker can survive even after a stale GPS write. For
  // this one confirmed day, restore the screenshot-confirmed timeline
  // regardless of the current row shape.
  if (!force && !looksLikeCollapsedJul10Timeline(current)) return state;

  const restored = buildUserConfirmedJul10Timeline(nowMinute);
  const last = restored[restored.length - 1];
  return {
    ...state,
    activeDay:day,
    view:'day',
    selectedEventId:null,
    selectedIds:[],
    selectMode:false,
    sheet:null,
    gpsPanelOpen:false,
    eventsByDay:{ ...(state.eventsByDay || {}), [day]:restored },
    certifyStatus:{ ...(state.certifyStatus || {}), [day]:'Active day / Not certified yet' },
    currentStatus:'ON',
    currentReason:'Pickup / Loading',
    currentLocation:{ city:'East Hartford', state:'CT', locationSource:'manual' },
    // Fully detach the stale live-driving session. Keeping the old gpsTrip
    // object, even as "stale", allowed older lifecycle code to write the
    // midnight Driving event back over the repaired rows.
    gpsTrip:null,
    dutySafetyBackupByDay:{
      ...(state.dutySafetyBackupByDay || {}),
      [day]:{
        events:current,
        createdAt:Date.now(),
        reason:'before_forced_user_confirmed_screenshot_restore_v9599',
      },
    },
    dutyRepairBackupByDay:{
      ...(state.dutyRepairBackupByDay || {}),
      [day]:{
        events:current,
        createdAt:Date.now(),
        reason:'before_forced_user_confirmed_screenshot_restore_v9599',
      },
    },
    userConfirmedTimelineRepair:{
      version:USER_CONFIRMED_REPAIR_VERSION,
      day,
      status:'forced_restored',
      restoredAt:Date.now(),
      restoredEventCount:restored.length,
      priorEventCount:current.length,
      finalEventId:last?.id || '',
    },
  };
}
