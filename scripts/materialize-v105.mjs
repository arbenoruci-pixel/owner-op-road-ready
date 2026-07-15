import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '100.5.0';
const RELEASED_AT = '2026-07-15T19:45:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
const write = (relative, content) => fs.writeFileSync(file(relative), content);

await import('./materialize-v105-route-sign.mjs');
await import('./materialize-v105-app-home.mjs');
await import('./materialize-v105-guide.mjs');

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v100.5-active-load-signing-integrity',
  releasedAt:RELEASED_AT,
  notes:[
    'Makes the Home Active Load card follow the active Driver Mission and current Rate Confirmation instead of an older unfinished route.',
    'Scopes carry-in route metadata to the active load so unrelated legacy loads no longer create Route / shipping review cards on another log day.',
    'Repairs completed days that remained labeled Active day after midnight and makes them available for signature or recertification.',
    'Allows truthful HOS violation/review items to be certified after an explicit warning; only missing or invalid RODS data blocks signing.',
    'Makes Driver Mission progress date/location aware, recognizes a pre-trip at the real start location, and stops unrelated Driving events from completing future stops.',
    'Preserves native PDF.js Rate Con reading, smart type arbitration, multi-stop routing, BOL/POD linking, HOS, DOT and business data.'
  ],
  label:'v100.5 Active Load & Signing Integrity',
  updatedAt:RELEASED_AT
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const route = read('source/src/core/routes/routeNormalization.js');
const signing = read('source/src/modules/logbook/signing.js');
const day = read('source/src/modules/logbook/DayLogScreen.jsx');
const app = read('source/src/app/App.jsx');
const home = read('source/src/modules/home/HomeScreen.jsx');
const guide = read('source/src/modules/loads/loadGuideV103.js');
if (!route.includes('activeRouteScopeV105') || !route.includes('scope.refs.has')) throw new Error('v100.5 route scope integration failed');
if (!signing.includes("severity === 'notice' || severity === 'review' || severity === 'violation'") || !signing.includes("const ready = fixRequired.length === 0;")) throw new Error('v100.5 signing policy integration failed');
if (!day.includes('blockers.filter(isFatalSigningIssue)')) throw new Error('v100.5 Sign tab integration failed');
if (!app.includes('normalizeCompletedDayCertificationV105')) throw new Error('v100.5 certification repair integration failed');
if (!home.includes('activeGuideLoadSummaryV105')) throw new Error('v100.5 Home active load integration failed');
if (!guide.includes('eventMatchesGuideReferenceV105') || !guide.includes('statusStepComplete(state, guide, step)')) throw new Error('v100.5 guide progress integration failed');
console.log('v100.5 Active Load & Signing Integrity materialized');
await import('./verify-logbook-load-integrity-v105.mjs');
