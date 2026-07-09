import assert from 'node:assert/strict';
import fs from 'node:fs';
const app = fs.readFileSync('source/src/app/App.jsx','utf8');
const start = app.indexOf('function applyShift');
const end = app.indexOf('function moveSelectedEventInline', start);
const body = app.slice(start, end);
assert.match(body, /return markRecert\(next\)/);
assert.match(body, /lastShiftResult/);
console.log('verify-shift-signed-day-needs-recertification-v9589: passed');
