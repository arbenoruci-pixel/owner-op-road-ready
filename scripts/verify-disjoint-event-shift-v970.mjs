import assert from 'node:assert/strict';
import { shiftSelectedEventsForDay } from '../source/src/core/timeline/timelineEngine.js';

const events = [
  { id:'a', status:'OFF', startMin:0, endMin:120 },
  { id:'b', status:'ON', startMin:120, endMin:180 },
  { id:'c', status:'D', startMin:180, endMin:300 },
  { id:'d', status:'SB', startMin:300, endMin:420 },
  { id:'e', status:'ON', startMin:420, endMin:480 },
  { id:'f', status:'OFF', startMin:480, endMin:1440 },
];
const result = shiftSelectedEventsForDay(events, ['b','e'], 60, { preserveCoverage:true });
assert.equal(result.blockedReason, '');
assert.equal(result.mode, 'disjoint_selected_groups');
assert.equal(result.events.find(event => event.id === 'b').startMin, 180);
assert.equal(result.events.find(event => event.id === 'e').startMin, 480);
console.log('verify-disjoint-event-shift-v970 passed');
