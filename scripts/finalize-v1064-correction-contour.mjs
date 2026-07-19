import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '106.4.0';
const RELEASED_AT = '2026-07-19T21:18:00.000Z';
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

write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v1064-four-corner-correction-contour',
  releasedAt:RELEASED_AT,
  notes:[
    'Shows exactly four automatic crop handles at the outer paper corners in the correction screen.',
    'Removes paper-segmentation midpoint samples from the crop boundary so interior peaks cannot cut through the document.',
    'Keeps the full top, bottom, left and right page edges for paper and paper-plus-text candidates.',
    'Normalizes every candidate selected manually or through Scan all documents before perspective correction.',
    'Preserves manual Add point controls, immutable originals, three-signal classification and Logbook safety rules.'
  ],
  label:'v106.4 Four-Corner Correction Contour',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);

write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

console.log('v106.4 Four-Corner Correction Contour finalized');
await import('./verify-correction-contour-v1064.mjs');
