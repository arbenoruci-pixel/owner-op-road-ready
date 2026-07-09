import assert from 'node:assert/strict';
import { shiftSelectedEventsForDay } from '../source/src/core/timeline/timelineEngine.js';
const raw = [
  { id:'off1', status:'OFF', startMin:0, endMin:360 },
  { id:'on1', status:'ON', startMin:360, endMin:375 },
  { id:'d1', status:'D', startMin:375, endMin:600 },
  { id:'on2', status:'ON', startMin:600, endMin:615 },
  { id:'off2', status:'OFF', startMin:615, endMin:1440 },
];
for (const delta of [-60, 60]) {
  const result = shiftSelectedEventsForDay(raw, ['on1','d1','on2'], delta, { preserveCoverage:true });
  assert.equal(result.blockedReason, '');
  const events = result.events;
  assert.equal(events[0].startMin, 0);
  assert.equal(events.at(-1).endMin, 1440);
  for (let i = 0; i < events.length - 1; i += 1) assert.equal(events[i].endMin, events[i+1].startMin);
}
console.log('verify-shift-preserves-24h-coverage-v9589: passed');
