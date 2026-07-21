import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '109.3.1';
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
    if (!source.includes(pattern)) throw new Error(`v109.3.1 missing ${label}`);
    return source.replace(pattern, replacement);
  }
  if (pattern.test(source)) return source.replace(pattern, replacement);
  if (source.includes(replacement)) return source;
  throw new Error(`v109.3.1 missing ${label}`);
}

// CurvedBoundary remains only as a legacy boundary reader. The active review and
// renderer use a straight four-corner homography.
copyTemplate('CurvedBoundaryV1093.js', 'source/src/modules/scan/v3/CurvedBoundaryV1093.js');
copyTemplate('AutoQualityBotV10931.js', 'source/src/modules/scan/v3/AutoQualityBotV1093.js');
copyTemplate('ReviewScreenV3.jsx', 'source/src/modules/scan/v3/ReviewScreenV3.jsx');
copyTemplate('ScannerEngineV3.js', 'source/src/modules/scan/v3/ScannerEngineV3.js');
copyTemplate('RoadReadyScannerV3.jsx', 'source/src/modules/scan/v3/RoadReadyScannerV3.jsx');

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
  build:'v10931-road-ready-scanner-four-corner-render',
  releasedAt:RELEASED_AT,
  label:'v109.3.1 Road Ready Scanner 0.4.2',
  notes:[
    'Replaces the curved six-point editor with a stable four-corner paper frame.',
    'Uses straight homography perspective correction and removes bend-point distortion.',
    'Persists the final rendered Auto-fix image as the primary Document Vault file.',
    'Keeps the immutable source photo as a recovery asset and keeps a separate OCR asset.',
    'Adds local illumination normalization, stronger shadow correction, paper white balance and text sharpening.',
    'Preserves colored handwriting, stamps and signatures when useful color is detected.',
    'Leaves Logbook, HOS, duty status and document classification logic unchanged.'
  ],
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);

write('public/scanner-engine.json', `${JSON.stringify({
  version:VERSION,
  name:'Road Ready Scanner 0.4.2',
  mode:'local-four-corner-document',
  externalRuntime:false,
  visibleHandles:4,
  internalBoundaryPoints:4,
  importMaxLongSide:2200,
  outputMaxDimension:2400,
  geometry:'homography-four-corner',
  primaryOutput:'display-final',
  qualityBot:'road-ready-auto-quality-bot-v10931',
  originalPreserved:true,
}, null, 2)}\n`);

const required = [
  ['source/src/modules/scan/v3/AutoQualityBotV1093.js', 'localIlluminationGrid:true'],
  ['source/src/modules/scan/v3/AutoQualityBotV1093.js', 'primaryRenderedOutput:true'],
  ['source/src/modules/scan/v3/ReviewScreenV3.jsx', 'four-corner-v10931'],
  ['source/src/modules/scan/v3/ReviewScreenV3.jsx', '4 corner frame'],
  ['source/src/modules/scan/v3/ScannerEngineV3.js', 'homography-four-corner-v10931'],
  ['source/src/modules/scan/v3/ScannerEngineV3.js', "primaryOutput:'displayFile'"],
  ['source/src/modules/scan/v3/ScannerEngineV3.js', "captureAsset('display-final'"],
  ['source/src/modules/scan/v3/RoadReadyScannerV3.jsx', 'Road Ready Scanner 0.4.2'],
  ['source/src/modules/scan/v3/RoadReadyScannerV3.jsx', 'onComplete?.(result.displayFile, result.metadata)'],
  [contractsPath, VERSION],
  [scanSheetPath, VERSION],
  ['public/app-version.json', VERSION],
];
for (const [relative, marker] of required) {
  if (!read(relative).includes(marker)) throw new Error(`${relative} is missing ${marker}`);
}

console.log('PASS — v109.3.1 four-corner rendered-output scanner applied');
