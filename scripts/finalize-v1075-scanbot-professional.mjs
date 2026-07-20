import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '107.5.0';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
const write = (relative, content) => {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
};

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v1075-scanbot-professional-scanner',
  label:'v107.5 Professional Document Scanner',
  notes:[
    'Uses Scanbot Web Document Scanner SDK 9 as the primary on-device paper detector and perspective correction engine.',
    'Uses the professional document enhancer when available to flatten folds, curl, creases and crinkles.',
    'Keeps Road Ready WebGL as a bounded fallback instead of treating it as the primary scanner.',
    'Keeps OCR, trucking classification, Vault filing, immutable originals and Logbook safety under Road Ready control.',
    'Requires a Scanbot production license key before production rollout; empty-key sessions are limited trial sessions.'
  ],
}, null, 2)}\n`);

const adapter = read('source/src/modules/scan/scanbotProfessionalAdapterV1075.js');
const engine = read('source/src/modules/scan/documentScannerEngine.js');
for (const [condition, label] of [
  [adapter.includes("SCANBOT_VERSION_V1075 = '9.0.0'"), 'SDK version is pinned'],
  [adapter.includes('detectDocumentCornersScanbotV1075'), 'professional detection exists'],
  [adapter.includes('rectifyDocumentScanbotV1075'), 'professional rectification exists'],
  [adapter.includes("straighteningMode:'STRAIGHTEN'"), 'dewarping is requested'],
  [adapter.includes('NEXT_PUBLIC_SCANBOT_LICENSE_KEY'), 'production license is environment-configured'],
  [engine.includes('scanbot-professional-v1075'), 'production engine imports professional adapter'],
  [engine.includes('RoadReadyFallbackV1075'), 'bounded fallback remains available'],
]) {
  if (!condition) throw new Error(`v107.5 verify failed: ${label}`);
  console.log(`PASS ${label}`);
}
console.log('PASS — v107.5 Professional Document Scanner regression suite');
