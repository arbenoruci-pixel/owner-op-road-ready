import { calculateHosClocks } from '../source/src/core/hos/hosEngine.js';
import { assert, assertMinutes, ev, localDate, pass } from './hos-v9581-test-utils.mjs';

const shortStopState = {
  currentStatus:'D',
  eventsByDay:{
    '2026-06-23':[
      ev('OFF', 0, 600, { id:'reset' }),
      ev('D', 600, 840, { id:'drive_4h_a' }),
      ev('ON', 840, 855, { id:'fuel_15m' }),
      ev('D', 855, 1095, { id:'drive_4h_b' }),
    ],
  },
};
const shortStop = calculateHosClocks(shortStopState, localDate('2026-06-23', 18, 15));
assertMinutes(shortStop.break.usedMinutes, 480, '15m non-driving does not reset break');
assert(shortStop.break.requiresBreakBeforeDriving, 'break should be required after 8h cumulative driving');

const qualifyingBreakState = {
  currentStatus:'D',
  eventsByDay:{
    '2026-06-23':[
      ev('OFF', 0, 600, { id:'reset' }),
      ev('D', 600, 840, { id:'drive_4h' }),
      ev('ON', 840, 855, { id:'fuel_15m' }),
      ev('OFF', 855, 875, { id:'off_20m' }),
      ev('D', 875, 935, { id:'drive_after_35m_break' }),
    ],
  },
};
const qualifying = calculateHosClocks(qualifyingBreakState, localDate('2026-06-23', 15, 35));
assertMinutes(qualifying.break.usedMinutes, 60, 'combined 35m non-driving resets break');
assertMinutes(qualifying.break.remainingMinutes, 420, 'break remaining after reset');
pass('verify-hos-break-clock-30min-rule-v9581');
