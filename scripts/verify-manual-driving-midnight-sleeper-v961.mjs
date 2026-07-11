import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  applyManualDrivingMidnightContinuity,
} from '../source/src/core/timeline/manualDrivingContinuity.js';
import {
  applyUserConfirmedHubbardSleeperStopRepair,
  USER_CONFIRMED_STOP_REPAIR_VERSION,
} from '../source/src/core/timeline/userConfirmedStopRepair.js';
import { applyLiveStatusTransition } from '../source/src/core/timeline/liveDrivingSafety.js';
import { rawStoredEventsForDay } from '../source/src/core/compliance/rawRodsChecks.js';
import { displayEventsForDayFromState } from '../source/src/core/timeline/displayTimeline.js';

const previousDay = '2026-07-10';
const currentDay = '2026-07-11';

const previousEvents = [
  { id:'d1', status:'D', startMin:0, endMin:80, city:'Youngstown', state:'OH', note:'Driving' },
  { id:'sb1', status:'SB', startMin:80, endMin:680, city:'Cheshire', state:'CT', note:'Sleeper Berth' },
  { id:'on1', status:'ON', startMin:680, endMin:700, city:'Cheshire', state:'CT', note:'On Duty' },
  { id:'d2', status:'D', startMin:700, endMin:756, city:'Cheshire', state:'CT', note:'Driving started' },
  { id:'on2', status:'ON', startMin:756, endMin:780, city:'East Hartford', state:'CT', note:'Pickup / Loading' },
  // Live rows are intentionally short in raw storage. Their status remains in
  // force until the next status change / end of day.
  { id:'late_drive', status:'D', startMin:928, endMin:929, city:'Youngstown', state:'OH', note:'Driving started', source:'live_status' },
];

const activeState = {
  activeDay:previousDay,
  view:'driveMode',
  currentStatus:'D',
  currentReason:'Driving started',
  currentLocation:{ city:'Youngstown', state:'OH', locationSource:'manual' },
  manualDrivingSession:{ active:true, status:'D', eventId:'late_drive', startDay:previousDay },
  eventsByDay:{ [previousDay]:previousEvents, [currentDay]:[] },
  certifyStatus:{ [previousDay]:'Active day / Not certified yet' },
};

const rolled = applyManualDrivingMidnightContinuity(activeState, {
  previousDay,
  currentDay,
  nowMinute:51,
  forceActiveDriving:true,
  reason:'test_active_manual_drive',
});

const rolledPrevious = rawStoredEventsForDay(rolled.eventsByDay, previousDay);
const rolledCurrent = rawStoredEventsForDay(rolled.eventsByDay, currentDay);
assert.equal(rolledPrevious.at(-1)?.id, 'late_drive');
assert.equal(rolledPrevious.at(-1)?.endMin, 1440, 'previous-day Driving must close at midnight');
assert.equal(rolledCurrent.length, 1, 'new day must contain one explicit continuation row');
assert.equal(rolledCurrent[0].status, 'D');
assert.equal(rolledCurrent[0].startMin, 0);
assert.equal(rolledCurrent[0].endMin, 51);
assert.equal(rolledCurrent[0].city, 'Youngstown');
assert.equal(rolled.activeDay, currentDay);
assert.equal(Boolean(rolledCurrent[0].syntheticCoverage), false);
assert.equal(Boolean(rolledCurrent[0].displayOnly), false);

const withSleeper = applyLiveStatusTransition(rolledCurrent, {
  id:'live_sb_0051',
  status:'SB',
  startMin:51,
  endMin:52,
  city:'Hubbard',
  state:'OH',
  note:'Sleeper Berth',
  source:'live_status',
  locationSource:'gps',
});
assert.deepEqual(
  withSleeper.map(event => [event.status, event.startMin, event.endMin, event.city, event.state]),
  [
    ['D', 0, 51, 'Youngstown', 'OH'],
    ['SB', 51, 52, 'Hubbard', 'OH'],
  ],
  'leaving Driving after midnight must preserve the real 00:00–00:51 Driving segment',
);

const idempotent = applyManualDrivingMidnightContinuity(rolled, {
  previousDay,
  currentDay,
  nowMinute:55,
  forceActiveDriving:true,
});
assert.deepEqual(
  rawStoredEventsForDay(idempotent.eventsByDay, currentDay).map(event => [event.id, event.status, event.startMin, event.endMin]),
  rolledCurrent.map(event => [event.id, event.status, event.startMin, event.endMin]),
  'midnight rollover must be idempotent',
);

const alreadyCovered = {
  ...activeState,
  eventsByDay:{
    [previousDay]:previousEvents,
    [currentDay]:[
      { id:'real_off', status:'OFF', startMin:0, endMin:20, city:'Hubbard', state:'OH', note:'Off Duty' },
      { id:'real_sb', status:'SB', startMin:20, endMin:21, city:'Hubbard', state:'OH', note:'Sleeper Berth' },
    ],
  },
};
const untouched = applyManualDrivingMidnightContinuity(alreadyCovered, {
  previousDay,
  currentDay,
  nowMinute:51,
  forceActiveDriving:true,
});
assert.deepEqual(untouched.eventsByDay, alreadyCovered.eventsByDay, 'real current-day rows beginning at midnight must never be overwritten');

const reportedBadState = {
  activeDay:currentDay,
  view:'day',
  currentStatus:'SB',
  currentReason:'Sleeper Berth',
  currentLocation:{ city:'Youngstown', state:'OH' },
  eventsByDay:{
    [previousDay]:previousEvents,
    [currentDay]:[
      { id:'bad_sb', status:'SB', startMin:51, endMin:55, city:'Youngstown', state:'OH', note:'Sleeper Berth', source:'live_status' },
    ],
  },
  certifyStatus:{ [currentDay]:'Active day / Not certified yet' },
};

const repaired = applyUserConfirmedHubbardSleeperStopRepair(reportedBadState);
const repairedPrevious = rawStoredEventsForDay(repaired.eventsByDay, previousDay);
const repairedCurrent = rawStoredEventsForDay(repaired.eventsByDay, currentDay);
assert.equal(repairedPrevious.at(-1)?.endMin, 1440);
assert.deepEqual(
  repairedCurrent.map(event => [event.status, event.startMin, event.endMin, event.city, event.state]),
  [
    ['D', 0, 51, 'Youngstown', 'OH'],
    ['SB', 51, 55, 'Hubbard', 'OH'],
  ],
  'reported bad current day must repair to Driving then Sleeper in Hubbard',
);
assert.equal(repaired.currentStatus, 'SB');
assert.equal(repaired.currentLocation.city, 'Hubbard');
assert.equal(repaired.currentLocation.state, 'OH');
assert.equal(repaired.userConfirmedStopRepairs[currentDay].version, USER_CONFIRMED_STOP_REPAIR_VERSION);
assert.equal(repaired.userConfirmedStopRepairBackupByDay[currentDay].events[0].city, 'Youngstown');
const repairedDisplay = displayEventsForDayFromState(repaired.eventsByDay, currentDay, { nowMinute:55 });
assert.deepEqual(
  repairedDisplay.map(event => [event.status, event.startMin, event.endMin]),
  [['D', 0, 51], ['SB', 51, 55]],
  'the repaired graph must show Driving, never synthetic OFF, before the Sleeper change',
);

const repairedAgain = applyUserConfirmedHubbardSleeperStopRepair(repaired);
assert.deepEqual(
  repairedAgain.eventsByDay,
  repaired.eventsByDay,
  'one-time user-confirmed repair must be idempotent',
);

const unrelated = {
  ...reportedBadState,
  eventsByDay:{
    ...reportedBadState.eventsByDay,
    [currentDay]:[
      { id:'other_sb', status:'SB', startMin:75, endMin:80, city:'Warren', state:'OH', note:'Sleeper Berth' },
    ],
  },
};
assert.equal(
  applyUserConfirmedHubbardSleeperStopRepair(unrelated),
  unrelated,
  'unrelated days/events must remain untouched',
);

const appSource = fs.readFileSync('source/src/app/App.jsx', 'utf8');
const statusSource = fs.readFileSync('source/src/modules/status/StatusWorkflowSheet.jsx', 'utf8');
assert.match(appSource, /applyUserConfirmedHubbardSleeperStopRepair\(continuous\)/);
assert.match(appSource, /allowClosedGapRepair:false,\s*forceActiveDriving:recovered\.currentStatus === 'D'/s, 'startup must bridge only a genuinely active manual Driving status');
assert.match(appSource, /allowClosedGapRepair:false,\s*forceActiveDriving:s\.currentStatus === 'D'/s, 'live rollover must not infer Driving into unrelated closed gaps');
assert.match(appSource, /const base = rolloverActiveDrivingIfNeeded\(s, now\);/);
assert.match(appSource, /manualDrivingSession/);
assert.match(statusSource, /Getting current stop location/);
assert.match(statusSource, /const leavingDriving = state\.currentStatus === 'D' && next !== 'D'/);
assert.match(statusSource, /setLocationText\(''\)/);
assert.match(statusSource, /Add the current City, ST or tap Use GPS before saving/);

console.log('verify-manual-driving-midnight-sleeper-v961: passed');
