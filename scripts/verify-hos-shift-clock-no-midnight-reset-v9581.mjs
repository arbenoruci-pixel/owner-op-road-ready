import { calculateHosClocks } from '../source/src/core/hos/hosEngine.js';
import { assertMinutes, ev, localDate, pass } from './hos-v9581-test-utils.mjs';

const state = {
  currentStatus:'D',
  eventsByDay:{
    '2026-06-22':[
      ev('OFF', 0, 1080, { id:'reset_rest' }),
      ev('ON', 1080, 1140, { id:'shift_start' }),
      ev('D', 1140, 1440, { id:'drive_to_midnight' }),
    ],
  },
};

const hos = calculateHosClocks(state, localDate('2026-06-23', 0, 0));
assertMinutes(hos.shift.usedMinutes, 360, 'shift elapsed across midnight');
assertMinutes(hos.shift.remainingMinutes, 480, 'shift remaining across midnight');
pass('verify-hos-shift-clock-no-midnight-reset-v9581');
