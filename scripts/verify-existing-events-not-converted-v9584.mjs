import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = fs.readFileSync('source/src/app/App.jsx', 'utf8');
const saveFn = app.slice(app.indexOf('function saveHomeTerminalTimeZone'), app.indexOf('async function buildManualBackup'));
assert(saveFn.includes('persistHomeTerminalTimeZone'), 'timezone save persists selected zone');
assert(!/eventsByDay\s*:/.test(saveFn), 'timezone save does not rewrite eventsByDay');
assert(!/startMin\s*:/.test(saveFn), 'timezone save does not rewrite startMin');
assert(!/endMin\s*:/.test(saveFn), 'timezone save does not rewrite endMin');
assert(!/normalizeState\(/.test(saveFn), 'timezone save does not run state normalization that could alter event rows');
console.log('PASS verify-existing-events-not-converted-v9584');
