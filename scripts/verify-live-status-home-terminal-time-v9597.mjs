import assert from 'node:assert/strict';
import fs from 'node:fs';
const app = fs.readFileSync(new URL('../source/src/app/App.jsx', import.meta.url), 'utf8');
assert.doesNotMatch(app, /new Date\(\)\.getHours\(\)/, 'live status still uses device-local clock');
assert.match(app, /const base = rolloverActiveDrivingIfNeeded\(s, now\)/, 'live status must reconcile a cross-midnight active status first');
assert.match(app, /const day = localDayKey\(now, getHomeTerminalTimeZone\(base\)\)/, 'live status must target home-terminal day');
assert.match(app, /const nowLiveMin = minuteFromDate\(now, base\)/, 'live status must use home-terminal minute');
assert.match(app, /applyLiveStatusTransition\(existing, ev\)/, 'live status must use history-preserving transition');
console.log('verify-live-status-home-terminal-time-v9597: passed');
