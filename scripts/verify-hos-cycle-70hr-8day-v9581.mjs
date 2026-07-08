import { calculateHosClocks } from '../source/src/core/hos/hosEngine.js';
import { assertMinutes, ev, localDate, pass } from './hos-v9581-test-utils.mjs';

const eventsByDay = {};
for (let d = 1; d <= 7; d += 1) {
  const day = `2026-07-0${d}`;
  eventsByDay[day] = [
    ev('ON', 0, 600, { id:`on_${day}` }),
    ev('OFF', 600, 1440, { id:`off_${day}` }),
  ];
}
const state = { currentStatus:'OFF', eventsByDay };
const hos = calculateHosClocks(state, localDate('2026-07-08', 0, 0));
assertMinutes(hos.cycle.usedMinutes, 4200, '70/8 cycle used');
assertMinutes(hos.cycle.remainingMinutes, 0, '70/8 cycle remaining');
pass('verify-hos-cycle-70hr-8day-v9581');
