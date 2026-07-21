import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '109.3.0';
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
    if (!source.includes(pattern)) throw new Error(`v109.3 missing ${label}`);
    return source.replace(pattern, replacement);
  }
  if (pattern.test(source)) return source.replace(pattern, replacement);
  if (source.includes(replacement)) return source;
  throw new Error(`v109.3 missing ${label}`);
}

copyTemplate('CurvedBoundaryV1093.js', 'source/src/modules/scan/v3/CurvedBoundaryV1093.js');
copyTemplate('AutoQualityBotV1093.js', 'source/src/modules/scan/v3/AutoQualityBotV1093.js');
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
  build:'v1093-road-ready-scanner-lab-041',
  releasedAt:RELEASED_AT,
  label:'v109.3 Road Ready Scanner 0.4.1',
  notes:[
    'Integrates the approved Scanner Lab 0.4.1 pipeline into Scan Anything.',
    'Uses six visible controls: four paper corners and two smart bend points.',
    'Keeps a 16-point internal curved boundary and locally flattens bowed pages.',
    'Speeds up Photos import by limiting the working image to 2200 pixels on its longest side.',
    'Runs an automatic local quality bot for shadows, paper white balance, contrast, text sharpness and color handwriting.',
    'Preserves the immutable original and all cleaned OCR variants in the existing Document Vault capture contract.',
    'Leaves Logbook, HOS, duty status and document classification logic unchanged.'
  ],
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);

write('public/scanner-engine.json', `${JSON.stringify({
  version:VERSION,
  name:'Road Ready Scanner 0.4.1',
  mode:'local-curved-document',
  externalRuntime:false,
  visibleHandles:6,
  internalBoundaryPoints:16,
  importMaxLongSide:2200,
  geometry:'coons-curved-boundary-mesh',
  qualityBot:'road-ready-auto-quality-bot-v1093',
  originalPreserved:true,
}, null, 2)}\n`);

const required = [
  ['source/src/modules/scan/v3/CurvedBoundaryV1093.js', 'VISIBLE_HANDLES_V1093 = 6'],
  ['source/src/modules/scan/v3/CurvedBoundaryV1093.js', 'extractCurvedDocumentV1093'],
  ['source/src/modules/scan/v3/AutoQualityBotV1093.js', 'autoFixDocumentV1093'],
  ['source/src/modules/scan/v3/ReviewScreenV3.jsx', 'Auto-fix & save'],
  ['source/src/modules/scan/v3/ReviewScreenV3.jsx', 'six-handle-v1093'],
  ['source/src/modules/scan/v3/ScannerEngineV3.js', 'Road Ready Scanner Lab 0.4.1 integrated'],
  ['source/src/modules/scan/v3/RoadReadyScannerV3.jsx', 'Road Ready Scanner 0.4.1'],
  [contractsPath, VERSION],
  [scanSheetPath, VERSION],
  ['public/app-version.json', VERSION],
];
for (const [relative, marker] of required) {
  if (!read(relative).includes(marker)) throw new Error(`${relative} is missing ${marker}`);
}

console.log('PASS — v109.3 Road Ready Scanner 0.4.1 integration applied');
