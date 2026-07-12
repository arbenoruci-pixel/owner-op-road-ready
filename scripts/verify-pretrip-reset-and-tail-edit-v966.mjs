import assert from 'node:assert/strict';
import fs from 'node:fs';
import { displayEventsForDay } from '../source/src/core/timeline/displayTimeline.js';
import {
  isDrivingContinuationFromPreviousDay,
  preTripRequirementForDrivingStart,
} from '../source/src/core/compliance/preTripContinuity.js';

const day = '2026-07-12';
const previousDay = '2026-07-11';

const midnightContinuation = {
  [previousDay]:[
    { id:'prev_d', status:'D', startMin:1000, endMin:1440, city:'Wayne', state:'IN', note:'Driving' },
  ],
  [day]:[
    { id:'today_d', status:'D', startMin:0, endMin:5, city:'Wayne', state:'IN', note:'Driving' },
  ],
};
assert.equal(
  isDrivingContinuationFromPreviousDay(midnightContinuation, day),
  true,
  'midnight does not create a new pre-trip requirement'
);

const shortRest = {
  [day]:[
    { id:'off', status:'OFF', startMin:0, endMin:599, city:'Frankfort', state:'IN', note:'Off Duty' },
    { id:'drive', status:'D', startMin:599, endMin:700, city:'Frankfort', state:'IN', note:'Driving' },
  ],
};
assert.equal(
  preTripRequirementForDrivingStart(shortRest, day).required,
  false,
  '9h59 rest does not trigger the app pre-trip gate'
);

const exactTenHourRest = {
  [day]:[
    { id:'off', status:'OFF', startMin:0, endMin:300, city:'Frankfort', state:'IN', note:'Off Duty' },
    { id:'sb', status:'SB', startMin:300, endMin:600, city:'Frankfort', state:'IN', note:'Sleeper Berth' },
    { id:'drive', status:'D', startMin:600, endMin:700, city:'Frankfort', state:'IN', note:'Driving' },
  ],
};
const tenHourMissing = preTripRequirementForDrivingStart(exactTenHourRest, day);
assert.equal(tenHourMissing.required, true, 'combined OFF/SB 10h reset requires pre-trip');
assert.equal(tenHourMissing.satisfied, false, 'missing pre-trip remains unsatisfied');
assert.equal(tenHourMissing.restMinutes, 600);

const tenHourWithPreTrip = {
  [day]:[
    { id:'off', status:'OFF', startMin:0, endMin:600, city:'Frankfort', state:'IN', note:'Off Duty' },
    { id:'pretrip', status:'ON', startMin:600, endMin:615, city:'Frankfort', state:'IN', note:'Pre-trip inspection' },
    { id:'drive', status:'D', startMin:615, endMin:700, city:'Frankfort', state:'IN', note:'Driving' },
  ],
};
const tenHourSatisfied = preTripRequirementForDrivingStart(tenHourWithPreTrip, day);
assert.equal(tenHourSatisfied.required, true);
assert.equal(tenHourSatisfied.satisfied, true, 'ON DUTY pre-trip satisfies the 10h reset gate');
assert.equal(isDrivingContinuationFromPreviousDay(tenHourWithPreTrip, day), true);

const candidateNow = {
  [day]:[
    { id:'sb_live', status:'SB', startMin:0, endMin:1, city:'Frankfort', state:'IN', note:'Sleeper Berth', source:'status_workflow' },
  ],
};
const candidateRequirement = preTripRequirementForDrivingStart(candidateNow, day, null, 600);
assert.equal(candidateRequirement.required, true, 'live OFF/SB stub is extended only for the 10h candidate-start calculation');
assert.equal(candidateRequirement.restMinutes, 600);

const lockedDisplay = displayEventsForDay([
  { id:'sb', status:'SB', startMin:100, endMin:237, city:'Frankfort', state:'IN', note:'Sleeper Berth', manualEndLocked:true },
], true, { nowMinute:633 });
assert.equal(lockedDisplay.at(-1).endMin, 237, 'explicitly edited end remains 3:57 AM and is not repainted to now');

const editedDisplayWithoutLegacyFlag = displayEventsForDay([
  { id:'sb', status:'SB', startMin:100, endMin:237, city:'Frankfort', state:'IN', note:'Sleeper Berth', source:'manual' },
], true, { nowMinute:633 });
assert.equal(editedDisplayWithoutLegacyFlag.at(-1).endMin, 237, 'substantial raw end time is respected even before the new flag exists');

const liveDisplay = displayEventsForDay([
  { id:'sb_live', status:'SB', startMin:100, endMin:101, city:'Frankfort', state:'IN', note:'Sleeper Berth', source:'status_workflow' },
], true, { nowMinute:633 });
assert.equal(liveDisplay.at(-1).endMin, 633, 'one-minute live status stub still extends to the current minute');

const editorSource = fs.readFileSync(new URL('../source/src/modules/editor/EditEventSheet.jsx', import.meta.url), 'utf8');
assert.match(editorSource, /manualEndLocked/, 'Edit Event marks an explicit saved end');

const statusSource = fs.readFileSync(new URL('../source/src/modules/status/StatusWorkflowSheet.jsx', import.meta.url), 'utf8');
assert.match(statusSource, /10h or more OFF\/SB reset completed/, 'Start Driving is blocked after a 10h reset until pre-trip is added');
assert.match(statusSource, /preTripRequirementForDrivingStart/, 'Status workflow uses the shared 10h pre-trip rule');

console.log('verify-pretrip-reset-and-tail-edit-v966 passed');
