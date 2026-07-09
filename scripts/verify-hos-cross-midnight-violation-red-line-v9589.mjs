import assert from 'node:assert/strict';
import { violationRangesForDay } from '../source/src/core/hos/hosEngine.js';
const day1 = '2026-07-08';
const day2 = '2026-07-09';
const ranges = violationRangesForDay({
  [day1]: [
    { id:'on1', status:'ON', startMin:0, endMin:780 },
    { id:'d1', status:'D', startMin:780, endMin:1440 },
  ],
  [day2]: [
    { id:'d2', status:'D', startMin:0, endMin:120 },
    { id:'off2', status:'OFF', startMin:120, endMin:1440 },
  ],
}, day2);
const any = ranges.find(r => ['window14','drive11','break8'].includes(r.type) && r.status === 'D');
assert.ok(any, 'expected violation carried into next day');
assert.equal(any.startMin, 0);
console.log('verify-hos-cross-midnight-violation-red-line-v9589: passed');
