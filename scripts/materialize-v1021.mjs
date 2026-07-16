import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '102.1.0';
const RELEASED_AT = '2026-07-16T02:15:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function appendOnce(content, marker, addition) {
  return content.includes(marker) ? content : `${content.trimEnd()}\n\n${addition.trim()}\n`;
}

const commandCssPath = 'source/src/command-center.css';
let commandCss = read(commandCssPath);
commandCss = appendOnce(commandCss, '/* v102.1 Google Receiver Intel */', read('source/src/receiver-intel-v1021.css'));
write(commandCssPath, commandCss);

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
  build:'v102.1-google-receiver-intelligence',
  releasedAt:RELEASED_AT,
  notes:[
    'Connects each active-load receiver to Google Places using the facility name, address or Google Place ID from the load stop.',
    'Shows the Google rating, returned review count, relevant review text, business phone, address and a direct Open Google Maps action.',
    'Analyzes returned reviews for early check-in, one-day-early evidence, turnaround time, parking, tandems, lumper, restroom and gate or call-in instructions.',
    'Calculates early-arrival evidence from appointment and arrival times written in truck-driver reviews, while leaving one-day-early acceptance unconfirmed unless a review says it directly.',
    'Keeps the Google API key server-side and requires GOOGLE_PLACES_API_KEY in the Vercel environment; the key is never exposed to the browser.',
    'Does not create or change any Logbook duty-status event, time, location, signature, route completion or billing record.'
  ],
  label:'v102.1 Google Receiver Intel',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const checks = [
  ['app/api/places/receiver/route.js','places.googleapis.com/v1/places:searchText'],
  ['app/api/places/receiver/route.js','GOOGLE_PLACES_API_KEY'],
  ['source/src/modules/receiver/receiverIntelEngineV1021.js','analyzeReceiverReviewsV1021'],
  ['source/src/modules/receiver/ReceiverIntelV1021.jsx','Receiver Intel'],
  ['source/src/modules/home/ActiveLoadLiveV102.jsx','ReceiverIntelV1021'],
  ['source/src/command-center.css','receiver-intel-overlay-v1021'],
];
for (const [relative, needle] of checks) {
  if (!read(relative).includes(needle)) throw new Error(`v102.1 verification missing ${needle} in ${relative}`);
}
console.log('v102.1 Google Receiver Intel materialized');
await import('./verify-receiver-intel-v1021.mjs');
await import('./materialize-v1030.mjs');
