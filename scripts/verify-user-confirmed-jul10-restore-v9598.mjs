import assert from 'node:assert/strict';
import {
  applyUserConfirmedJul10TimelineRepair,
  buildUserConfirmedJul10Timeline,
  hasUserConfirmedJul10Timeline,
  looksLikeCollapsedJul10Timeline,
} from '../source/src/core/timeline/userConfirmedTimelineRepair.js';

const badState = {
  activeDay:'2026-07-10',
  currentStatus:'D',
  currentReason:'Driving',
  currentLocation:{ city:'East Hartford', state:'CT' },
  gpsTrip:{ eventId:'bad-drive', status:'active' },
  eventsByDay:{
    '2026-07-10':[
      { id:'bad-drive', status:'D', startMin:0, endMin:884, city:'East Hartford', state:'CT', note:'Driving', source:'manual' },
    ],
  },
  certifyStatus:{ '2026-07-10':'Active day / Not certified yet' },
};

assert.equal(looksLikeCollapsedJul10Timeline(badState.eventsByDay['2026-07-10']), true);
const fixed = applyUserConfirmedJul10TimelineRepair(badState, { day:'2026-07-10', nowMinute:884 });
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
assert.equal(fixed.gpsTrip.status, 'stale');
assert.equal(fixed.dutyRepairBackupByDay['2026-07-10'].events.length, 1);
assert.equal(hasUserConfirmedJul10Timeline(events), true);

const second = applyUserConfirmedJul10TimelineRepair(fixed, { day:'2026-07-10', nowMinute:900 });
assert.deepEqual(second.eventsByDay['2026-07-10'], events, 'repair must run only once');

const normal = {
  eventsByDay:{
    '2026-07-10':buildUserConfirmedJul10Timeline(884),
  },
};
const normalResult = applyUserConfirmedJul10TimelineRepair(normal, { day:'2026-07-10', nowMinute:900 });
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
assert.equal(applyUserConfirmedJul10TimelineRepair(unrelated, { day:'2026-07-10', nowMinute:884 }), unrelated);
assert.equal(applyUserConfirmedJul10TimelineRepair(badState, { day:'2026-07-11', nowMinute:884 }), badState);

console.log('verify-user-confirmed-jul10-restore-v9598: passed');
