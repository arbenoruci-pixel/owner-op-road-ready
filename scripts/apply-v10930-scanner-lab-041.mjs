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

// Keep the approved four-corner selector unchanged. The final render reopens
// the immutable source photo at native detail and applies a US-document page
// prior so perspective does not leave full-page trucking documents too wide.
copyTemplate('CurvedBoundaryV1093.js', 'source/src/modules/scan/v3/CurvedBoundaryV1093.js');
copyTemplate('PerspectiveEngineV10933.js', 'source/src/modules/scan/v3/PerspectiveEngineV10933.js');
copyTemplate('AutoQualityBotV10933.js', 'source/src/modules/scan/v3/AutoQualityBotV1093.js');
copyTemplate('ReviewScreenV3.jsx', 'source/src/modules/scan/v3/ReviewScreenV3.jsx');
copyTemplate('ScannerEngineV10933.js', 'source/src/modules/scan/v3/ScannerEngineV3.js');
copyTemplate('RoadReadyScannerV3.jsx', 'source/src/modules/scan/v3/RoadReadyScannerV3.jsx');

const scannerUiPath = 'source/src/modules/scan/v3/RoadReadyScannerV3.jsx';
let scannerUi = read(scannerUiPath);
scannerUi = replaceRequired(scannerUi, "setStatus('Correcting four-corner perspective…');", "setStatus('Rendering from the original photo…');", 'native-detail completion status');
scannerUi = replaceRequired(scannerUi, "source:'road-ready-file-import-v10931'", "source:'road-ready-file-import-v10933'", 'file import source');
scannerUi = replaceRequired(scannerUi, "scannerVersion:'109.3.1'", "scannerVersion:'109.3.3'", 'file import version');
scannerUi = replaceRequired(scannerUi, 'data-road-ready-scanner="four-corner-042-integrated"', 'data-road-ready-scanner="four-corner-044-native-detail"', 'scanner UI marker');
scannerUi = replaceRequired(scannerUi, 'Road Ready Scanner 0.4.2', 'Road Ready Scanner 0.4.4', 'visible scanner version');
scannerUi = replaceRequired(
  scannerUi,
  'Fast paper detection, straight four-corner correction and a stronger automatic\n            local quality bot.',
  'Straight four-corner correction, full-resolution source rendering and natural-detail\n            quality for clear trucking documents.',
  'scanner quality description',
);
scannerUi = replaceRequired(
  scannerUi,
  'Import a photo, correct perspective and save the rendered scan.',
  'Import a photo, correct the real page shape and save the native-detail render.',
  'Photos description',
);
scannerUi = replaceRequired(
  scannerUi,
  'Local processing · four corners · rendered scan saved · original preserved',
  'Local native-detail processing · four corners · final render saved · original preserved',
  'scanner footer',
);
write(scannerUiPath, scannerUi);

const reviewPath = 'source/src/modules/scan/v3/ReviewScreenV3.jsx';
write(
  reviewPath,
  replaceRequired(
    read(reviewPath),
    "status || 'Correcting perspective and document quality locally…'",
    "status || 'Rendering from the original photo at full detail…'",
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
  build:'v10933-road-ready-scanner-native-detail-format',
  releasedAt:RELEASED_AT,
  label:'v109.3.3 Road Ready Scanner 0.4.4',
  notes:[
    'Keeps the approved straight four-corner selector unchanged.',
    'Reopens the immutable original photo up to 4096 pixels for the final perspective render instead of rendering from the smaller review image.',
    'Uses geometric opposite-edge measurements and a US Letter prior for full-page trucking documents so BOL and POD pages are not left too wide.',
    'Stops enlarging the perspective result beyond source detail and renders the final page up to 3600 pixels.',
    'Uses a natural-detail display renderer with restrained shadow correction, protected highlights and adaptive fine-text sharpening.',
    'Exports the primary rendered document at JPEG quality 0.995 and builds OCR variants separately at an iPhone-safe resolution.',
    'Keeps the immutable source and separate OCR assets while leaving Logbook, HOS and classification unchanged.'
  ],
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);

write('public/scanner-engine.json', `${JSON.stringify({
  version:VERSION,
  name:'Road Ready Scanner 0.4.4',
  mode:'local-four-corner-native-detail',
  externalRuntime:false,
  visibleHandles:4,
  internalBoundaryPoints:4,
  reviewMaxLongSide:2200,
  finalInputMaxLongSide:4096,
  outputMaxDimension:3600,
  ocrMaxLongSide:2400,
  pageFormats:['letter-us-prior','a4','legal','free'],
  geometry:'homography-native-detail',
  primaryOutput:'display-final',
  jpegQuality:.995,
  qualityBot:'road-ready-auto-quality-bot-v10933',
  noPerspectiveUpscale:true,
  highlightClippingProtected:true,
  originalPreserved:true,
}, null, 2)}\n`);

const required = [
  ['source/src/modules/scan/v3/PerspectiveEngineV10933.js', 'estimateOutputGeometryV10933'],
  ['source/src/modules/scan/v3/PerspectiveEngineV10933.js', "reason:'us-letter-page-prior'"],
  ['source/src/modules/scan/v3/AutoQualityBotV1093.js', "qualityProfile:'native-detail-preserving'"],
  ['source/src/modules/scan/v3/AutoQualityBotV1093.js', 'adaptiveTextSharpening:true'],
  ['source/src/modules/scan/v3/AutoQualityBotV1093.js', 'nativeDetailSource:true'],
  ['source/src/modules/scan/v3/ReviewScreenV3.jsx', 'four-corner-v10931'],
  ['source/src/modules/scan/v3/ReviewScreenV3.jsx', '4 corner frame'],
  ['source/src/modules/scan/v3/ScannerEngineV3.js', 'warpPerspectiveV10933'],
  ['source/src/modules/scan/v3/ScannerEngineV3.js', 'maxFinalInputDimension || 4096'],
  ['source/src/modules/scan/v3/ScannerEngineV3.js', 'homography-native-detail-v10933'],
  ['source/src/modules/scan/v3/ScannerEngineV3.js', "primaryOutput:'displayFile'"],
  ['source/src/modules/scan/v3/ScannerEngineV3.js', 'jpegQuality:.995'],
  ['source/src/modules/scan/v3/RoadReadyScannerV3.jsx', 'Road Ready Scanner 0.4.4'],
  ['source/src/modules/scan/v3/RoadReadyScannerV3.jsx', 'onComplete?.(result.displayFile, result.metadata)'],
  [contractsPath, VERSION],
  [scanSheetPath, VERSION],
  ['public/app-version.json', VERSION],
];
for (const [relative, marker] of required) {
  if (!read(relative).includes(marker)) throw new Error(`${relative} is missing ${marker}`);
}

console.log('PASS — v109.3.3 scanner native-detail quality and page-format renderer applied');
