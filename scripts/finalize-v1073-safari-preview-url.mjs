import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '107.3.0';
const RELEASED_AT = '2026-07-20T03:12:00.000Z';
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
  build:'v1073-safari-preview-object-url',
  releasedAt:RELEASED_AT,
  notes:[
    'Converts the driver-visible cleaned File into a valid blob URL before assigning it to the preview image.',
    'Rejects non-Blob and zero-byte preview inputs instead of displaying Safari’s broken-image icon.',
    'Pre-decodes the cleaned scan and keeps Use scan disabled until Safari confirms the image is readable.',
    'Shows an actionable preview error and retains Edges access when a generated scan cannot be displayed.',
    'Revokes original and cleaned blob URLs only when the page changes or the scanner closes.',
    'Preserves the one-page dedupe, WebGL straightening, immutable original and Logbook safety rules.'
  ],
  label:'v107.3 Safari Preview Object URL Integrity',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);

write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

console.log('v107.3 Safari Preview Object URL Integrity finalized');
await import('./verify-v1073-safari-preview-url.mjs');
