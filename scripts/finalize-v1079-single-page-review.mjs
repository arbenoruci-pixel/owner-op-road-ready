import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '107.9.0';
const RELEASED_AT = '2026-07-20T06:30:00.000Z';
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
  build:'v1079-scanbot-single-page-review',
  releasedAt:RELEASED_AT,
  label:'v107.9 Scanbot Single-Page Review',
  notes:[
    'Changes the Scanbot session from unlimited multi-page capture to one-page capture with Review.',
    'After Use this one, the accepted camera or Photos page advances out of the camera instead of waiting for another page.',
    'Review remains enabled so the driver can crop, rotate, retake and submit before Road Ready processing.',
    'Additional pages continue through Road Ready Add another page after the first page is processed.',
    'Keeps the Scanbot-only active render, bounded export/restore timeouts, immutable originals and OCR/Vault/Logbook safety.'
  ]
}, null, 2) + '\n');

const runtime = read('source/src/modules/scan/scanbotRtuV1076.js');
const capture = read('source/src/modules/scan/SmartDocumentCaptureV106.jsx');
const checks = [
  [runtime.includes('config.outputSettings.pagesScanLimit = 1;'), 'Scanbot accepts one page per capture session'],
  [runtime.includes('config.screens.review.enabled = true'), 'Review screen is explicitly enabled'],
  [!runtime.includes('config.outputSettings.pagesScanLimit = 0;'), 'unlimited multi-page camera waiting is removed'],
  [runtime.includes("acknowledgementMode = 'ALWAYS'"), 'Use this one quality acknowledgement remains enabled'],
  [capture.includes('data-professional-scanner="scanbot-only-v1078"'), 'legacy blue-point scanner remains unreachable'],
  [capture.includes("setProfessionalStateV1076('handoff')"), 'Submit still advances to the Road Ready reader'],
  [runtime.includes("title.text = 'Photos'"), 'Photos import remains available'],
];
for (const [condition, label] of checks) {
  if (!condition) throw new Error('v107.9 regression failed: ' + label);
  console.log('PASS ' + label);
}
console.log('PASS — v107.9 Scanbot Single-Page Review regression suite');
