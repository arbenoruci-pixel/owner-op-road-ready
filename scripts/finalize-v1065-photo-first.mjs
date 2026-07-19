import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '106.5.0';
const RELEASED_AT = '2026-07-19T21:35:00.000Z';
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
  build:'v1065-photo-first-smart-capture',
  releasedAt:RELEASED_AT,
  notes:[
    'Captures one clear still photo before attempting document boundary selection.',
    'Removes the unstable moving live polygon from the default camera experience.',
    'Runs full-resolution paper and text-layout analysis after the photo is captured.',
    'Selects the strongest outer paper candidate and converts it to four correction corners.',
    'Keeps gallery import and camera capture on the same photo-first analysis path.',
    'Runs OCR and document qualification on the corrected page while preserving the immutable original.'
  ],
  label:'v106.5 Photo First Smart Capture',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);

write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

console.log('v106.5 Photo First Smart Capture finalized');
await import('./verify-photo-first-v1065.mjs');
