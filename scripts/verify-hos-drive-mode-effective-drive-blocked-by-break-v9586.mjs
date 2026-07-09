import { calculateHosClocks } from '../source/src/core/hos/hosEngine.js';
import { assert, assertMinutes, ev, localDate, pass } from './hos-v9581-test-utils.mjs';

// After 8 cumulative driving hours without a qualifying 30-min interruption,
// the raw 11h drive clock may still have time. Effective Drive Mode must show
// 00:00 until a 30-min non-driving break is completed.
const state = {
  currentStatus:'D',
  settings:{ homeTerminalTimeZone:'America/New_York' },
  eventsByDay:{
    '2026-06-23':[
      ev('OFF', 0, 600, { id:'reset_rest' }),
      ev('ON', 600, 615, { id:'pretrip' }),
      ev('D', 615, 1095, { id:'eight_hours_drive' }),
    ],
  },
};

const hos = calculateHosClocks(state, localDate('2026-06-23', 18, 15));
assertMinutes(hos.drive.remainingMinutes, 180, 'raw 11-hour drive remaining is preserved after 8h driving');
assertMinutes(hos.break.remainingMinutes, 0, 'break clock has reached zero');
assert(hos.break.requiresBreakBeforeDriving, 'break required before more driving');
assertMinutes(hos.effectiveDrive.remainingMinutes, 0, 'effective legal DRIVE is blocked by break requirement');
assert(hos.effectiveDrive.blockers.includes('break'), 'effective drive blocker includes break');
pass('verify-hos-drive-mode-effective-drive-blocked-by-break-v9586');
