import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const dayPath='source/src/modules/logbook/DayLogScreen.jsx';
const day=fs.readFileSync(dayPath,'utf8');
const app=fs.readFileSync('source/src/app/App.jsx','utf8');
const css=fs.readFileSync('source/src/styles.css','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const updater=fs.readFileSync('source/src/core/update/appUpdate.js','utf8');
const meta=JSON.parse(fs.readFileSync('public/app-version.json','utf8'));
const locks=JSON.parse(fs.readFileSync('module-locks.v1.json','utf8'));

const wizard=day.match(/function CoverageFixWizard\([\s\S]*?\n}\n\nfunction MissingDayModal/);
assert.ok(wizard,'CoverageFixWizard block missing');
assert.match(wizard[0],/onNextProblem/);
assert.match(wizard[0],/const rootDay = issue\?\._wizardRootDay \|\| day/);
assert.match(wizard[0],/const \[advanceAfterSave, setAdvanceAfterSave\] = useState\(null\)/);
assert.match(wizard[0],/!advanceAfterSave && issue\?\.fixAction === 'OPEN_COVERAGE_WIZARD'/);
assert.match(wizard[0],/setAdvanceAfterSave\(\{ id:block\.id \|\| '', startMin:block\.startMin, endMin:block\.endMin \}\)/);
assert.match(wizard[0],/onNextProblem\?\.\(\{ day:targetDay, rootDay \}\)/);
assert.match(wizard[0],/onNextProblem\?\.\(\{ day:targetDay, rootDay, skipped:true \}\)/);
assert.match(wizard[0],/onClick=\{skipCurrent\}>Skip/);
assert.doesNotMatch(wizard[0],/note: note \|\| statusDefaultNote\(status\),\n    \}\);\n    setIndex\(0\);/);

assert.match(day,/function advanceToNextProblem\(\{ fixedDay = state\.activeDay, rootDay = state\.activeDay, skipped = false \} = \{\}\)/);
assert.match(day,/buildDotOfficerCheck\(state, reviewDay\)/);
assert.match(day,/row\.issue && !\(skipped && row\.day === fixedDay\)/);
assert.match(day,/_wizardRootDay:reviewDay/);
assert.match(day,/setCoverageWizardIssue\(\{ \.\.\.issue, _wizardRootDay:issue\?\._wizardRootDay \|\| state\.activeDay \}\)/);
assert.match(day,/onNextProblem=\{advanceToNextProblem\}/);

assert.match(app,/setUndoNotice\(null\), 2400/);
assert.doesNotMatch(app,/setUndoNotice\(null\), 10000/);
assert.match(css,/COMPACT_UNDO_NOTICE_V11027/);
assert.match(css,/top:calc\(env\(safe-area-inset-top\) \+ 64px\)!important/);
assert.match(css,/max-width:min\(270px,calc\(100vw - 24px\)\)!important/);
assert.match(css,/pointer-events:none!important/);
assert.match(css,/\.change-undo-bar button\{[^}]*pointer-events:auto!important/);

assert.equal(meta.version,'110.2.7');
assert.equal(meta.build,'v110207-wizard-next');
assert.equal(meta.force,false);
assert.match(sw,/OWNER_OP_SW_BUILD = 'v110207-wizard-next'/);
assert.match(updater,/FALLBACK_APP_BUILD = 'v110207-wizard-next'/);

const actualHash=crypto.createHash('sha256').update(fs.readFileSync(dayPath)).digest('hex');
assert.equal(locks.files[dayPath],actualHash,'reviewed DayLogScreen lock must match finalized runtime');

console.log('PASS — Fix Wizard advances after persistence, preserves review root, and compact Undo clears quickly without blocking controls');
