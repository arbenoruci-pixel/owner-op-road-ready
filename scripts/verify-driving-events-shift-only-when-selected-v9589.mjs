import assert from 'node:assert/strict';
import { shiftSelectedEventsForDay } from '../source/src/core/timeline/timelineEngine.js';
const raw = [
  { id:'off1', status:'OFF', startMin:0, endMin:360 },
  { id:'on1', status:'ON', startMin:360, endMin:375 },
  { id:'d1', status:'D', startMin:375, endMin:600 },
  { id:'off2', status:'OFF', startMin:600, endMin:1440 },
];
const result = shiftSelectedEventsForDay(raw, ['on1'], 60, { preserveCoverage:true });
assert.equal(result.blockedReason, '');
const d = result.events.find(e => e.id === 'd1');
assert.deepEqual([d.startMin, d.endMin], [435, 600]);
assert.ok(!result.changedEventIds.includes('d1'));
console.log('verify-driving-events-shift-only-when-selected-v9589: passed');
