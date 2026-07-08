import { calculateHosClocks } from '../source/src/core/hos/hosEngine.js';
import { assertMinutes, ev, localDate, pass } from './hos-v9581-test-utils.mjs';

const state = {
  currentStatus:'D',
  eventsByDay:{
    '2026-06-22':[
      ev('OFF', 0, 1080, { id:'reset_rest' }),
      ev('ON', 1080, 1140, { id:'pretrip' }),
      ev('D', 1140, 1440, { id:'drive_before_midnight' }),
    ],
  },
};

const hos = calculateHosClocks(state, localDate('2026-06-23', 0, 0));
assertMinutes(hos.drive.usedMinutes, 300, 'drive used across midnight');
assertMinutes(hos.drive.remainingMinutes, 360, 'drive remaining across midnight');
assertMinutes(hos.break.usedMinutes, 300, 'break clock carries driving across midnight');
pass('verify-hos-drive-clock-no-midnight-reset-v9581');
