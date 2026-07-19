import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '106.2.0';
const RELEASED_AT = '2026-07-19T17:55:00.000Z';
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
  build:'v1062-smart-autoframe-paper-first',
  releasedAt:RELEASED_AT,
  notes:[
    'Rejects global text and carpet-texture regions that touch the image border or cover most of the photo.',
    'Uses text density as supporting evidence for the nearest paper boundary instead of cropping to a text bounding box.',
    'Keeps the full paper contour when printed text sits inside a segmented page.',
    'Penalizes clipping and near-full-image candidates so a centered paper region wins automatic selection.',
    'Keeps rectangle, paper segmentation, edge, saliency and full-photo fallback candidates deterministic and reviewable.',
    'Preserves the immutable original and leaves v106.1 three-signal document classification and Logbook safety rules unchanged.'
  ],
  label:'v106.2 Smart Autoframe — Paper First',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);

write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

console.log('v106.2 Smart Autoframe — Paper First finalized');
await import('./verify-smart-autoframe-v1062.mjs');
