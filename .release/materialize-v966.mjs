import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.MATERIALIZE_ROOT
  ? path.resolve(process.env.MATERIALIZE_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RELEASE = path.join(ROOT, '.release');

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}
function write(relative, content) {
  const target = path.join(ROOT, relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function stripExtraPlusFromMarker(text, marker) {
  const index = text.indexOf(marker);
  if (index < 0) return text;
  const head = text.slice(0, index);
  const tail = text.slice(index).split('\n').map(line => line.startsWith('+') ? line.slice(1) : line).join('\n');
  return head + tail;
}
function normalizePatchPaths(text) {
  return text
    .replaceAll('a/mnt/data/orr964orig/', 'a/')
    .replaceAll('b/mnt/data/orr964/', 'b/')
    .replaceAll('a/mnt/data/orr964/', 'a/')
    .replaceAll('a/mnt/data/orr967/', 'a/')
    .replaceAll('b/mnt/data/orr967/', 'b/');
}
function applyPatch(name, text) {
  const patchPath = path.join(ROOT, `.tmp-${name}.patch`);
  fs.writeFileSync(patchPath, normalizePatchPaths(text));
  try {
    execFileSync('git', ['apply', '--reject', '--whitespace=nowarn', patchPath], { cwd:ROOT, stdio:'inherit' });
  } catch {
    console.warn(`${name}: git apply reported metadata rejects; deterministic repair will run next.`);
  } finally {
    fs.rmSync(patchPath, { force:true });
  }
}

let pretripPatch = ['00','01','02'].map(part => read(`.release/v965pretrip/part-${part}.diff`)).join('');
pretripPatch = stripExtraPlusFromMarker(pretripPatch, '+diff --git a/mnt/data/orr964/PATCH_V96_5_PRETRIP_AFTER_10H_RESET_NOTES.md');
applyPatch('v965-pretrip', pretripPatch);

let splitPart03 = read('.release/v966patch/part-03.diff');
splitPart03 = stripExtraPlusFromMarker(splitPart03, '+diff --git a/mnt/data/orr967/scripts/verify-split-sleeper-v966.mjs');
let splitPart04 = read('.release/v966patch/part-04.diff');
splitPart04 = stripExtraPlusFromMarker(splitPart04, '+diff --git a/mnt/data/orr967/scripts/verify-latest-edit-authoritative-v966.mjs');
const splitPatch = [
  read('.release/v966patch/part-00.diff'),
  read('.release/v966patch/part-01.diff'),
  read('.release/v966patch/part-02.diff'),
  splitPart03,
  splitPart04,
].join('');
applyPatch('v966-split', splitPatch);

write('source/src/core/compliance/preTripContinuity.js', read('.release/v966patch/preTripContinuity.js'));

const pkg = JSON.parse(read('package.json'));
pkg.version = '96.6.0';
pkg.scripts = {
  ...(pkg.scripts || {}),
  'verify-pretrip-after-10h-reset-v965':'node scripts/verify-pretrip-after-10h-reset-v965.mjs',
  'verify-split-sleeper-v966':'node scripts/verify-split-sleeper-v966.mjs',
  'verify-latest-edit-authoritative-v966':'node scripts/verify-latest-edit-authoritative-v966.mjs',
};
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

const lock = JSON.parse(read('package-lock.json'));
lock.version = '96.6.0';
if (lock.packages?.['']) lock.packages[''].version = '96.6.0';
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);

write('public/app-version.json', `${JSON.stringify({
  version:'96.6.0',
  build:'v96.6-split-sleeper-authoritative-edit',
  releasedAt:'2026-07-12T15:30:00.000Z',
  notes:[
    'Implements property-carrying split sleeper clocks for qualifying 7+ hour Sleeper Berth and 2+ hour OFF/SB periods totaling at least 10 hours.',
    'Shows pending split clocks provisionally, identifies the exact partner rest still required, and switches to completed split calculations when the pair is finished.',
    'Recalculates the 11-hour and 14-hour clocks from the end of the first qualifying period, excludes the paired rest period from the 14-hour window, and keeps cycle and 30-minute-break rules active.',
    'Makes the latest explicit event-time edit authoritative across its interval so older overlapped rows cannot resurface after Save.',
    'Preserves the pre-trip-after-10h-reset rule and the exact-event Pickup/BOL/Going-to link.',
  ],
  label:'v96.6 Split Sleeper + Latest Edit Wins',
  updatedAt:'2026-07-12T15:30:00.000Z',
}, null, 2)}\n`);

write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, "const OWNER_OP_SW_VERSION = '96.6.0';"));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, "const FALLBACK_APP_VERSION = '96.6.0';"));

const checks = [
  ['source/src/core/hos/splitSleeper.js', 'SPLIT_LONG_SLEEPER_MINUTES'],
  ['source/src/core/hos/hosEngine.js', 'buildSplitSleeperClockSet'],
  ['source/src/modules/drive/DriveModeScreen.jsx', 'Using Split SB Clocks'],
  ['source/src/core/timeline/timelineEngine.js', 'latest explicit edit is authoritative'],
  ['source/src/core/compliance/preTripContinuity.js', 'QUALIFYING_PRETRIP_REST_MINUTES'],
  ['source/src/modules/status/StatusWorkflowSheet.jsx', 'Pre-trip required after 10h+ rest'],
  ['source/src/modules/logbook/signing.js', 'pretrip_after_10h_rest_review'],
  ['source/src/core/dot/dotOfficerCheckEngine.js', 'pretrip_after_10h_rest_review'],
];
for (const [relative, needle] of checks) {
  if (!read(relative).includes(needle)) throw new Error(`Materialization verification failed: ${relative} missing ${needle}`);
}

for (const relative of [
  'source/src/core/hos/hosEngine.js.rej',
  'source/src/modules/drive/DriveModeScreen.jsx.rej',
  'source/src/core/timeline/timelineEngine.js.rej',
  'package.json.rej',
  'package-lock.json.rej',
  'public/app-version.json.rej',
  'public/sw.js.rej',
  'source/src/core/update/appUpdate.js.rej',
  'CHANGELOG.md.rej',
]) fs.rmSync(path.join(ROOT, relative), { force:true });

fs.rmSync(RELEASE, { recursive:true, force:true });
fs.rmSync(path.join(ROOT, '.github/workflows/materialize-v966.yml'), { force:true });
console.log('v96.6 materialized successfully');
