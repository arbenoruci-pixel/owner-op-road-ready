import assert from 'node:assert/strict';
import fs from 'node:fs';

const edit=fs.readFileSync('source/src/modules/editor/EditEventSheet.jsx','utf8');
const insert=fs.readFileSync('source/src/modules/editor/InsertEditEventSheet.jsx','utf8');
const time=fs.readFileSync('source/src/modules/editor/components/EditorTimeControlsV110.jsx','utf8');
const graph=fs.readFileSync('source/src/modules/editor/components/CompactGraphPanelV111.jsx','utf8');
const css=fs.readFileSync('source/src/modules/editor/modern-editor-v11027.css','utf8');
const layout=fs.readFileSync('app/layout.jsx','utf8');

assert.match(edit,/editor-modern-v11027/);assert.match(insert,/editor-modern-v11027/);
assert.ok(layout.indexOf('modern-editor-v11027.css')>layout.indexOf('compact-editor-v111.css'));
console.log('PASS — modern editor layer is scoped and imported after legacy/compact styles');

assert.match(time,/modern-time-strip-v11027/);assert.match(time,/modern-duration-cell-v11027/);assert.match(time,/aria-label="Start time"/);assert.match(time,/aria-label="End time"/);assert.match(time,/modern-fine-time-v11027/);
assert.doesNotMatch(time,/className="time-nudges-v110"/);
console.log('PASS — Start Duration End share one primary strip; one-minute controls are secondary');

assert.match(graph,/modern-handle-v11027/);assert.match(graph,/aria-label=\{wide \? 'Done graph' : 'Full screen'\}/);assert.match(graph,/•••/);assert.match(css,/height:46px!important/);assert.match(css,/touch-action:none!important/);
console.log('PASS — lighter handles retain large touch targets and full-screen accessibility names');

assert.match(css,/grid-template-columns:minmax\(0,1fr\) 82px minmax\(0,1fr\)/);assert.match(css,/\.quick-activities-v11023 button\{height:44px!important/);assert.match(css,/\.editor-duty-grid\{display:grid!important;grid-template-columns:repeat\(4/);assert.match(css,/\.location-one-v85\{height:48px!important/);assert.match(css,/\.compact-editor-footer-v111\{height:64px!important/);
console.log('PASS — phone hierarchy keeps time, segmented duty, 44px activities, smart location and sticky actions compact');

assert.doesNotMatch(edit,/This range replaces overlapping manual duty time\. Save keeps the original in edit history\./);assert.match(edit,/previewResultV11023\?\.ok===false/);assert.match(edit,/Save changes/);
assert.match(edit,/expectedRows:initialRowsV11023/);assert.match(edit,/onEditTime=\{liveV110 \? undefined/);assert.match(insert,/insertLogbookEditorOverride/);
console.log('PASS — helper prose is removed while blocking errors, whole-day guard, protected live timing and override engine remain');

const meta=JSON.parse(fs.readFileSync('public/app-version.json','utf8'));assert.equal(meta.version,'110.2.7');assert.equal(meta.build,'v110207-fast-edit');assert.equal(meta.force,false);assert.match(fs.readFileSync('public/sw.js','utf8'),/OWNER_OP_SW_VERSION = '110\.2\.7'/);
console.log('PASS — 110.2.7 release identity and non-forced worker agree');
