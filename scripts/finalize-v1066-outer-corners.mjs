import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '106.6.0';
const RELEASED_AT = '2026-07-19T21:45:00.000Z';
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
  build:'v1066-outer-paper-corner-validation',
  releasedAt:RELEASED_AT,
  notes:[
    'Rejects diamond and hourglass crop shapes whose detected points sit inside the page instead of at its four outer corners.',
    'Rebuilds a suspicious paper frame from the complete detected paper extent before perspective correction.',
    'Keeps valid perspective quadrilaterals when all four points remain close to the corresponding page corners.',
    'Applies the same corrected outer frame to Photo First, candidate switching and document processing.',
    'Preserves the immutable original, three-signal document qualification and Logbook safety rules.'
  ],
  label:'v106.6 Outer Paper Corner Validation',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);

write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

console.log('v106.6 Outer Paper Corner Validation finalized');
await import('./verify-outer-corner-v1066.mjs');
