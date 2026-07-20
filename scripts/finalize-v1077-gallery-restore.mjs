import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const write = (relative, content) => {
  const target = path.join(ROOT, relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
};
const VERSION = '107.7.0';

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

write('public/app-version.json', JSON.stringify({
  version:VERSION,
  build:'v1077-scanbot-gallery-document-restore',
  releasedAt:'2026-07-20T05:05:00.000Z',
  label:'v107.7 Scanbot Gallery + Document Restore',
  notes:[
    'Makes the official Scanbot RTU interface the only document capture and import flow.',
    'Shows a clearly labeled Photos button that imports existing images into the same crop, straighten, rotate and review workflow as camera captures.',
    'Applies Road Ready Document Restore after Scanbot processing to whiten paper, normalize shadows and strengthen small text while preserving handwriting and signatures.',
    'Keeps immutable originals separately from the restored OCR asset.',
    'Keeps the old Road Ready edge scanner disabled with no hidden fallback.'
  ]
}, null, 2) + '\n');
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const runtime = read('source/src/modules/scan/scanbotRtuV1076.js');
const capture = read('source/src/modules/scan/SmartDocumentCaptureV106.jsx');
const checks = [
  [runtime.includes("title.text = 'Photos'"), 'Scanbot Photos import is explicitly visible'],
  [runtime.includes('ScanbotSDK.UI.createDocumentScanner(config)'), 'official Scanbot RTU scanner remains active'],
  [capture.includes('restoredPagesV1077'), 'Scanbot pages pass through Document Restore'],
  [capture.includes("filter:'color'"), 'driver-visible restored color is generated'],
  [capture.includes('road-ready-scanbot-restored-'), 'restored output files are named and traceable'],
  [capture.includes("source:'scanbot-rtu-v1077-gallery-restore'"), 'completion metadata pins the gallery restore source'],
  [capture.includes('No hidden fallback was used'), 'old edge scanner remains disabled'],
];
for (const [condition, label] of checks) {
  if (!condition) throw new Error('v107.7 regression failed: ' + label);
  console.log('PASS ' + label);
}
if (/Professional scanner unavailable — using Road Ready fallback/.test(capture)) throw new Error('v107.7 hidden fallback text remains');
console.log('PASS — v107.7 Scanbot Gallery + Document Restore regression suite');
