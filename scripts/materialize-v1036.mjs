import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '103.6.0';
const RELEASED_AT = '2026-07-16T19:30:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}

await import('./materialize-v1036-ui.mjs');
await import('./materialize-v1036-coverage.mjs');

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
  build:'v103.6-live-duty-status-duration',
  releasedAt:RELEASED_AT,
  notes:[
    'Keeps the current OFF, Sleeper, Driving or ON DUTY status running until the driver selects a different status.',
    'Refreshes graph, event duration and HOS display as home-terminal time advances.',
    'Prevents DOT Check and Fix Wizard from reporting a false gap after the short raw live-status row.',
    'Closes the previous status at the exact minute of the next driver-selected status change.',
    'Uses derived live time for the active display and checks without changing stored past events.'
  ],
  label:'v103.6 Live Duty Status Duration',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

for (const [relative, marker] of [
  ['source/src/modules/logbook/DayLogScreen.jsx','liveMinuteV1036'],
  ['source/src/core/compliance/rawRodsChecks.js','coverageBaseV1036'],
  ['source/src/core/dot/dotOfficerCheckEngine.js','liveCoverageOptionsV1036'],
  ['source/src/modules/logbook/signing.js','liveCoverageOptionsV1036'],
]) {
  if (!read(relative).includes(marker)) throw new Error(`v103.6 missing ${marker} in ${relative}`);
}
console.log('v103.6 live duty status materialized');
await import('./verify-live-duty-status-v1036.mjs');
