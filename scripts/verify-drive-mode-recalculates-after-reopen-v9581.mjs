import { calculateHosClocks } from '../source/src/core/hos/hosEngine.js';
import { assertMinutes, ev, localDate, pass } from './hos-v9581-test-utils.mjs';

const restoredState = {
  currentStatus:'D',
  eventsByDay:{
    '2026-06-23':[
      ev('OFF', 0, 600, { id:'reset' }),
      ev('D', 600, 601, { id:'open_driving_event' }),
    ],
  },
};

const hos = calculateHosClocks(restoredState, localDate('2026-06-23', 12, 30));
assertMinutes(hos.drive.usedMinutes, 150, 'open driving event recalculated to now');
assertMinutes(hos.drive.remainingMinutes, 510, 'open driving event remaining after reopen');
pass('verify-drive-mode-recalculates-after-reopen-v9581');
