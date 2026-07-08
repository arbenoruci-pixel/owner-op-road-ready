import assert from 'node:assert/strict';
import { homeTerminalMinute } from '../source/src/core/time/homeTerminalTime.js';

const winter = new Date('2026-12-01T05:30:00.000Z');
assert.equal(homeTerminalMinute(winter, 'America/New_York'), 30, '12:30 AM EST = minute 30');
assert.equal(homeTerminalMinute(winter, 'America/Chicago'), 1410, '11:30 PM CST = minute 1410');

const summer = new Date('2026-07-09T04:30:00.000Z');
assert.equal(homeTerminalMinute(summer, 'America/New_York'), 30, '12:30 AM EDT = minute 30');
assert.equal(homeTerminalMinute(summer, 'America/Chicago'), 1410, '11:30 PM CDT = minute 1410');
console.log('PASS verify-now-min-uses-home-terminal-v9584');
