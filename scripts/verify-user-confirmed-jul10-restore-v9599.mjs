import assert from 'node:assert/strict';
import {
  applyUserConfirmedJul10TimelineRepair,
  buildUserConfirmedJul10Timeline,
  hasUserConfirmedJul10Timeline,
  looksLikeCollapsedJul10Timeline,
  USER_CONFIRMED_REPAIR_VERSION,
} from '../source/src/core/timeline/userConfirmedTimelineRepair.js';

assert.equal(USER_CONFIRMED_REPAIR_VERSION, '95.99.0');

const badState = {
  activeDay:'2026-07-10',
  currentStatus:'D',
  currentReason:'Driving',
  currentLocation:{ city:'East Hartford', state:'CT' },
  gpsTrip:{ eventId:'bad-drive', status:'active' },
  userConfirmedTimelineRepair:{ version:'95.98.0', status:'already_correct' },
  eventsByDay:{
    '2026-07-10':[
      { id:'artifact-off', status:'OFF', startMin:0, endMin:1, city:'East Hartford', state:'CT', note:'Carry-forward artifact' },
      { id:'bad-drive', status:'D', startMin:1, endMin:884, city:'East Hartford', state:'CT', note:'Driving', source:'manual' },
      { id:'artifact-1', status:'D', startMin:200, endMin:201, city:'East Hartford', state:'CT' },
      { id:'artifact-2', status:'ON', startMin:300, endMin:301, city:'East Hartford', state:'CT' },
      { id:'artifact-3', status:'D', startMin:400, endMin:401, city:'East Hartford', state:'CT' },
      { id:'artifact-4', status:'ON', startMin:500, endMin:501, city:'East Hartford', state:'CT' },
    ],
  },
  certifyStatus:{ '2026-07-10':'Active day / Not certified yet' },
};

assert.equal(looksLikeCollapsedJul10Timeline(badState.eventsByDay['2026-07-10']), false, 'legacy narrow detector should miss this extra-fragment shape');
const fixed = applyUserConfirmedJul10TimelineRepair(badState, { day:'2026-07-10', nowMinute:884, force:true });
const events = fixed.eventsByDay['2026-07-10'];
assert.equal(events.length, 5);
assert.deepEqual(events.map(event => event.status), ['D','SB','ON','D','ON']);
assert.deepEqual(events.map(event => event.startMin), [0,80,680,700,756]);
assert.deepEqual(events.map(event => event.endMin), [80,680,700,756,884]);
assert.equal(events[0].city, 'Youngstown');
assert.equal(events[1].city, 'Cheshire');
assert.equal(events[4].city, 'East Hartford');
assert.equal(events[4].note, 'Pickup / Loading');
assert.equal(fixed.currentStatus, 'ON');
assert.equal(fixed.currentReason, 'Pickup / Loading');
assert.equal(fixed.view, 'day');
assert.equal(fixed.gpsTrip, null);
assert.equal(fixed.userConfirmedTimelineRepair.status, 'forced_restored');
assert.equal(fixed.dutyRepairBackupByDay['2026-07-10'].events.length, 5);
assert.equal(fixed.dutySafetyBackupByDay['2026-07-10'].events.length, 5);
assert.equal(hasUserConfirmedJul10Timeline(events), true);

const second = applyUserConfirmedJul10TimelineRepair(fixed, { day:'2026-07-10', nowMinute:900, force:true });
assert.equal(second, fixed, 'already-correct v95.99 state must not be rewritten');

const normal = {
  eventsByDay:{ '2026-07-10':buildUserConfirmedJul10Timeline(884) },
};
const normalResult = applyUserConfirmedJul10TimelineRepair(normal, { day:'2026-07-10', nowMinute:900, force:true });
assert.equal(normalResult.userConfirmedTimelineRepair.status, 'already_correct');
assert.deepEqual(normalResult.eventsByDay['2026-07-10'], normal.eventsByDay['2026-07-10']);

const unrelated = {
  eventsByDay:{
    '2026-07-10':[
      { id:'off', status:'OFF', startMin:0, endMin:700, city:'Chicago', state:'IL', note:'Off Duty' },
      { id:'on', status:'ON', startMin:700, endMin:884, city:'Chicago', state:'IL', note:'On Duty' },
    ],
  },
};
const forcedUnrelated = applyUserConfirmedJul10TimelineRepair(unrelated, { day:'2026-07-10', nowMinute:884, force:true });
assert.equal(hasUserConfirmedJul10Timeline(forcedUnrelated.eventsByDay['2026-07-10']), true, 'explicit user-confirmed repair must replace any wrong Jul 10 shape');
assert.equal(applyUserConfirmedJul10TimelineRepair(unrelated, { day:'2026-07-11', nowMinute:884, force:true }), unrelated);

console.log('verify-user-confirmed-jul10-restore-v9599: passed');
