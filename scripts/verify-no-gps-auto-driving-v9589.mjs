import assert from 'node:assert/strict';
import fs from 'node:fs';
const app = fs.readFileSync('source/src/app/App.jsx','utf8');
assert.match(app, /Smart paper-log mode: no GPS prompt at launch/);
assert.doesNotMatch(app, /motion.*auto.*driv/i);
console.log('verify-no-gps-auto-driving-v9589: passed');
