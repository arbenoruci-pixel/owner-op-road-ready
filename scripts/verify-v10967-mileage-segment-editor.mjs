import fs from 'node:fs';
import assert from 'node:assert/strict';

const day = fs.readFileSync('source/src/modules/logbook/DayLogScreen.jsx', 'utf8');
const editor = fs.readFileSync('source/src/modules/logbook/MileageSegmentEditor.jsx', 'utf8');
const css = fs.readFileSync('source/src/road-ready-2026.css', 'utf8');

assert.match(day, /MileageSegmentEditor/, 'Mileage editor is not wired into DayLogScreen');
assert.doesNotMatch(day, /Enter total miles for this driving/, 'Legacy single-event prompt remains active');
assert.match(day, /saveMileageSegments/, 'Segment save handler is missing');
assert.match(editor, /CHICAGO, IL\|ELGIN, IL': 52/, 'Verified Chicago to Elgin route is missing');
assert.match(editor, /ELGIN, IL\|WOODHAVEN, MI': 327/, 'Verified Elgin to Woodhaven route is missing');
assert.match(editor, /short legal break inside the same trip segment/, 'Break-aware segment grouping is missing');
assert.match(editor, /inputMode="decimal"/, 'Segment miles are not editable');
assert.match(editor, /Total for the day/, 'Daily total is not shown');
assert.match(css, /mileage-segment-row\.tone-1/, 'Colored segment rows are missing');
console.log('PASS — v109.6.7 editable daily mileage segment editor');
