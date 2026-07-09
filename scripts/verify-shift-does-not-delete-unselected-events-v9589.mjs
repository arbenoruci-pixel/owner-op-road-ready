import assert from 'node:assert/strict';
import { shiftSelectedEventsForDay } from '../source/src/core/timeline/timelineEngine.js';
const raw = [
  { id:'off1', status:'OFF', startMin:0, endMin:360 },
  { id:'on1', status:'ON', startMin:360, endMin:375 },
  { id:'d1', status:'D', startMin:375, endMin:600 },
  { id:'on2', status:'ON', startMin:600, endMin:615 },
  { id:'off2', status:'OFF', startMin:615, endMin:1440 },
];
const result = shiftSelectedEventsForDay(raw, ['d1'], 60, { preserveCoverage:true });
assert.equal(result.blockedReason, '');
const ids = result.events.map(e => e.id).sort();
assert.deepEqual(ids, raw.map(e => e.id).sort());
assert.ok(result.events.find(e => e.id === 'off1'));
assert.ok(result.events.find(e => e.id === 'on1'));
assert.ok(result.events.find(e => e.id === 'on2'));
assert.ok(result.events.find(e => e.id === 'off2'));
console.log('verify-shift-does-not-delete-unselected-events-v9589: passed');
