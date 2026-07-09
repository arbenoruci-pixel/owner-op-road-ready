import assert from 'node:assert/strict';
import fs from 'node:fs';
import { violationRangesForDay } from '../source/src/core/hos/hosEngine.js';
const day='2026-07-05';
const eventsByDay={ [day]:[
 {id:'off',status:'OFF',startMin:0,endMin:300},
 {id:'on',status:'ON',startMin:300,endMin:315},
 {id:'d1',status:'D',startMin:315,endMin:700},
 {id:'offbreak',status:'OFF',startMin:700,endMin:1130},
 {id:'d2',status:'D',startMin:1130,endMin:1300},
 {id:'off2',status:'OFF',startMin:1300,endMin:1440},
]};
const ranges=violationRangesForDay(eventsByDay, day);
const shift=ranges.find(r=>r.type==='window14' && r.eventId==='d2');
assert(shift, 'expected 14h violation range on second driving event');
assert.equal(shift.startMin,1140);
assert.equal(shift.endMin,1300);
const graph=fs.readFileSync('source/src/modules/graph/LogGraph.jsx','utf8');
assert(graph.includes('graph-violation-trace'));
assert(graph.includes('violationLabel'));
console.log('verify-hos-violation-red-line-start-v9589: PASS');
