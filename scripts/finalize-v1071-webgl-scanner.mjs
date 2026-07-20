import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '107.1.0';
const RELEASED_AT = '2026-07-20T02:10:00.000Z';
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
  build:'v1071-nonblocking-webgl-scanner',
  releasedAt:RELEASED_AT,
  notes:[
    'Removes OpenCV initialization from post-capture paper detection, perspective correction and image enhancement.',
    'Uses a lightweight Canvas paper detector so Page intelligence opens without compiling a 10 MB runtime on the iPhone main thread.',
    'Uses a direct WebGL homography on the device GPU to turn four selected corners into one upright document scan.',
    'Normalizes shadows and improves readability locally while preserving signatures, handwriting and the immutable original.',
    'Retains the local OpenCV runtime only as an optional future fallback; it cannot block the primary capture flow.'
  ],
  label:'v107.1 Non-blocking WebGL Scanner',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);

write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

console.log('v107.1 Non-blocking WebGL Scanner finalized');
await import('./verify-v1071-webgl-scanner.mjs');
