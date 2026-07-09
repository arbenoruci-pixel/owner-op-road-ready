import { calculateHosClocks } from '../source/src/core/hos/hosEngine.js';
import { assert, assertMinutes, ev, localDate, pass } from './hos-v9581-test-utils.mjs';

// Real-world pattern from the screenshot:
// - A 10h+ reset happened earlier on Jul 08.
// - Work/drive started at 2:07 PM Jul 08.
// - Driver took 7h25 OFF later, which resets the 30-min break clock but does NOT reset the 14h shift.
// - At 4:55 AM Jul 09, raw 11h drive clock still has time, but 14h shift is expired.
// Drive Mode must show effective/legal DRIVE as 00:00, not the raw 11h remainder.
const state = {
  currentStatus:'D',
  settings:{ homeTerminalTimeZone:'America/New_York' },
  eventsByDay:{
    '2026-07-08':[
      ev('OFF', 0, 847, { id:'reset_rest', city:'Cheshire', state:'CT' }),
      ev('ON', 847, 862, { id:'pretrip', city:'Chicago', state:'IL', note:'Pre-trip inspection' }),
      ev('D', 862, 960, { id:'drive_1422_1600', city:'Chicago', state:'IL' }),
      ev('ON', 960, 975, { id:'pickup', city:'Wilmington', state:'IL', note:'Pickup / Loading' }),
      ev('OFF', 975, 1420, { id:'off_1615_2340', city:'Wilmington', state:'IL' }),
      ev('D', 1420, 1421, { id:'drive_2340_2341', city:'Wilmington', state:'IL' }),
      ev('OFF', 1421, 1431, { id:'off_2341_2351', city:'Wilmington', state:'IL' }),
      ev('D', 1431, 1439, { id:'drive_2351_2359', city:'Wilmington', state:'IL' }),
      ev('ON', 1439, 1440, { id:'fuel_2359', city:'Wilmington', state:'IL', note:'Fuel' }),
    ],
    '2026-07-09':[
      ev('D', 0, 1, { id:'open_drive_after_midnight', city:'Wilmington', state:'IL' }),
    ],
  },
};

const hos = calculateHosClocks(state, localDate('2026-07-09', 4, 55));
assertMinutes(hos.drive.remainingMinutes, 258, 'raw 11-hour drive remaining is preserved');
assertMinutes(hos.shift.remainingMinutes, 0, '14-hour shift is expired');
assertMinutes(hos.effectiveDrive.remainingMinutes, 0, 'effective legal DRIVE is blocked by expired shift');
assert(hos.effectiveDrive.blockers.includes('shift'), 'effective drive blocker includes shift');
assert(hos.clocks.find(clock => clock.label === 'DRIVE').remainingMinutes === 0, 'display DRIVE clock uses effective legal time');
assert(hos.warnings.some(warning => warning.type === 'legalDrive' || warning.type === 'shift'), 'warning explains no legal driving time');
pass('verify-hos-drive-mode-effective-drive-blocked-by-shift-v9586');
