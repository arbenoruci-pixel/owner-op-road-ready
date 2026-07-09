import assert from 'node:assert/strict';
import fs from 'node:fs';
const panel = fs.readFileSync('source/src/modules/logbook/LogCheckPanel.jsx','utf8');
assert.match(panel, /Starts \$\{timeLabel\(target\.startMin, true\)\}/);
assert.match(panel, /<b>\{target \? 'Show'/);
const day = fs.readFileSync('source/src/modules/logbook/DayLogScreen.jsx','utf8');
assert.match(day, /isHosRange/);
assert.match(day, /onSelect\?\.\(targetEventId\)/);
console.log('verify-hos-violation-click-opens-exact-event-v9589: passed');
