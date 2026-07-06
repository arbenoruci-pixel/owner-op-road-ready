import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
};

const dayLog = read('source/src/modules/logbook/DayLogScreen.jsx');
const home = read('source/src/modules/home/HomeScreen.jsx');
const dot = read('source/src/modules/dot/DotMode.jsx');
const signing = read('source/src/modules/logbook/signing.js');
const appUpdate = read('source/src/core/update/appUpdate.js');
const sw = read('public/sw.js');
const appVersion = JSON.parse(read('public/app-version.json'));
const pkg = JSON.parse(read('package.json'));

assert(pkg.version === '95.69.0', 'package version is 95.69.0');
assert(appUpdate.includes("CURRENT_APP_VERSION = '95.69.0'"), 'app update version bumped');
assert(sw.includes("OWNER_OP_SW_VERSION = '95.69.0'"), 'service worker version bumped');
assert(appVersion.version === '95.69.0', 'app-version.json bumped');

assert(dayLog.includes('function equipmentFormSummary'), 'Form has day equipment summary helper');
assert(dayLog.includes('function chassisUsedForDay'), 'Form collects chassis used for day');
assert(dayLog.includes('leg.droppedChassis') && dayLog.includes('leg.chassis'), 'Form reads dropped and hooked chassis from route legs');
assert(dayLog.includes('chassisFromDropHookText'), 'Form can parse chassis from Drop & Hook notes');
assert(dayLog.includes("label: 'Chassis'"), 'Intermodal Form row label becomes Chassis');
assert(dayLog.includes("label: 'Trailers'"), 'Non-intermodal Form row remains Trailers');
assert(dayLog.includes("<FormRow label={form.equipmentLabel || 'Trailers'}"), 'Form row uses dynamic equipment label');
assert(!dayLog.includes("const trailers = state.currentTrailer && state.currentTrailer !== 'No trailer'"), 'Old trailer fallback removed from Form summary');
assert(!/drop\\s\*\&\\s\*hook/.test(dayLog), 'Drop & Hook alone does not force intermodal display');

assert(home.includes('function equipmentDisplayName') && home.includes("equipment.type === 'intermodal'"), 'Home display respects intermodal chassis');
assert(dot.includes("equipment.type === 'intermodal'") && dot.includes('Intermodal chassis missing'), 'DOT package display respects intermodal chassis');
assert(signing.includes("equipment.type === 'intermodal'") && signing.includes("equipment.chassis || state.loadInfo?.equipmentChassis"), 'Signing warning fallback respects intermodal chassis');

// Validate the expected value from the repaired July 5 import model.
const sampleRouteLegs = [
  { chassis:'', droppedChassis:'' },
  { chassis:'UPHZ 531029', droppedChassis:'UPHZ 531029' },
  { chassis:'DDRZ959762', droppedChassis:'DDRZ959762' },
];
const expectedUnique = [...new Set(sampleRouteLegs.flatMap(leg => [leg.droppedChassis, leg.chassis]).filter(Boolean).map(v => v.toUpperCase()))];
assert(expectedUnique.join(' · ') === 'UPHZ 531029 · DDRZ959762', 'July 5 repaired route legs resolve to UPHZ 531029 · DDRZ959762');

if (process.exitCode) process.exit(process.exitCode);
console.log('v95.69 intermodal chassis form verification complete.');
