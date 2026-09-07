import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const edit=fs.readFileSync('source/src/modules/editor/EditEventSheet.jsx','utf8');
const insert=fs.readFileSync('source/src/modules/editor/InsertEditEventSheet.jsx','utf8');
const time=fs.readFileSync('source/src/modules/editor/components/EditorTimeControlsV110.jsx','utf8');
const graph=fs.readFileSync('source/src/modules/editor/components/CompactGraphPanelV111.jsx','utf8');
const notes=fs.readFileSync('source/src/modules/editor/components/EditorNotesField.jsx','utf8');
const css=fs.readFileSync('source/src/modules/editor/modern-editor-v11027.css','utf8');
const eventList=fs.readFileSync('source/src/modules/logbook/EventList.jsx','utf8');
const dayPath='source/src/modules/logbook/DayLogScreen.jsx';
const day=fs.readFileSync(dayPath,'utf8');
const layout=fs.readFileSync('app/layout.jsx','utf8');

assert.match(edit,/editor-modern-v11027/);assert.match(insert,/editor-modern-v11027/);
assert.ok(layout.indexOf('modern-editor-v11027.css')>layout.indexOf('compact-editor-v111.css'));
console.log('PASS — modern editor layer is scoped and imported after legacy/compact styles');

assert.match(time,/Start Time/);assert.match(time,/End Time/);assert.match(time,/aria-label="Start time"/);assert.match(time,/aria-label="End time"/);assert.match(time,/modern-fine-time-v11027/);
assert.doesNotMatch(time,/modern-duration-cell-v11027/);assert.doesNotMatch(time,/className="time-nudges-v110"/);
console.log('PASS — Start and End are direct primary cards; one-minute controls remain secondary');

assert.match(graph,/modern-handle-v11027/);assert.match(graph,/aria-label=\{wide \? 'Done graph' : 'Full screen'\}/);assert.match(graph,/•••/);
assert.match(css,/MODERN_MOTIVE_FINAL_V11027/);assert.match(css,/graph-handle-large-v110\{height:44px!important;min-height:44px!important/);assert.match(css,/touch-action:none!important/);
console.log('PASS — Motive-style graph flags keep real 44px touch targets and accessible full-screen control');

assert.match(css,/sheet-head\{height:56px!important/);assert.match(css,/background:#2d2d2d!important/);
assert.match(css,/modern-time-strip-v11027\{display:grid!important;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(css,/editor-duty-grid\{display:grid!important;grid-template-columns:repeat\(4/);assert.match(css,/location-one-v85\{display:grid!important;grid-template-columns:56px minmax\(0,1fr\)/);
assert.match(notes,/FAST_EDITOR_NOTES_V11027/);assert.match(notes,/<textarea/);assert.match(css,/textarea\.note-v85\{display:block!important/);
assert.match(css,/save-main\{display:block!important;width:100%!important;height:58px!important/);assert.match(css,/background:#087cf0!important/);
assert.match(css,/cancel-main\{display:block!important;grid-column:1!important;width:72px!important/);
console.log('PASS — header, two-card time, four duty choices, GPS location, visible Notes and dominant Save match the phone reference hierarchy');

assert.match(eventList,/onSelect\?\.\(event\.id\)/);assert.match(eventList,/selected \? \(/);assert.match(eventList,/motive-edit-reveal-v11027/);assert.match(eventList,/Edit selected event/);
assert.match(css,/MOTIVE_EDIT_REVEAL_V11027/);assert.match(css,/motive-edit-reveal-v11027\{position:absolute!important;left:0!important/);
const graphTapStart=day.indexOf('function handleGraphEventTap(eventId)');
const graphTapEnd=day.indexOf('function handleLogbookBack()',graphTapStart);
assert.ok(graphTapStart>=0&&graphTapEnd>graphTapStart,'graph tap handler missing');
const graphTap=day.slice(graphTapStart,graphTapEnd);
assert.match(graphTap,/onSelect\?\.\(eventId\)/);assert.doesNotMatch(graphTap,/onOpenEdit/);
console.log('PASS — event tap selects first and reveals an explicit Motive-style Edit action');

assert.doesNotMatch(edit,/This range replaces overlapping manual duty time\. Save keeps the original in edit history\./);assert.match(edit,/previewResultV11023\?\.ok===false/);assert.match(edit,/Save changes/);
assert.match(edit,/expectedRows:initialRowsV11023/);assert.match(edit,/onEditTime=\{liveV110 \? undefined/);
assert.match(insert,/previewLogbookInsertOverride/);assert.match(insert,/previewInsertOverride/);assert.match(insert,/applyEditOverride/);assert.match(insert,/originalRowsV11023/);
console.log('PASS — visual simplification leaves whole-day guard, protected live timing and Insert override engine intact');

const meta=JSON.parse(fs.readFileSync('public/app-version.json','utf8'));assert.equal(meta.version,'110.2.7');assert.equal(meta.build,'v110207-fast-edit');assert.equal(meta.force,false);assert.match(fs.readFileSync('public/sw.js','utf8'),/OWNER_OP_SW_VERSION = '110\.2\.7'/);
const locks=JSON.parse(fs.readFileSync('module-locks.v1.json','utf8'));
assert.equal(locks.release,'110.2.7');
assert.equal(locks.files[dayPath],crypto.createHash('sha256').update(day).digest('hex'));
console.log('PASS — 110.2.7 release identity, non-forced worker and reviewed DayLogScreen lock agree');
