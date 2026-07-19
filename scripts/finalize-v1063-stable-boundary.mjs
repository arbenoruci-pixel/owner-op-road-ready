import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '106.3.0';
const RELEASED_AT = '2026-07-19T18:28:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
const write = (relative, content) => {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
};

const contractsPath = 'source/src/modules/scan/scannerContractsV106.js';
write(contractsPath, read(contractsPath).replace(
  /export const ROAD_READY_SCANNER_VERSION_V106 = '[^']+';/,
  `export const ROAD_READY_SCANNER_VERSION_V106 = '${VERSION}';`,
));

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
  build:'v1063-stable-page-boundary',
  releasedAt:RELEASED_AT,
  notes:[
    'Converts fragmented paper-segmentation meshes into one convex four-corner page boundary before showing or cropping the document.',
    'Rejects center spikes and house-shaped contours by fitting robust top and bottom paper lines with a stable-band fallback.',
    'Keeps perspective candidates when reliable and uses a conservative full-page quadrilateral when segmentation edges are noisy.',
    'Adds source-aware candidate continuity and temporal corner smoothing so the live overlay no longer jumps between unrelated regions.',
    'Requires five tightly matching four-corner detections before automatic capture.',
    'Re-runs full-resolution paper selection after capture while preserving the immutable original and v106.1 three-signal classification rules.'
  ],
  label:'v106.3 Stable Page Boundary',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);

write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

console.log('v106.3 Stable Page Boundary finalized');
await import('./verify-stable-boundary-v1063.mjs');
