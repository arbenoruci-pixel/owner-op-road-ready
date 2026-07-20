import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '107.2.0';
const RELEASED_AT = '2026-07-20T02:55:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
const write = (relative, content) => {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
};

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

const contractsPath = 'source/src/modules/scan/scannerContractsV106.js';
write(contractsPath, read(contractsPath).replace(
  /ROAD_READY_SCANNER_VERSION_V106 = '[^']+';/,
  `ROAD_READY_SCANNER_VERSION_V106 = '${VERSION}';`,
));

write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v1072-reader-packet-preview',
  releasedAt:RELEASED_AT,
  notes:[
    'Removes the remaining OpenCV initialization from document quality checks and structured OCR variant generation.',
    'Treats overlapping paper, text, edge and saliency candidates as evidence for one physical sheet instead of separate documents.',
    'Shows Scan all only when independent non-overlapping sheets are present in the same photo.',
    'Keeps the enhanced color page as the driver-visible Clean preview while OCR may use grayscale or high contrast privately.',
    'Displays the full cleaned page at its natural aspect ratio and uses balanced shadow normalization without washing out the text.',
    'Preserves the immutable original, evidence-based classification and all Logbook safety rules.'
  ],
  label:'v107.2 Reader, Packet Dedupe & Preview',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);

write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

console.log('v107.2 Reader, Packet Dedupe & Preview finalized');
await import('./verify-v1072-reader-packet-preview.mjs');
