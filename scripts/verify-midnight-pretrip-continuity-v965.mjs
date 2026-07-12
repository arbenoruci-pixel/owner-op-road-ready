import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isDrivingContinuationFromPreviousDay } from '../source/src/core/compliance/preTripContinuity.js';
import { validateLogForSigning } from '../source/src/modules/logbook/signing.js';
import { buildDotOfficerCheck } from '../source/src/core/dot/dotOfficerCheckEngine.js';

const previousDay = '2026-07-09';
const day = '2026-07-10';

function baseState({
  previousStatus = 'D',
  previousEnd = 1440,
  previousNote = 'Driving',
  currentStatus = 'D',
  currentStart = 0,
  currentMeta = {},
} = {}) {
  return {
    activeDay:day,
    eventsByDay:{
      [previousDay]:[
        { id:'prev_off', status:'OFF', startMin:0, endMin:900, city:'Toledo', state:'OH', note:'Off Duty' },
        { id:'prev_tail', status:previousStatus, startMin:900, endMin:previousEnd, city:'Youngstown', state:'OH', note:previousNote },
      ],
      [day]:[
        { id:'current_drive', status:currentStatus, startMin:currentStart, endMin:80, city:'Youngstown', state:'OH', note:'Driving', ...currentMeta },
        { id:'current_sb', status:'SB', startMin:80, endMin:1440, city:'Cheshire', state:'CT', note:'Sleeper Berth' },
      ],
    },
    inspectionByDay:{ [day]:{ complete:true } },
    signatureByDay:{},
    certifyStatus:{ [day]:'Needs signature' },
    manualMilesByDay:{ [day]:100 },
    routeLegsByDay:{},
    loadInfo:{},
    driverProfile:{ name:'Arben Oruci' },
    carrierName:'Narta Express LLC',
    mainOfficeAddress:'Willowbrook, IL',
    driver:{ truck:'228' },
    currentLocation:{ city:'Cheshire', state:'CT' },
  };
}

function assertNoPreTripIssue(state, label) {
  assert.equal(isDrivingContinuationFromPreviousDay(state.eventsByDay, day), true, `${label}: continuity helper`);
  assert.ok(!validateLogForSigning(state, day).some(issue => String(issue.code).includes('missing_pretrip_event')), `${label}: signing`);
  assert.ok(!buildDotOfficerCheck(state, day).issues.some(issue => String(issue.id).includes('missing_pretrip_event')), `${label}: DOT check`);
}

assertNoPreTripIssue(baseState(), 'exact 24:00 -> 00:00');
assertNoPreTripIssue(baseState({ previousEnd:1439 }), 'whole-minute 23:59 -> 00:00 rounding');
assertNoPreTripIssue(baseState({
  previousEnd:1438,
  currentStart:1,
  currentMeta:{ source:'manual_drive_midnight_continuation', crossMidnightContinuation:true, crossMidnightFromDay:previousDay },
}), 'explicit rollover metadata with small persisted boundary gap');
assertNoPreTripIssue(baseState({ previousStatus:'ON', previousEnd:1440, previousNote:'Fuel' }), 'connected ON DUTY boundary at midnight');
assertNoPreTripIssue(baseState({ currentStatus:'DRIVING' }), 'legacy full-word DRIVING status');

const previousRest = baseState({ previousStatus:'OFF', previousEnd:1440, previousNote:'Off Duty' });
assert.equal(isDrivingContinuationFromPreviousDay(previousRest.eventsByDay, day), false, 'previous OFF is a new driving start');
assert.ok(validateLogForSigning(previousRest, day).some(issue => String(issue.code).includes('missing_pretrip_event')), 'previous OFF keeps normal review');

const realGap = baseState({ previousEnd:1430, currentStart:5 });
assert.equal(isDrivingContinuationFromPreviousDay(realGap.eventsByDay, day), false, 'real untagged gap is not auto-classified as continuous');

const syntheticBeforeDrive = baseState();
syntheticBeforeDrive.eventsByDay[day].unshift({
  id:'display_only', status:'OFF', startMin:0, endMin:1, city:'Youngstown', state:'OH', note:'Carry-over', displayOnly:true, source:'display',
});
assertNoPreTripIssue(syntheticBeforeDrive, 'display-only placeholder is ignored');

const app = fs.readFileSync(new URL('../source/src/app/App.jsx', import.meta.url), 'utf8');
assert.match(app, /isDrivingContinuationFromPreviousDay[\s\S]*No new pre-trip event is added at 12:00 AM/, 'manual fix action remains guarded');

console.log('verify-midnight-pretrip-continuity-v965 passed');
