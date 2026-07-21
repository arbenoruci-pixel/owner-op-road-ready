import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '109.3.4';
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
    if (!source.includes(pattern)) throw new Error(`v109.3.4 missing ${label}`);
    return source.replace(pattern, replacement);
  }
  if (pattern.test(source)) return source.replace(pattern, replacement);
  if (source.includes(replacement)) return source;
  throw new Error(`v109.3.4 missing ${label}`);
}

// Keep the approved four-corner selector and the v109.3.3 native-resolution
// source path. Upgrade only physical page-shape recovery, resampling and detail.
copyTemplate('CurvedBoundaryV1093.js', 'source/src/modules/scan/v3/CurvedBoundaryV1093.js');
copyTemplate('PerspectiveEngineV10934.js', 'source/src/modules/scan/v3/PerspectiveEngineV10934.js');
copyTemplate('AutoQualityBotV10934.js', 'source/src/modules/scan/v3/AutoQualityBotV1093.js');
copyTemplate('ReviewScreenV3.jsx', 'source/src/modules/scan/v3/ReviewScreenV3.jsx');
copyTemplate('ScannerEngineV10933.js', 'source/src/modules/scan/v3/ScannerEngineV3.js');
copyTemplate('RoadReadyScannerV3.jsx', 'source/src/modules/scan/v3/RoadReadyScannerV3.jsx');

const enginePath = 'source/src/modules/scan/v3/ScannerEngineV3.js';
let engine = read(enginePath);
engine = replaceRequired(
  engine,
  "import { warpPerspectiveV10933 } from './PerspectiveEngineV10933.js';",
  "import { warpPerspectiveV10934 } from './PerspectiveEngineV10934.js';",
  'projective perspective import',
);
engine = replaceRequired(engine, 'warpPerspectiveV10933(', 'warpPerspectiveV10934(', 'projective warp call');
engine = replaceRequired(engine, "const geometryMode = 'homography-native-detail-v10933';", "const geometryMode = 'projective-native-detail-v10934';", 'geometry mode');
engine = replaceRequired(
  engine,
  `        maxDimension:this.maxOutputDimension,
        maxUpscale:1,
        snapToStandard:true,
        snapTolerance:.18,
        usLetterBias:true,
        trimRatio:.0008,`,
  `        maxDimension:this.maxOutputDimension,
        maxUpscale:1,
        snapToStandard:true,
        snapTolerance:.095,
        usLetterBias:true,
        trimRatio:0,
        bicubicMaxPixels:6200000,`,
  'projective render options',
);
engine = replaceRequired(engine, "options.onStatus?.('Correcting the page shape without stretching text…');", "options.onStatus?.('Recovering the physical page ratio…');", 'page-shape status');
engine = replaceRequired(engine, "options.onStatus?.('Restoring natural paper color and fine print…');", "options.onStatus?.('Restoring source text detail and natural paper tone…');", 'detail status');
engine = replaceRequired(engine, "'road-ready-perspective-native-detail.jpg'", "'road-ready-projective-native-detail.jpg'", 'perspective filename');
engine = replaceRequired(engine, "'road-ready-final-native-detail.jpg'", "'road-ready-final-source-detail.jpg'", 'display filename');
engine = replaceRequired(engine, "filter:'native-detail-primary-v10933'", "filter:'source-detail-primary-v10934'", 'primary filter');
engine = replaceRequired(engine, "filter:'clean-ocr-v10933'", "filter:'clean-ocr-v10934'", 'clean OCR filter');
engine = replaceRequired(engine, "filter:'high-contrast-ocr-v10933'", "filter:'high-contrast-ocr-v10934'", 'high contrast filter');
engine = replaceRequired(engine, "filter:`selected-${ocr.selected?.name || 'clean'}-v10933`", "filter:`selected-${ocr.selected?.name || 'clean'}-v10934`", 'selected OCR filter');
engine = replaceRequired(engine, "source:`road-ready-scanner-v10933-${session.source}`", "source:`road-ready-scanner-v10934-${session.source}`", 'scanner source');
engine = replaceRequired(engine, "engine:'Road Ready Scanner 0.4.4 native-detail renderer'", "engine:'Road Ready Scanner 0.4.5 projective source-detail renderer'", 'engine label');
engine = replaceRequired(engine, "operation:'native-resolution-four-corner-correction'", "operation:'projective-ratio-native-resolution-correction'", 'perspective operation');
engine = replaceRequired(
  engine,
  `            formatReason:corrected.formatReason,
            measuredAspect:corrected.measuredAspect,
            portraitRatio:corrected.portraitRatio,
            outputAspect:corrected.outputAspect,
            renderScale:corrected.renderScale,`,
  `            formatReason:corrected.formatReason,
            measuredAspect:corrected.measuredAspect,
            projectiveAspect:corrected.projectiveAspect,
            portraitRatio:corrected.portraitRatio,
            outputAspect:corrected.outputAspect,
            aspectMethod:corrected.aspectMethod,
            perspectiveStrength:corrected.perspectiveStrength,
            focalLength:corrected.focalLength,
            renderScale:corrected.renderScale,
            interpolation:corrected.interpolation,`,
  'projective metadata',
);
write(enginePath, engine);

const scannerUiPath = 'source/src/modules/scan/v3/RoadReadyScannerV3.jsx';
let scannerUi = read(scannerUiPath);
scannerUi = replaceRequired(scannerUi, "setStatus('Correcting four-corner perspective…');", "setStatus('Recovering the physical page ratio…');", 'completion status');
scannerUi = replaceRequired(scannerUi, "source:'road-ready-file-import-v10931'", "source:'road-ready-file-import-v10934'", 'file import source');
scannerUi = replaceRequired(scannerUi, "scannerVersion:'109.3.1'", "scannerVersion:'109.3.4'", 'file import version');
scannerUi = replaceRequired(scannerUi, 'data-road-ready-scanner="four-corner-042-integrated"', 'data-road-ready-scanner="four-corner-045-projective-source-detail"', 'scanner UI marker');
scannerUi = replaceRequired(scannerUi, 'Road Ready Scanner 0.4.2', 'Road Ready Scanner 0.4.5', 'visible scanner version');
scannerUi = replaceRequired(
  scannerUi,
  'Fast paper detection, straight four-corner correction and a stronger automatic\n            local quality bot.',
  'Straight four-corner correction, physical page-ratio recovery and source-detail\n            rendering for clearer trucking documents.',
  'scanner quality description',
);
scannerUi = replaceRequired(
  scannerUi,
  'Import a photo, correct perspective and save the rendered scan.',
  'Import a photo, recover the real page shape and save the detail-preserved render.',
  'Photos description',
);
scannerUi = replaceRequired(
  scannerUi,
  'Local processing · four corners · rendered scan saved · original preserved',
  'Local source-detail processing · four corners · real ratio · original preserved',
  'scanner footer',
);
write(scannerUiPath, scannerUi);

const reviewPath = 'source/src/modules/scan/v3/ReviewScreenV3.jsx';
write(
  reviewPath,
  replaceRequired(
    read(reviewPath),
    "status || 'Correcting perspective and document quality locally…'",
    "status || 'Recovering page shape and source text detail locally…'",
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
  build:'v10934-road-ready-scanner-projective-source-detail',
  releasedAt:RELEASED_AT,
  label:'v109.3.4 Road Ready Scanner 0.4.5',
  notes:[
    'Keeps the approved straight four-corner selector unchanged.',
    'Reopens the immutable original photo up to 4096 pixels for the final render.',
    'Recovers the physical page ratio from projective camera geometry and uses Letter, A4 or Legal snapping only when the recovered shape supports it.',
    'Removes forced minimum-resolution enlargement and keeps perspective scale at or below the source detail.',
    'Uses bicubic resampling on normal page sizes with a memory-safe bilinear fallback for unusually large renders.',
    'Fuses fine text detail back from the corrected source after gentle shadow and paper-tone normalization.',
    'Exports the primary rendered document at JPEG quality 0.995 and keeps OCR variants separate at an iPhone-safe resolution.',
    'Leaves Logbook, HOS, duty status and document classification unchanged.'
  ],
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);

write('public/scanner-engine.json', `${JSON.stringify({
  version:VERSION,
  name:'Road Ready Scanner 0.4.5',
  mode:'local-four-corner-projective-source-detail',
  externalRuntime:false,
  visibleHandles:4,
  internalBoundaryPoints:4,
  reviewMaxLongSide:2200,
  finalInputMaxLongSide:4096,
  outputMaxDimension:3600,
  ocrMaxLongSide:2400,
  maximumUpscale:1,
  pageFormats:['letter','a4','legal','projective-free'],
  geometry:'projective-rectangle-native-detail',
  interpolation:['bicubic-catmull-rom','bilinear-large-page-fallback'],
  primaryOutput:'display-final',
  jpegQuality:.995,
  qualityBot:'road-ready-auto-quality-bot-v10934',
  sourceDetailFusion:true,
  noPerspectiveUpscale:true,
  highlightClippingProtected:true,
  originalPreserved:true,
}, null, 2)}\n`);

const required = [
  ['source/src/modules/scan/v3/PerspectiveEngineV10934.js', 'estimateProjectiveAspectV10934'],
  ['source/src/modules/scan/v3/PerspectiveEngineV10934.js', "method:'projective-rectangle'"],
  ['source/src/modules/scan/v3/PerspectiveEngineV10934.js', 'bicubic-catmull-rom'],
  ['source/src/modules/scan/v3/AutoQualityBotV1093.js', "qualityProfile:'native-source-detail-fusion'"],
  ['source/src/modules/scan/v3/AutoQualityBotV1093.js', 'sourceDetailFused:true'],
  ['source/src/modules/scan/v3/AutoQualityBotV1093.js', 'naturalPaperTone:true'],
  ['source/src/modules/scan/v3/ReviewScreenV3.jsx', 'four-corner-v10931'],
  ['source/src/modules/scan/v3/ReviewScreenV3.jsx', '4 corner frame'],
  ['source/src/modules/scan/v3/ScannerEngineV3.js', 'warpPerspectiveV10934'],
  ['source/src/modules/scan/v3/ScannerEngineV3.js', 'projective-native-detail-v10934'],
  ['source/src/modules/scan/v3/ScannerEngineV3.js', 'bicubicMaxPixels:6200000'],
  ['source/src/modules/scan/v3/ScannerEngineV3.js', "primaryOutput:'displayFile'"],
  ['source/src/modules/scan/v3/ScannerEngineV3.js', 'jpegQuality:.995'],
  ['source/src/modules/scan/v3/RoadReadyScannerV3.jsx', 'Road Ready Scanner 0.4.5'],
  ['source/src/modules/scan/v3/RoadReadyScannerV3.jsx', 'onComplete?.(result.displayFile, result.metadata)'],
  [contractsPath, VERSION],
  [scanSheetPath, VERSION],
  ['public/app-version.json', VERSION],
];
for (const [relative, marker] of required) {
  if (!read(relative).includes(marker)) throw new Error(`${relative} is missing ${marker}`);
}

console.log('PASS — v109.3.4 projective ratio and source-detail renderer applied');
