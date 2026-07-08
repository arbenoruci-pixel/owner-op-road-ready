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
eventsByDay['2026-07-08'] = [ev('OFF', 0, 1440, { id:'restart_rest_day' })];
eventsByDay['2026-07-09'] = [
  ev('OFF', 0, 600, { id:'restart_rest_morning' }),
  ev('ON', 600, 660, { id:'after_restart_on' }),
];

const state = { currentStatus:'ON', eventsByDay };
const hos = calculateHosClocks(state, localDate('2026-07-09', 11, 0));
assertMinutes(hos.cycle.usedMinutes, 60, 'cycle used after 34h restart');
assertMinutes(hos.cycle.remainingMinutes, 4140, 'cycle remaining after 34h restart');
pass('verify-hos-34hr-restart-v9581');
