import assert from 'node:assert/strict';
import {
  appendRecoveredLiveTail,
  isSuspiciousMidnightDrivingOverwrite,
  recoverEventsFromLocalRevisions,
} from '../source/src/core/timeline/liveDrivingSafety.js';

const bad = [{
  id:'gps_drive_2026-07-10_999', status:'D', startMin:0, endMin:884,
  city:'East Hartford', state:'CT', note:'Driving', source:'gps_drive_rollover',
}];
assert.equal(isSuspiciousMidnightDrivingOverwrite(bad, 884), true);

const before = [
  ['d1','c1','D',0,80,'Driving'],
  ['sb1','c2','SB',80,680,'Sleeper Berth'],
  ['on1','c3','ON',680,700,'On Duty'],
  ['d2','c4','D',700,756,'Driving started'],
  ['on2','c5','ON',756,845,'Pickup / Loading'],
];
const revisionRows = before.map(([sourceId, chain, status, start, end, note], index) => ({
  local_id:`${sourceId}:rev`, event_chain_id:chain, action:'create', log_date:'2026-07-10',
  status, start_min:start, end_min:end, note,
  location:{ city:index === 0 ? 'Youngstown' : 'Cheshire', state:index === 0 ? 'OH' : 'CT', source:'manual' },
  created_at:`2026-07-10T15:${String(10+index).padStart(2,'0')}:00.000Z`,
}));
revisionRows.push({
  local_id:'bad:rev', event_chain_id:'cbad', action:'create', log_date:'2026-07-10',
  status:'D', start_min:0, end_min:884, note:'Driving',
  location:{ city:'East Hartford', state:'CT', source:'manual' },
  created_at:'2026-07-10T18:44:00.000Z',
});
for (const [, chain] of before) {
  revisionRows.push({
    local_id:`void:${chain}`, event_chain_id:chain, action:'void', log_date:'2026-07-10',
    status:'OFF', start_min:0, end_min:1, note:'', location:{},
    created_at:'2026-07-10T18:44:00.300Z',
  });
}
const idMapRows = [
  ...before.map(([sourceId, chain]) => ({ source_id:sourceId, mapped_id:chain, entity:'duty_event' })),
  { source_id:'gps_drive_2026-07-10_999', mapped_id:'cbad', entity:'duty_event' },
];

const recovered = recoverEventsFromLocalRevisions({
  currentEvents:bad, revisionRows, idMapRows, nowMinute:884,
});
assert.equal(recovered.length, 5, 'five pre-corruption events should be recovered');
assert.deepEqual(recovered.map(e => e.status), ['D','SB','ON','D','ON']);
assert.deepEqual(recovered.map(e => e.startMin), [0,80,680,700,756]);

const withTail = appendRecoveredLiveTail(recovered, bad, 'D');
assert.equal(withTail.length, 6);
assert.equal(withTail.at(-1).status, 'D');
assert.equal(withTail.at(-1).startMin, 845);
assert.equal(withTail.at(-1).endMin, 884);


const stoppedBad = [
  { ...bad[0], endMin:884 },
  { id:'auto_on_bad', status:'ON', startMin:884, endMin:885, city:'East Hartford', state:'CT', note:'Stopped / On Duty', source:'auto_stop' },
];
assert.equal(isSuspiciousMidnightDrivingOverwrite(stoppedBad, 885), true, 'short trailing stop should still be recoverable');
const recoveredStopped = appendRecoveredLiveTail(recovered, stoppedBad, 'ON');
assert.equal(recoveredStopped.at(-2).status, 'D');
assert.equal(recoveredStopped.at(-2).startMin, 845);
assert.equal(recoveredStopped.at(-2).endMin, 884);
assert.equal(recoveredStopped.at(-1).status, 'ON');
assert.equal(recoveredStopped.at(-1).startMin, 884);

console.log('verify-midnight-driving-recovery-v9597: passed');
