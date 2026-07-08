import assert from 'node:assert/strict';
import { calculateHosClocks } from '../source/src/core/hos/hosEngine.js';

const now = new Date('2026-07-09T04:30:00.000Z');
const state = {
  currentStatus:'D',
  settings:{ homeTerminalTimeZone:'America/New_York' },
  eventsByDay:{
    '2026-07-09':[{
      id:'open_drive', status:'D', startMin:0, endMin:1, city:'Rahway', state:'NJ', note:'Driving', source:'manual'
    }],
  },
};
const hos = calculateHosClocks(state, now);
assert.equal(hos.nowDay, '2026-07-09', 'HOS nowDay uses configured Eastern time');
assert.equal(hos.nowMinute, 30, 'HOS nowMinute uses configured Eastern time');
assert.equal(hos.drive.usedMinutes, 30, 'open driving event extends to 12:30 AM ET');

const chicagoHos = calculateHosClocks({ ...state, settings:{ homeTerminalTimeZone:'America/Chicago' } }, now);
assert.equal(chicagoHos.nowDay, '2026-07-08', 'HOS can use custom Central time if configured');
assert.equal(chicagoHos.nowMinute, 1410, 'custom Central nowMinute is used');
console.log('PASS verify-hos-no-device-timezone-v9584');
