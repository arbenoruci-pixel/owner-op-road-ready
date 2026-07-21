import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '109.3.3';
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
    if (!source.includes(pattern)) throw new Error(`v109.3.3 missing ${label}`);
    return source.replace(pattern, replacement);
  }
  if (pattern.test(source)) return source.replace(pattern, replacement);
  if (source.includes(replacement)) return source;
  throw new Error(`v109.3.3 missing ${label}`);
}

// Keep the approved four-corner selector. Replace only the downstream aspect
// recovery, resampling, detail restoration and persisted render.
copyTemplate('CurvedBoundaryV1093.js', 'source/src/modules/scan/v3/CurvedBoundaryV1093.js');
copyTemplate('PerspectiveEngineV10933.js', 'source/src/modules/scan/v3/PerspectiveEngineV10933.js');
copyTemplate('AutoQualityBotV10933.js', 'source/src/modules/scan/v3/AutoQualityBotV1093.js');
copyTemplate('ReviewScreenV3.jsx', 'source/src/modules/scan/v3/ReviewScreenV3.jsx');
copyTemplate('ScannerEngineV10933.js', 'source/src/modules/scan/v3/ScannerEngineV3.js');
copyTemplate('RoadReadyScannerV3.jsx', 'source/src/modules/scan/v3/RoadReadyScannerV3.jsx');

const scannerUiPath = 'source/src/modules/scan/v3/RoadReadyScannerV3.jsx';
let scannerUi = read(scannerUiPath);
scannerUi = replaceRequired(scannerUi, "setStatus('Correcting four-corner perspective…');", "setStatus('Recovering the real page shape…');", 'projective completion status');
scannerUi = replaceRequired(scannerUi, "source:'road-ready-file-import-v10931'", "source:'road-ready-file-import-v10933'", 'file import source');
scannerUi = replaceRequired(scannerUi, "scannerVersion:'109.3.1'", "scannerVersion:'109.3.3'", 'file import version');
scannerUi = replaceRequired(scannerUi, 'data-road-ready-scanner="four-corner-042-integrated"', 'data-road-ready-scanner="four-corner-044-projective-detail"', 'scanner UI marker');
scannerUi = replaceRequired(scannerUi, 'Road Ready Scanner 0.4.2', 'Road Ready Scanner 0.4.4', 'visible scanner version');
scannerUi = replaceRequired(
  scannerUi,
  'Fast paper detection, straight four-corner correction and a stronger automatic\n            local quality bot.',
  'Straight four-corner correction with projective page-shape recovery and\n            source-detail rendering that protects small printed text.',
  'scanner quality description',
);
scannerUi = replaceRequired(
  scannerUi,
  'Import a photo, correct perspective and save the rendered scan.',
  'Import a photo, recover the real page ratio and save the detail-preserved render.',
  'Photos description',
);
scannerUi = replaceRequired(
  scannerUi,
  'Local processing · four corners · rendered scan saved · original preserved',
  'Local detail processing · four corners · real ratio · original preserved',
  'scanner footer',
);
write(scannerUiPath, scannerUi);

const reviewPath = 'source/src/modules/scan/v3/ReviewScreenV3.jsx';
write(
  reviewPath,
  replaceRequired(
    read(reviewPath),
    "status || 'Correcting perspective and document quality locally…'",
    "status || 'Recovering page shape and source detail locally…'",
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
  build:'v10933-road-ready-scanner-projective-detail',
  releasedAt:RELEASED_AT,
  label:'v109.3.3 Road Ready Scanner 0.4.4',
  notes:[
    'Keeps the approved straight four-corner selector unchanged.',
    'Recovers the physical page ratio from projective camera geometry instead of relying only on foreshortened edge lengths.',
    'Uses US Letter, A4 or Legal snapping only when the recovered ratio is close enough; receipts and unusual documents keep their recovered free ratio.',
    'Removes forced minimum-resolution upscaling and limits enlargement to about one percent so low-resolution imports are not blurred.',
    'Uses bicubic resampling on normal document sizes and falls back safely on very large pages.',
    'Replaces whitening-heavy enhancement with source-detail fusion, natural paper tone, gentle shadow correction and highlight protection.',
    'Exports the primary rendered document at JPEG quality 0.995 while preserving the immutable source and a separate OCR asset.',
    'Leaves Logbook, HOS, duty status and document classification unchanged.'
  ],
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);

write('public/scanner-engine.json', `${JSON.stringify({
  version:VERSION,
  name:'Road Ready Scanner 0.4.4',
  mode:'local-four-corner-projective-detail',
  externalRuntime:false,
  visibleHandles:4,
  internalBoundaryPoints:4,
  importMaxLongSide:3000,
  outputMaxDimension:3000,
  maximumUpscale:1.015,
  pageFormats:['letter','a4','legal','projective-free'],
  geometry:'projective-rectangle-aspect-homography',
  interpolation:['bicubic-catmull-rom','bilinear-large-page-fallback'],
  primaryOutput:'display-final',
  jpegQuality:.995,
  qualityBot:'road-ready-auto-quality-bot-v10933',
  sourceDetailFusion:true,
  highlightClippingProtected:true,
  originalPreserved:true,
}, null, 2)}\n`);

const required = [
  ['source/src/modules/scan/v3/PerspectiveEngineV10933.js', 'estimateProjectiveAspectV10933'],
  ['source/src/modules/scan/v3/PerspectiveEngineV10933.js', "method:'projective-rectangle'"],
  ['source/src/modules/scan/v3/PerspectiveEngineV10933.js', "interpolation:useBicubic ? 'bicubic-catmull-rom' : 'bilinear'"],
  ['source/src/modules/scan/v3/AutoQualityBotV1093.js', "qualityProfile:'source-detail-fusion'"],
  ['source/src/modules/scan/v3/AutoQualityBotV1093.js', 'sourceDetailFused:true'],
  ['source/src/modules/scan/v3/AutoQualityBotV1093.js', 'naturalPaperTone:true'],
  ['source/src/modules/scan/v3/ReviewScreenV3.jsx', 'four-corner-v10931'],
  ['source/src/modules/scan/v3/ReviewScreenV3.jsx', '4 corner frame'],
  ['source/src/modules/scan/v3/ScannerEngineV3.js', 'warpPerspectiveV10933'],
  ['source/src/modules/scan/v3/ScannerEngineV3.js', 'projective-four-corner-v10933'],
  ['source/src/modules/scan/v3/ScannerEngineV3.js', "primaryOutput:'displayFile'"],
  ['source/src/modules/scan/v3/ScannerEngineV3.js', "jpegQuality:.995"],
  ['source/src/modules/scan/v3/RoadReadyScannerV3.jsx', 'Road Ready Scanner 0.4.4'],
  ['source/src/modules/scan/v3/RoadReadyScannerV3.jsx', 'onComplete?.(result.displayFile, result.metadata)'],
  [contractsPath, VERSION],
  [scanSheetPath, VERSION],
  ['public/app-version.json', VERSION],
];
for (const [relative, marker] of required) {
  if (!read(relative).includes(marker)) throw new Error(`${relative} is missing ${marker}`);
}

console.log('PASS — v109.3.3 projective ratio and source-detail renderer applied');
