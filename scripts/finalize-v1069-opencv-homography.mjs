import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '106.9.0';
const RELEASED_AT = '2026-07-20T00:20:00.000Z';
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
  build:'v1069-opencv-homography-readability',
  releasedAt:RELEASED_AT,
  notes:[
    'Uses OpenCV getPerspectiveTransform and warpPerspective to turn the selected four paper corners into one upright rectangular scan.',
    'Removes the silent bounding-box fallback that previously left a tilted document inside the cleaned preview.',
    'Normalizes uneven lighting and shadows before applying controlled contrast and sharpening.',
    'Generates enhanced color, grayscale and adaptive high-contrast variants while preserving signatures and colored marks.',
    'Keeps the immutable original, three-signal document qualification, canonical load matching and Logbook safety unchanged.'
  ],
  label:'v106.9 OpenCV Homography & Readability',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);

write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

console.log('v106.9 OpenCV Homography & Readability finalized');
await import('./verify-opencv-homography-v1069.mjs');
