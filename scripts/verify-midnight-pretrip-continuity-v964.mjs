import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isDrivingContinuationFromPreviousDay } from '../source/src/core/compliance/preTripContinuity.js';
import { validateLogForSigning } from '../source/src/modules/logbook/signing.js';
import { buildDotOfficerCheck } from '../source/src/core/dot/dotOfficerCheckEngine.js';

const previousDay = '2026-07-09';
const day = '2026-07-10';

function baseState(previousLast, currentFirstStart = 0) {
  return {
    activeDay:day,
    eventsByDay:{
      [previousDay]:[
        { id:'prev_off', status:'OFF', startMin:0, endMin:900, city:'Toledo', state:'OH', note:'Off Duty' },
        { id:'prev_drive', status:previousLast, startMin:900, endMin:1440, city:'Youngstown', state:'OH', note:'Driving' },
      ],
      [day]:[
        { id:'current_drive', status:'D', startMin:currentFirstStart, endMin:80, city:'Youngstown', state:'OH', note:'Driving' },
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

const continuous = baseState('D', 0);
assert.equal(isDrivingContinuationFromPreviousDay(continuous.eventsByDay, day), true, 'exact D 24:00 -> D 00:00 is continuous driving');
assert.ok(!validateLogForSigning(continuous, day).some(issue => String(issue.code).includes('missing_pretrip_event')), 'signing does not request a new pre-trip at midnight');
assert.ok(!buildDotOfficerCheck(continuous, day).issues.some(issue => String(issue.id).includes('missing_pretrip_event')), 'DOT check does not request a new pre-trip at midnight');

const stoppedBeforeMidnight = baseState('OFF', 0);
assert.equal(isDrivingContinuationFromPreviousDay(stoppedBeforeMidnight.eventsByDay, day), false, 'previous OFF is not continuous driving');
assert.ok(validateLogForSigning(stoppedBeforeMidnight, day).some(issue => String(issue.code).includes('missing_pretrip_event')), 'normal first driving still gets pre-trip review');
assert.ok(buildDotOfficerCheck(stoppedBeforeMidnight, day).issues.some(issue => String(issue.id).includes('missing_pretrip_event')), 'DOT check keeps true pre-trip review');

const startsAfterMidnight = baseState('D', 1);
assert.equal(isDrivingContinuationFromPreviousDay(startsAfterMidnight.eventsByDay, day), false, 'a current D row starting after 00:00 is not the same midnight continuation');

const app = fs.readFileSync(new URL('../source/src/app/App.jsx', import.meta.url), 'utf8');
assert.match(app, /isDrivingContinuationFromPreviousDay[\s\S]*No new pre-trip event is added at 12:00 AM/, 'manual fix action is guarded against false midnight pre-trip insertion');

console.log('verify-midnight-pretrip-continuity-v964 passed');
