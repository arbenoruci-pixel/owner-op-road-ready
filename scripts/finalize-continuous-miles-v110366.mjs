import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {syncLegacyReleaseAssertions} from './test-support/sync-release-assertions.mjs';
// Re-copied historic fixtures must describe the current predecessor release.
for(const file of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs'])syncLegacyReleaseAssertions(file);
const read = path => fs.readFileSync(path, 'utf8');
function patch(path, before, after) {
  const source = read(path);
  if (source.includes(after)) return;
  assert.equal(source.split(before).length - 1, 1, 'Continuous mileage anchor: ' + path);
  fs.writeFileSync(path, source.replace(before, after));
}
fs.copyFileSync('scripts/v110366/MileageSegmentEditor.jsx', 'source/src/modules/logbook/MileageSegmentEditor.jsx');
const day = 'source/src/modules/logbook/DayLogScreen.jsx';
patch(day,
  `<MileageSegmentEditor
        open={mileageEditorOpen}
        events={displayEvents}`,
  `<MileageSegmentEditor
        open={mileageEditorOpen}
        events={dutyViewEvents(exactViewEventsV110, displayEvents, { eventsByDay:state.eventsByDay, day:state.activeDay })}`);
patch(day,
  `    setMileageEditorOpen(false);
    window.alert?.('Saved ' + Number(totalMiles || 0).toFixed(2) + ' total driving miles.');`,
  `    onSaveDayDistance?.(totalMiles);
    setMileageEditorOpen(false);
    window.alert?.('Saved ' + Number(totalMiles || 0).toFixed(2) + ' total driving miles.');`);
const css = 'source/src/road-ready-2026.css';
if (!read(css).includes('CONTINUOUS_MILEAGE_V110366')) fs.appendFileSync(css, `
/* CONTINUOUS_MILEAGE_V110366 */
.mileage-editor-overlay .mileage-driving-time-v110366{font-size:12px;color:#cbd5e1;line-height:1.4}
.mileage-editor-overlay .mileage-segment-input input{box-sizing:border-box}
@media(max-width:480px){
.mileage-editor-overlay .mileage-segment-row{grid-template-columns:28px minmax(0,1fr)}
.mileage-editor-overlay .mileage-segment-input{grid-column:2;width:min(170px,100%)}
.mileage-editor-overlay .mileage-segment-input input{text-align:left;padding-right:36px}
}
`);
const VERSION = '110.3.66', BUILD = 'v110366-continuous-driving-miles';
for (const path of ['release-version.json', 'public/app-version.json']) {
  const value = JSON.parse(read(path));
  Object.assign(value, {version:VERSION, build:BUILD, force:false, label:'v110.3.66 Continuous driving mileage', releasedAt:new Date().toISOString(), updatedAt:new Date().toISOString(), sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null,
    notes:['Include driving without a recorded stop in daily mileage review.', 'Show driving hours and editable 62 mph time estimates.', 'Keep typed mileage stable during review and preserve duty times when saving.']});
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
for (const path of ['package.json', 'package-lock.json']) {
  const value = JSON.parse(read(path)); value.version = VERSION; if (value.packages?.['']) value.packages[''].version = VERSION;
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
for (const [path, name] of [['source/src/core/update/appUpdate.js', 'FALLBACK_APP'], ['public/sw.js', 'OWNER_OP_SW']]) {
  let source = read(path);
  for (const [key, value] of [['VERSION', VERSION], ['BUILD', BUILD]]) {
    const pattern = new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`, 'g');
    assert.equal([...source.matchAll(pattern)].length, 1, 'Unique release marker: ' + path);
    source = source.replace(pattern, `const ${name}_${key} = '${value}';`);
  }
  fs.writeFileSync(path, source);
}
for (const path of ['source/src/modules/home/HomeScreen.jsx', 'source/src/shared/ui/ToolsSheet.jsx']) fs.writeFileSync(path, read(path).replace(/App v\d+\.\d+\.\d+/g, 'App v' + VERSION).replace(/APP V\d+\.\d+\.\d+/g, 'APP V' + VERSION));
// Validate the newly installed release against app, service worker and both manifests.
for(const file of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs'])syncLegacyReleaseAssertions(file);

// Reviewed DayLog wiring only; core persistence and signing retain their locks.
const reviewedDayHash = '469d3d66d4d55c3b749b66008d9f15f23488b7bedf04d0c04ea56aee6c7584c8';
assert.equal(crypto.createHash('sha256').update(read(day)).digest('hex'), reviewedDayHash);
const lockPath = 'module-locks.v1.json', locks = JSON.parse(read(lockPath));
locks.release = VERSION; locks.files[day] = reviewedDayHash;
fs.writeFileSync(lockPath, JSON.stringify(locks, null, 2) + '\n');
console.log('PASS — 110.3.66 includes continuous driving in daily mileage review');
