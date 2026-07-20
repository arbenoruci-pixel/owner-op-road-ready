import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '107.8.0';
const RELEASED_AT = '2026-07-20T05:55:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
const write = (relative, content) => { const target = file(relative); fs.mkdirSync(path.dirname(target), { recursive:true }); fs.writeFileSync(target, content); };

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
write('package.json', JSON.stringify(pkg, null, 2) + '\n');
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) { lock.packages[''].version = VERSION; lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' }; }
write('package-lock.json', JSON.stringify(lock, null, 2) + '\n');
const contracts = 'source/src/modules/scan/scannerContractsV106.js';
write(contracts, read(contracts).replace(/ROAD_READY_SCANNER_VERSION_V106 = '[^']+';/, `ROAD_READY_SCANNER_VERSION_V106 = '${VERSION}';`));
write('public/app-version.json', JSON.stringify({
  version:VERSION,
  build:'v1078-scanbot-only-submit-flow',
  releasedAt:RELEASED_AT,
  label:'v107.8 Scanbot-Only Submit Flow',
  notes:[
    'Removes the legacy Road Ready edge-selection screen from every active render state.',
    'Camera capture and Photos import stay inside the same official Scanbot crop, straighten, rotate and review workflow.',
    'Fixes the Use this one / Submit handoff so the result advances through processing to the Road Ready reader.',
    'Adds bounded timeouts around Scanbot page export and post-scan restoration so Safari cannot remain on an endless spinner.',
    'Uses the Scanbot straightened image if advanced restoration takes too long, while preserving the immutable original.',
    'Shows a clear retry action when the professional scanner cannot complete.'
  ]
}, null, 2) + '\n');
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const capture = read('source/src/modules/scan/SmartDocumentCaptureV106.jsx');
const runtime = read('source/src/modules/scan/scanbotRtuV1076.js');
const checks = [
  [runtime.includes('scanbot_final_image_timeout'), 'Scanbot final page export has a timeout'],
  [runtime.includes('scanbot_final_jpeg_timeout'), 'Scanbot JPEG conversion has a timeout'],
  [capture.includes('restoredPagesV1078'), 'post-scan restoration has bounded processing'],
  [capture.includes("setProfessionalStateV1076('handoff')"), 'successful submit advances to handoff state'],
  [capture.includes('data-professional-scanner="scanbot-only-v1078"'), 'only the professional processing shell is rendered'],
  [capture.includes('Try professional scanner again'), 'professional errors provide a retry action'],
  [capture.includes("source:'scanbot-rtu-v1078-pro-submit'"), 'completion metadata pins v107.8'],
  [capture.includes("title.text = 'Photos'"), 'Photos import remains explicit'],
];
for (const [condition, label] of checks) { if (!condition) throw new Error('v107.8 regression failed: ' + label); console.log('PASS ' + label); }
for (const forbidden of ['Check document edge', 'Paper edge — angle corrected', 'data-professional-scanner="scanbot-rtu-v1076"', "setProfessionalStateV1076('complete')"]) {
  if (capture.includes(forbidden)) throw new Error('v107.8 legacy active flow remains: ' + forbidden);
}
console.log('PASS old blue-point edge scanner is absent from the active component render');
console.log('PASS — v107.8 Scanbot-Only Submit Flow regression suite');
