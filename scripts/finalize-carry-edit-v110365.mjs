import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const read = path => fs.readFileSync(path, 'utf8');
function patch(path, before, after) {
  const source = read(path);
  if (source.includes(after)) return;
  assert.equal(source.split(before).length - 1, 1, 'Carry correction anchor: ' + path);
  fs.writeFileSync(path, source.replace(before, after));
}
fs.copyFileSync('scripts/v110365/carryCorrection.js', 'source/src/modules/logbook/carryCorrection.js');

const day = 'source/src/modules/logbook/DayLogScreen.jsx';
const reviewedDayHash = '09c473ecabcb8e562f8613f321a6e0cd462eab4a7151ef57c2ea8e5e8f9d17f1';
patch(day, "import EventList from './EventList.jsx';", "import EventList from './EventList.jsx';\nimport { carryCorrectionDefaults } from './carryCorrection.js';");
patch(day,
  '  function handleGraphEventTap(eventId) {\n    // Derived carry is display-only, just like its Now/Sign list row.',
  `  function openCarryCorrection(eventId) {
    const defaults = carryCorrectionDefaults(eventListEvents.find(event => event.id === eventId));
    if (defaults) onOpenAdd?.(defaults);
  }

  function handleGraphEventTap(eventId) {
    // Selecting a continuation is read-only; Edit opens an explicit Insert draft.`);
const oldGuard = 'if (visibleEvent?.displayOnly || visibleEvent?.carriedFromPreviousDay || visibleEvent?.syntheticCoverage) return;';
const newGuard = 'if (state.selectMode && (visibleEvent?.displayOnly || visibleEvent?.carriedFromPreviousDay || visibleEvent?.syntheticCoverage)) return;';
patch(day, oldGuard, newGuard);
patch(day, 'onToggleSelected={onToggleSelectedId} onOpenEdit={onOpenEdit} />', 'onToggleSelected={onToggleSelectedId} onOpenEdit={onOpenEdit} onCorrectCarry={openCarryCorrection} />');

const list = 'source/src/modules/logbook/EventList.jsx';
patch(list, 'onToggleSelected, onOpenEdit })', 'onToggleSelected, onOpenEdit, onCorrectCarry })');
patch(list,
  'onClick={() => continuityOnly ? undefined : (selectMode ? onToggleSelected(event.id) : onSelect?.(event.id))}',
  'onClick={() => selectMode ? (!continuityOnly && onToggleSelected(event.id)) : onSelect?.(event.id)}');
patch(list,
  '<span className="event-continuity-tag-v11026">{event.isLive ? \'Now\' : \'Sign\'}</span>',
  '<button type="button" className="blue-edit carry-edit-action-v110365" aria-label="Edit continued status" onClick={(e) => { e.stopPropagation(); onCorrectCarry?.(event.id); }}>Edit</button>');

const insert = 'source/src/modules/editor/InsertEditEventSheet.jsx';
patch(insert, '<div>Insert Duty Status</div>', '<div>{defaults.carryCorrection ? \'Edit Duty Status\' : \'Insert Duty Status\'}</div>');
patch(insert,
  '<div className="form editor-form-v85">',
  '<div className="form editor-form-v85">\n        {defaults.carryCorrection && <p className="carry-edit-help-v110365">Save this interval for {logbookContext.activeDay}.</p>}');

const css = 'source/src/modules/editor/modern-editor-v11027.css';
if (!read(css).includes('CARRY_EDIT_V110365')) fs.appendFileSync(css, `
/* CARRY_EDIT_V110365: a real touch target opens a draft for this log day. */
.logbook-ui-v110 .event-row.continuity-only-v11026{cursor:pointer!important}
.logbook-ui-v110 .carry-edit-action-v110365{min-width:52px!important;min-height:44px!important;height:44px!important;flex:none!important;touch-action:manipulation}
.editor-ui-v110 .carry-edit-help-v110365{margin:0 0 8px;color:#536176;font-size:13px;line-height:1.4}
`);

// This assertion runs at earlier release stages with their original guard.
// Revise it only after the new selection/draft behavior is installed.
patch('scripts/test-duty-graph-continuity.mjs', oldGuard, newGuard);

const VERSION = '110.3.65', BUILD = 'v110365-carried-status-edit';
for (const path of ['release-version.json', 'public/app-version.json']) {
  const value = JSON.parse(read(path));
  Object.assign(value, {version:VERSION, build:BUILD, force:false, label:'v110.3.65 Edit continued duty status', releasedAt:new Date().toISOString(), updatedAt:new Date().toISOString(), sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null,
    notes:['Edit continued OFF, Sleeper or On Duty for the selected log day.', 'Open a draft from the event row or graph selection and save an explicit interval.', 'Keep edit history and require review of the changed day signature.']});
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
patch('scripts/test-duty-graph-continuity.mjs', "assert.equal(meta.version,'110.3.64');assert.equal(meta.build,'v110364-native-pdf-cells');", `assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
patch('scripts/test-editor-grips-v110355.mjs', "assert.equal(meta.version,'110.3.64'); assert.equal(meta.build,'v110364-native-pdf-cells');", `assert.equal(meta.version,'${VERSION}'); assert.equal(meta.build,'${BUILD}');`);

// Intentional reviewed change to this locked UI boundary. Persistence and
// signature implementations keep their existing independent locks.
const lockPath = 'module-locks.v1.json', locks = JSON.parse(read(lockPath));
locks.release = VERSION;
assert.equal(crypto.createHash('sha256').update(read(day)).digest('hex'), reviewedDayHash, 'Unexpected DayLogScreen outside reviewed correction wiring');
locks.files[day] = reviewedDayHash;
fs.writeFileSync(lockPath, JSON.stringify(locks, null, 2) + '\n');
console.log('PASS — 110.3.65 continued duty segments open a current-day correction draft');
