import { calculateHosClocks } from '../source/src/core/hos/hosEngine.js';
import { assert, ev, jsonClone, localDate, pass } from './hos-v9581-test-utils.mjs';

const state = {
  currentStatus:'D',
  eventsByDay:{
    '2026-06-23':[
      ev('OFF', 0, 600, { id:'reset' }),
      ev('D', 600, 601, { id:'drive_open', source:'manual' }),
    ],
  },
  routeLegsByDay:{ '2026-06-23':[{ id:'leg_1', pickupMin:600, status:'open' }] },
};
const before = JSON.stringify(state);
const clone = jsonClone(state);
calculateHosClocks(clone, localDate('2026-06-23', 12, 0));
assert(JSON.stringify(state) === before, 'original state mutated');
assert(JSON.stringify(clone.eventsByDay) === JSON.stringify(state.eventsByDay), 'duty event times changed by HOS calculation');
pass('verify-driving-events-unchanged-v9581');
