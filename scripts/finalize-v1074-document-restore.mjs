import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '107.4.0';
const RELEASED_AT = '2026-07-20T04:05:00.000Z';
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
  build:'v1074-document-restore',
  releasedAt:RELEASED_AT,
  notes:[
    'Adds a local Document Restore pipeline after perspective correction to produce a straight, clean and readable page.',
    'Uses multi-scale illumination normalization and paper white balance to remove seat, dashboard and uneven-shadow color casts.',
    'Strengthens printed lines and small text with local-detail contrast while retaining faint pencil and handwriting.',
    'Preserves blue and colored signatures through chroma-aware restoration instead of flattening every scan into black and white.',
    'Keeps a separate grayscale and high-contrast OCR ensemble while the driver sees the restored color document.',
    'Does not upload or synthesize document content and keeps the immutable original available.'
  ],
  label:'v107.4 Document Restore',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);

write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

console.log('v107.4 Document Restore finalized');
await import('./verify-v1074-document-restore.mjs');
