import assert from 'node:assert/strict';
import { shiftSelectedEventsForDay } from '../source/src/core/timeline/timelineEngine.js';
const raw = [
  { id:'off1', status:'OFF', startMin:0, endMin:360 },
  { id:'on1', status:'ON', startMin:360, endMin:375 },
  { id:'d1', status:'D', startMin:375, endMin:600 },
  { id:'off2', status:'OFF', startMin:600, endMin:1440 },
];
const result = shiftSelectedEventsForDay(raw, raw.map(e => e.id), 60, { preserveCoverage:true });
assert.equal(result.blockedReason, '');
assert.equal(result.mode, 'duty_changes');
assert.equal(result.events[0].startMin, 0);
assert.equal(result.events.at(-1).endMin, 1440);
assert.deepEqual(result.events.map(e => [e.id, e.startMin, e.endMin]), [
  ['off1',0,420], ['on1',420,435], ['d1',435,660], ['off2',660,1440],
]);
console.log('verify-shift-all-day-duty-change-mode-v9589: passed');
