import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '109.3.2';
const RELEASED_AT = new Date().toISOString();

const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
const write = (relative, content) => {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
};

function copyTemplate(name, destination) {
  write(destination, read(`scripts/v1093-scanner/${name}.txt`));
}

function replaceRequired(source, pattern, replacement, label) {
  if (typeof pattern === 'string') {
    if (source.includes(replacement)) return source;
    if (!source.includes(pattern)) throw new Error(`v109.3.2 missing ${label}`);
    return source.replace(pattern, replacement);
  }
  if (pattern.test(source)) return source.replace(pattern, replacement);
  if (source.includes(replacement)) return source;
  throw new Error(`v109.3.2 missing ${label}`);
}

// Keep the approved four-corner selector unchanged. Only the downstream page
// geometry, resolution, rendering and persisted output are upgraded here.
copyTemplate('CurvedBoundaryV1093.js', 'source/src/modules/scan/v3/CurvedBoundaryV1093.js');
copyTemplate('PerspectiveEngineV10932.js', 'source/src/modules/scan/v3/PerspectiveEngineV10932.js');
copyTemplate('AutoQualityBotV10932.js', 'source/src/modules/scan/v3/AutoQualityBotV1093.js');
copyTemplate('ReviewScreenV3.jsx', 'source/src/modules/scan/v3/ReviewScreenV3.jsx');
copyTemplate('ScannerEngineV10932.js', 'source/src/modules/scan/v3/ScannerEngineV3.js');
copyTemplate('RoadReadyScannerV3.jsx', 'source/src/modules/scan/v3/RoadReadyScannerV3.jsx');

const scannerUiPath = 'source/src/modules/scan/v3/RoadReadyScannerV3.jsx';
let scannerUi = read(scannerUiPath);
scannerUi = replaceRequired(scannerUi, "setStatus('Correcting four-corner perspective…');", "setStatus('Rendering the HD document…');", 'HD completion status');
scannerUi = replaceRequired(scannerUi, "source:'road-ready-file-import-v10931'", "source:'road-ready-file-import-v10932'", 'file import source');
scannerUi = replaceRequired(scannerUi, "scannerVersion:'109.3.1'", "scannerVersion:'109.3.2'", 'file import version');
scannerUi = replaceRequired(scannerUi, 'data-road-ready-scanner="four-corner-042-integrated"', 'data-road-ready-scanner="four-corner-043-hd-integrated"', 'scanner UI marker');
scannerUi = replaceRequired(scannerUi, 'Road Ready Scanner 0.4.2', 'Road Ready Scanner 0.4.3', 'visible scanner version');
scannerUi = replaceRequired(
  scannerUi,
  'Fast paper detection, straight four-corner correction and a stronger automatic\n            local quality bot.',
  'Straight four-corner correction, page-format normalization and detail-first\n            HD rendering for clear trucking documents.',
  'scanner quality description',
);
scannerUi = replaceRequired(
  scannerUi,
  'Import a photo, correct perspective and save the rendered scan.',
  'Import a photo, normalize the page format and save the HD rendered scan.',
  'Photos description',
);
scannerUi = replaceRequired(
  scannerUi,
  'Local processing · four corners · rendered scan saved · original preserved',
  'Local HD processing · four corners · final render saved · original preserved',
  'scanner footer',
);
write(scannerUiPath, scannerUi);

const reviewPath = 'source/src/modules/scan/v3/ReviewScreenV3.jsx';
write(
  reviewPath,
  replaceRequired(
    read(reviewPath),
    "status || 'Correcting perspective and document quality locally…'",
    "status || 'Rendering the HD document locally…'",
    'review processing text',
  ),
);

const scannerTypesPath = 'source/src/modules/scan/v3/scannerTypesV3.js';
write(
  scannerTypesPath,
  replaceRequired(
    read(scannerTypesPath),
    /export const ROAD_READY_SCANNER_V3_VERSION = '[^']+';/,
    `export const ROAD_READY_SCANNER_V3_VERSION = '${VERSION}';`,
    'Scanner V3 version constant',
  ),
);

const contractsPath = 'source/src/modules/scan/scannerContractsV106.js';
write(
  contractsPath,
  replaceRequired(
    read(contractsPath),
    /export const ROAD_READY_SCANNER_VERSION_V106 = '[^']+';/,
    `export const ROAD_READY_SCANNER_VERSION_V106 = '${VERSION}';`,
    'scanner contract version',
  ),
);

const scanSheetPath = 'source/src/modules/scan/SmartScanSheetV105.jsx';
write(
  scanSheetPath,
  replaceRequired(
    read(scanSheetPath),
    /scannerVersion:analysis\?\.scanMeta\?\.scannerVersion \|\| '[^']+'/, 
    `scannerVersion:analysis?.scanMeta?.scannerVersion || '${VERSION}'`,
    'capture persistence scanner version',
  ),
);

const packageJson = JSON.parse(read('package.json'));
packageJson.version = VERSION;
packageJson.engines = { ...(packageJson.engines || {}), node:'24.x' };
write('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);

const packageLock = JSON.parse(read('package-lock.json'));
packageLock.version = VERSION;
if (packageLock.packages?.['']) {
  packageLock.packages[''].version = VERSION;
  packageLock.packages[''].engines = {
    ...(packageLock.packages[''].engines || {}),
    node:'24.x',
  };
}
write('package-lock.json', `${JSON.stringify(packageLock, null, 2)}\n`);

const serviceWorkerPath = 'public/sw.js';
write(
  serviceWorkerPath,
  replaceRequired(
    read(serviceWorkerPath),
    /const OWNER_OP_SW_VERSION = '[^']+';/,
    `const OWNER_OP_SW_VERSION = '${VERSION}';`,
    'service worker version',
  ),
);

const appUpdatePath = 'source/src/core/update/appUpdate.js';
write(
  appUpdatePath,
  replaceRequired(
    read(appUpdatePath),
    /const FALLBACK_APP_VERSION = '[^']+';/,
    `const FALLBACK_APP_VERSION = '${VERSION}';`,
    'fallback app version',
  ),
);

write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v10932-road-ready-scanner-hd-quality-format',
  releasedAt:RELEASED_AT,
  label:'v109.3.2 Road Ready Scanner 0.4.3',
  notes:[
    'Keeps the approved straight four-corner selector unchanged.',
    'Raises the working photo limit from 2200 to 2800 pixels and the final page limit to 3000 pixels.',
    'Uses average opposite-edge geometry and snaps likely Letter, A4 or Legal pages to the correct document ratio.',
    'Adds a small safe edge trim to remove background slivers without cutting document content.',
    'Replaces double whitening with a detail-first renderer that protects highlights and fine printed text.',
    'Exports the primary rendered document at JPEG quality 0.985 and encodes variants sequentially for iPhone memory safety.',
    'Keeps the immutable source and separate OCR assets while leaving Logbook, HOS and classification unchanged.'
  ],
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);

write('public/scanner-engine.json', `${JSON.stringify({
  version:VERSION,
  name:'Road Ready Scanner 0.4.3',
  mode:'local-four-corner-hd-document',
  externalRuntime:false,
  visibleHandles:4,
  internalBoundaryPoints:4,
  importMaxLongSide:2800,
  outputMaxDimension:3000,
  minimumOutputShortSide:1700,
  pageFormats:['letter','a4','legal','free'],
  geometry:'homography-four-corner-hd',
  primaryOutput:'display-final',
  jpegQuality:.985,
  qualityBot:'road-ready-auto-quality-bot-v10932',
  highlightClippingProtected:true,
  originalPreserved:true,
}, null, 2)}\n`);

const required = [
  ['source/src/modules/scan/v3/PerspectiveEngineV10932.js', 'estimateOutputGeometryV10932'],
  ['source/src/modules/scan/v3/PerspectiveEngineV10932.js', "pageFormat:standard?.id || 'free'"],
  ['source/src/modules/scan/v3/AutoQualityBotV1093.js', "qualityProfile:'detail-first'"],
  ['source/src/modules/scan/v3/AutoQualityBotV1093.js', 'highlightClippingProtected:true'],
  ['source/src/modules/scan/v3/AutoQualityBotV1093.js', 'doubleNormalization:false'],
  ['source/src/modules/scan/v3/ReviewScreenV3.jsx', 'four-corner-v10931'],
  ['source/src/modules/scan/v3/ReviewScreenV3.jsx', '4 corner frame'],
  ['source/src/modules/scan/v3/ScannerEngineV3.js', 'warpPerspectiveV10932'],
  ['source/src/modules/scan/v3/ScannerEngineV3.js', 'homography-four-corner-hd-v10932'],
  ['source/src/modules/scan/v3/ScannerEngineV3.js', "primaryOutput:'displayFile'"],
  ['source/src/modules/scan/v3/ScannerEngineV3.js', "jpegQuality:.985"],
  ['source/src/modules/scan/v3/RoadReadyScannerV3.jsx', 'Road Ready Scanner 0.4.3'],
  ['source/src/modules/scan/v3/RoadReadyScannerV3.jsx', 'onComplete?.(result.displayFile, result.metadata)'],
  [contractsPath, VERSION],
  [scanSheetPath, VERSION],
  ['public/app-version.json', VERSION],
];
for (const [relative, marker] of required) {
  if (!read(relative).includes(marker)) throw new Error(`${relative} is missing ${marker}`);
}

console.log('PASS — v109.3.2 scanner HD quality and page-format renderer applied');
