import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '104.3.0';
const RELEASED_AT = '2026-07-17T18:45:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v104.3 missing ${label}`);
  return content.replace(before, after);
}
function replaceRegex(content, pattern, replacement, marker, label) {
  if (marker && content.includes(marker)) return content;
  if (!pattern.test(content)) throw new Error(`v104.3 missing ${label}`);
  return content.replace(pattern, replacement);
}

// Run deterministic multi-stop progress repair after the existing route repair.
const appPath = 'source/src/app/App.jsx';
let app = read(appPath);
app = replaceOnce(
  app,
  "import { repairMultiStopDeliveryStateV1034 } from '../modules/loads/multiStopDeliveryV1034.js';",
  "import { repairMultiStopDeliveryStateV1034 } from '../modules/loads/multiStopDeliveryV1034.js';\nimport { repairMultiStopProgressStateV1043 } from '../modules/loads/multiStopProgressV1043.js';",
  'App multi-stop progress import',
);
app = replaceOnce(
  app,
  "  return reconcileCertificationStatusesV1032(repairMultiStopDeliveryStateV1034(inspectionNormalized, { source:'normalize_v1034' }));",
  "  return reconcileCertificationStatusesV1032(repairMultiStopProgressStateV1043(repairMultiStopDeliveryStateV1034(inspectionNormalized, { source:'normalize_v1034' }), { source:'normalize_v1043' }));",
  'state normalization progress repair',
);
app = app.replaceAll(
  "return markRecert(repairMultiStopDeliveryStateV1034(next, { source:'state_write_v1034' }));",
  "return markRecert(repairMultiStopProgressStateV1043(repairMultiStopDeliveryStateV1034(next, { source:'state_write_v1034' }), { source:'state_write_v1043' }));",
);
write(appPath, app);

// Enrich the mission resolver with reached/current/completed stop inference.
const guidePath = 'source/src/modules/loads/loadGuideV103.js';
let guide = read(guidePath);
if (!guide.includes("from './multiStopProgressV1043.js'")) {
  guide = `import { enrichDriverGuideProgressV1043 } from './multiStopProgressV1043.js';\n${guide}`;
}
if (!guide.includes('function resolveDriverGuideV103Base(')) {
  guide = replaceOnce(
    guide,
    'export function resolveDriverGuideV103(state = {}, guideInput = null) {',
    'function resolveDriverGuideV103Base(state = {}, guideInput = null) {',
    'base mission resolver rename',
  );
}
if (!guide.includes("return enrichDriverGuideProgressV1043(state, base);")) {
  guide = `${guide.trimEnd()}\n\nexport function resolveDriverGuideV103(state = {}, guideInput = null) {\n  const base = resolveDriverGuideV103Base(state, guideInput);\n  return enrichDriverGuideProgressV1043(state, base);\n}\n`;
}
write(guidePath, guide);

// Home must follow the actual stop reached by the live log, even when an older
// checklist route step was never manually tapped Done.
const adaptiveLogicPath = 'source/src/modules/home/adaptiveHomeLogicV1038.js';
let adaptiveLogic = read(adaptiveLogicPath);
adaptiveLogic = replaceOnce(
  adaptiveLogic,
  '  const currentSequence = Number(currentStep?.stopSequence || activeLoad?.currentStop || 0);',
  '  const currentSequence = Number(progress.currentStopSequence || progress.activeStopSequence || guide?.currentStopSequence || activeLoad?.currentStop || currentStep?.stopSequence || 0);',
  'adaptive Home actual stop priority',
);
write(adaptiveLogicPath, adaptiveLogic);

// Keep the active-load summary aligned with repaired route legs and loadInfo.
const homePath = 'source/src/modules/home/HomeScreen.jsx';
let home = read(homePath);
home = replaceOnce(
  home,
  "  const completedStops = ordered.filter(leg => String(leg.status || '').toLowerCase() === 'delivered').length;",
  "  const completedStops = Math.max(ordered.filter(leg => String(leg.status || '').toLowerCase() === 'delivered').length, Number(info.completedStops || 0));",
  'active load completed-stop fallback',
);
home = replaceOnce(
  home,
  '    currentStop:Math.min(ordered.length, completedStops + 1),',
  '    currentStop:Math.min(ordered.length, Math.max(1, Number(info.currentStopSequence || info.activeStopSequence || completedStops + 1))),',
  'active load current-stop fallback',
);
write(homePath, home);

// Starting a fresh ON DUTY status must not silently preselect Pre-trip. That
// default caused Delivery / Unloading rows to be saved as a combined pre-trip.
const statusPath = 'source/src/modules/status/StatusWorkflowSheet.jsx';
let status = read(statusPath);
status = replaceOnce(
  status,
  "  const initialReason = guidePrefill.reason || reasonList(initialStatus)[0];",
  "  const initialReason = guidePrefill.reason || (initialStatus === 'ON' ? '' : reasonList(initialStatus)[0]);",
  'ON DUTY empty initial activity',
);
status = replaceOnce(
  status,
  '  const [selectedReasons, setSelectedReasons] = useState([initialReason]);',
  '  const [selectedReasons, setSelectedReasons] = useState(initialReason ? [initialReason] : []);',
  'ON DUTY selected activity state',
);
status = status.replaceAll(
  '    setSelectedReasons([reasonList(next)[0]]);',
  "    setSelectedReasons(next === 'ON' ? [] : [reasonList(next)[0]]);",
);
status = replaceOnce(
  status,
  '    const reason = reasonText(selectedReasons) || reasonList(status)[0];',
  "    const reason = reasonText(selectedReasons) || (status === 'ON' ? '' : reasonList(status)[0]);",
  'ON DUTY no hidden fallback',
);
if (!status.includes("Choose at least one ON DUTY activity.")) {
  status = replaceRegex(
    status,
    /  function save\(\) \{\n/,
    "  function save() {\n    if (status === 'ON' && !reasonText(selectedReasons)) {\n      setGpsStatus('Choose at least one ON DUTY activity.');\n      return;\n    }\n",
    'Choose at least one ON DUTY activity.',
    'ON DUTY save validation',
  );
}
write(statusPath, status);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) {
  lock.packages[''].version = VERSION;
  lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
}
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v104.3-live-multistop-progress',
  releasedAt:RELEASED_AT,
  notes:[
    'Uses real Delivery / Unloading events, event location, load references, route legs and the current location to determine which multi-stop delivery is active.',
    'Automatically closes an earlier stop after the driver reaches or starts unloading at a later stop, without changing duty-status time, status, note or location.',
    'Repairs the active load, route-leg statuses, completed-stop count and Driver Mission so Home follows the actual stop instead of a stale route checklist step.',
    'Marks route, arrival, paperwork, completion and departure steps for prior stops complete when later-stop evidence proves the driver moved on.',
    'Treats a Delivery / Unloading event containing a legacy Pre-trip label as delivery evidence while leaving the certified log text untouched.',
    'Removes the hidden Pre-trip default from new ON DUTY entries and requires the driver to choose the real activity before saving.'
  ],
  label:'v104.3 Live Multi-stop Progress',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

for (const [relative, marker] of [
  [appPath,'repairMultiStopProgressStateV1043'],
  [guidePath,'enrichDriverGuideProgressV1043'],
  [adaptiveLogicPath,'progress.currentStopSequence'],
  [homePath,'Number(info.completedStops || 0)'],
  [statusPath,"initialStatus === 'ON' ? ''"],
  [statusPath,'Choose at least one ON DUTY activity.'],
  ['source/src/modules/loads/multiStopProgressV1043.js','inferMultiStopProgressV1043'],
]) {
  if (!read(relative).includes(marker)) throw new Error(`v104.3 verification missing ${marker} in ${relative}`);
}

console.log('v104.3 live multi-stop progress materialized');
await import('./verify-multistop-progress-v1043.mjs');
await import('./prepare-v105-foundation-logic.mjs');
await import('./materialize-v105-road-ready-os.mjs');
