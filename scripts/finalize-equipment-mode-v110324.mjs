import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = file => fs.readFileSync(file, 'utf8');
function patch(file, before, after) {
  const source = read(file);
  if (source.includes(after)) return;
  assert.equal(source.split(before).length - 1, 1, `Equipment mode anchor: ${file}`);
  fs.writeFileSync(file, source.replace(before, after));
}
function optionalPatch(file, before, after) {
  const source = read(file);
  if (source.includes(after) || !source.includes(before)) return;
  assert.equal(source.split(before).length - 1, 1, `Equipment mode optional anchor: ${file}`);
  fs.writeFileSync(file, source.replace(before, after));
}

const status = 'source/src/modules/status/StatusWorkflowSheet.jsx';
fs.copyFileSync('scripts/v110324/equipmentMode.js', 'source/src/modules/status/equipmentMode.js');
patch(status,
  "import { getAccurateGpsLocation } from '../../core/gps/locationService.js';",
  "import { getAccurateGpsLocation } from '../../core/gps/locationService.js';\nimport { isIntermodalModeActive } from './equipmentMode.js';");
patch(status,
  "const onReasons = ['Pre-trip inspection', 'Fuel', 'Pickup / Loading', 'Delivery / Unloading', 'Waiting', 'Drop Trailer', 'Drop Off', 'Drop & Hook', 'Hook Empty / Reposition'];",
  "const onReasons = ['Pre-trip inspection', 'Fuel', 'Pickup / Loading', 'Delivery / Unloading', 'Waiting'];\nconst trailerReasons = ['Drop Trailer', 'Hook / Pickup Trailer'];\nconst intermodalReasons = ['Drop Off', 'Drop & Hook', 'Hook Empty / Reposition'];");
patch(status, "function reasonList(status) {\n  if (status === 'ON') return onReasons;",
  "function reasonList(status, intermodalMode = false) {\n  if (status === 'ON') return [...onReasons, ...(intermodalMode ? intermodalReasons : trailerReasons)];");
patch(status,
  'export default function StatusWorkflowSheet({ state, onClose, onApplyStatus, onStartDriving }) {',
  'export default function StatusWorkflowSheet({ state, onClose, onApplyStatus, onStartDriving }) {\n  const intermodalMode = isIntermodalModeActive(state);');
optionalPatch(status,
  'const initialReason = guidePrefill.reason || reasonList(initialStatus)[0];',
  'const initialReason = guidePrefill.reason || reasonList(initialStatus, intermodalMode)[0];');
optionalPatch(status,
  "useState([reasonList(state.currentStatus || 'OFF')[0]])",
  "useState([reasonList(state.currentStatus || 'OFF', intermodalMode)[0]])");
patch(status, 'setSelectedReasons([reasonList(next)[0]]);', 'setSelectedReasons([reasonList(next, intermodalMode)[0]]);');
patch(status, 'reasonText(selectedReasons) || reasonList(status)[0]', 'reasonText(selectedReasons) || reasonList(status, intermodalMode)[0]');
for (const [before, after] of [
  ['if (dropOffSelected && !dropContainer.trim() && !dropChassis.trim())', 'if (intermodalMode && dropOffSelected && !dropContainer.trim() && !dropChassis.trim())'],
  ['if (dropHookSelected && (!hookContainer.trim() || !hookChassis.trim() || !hookDestination.trim()))', 'if (intermodalMode && dropHookSelected && (!hookContainer.trim() || !hookChassis.trim() || !hookDestination.trim()))'],
  ['if (dropHookSelected && !hookLoadNo.trim())', 'if (intermodalMode && dropHookSelected && !hookLoadNo.trim())'],
  ['if (hookEmptySelected && (!hookContainer.trim() && !hookChassis.trim()))', 'if (intermodalMode && hookEmptySelected && (!hookContainer.trim() && !hookChassis.trim()))'],
  ['if (hookEmptySelected && !hookDestination.trim())', 'if (intermodalMode && hookEmptySelected && !hookDestination.trim())'],
  ['const equipmentDropSelected = dropHookSelected || dropOffSelected || hookEmptySelected;', 'const equipmentDropSelected = intermodalMode && (dropHookSelected || dropOffSelected || hookEmptySelected);'],
  ['{reasonList(status).map(r => (', '{reasonList(status, intermodalMode).map(r => ('],
]) patch(status, before, after);

const VERSION = '110.3.24';
const BUILD = 'v110324-trailer-intermodal-mode-separation';
for (const file of ['release-version.json', 'public/app-version.json']) {
  const data = JSON.parse(read(file));
  Object.assign(data, {
    version:VERSION, build:BUILD, force:false,
    label:'v110.3.24 Trailer and intermodal drop separation',
    releasedAt:new Date().toISOString(), updatedAt:new Date().toISOString(),
    sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null,
    notes:[
      'Normal trailer status actions no longer show container or chassis fields.',
      'Intermodal Drop Off, Drop & Hook and Hook Empty retain their container/chassis workflow.',
      'A real active trailer number overrides the stale legacy intermodal default when no container or chassis is active.',
    ],
  });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
for (const file of ['package.json', 'package-lock.json']) {
  const data = JSON.parse(read(file));
  data.version = VERSION;
  if (data.packages?.['']) data.packages[''].version = VERSION;
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
for (const [file, name] of [['source/src/core/update/appUpdate.js', 'FALLBACK_APP'], ['public/sw.js', 'OWNER_OP_SW']]) {
  let source = read(file);
  for (const [key, value] of [['VERSION', VERSION], ['BUILD', BUILD]]) {
    source = source.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['\"][^'\"]+['\"];?`), `const ${name}_${key} = '${value}';`);
  }
  fs.writeFileSync(file, source);
}
for (const file of ['source/src/modules/home/HomeScreen.jsx', 'source/src/shared/ui/ToolsSheet.jsx']) {
  fs.writeFileSync(file, read(file).replace(/App v\d+\.\d+\.\d+/g, `App v${VERSION}`).replace(/APP V\d+\.\d+\.\d+/g, `APP V${VERSION}`));
}
{
  const file = 'scripts/test-duty-graph-continuity.mjs';
  const expected = `assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`;
  const source = read(file);
  if (!source.includes(expected)) {
    const pattern = /assert\.equal\(meta\.version,'[^']+'\);assert\.equal\(meta\.build,'[^']+'\);/;
    assert.equal((source.match(new RegExp(pattern.source, 'g')) || []).length, 1, `Equipment mode release anchor: ${file}`);
    fs.writeFileSync(file, source.replace(pattern, expected));
  }
}

console.log('PASS — trailer and intermodal status actions are separated');
