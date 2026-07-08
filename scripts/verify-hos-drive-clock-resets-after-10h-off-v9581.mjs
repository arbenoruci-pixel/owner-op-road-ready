import { calculateHosClocks } from '../source/src/core/hos/hosEngine.js';
import { assertMinutes, ev, localDate, pass } from './hos-v9581-test-utils.mjs';

const state = {
  currentStatus:'D',
  eventsByDay:{
    '2026-06-22':[
      ev('OFF', 0, 600, { id:'initial_10h' }),
      ev('D', 600, 900, { id:'first_drive' }),
      ev('OFF', 900, 1440, { id:'off_start' }),
    ],
    '2026-06-23':[
      ev('OFF', 0, 60, { id:'off_complete_10h' }),
      ev('D', 60, 120, { id:'after_reset_drive' }),
    ],
  },
};

const hos = calculateHosClocks(state, localDate('2026-06-23', 2, 0));
assertMinutes(hos.drive.usedMinutes, 60, 'drive used after 10h reset');
assertMinutes(hos.drive.remainingMinutes, 600, 'drive remaining after 10h reset');
assertMinutes(hos.shift.remainingMinutes, 780, 'shift starts with first duty after reset');
pass('verify-hos-drive-clock-resets-after-10h-off-v9581');
