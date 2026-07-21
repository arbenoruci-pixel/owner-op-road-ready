import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '109.4.3';
const BUILD = 'v10943-auto-upright-deskew';
const RELEASED_AT = new Date().toISOString();
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
const write = (relative, content) => {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
};

function replaceRequired(source, pattern, replacement, label) {
  if (typeof pattern === 'string') {
    if (source.includes(replacement)) return source;
    if (!source.includes(pattern)) throw new Error(`v109.4.3 missing ${label}`);
    return source.replace(pattern, replacement);
  }
  if (pattern.test(source)) return source.replace(pattern, replacement);
  if (source.includes(replacement)) return source;
  throw new Error(`v109.4.3 missing ${label}`);
}

write(
  'source/src/modules/scan/v3/DocumentOrientationV10943.js',
  read('scripts/v1093-scanner/DocumentOrientationV10943.js.txt'),
);

const enginePath = 'source/src/modules/scan/v3/ScannerEngineV3.js';
let engine = read(enginePath);
engine = replaceRequired(
  engine,
  "import { autoFixDocumentV1093 } from './AutoQualityBotV1093.js';",
  "import { autoFixDocumentV1093 } from './AutoQualityBotV1093.js';\nimport { autoOrientDocumentV10943 } from './DocumentOrientationV10943.js';",
  'orientation import',
);
engine = replaceRequired(
  engine,
  '    const corrected = warpPerspectiveV10934(',
  '    let corrected = warpPerspectiveV10934(',
  'mutable corrected page',
);
engine = replaceRequired(
  engine,
  `    finalSource = null;
    await Promise.resolve();`,
  `    options.onStatus?.('Straightening page orientation and text lines…');
    const straightened = autoOrientDocumentV10943(corrected, {
      pageFormat:corrected.pageFormat,
      pageFormatLabel:corrected.pageFormatLabel,
    });
    corrected = straightened.image;
    finalSource = null;
    await Promise.resolve();`,
  'automatic orientation pass',
);
engine = replaceRequired(
  engine,
  `            interpolation:corrected.interpolation,`,
  `            interpolation:corrected.interpolation,
            autoRotationDegrees:straightened.rotationDegrees,
            autoDeskewDegrees:straightened.deskewDegrees,
            orientationConfidence:straightened.confidence,
            orientationReason:straightened.reason,
            horizontalTextScore:straightened.horizontalScore,
            verticalTextScore:straightened.verticalScore,`,
  'orientation perspective metadata',
);
engine = replaceRequired(
  engine,
  `          rotation:session.rotation,`,
  `          rotation:(Number(session.rotation || 0) + Number(straightened.rotationDegrees || 0)) % 360,
          manualRotation:Number(session.rotation || 0),
          autoRotation:Number(straightened.rotationDegrees || 0),
          autoDeskew:Number(straightened.deskewDegrees || 0),`,
  'capture orientation metadata',
);
write(enginePath, engine);

for (const [target, pattern, replacement] of [
  [
    'source/src/modules/scan/v3/scannerTypesV3.js',
    /export const ROAD_READY_SCANNER_V3_VERSION = '[^']+';/,
    `export const ROAD_READY_SCANNER_V3_VERSION = '${VERSION}';`,
  ],
  [
    'source/src/modules/scan/scannerContractsV106.js',
    /export const ROAD_READY_SCANNER_VERSION_V106 = '[^']+';/,
    `export const ROAD_READY_SCANNER_VERSION_V106 = '${VERSION}';`,
  ],
]) {
  write(target, replaceRequired(read(target), pattern, replacement, target));
}

const scanSheetPath = 'source/src/modules/scan/SmartScanSheetV105.jsx';
write(
  scanSheetPath,
  replaceRequired(
    read(scanSheetPath),
    /scannerVersion:analysis\?\.scanMeta\?\.scannerVersion \|\| '[^']+'/, 
    `scannerVersion:analysis?.scanMeta?.scannerVersion || '${VERSION}'`,
    'scan persistence version',
  ),
);

const scannerUiPath = 'source/src/modules/scan/v3/RoadReadyScannerV3.jsx';
let scannerUi = read(scannerUiPath);
scannerUi = replaceRequired(
  scannerUi,
  /Road Ready Scanner 0\.5\.[0-9]+/,
  'Road Ready Scanner 0.5.3',
  'scanner label',
);
scannerUi = replaceRequired(
  scannerUi,
  /· App 109\.[0-9]+\.[0-9]+/,
  `· App ${VERSION}`,
  'app label',
);
write(scannerUiPath, scannerUi);

const reviewPath = 'source/src/modules/scan/v3/ReviewScreenV3.jsx';
write(
  reviewPath,
  replaceRequired(
    read(reviewPath),
    /Neutral safe · build 109\.[0-9]+\.[0-9]+/,
    `Auto upright · build ${VERSION}`,
    'review marker',
  ),
);

const updatePath = 'source/src/core/update/appUpdate.js';
let update = read(updatePath);
update = replaceRequired(
  update,
  /const FALLBACK_APP_VERSION = '[^']+';/,
  `const FALLBACK_APP_VERSION = '${VERSION}';`,
  'fallback app version',
);
update = replaceRequired(
  update,
  /const FALLBACK_APP_BUILD = '[^']+';/,
  `const FALLBACK_APP_BUILD = '${BUILD}';`,
  'fallback app build',
);
write(updatePath, update);

const bannerPath = 'source/src/modules/update/UpdateBanner.jsx';
write(
  bannerPath,
  replaceRequired(
    read(bannerPath),
    /data-owner-op-update-banner="[^"]+"/,
    `data-owner-op-update-banner="${VERSION}"`,
    'update banner marker',
  ),
);

const bootPath = 'public/update.html';
let boot = read(bootPath);
boot = replaceRequired(
  boot,
  /const version = params\.get\('version'\) \|\| '[^']+';/,
  `const version = params.get('version') || '${VERSION}';`,
  'update page version',
);
boot = replaceRequired(
  boot,
  /const build = params\.get\('build'\) \|\| '[^']+';/,
  `const build = params.get('build') || '${BUILD}';`,
  'update page build',
);
write(bootPath, boot);

const swPath = 'public/sw.js';
let sw = read(swPath);
sw = replaceRequired(
  sw,
  /const OWNER_OP_SW_VERSION = '[^']+';/,
  `const OWNER_OP_SW_VERSION = '${VERSION}';`,
  'service worker version',
);
sw = replaceRequired(
  sw,
  /const OWNER_OP_SW_BUILD = '[^']+';/,
  `const OWNER_OP_SW_BUILD = '${BUILD}';`,
  'service worker build',
);
write(swPath, sw);

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

write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:BUILD,
  releasedAt:RELEASED_AT,
  updatedAt:RELEASED_AT,
  label:'v109.4.3 Auto Upright Scanner 0.5.3',
  force:true,
  notes:[
    'Automatically rotates a sideways corrected page so printed text is horizontal and the document opens upright.',
    'Uses source-pixel text-line projections and standard-page geometry; it does not use OCR rewriting or generative reconstruction.',
    'Applies a bounded residual deskew of at most four degrees only when projection sharpness improves measurably.',
    'Keeps manual Rotate available, the four-corner selector unchanged, and the immutable original, OCR and display-final assets separate.',
    'Keeps the neutral-safe layered quality renderer and Content Fidelity Lock active after orientation correction.',
  ],
}, null, 2)}\n`);

const manifest = JSON.parse(read('public/scanner-engine.json'));
Object.assign(manifest, {
  version:VERSION,
  name:'Road Ready Scanner 0.5.3',
  autoOrientation:'source-text-axis-v10943',
  autoDeskew:true,
  maxDeskewDegrees:4,
  standardPageUprightPrior:true,
  ocrRewrite:false,
  generativeReconstruction:false,
  qualityBot:'road-ready-auto-quality-bot-v10942',
  qualityProfile:'neutral-safe-layered-render-v10942',
  updateBootstrap:BUILD,
  visibleBuildMarker:VERSION,
});
write('public/scanner-engine.json', `${JSON.stringify(manifest, null, 2)}\n`);

console.log('PASS — v109.4.3 auto upright and residual deskew scanner applied');
