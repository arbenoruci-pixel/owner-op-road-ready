import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '108.0.0';
const RELEASED_AT = '2026-07-20T06:55:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
const write = (relative, content) => { const target = file(relative); fs.mkdirSync(path.dirname(target), { recursive:true }); fs.writeFileSync(target, content); };

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
write('package.json', JSON.stringify(pkg, null, 2) + '\n');

const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) {
  lock.packages[''].version = VERSION;
  lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
}
write('package-lock.json', JSON.stringify(lock, null, 2) + '\n');

const contracts = 'source/src/modules/scan/scannerContractsV106.js';
write(contracts, read(contracts).replace(/ROAD_READY_SCANNER_VERSION_V106 = '[^']+';/, `ROAD_READY_SCANNER_VERSION_V106 = '${VERSION}';`));
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));
write('public/app-version.json', JSON.stringify({
  version:VERSION,
  build:'v1080-scanbot-auto-review',
  releasedAt:RELEASED_AT,
  label:'v108.0 Scanbot Auto Review',
  notes:[
    'Removes the acknowledgement loop that returned an accepted page to the camera thumbnail tray.',
    'One camera or Photos page now moves directly into the Scanbot Review screen with Crop, Rotate, Retake and Submit.',
    'Adds robust Scanbot page image API detection and explicit export errors instead of an endless processing spinner.',
    'Keeps Scanbot as the only active scanner and preserves the immutable original, restored OCR page and reader safety.',
    'Adds bounded scanner, export and JPEG timeouts with clear failure states.'
  ]
}, null, 2) + '\n');

const runtime = read('source/src/modules/scan/scanbotRtuV1076.js');
const capture = read('source/src/modules/scan/SmartDocumentCaptureV106.jsx');
const checks = [
  [runtime.includes('config.outputSettings.pagesScanLimit = 1;'), 'Scanbot accepts one page per session'],
  [runtime.includes("acknowledgementMode = 'NONE'"), 'accepted pages do not return to the camera acknowledgement loop'],
  [runtime.includes('config.screens.review.enabled = true'), 'Review remains enabled'],
  [runtime.includes("title.text = 'Photos'"), 'Photos import remains visible'],
  [runtime.includes('scanbot_ui_session_timeout'), 'scanner UI session is bounded'],
  [runtime.includes('scanbot_page_image_api_missing'), 'missing Scanbot page image APIs fail clearly'],
  [runtime.includes('scanbot_page_export_empty'), 'empty page export cannot silently continue'],
  [capture.includes("source:'scanbot-rtu-v1080-auto-review'"), 'completion metadata pins v108.0'],
  [capture.includes('data-professional-scanner="scanbot-only-v1078"'), 'legacy blue-point scanner remains unreachable'],
  [capture.includes("setProfessionalStateV1076('handoff')"), 'successful Submit advances to the reader'],
];
for (const [condition, label] of checks) {
  if (!condition) throw new Error('v108.0 regression failed: ' + label);
  console.log('PASS ' + label);
}
if (runtime.includes("acknowledgementMode = 'ALWAYS'")) throw new Error('v108.0 acknowledgement loop still present');
console.log('PASS — v108.0 Scanbot Auto Review regression suite');
