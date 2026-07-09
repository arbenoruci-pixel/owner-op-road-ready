import assert from 'node:assert/strict';
import { shiftSelectedEventsForDay } from '../source/src/core/timeline/timelineEngine.js';
const raw = [
  { id:'off1', status:'OFF', startMin:0, endMin:360 },
  { id:'on1', status:'ON', startMin:360, endMin:375 },
  { id:'d1', status:'D', startMin:375, endMin:600 },
  { id:'on2', status:'ON', startMin:600, endMin:615 },
  { id:'off2', status:'OFF', startMin:615, endMin:1440 },
];
const result = shiftSelectedEventsForDay(raw, ['on1','d1','on2'], -60, { preserveCoverage:true });
assert.equal(result.blockedReason, '');
assert.equal(result.appliedDeltaMin, -60);
assert.deepEqual(result.events.map(e => [e.id, e.startMin, e.endMin]), [
  ['off1',0,300], ['on1',300,315], ['d1',315,540], ['on2',540,555], ['off2',555,1440],
]);
console.log('verify-shift-selected-block-earlier-v9589: passed');
