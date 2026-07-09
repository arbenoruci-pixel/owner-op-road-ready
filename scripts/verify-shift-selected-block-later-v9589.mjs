import assert from 'node:assert/strict';
import { shiftSelectedEventsForDay } from '../source/src/core/timeline/timelineEngine.js';

const raw = [
  { id:'off1', status:'OFF', startMin:0, endMin:360 },
  { id:'on1', status:'ON', startMin:360, endMin:375, note:'Pre-trip' },
  { id:'d1', status:'D', startMin:375, endMin:600 },
  { id:'on2', status:'ON', startMin:600, endMin:615, note:'Delivery' },
  { id:'off2', status:'OFF', startMin:615, endMin:1440 },
];
const result = shiftSelectedEventsForDay(raw, ['on1','d1','on2'], 60, { preserveCoverage:true });
assert.equal(result.blockedReason, '');
assert.equal(result.appliedDeltaMin, 60);
assert.deepEqual(result.events.map(e => [e.id, e.startMin, e.endMin]), [
  ['off1',0,420], ['on1',420,435], ['d1',435,660], ['on2',660,675], ['off2',675,1440],
]);
assert.deepEqual(result.changedEventIds, ['on1','d1','on2']);
assert.deepEqual(new Set(result.events.map(e => e.id)).size, raw.length);
console.log('verify-shift-selected-block-later-v9589: passed');
