import assert from 'node:assert/strict';
import { homeTerminalDayKey, homeTerminalMinute } from '../source/src/core/time/homeTerminalTime.js';

const instant = new Date('2026-07-09T02:00:00.000Z');
assert.equal(homeTerminalDayKey(instant, 'Europe/Belgrade'), '2026-07-09', 'Kosovo/Central Europe is already next day');
assert.equal(homeTerminalDayKey(instant, 'America/New_York'), '2026-07-08', 'Eastern DOT log day stays on previous day');
assert.equal(homeTerminalMinute(instant, 'America/New_York'), 1320, 'Eastern current minute is 10:00 PM, not Kosovo 4:00 AM');
console.log('PASS verify-log-day-does-not-shift-in-kosovo-device-time-v9584');
