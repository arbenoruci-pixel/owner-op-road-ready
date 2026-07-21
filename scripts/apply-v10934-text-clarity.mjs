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

const qualityPath = 'source/src/modules/scan/v3/AutoQualityBotV1093.js';
let quality = read(qualityPath);

const clarityHelper = `
function boostNeutralInkV10934(image, metrics, colorMode = false) {
  if (!image?.data || image.width < 5 || image.height < 5) return image;
  const sourceLuma = lumaPlane(image);
  const output = image.data;
  const width = image.width;
  const height = image.height;
  const softnessBoost = range((12.5 - Number(metrics.edgeEnergy || 0)) / 12.5, 0, 1);
  const detailStrength = colorMode ? .30 + softnessBoost * .18 : .40 + softnessBoost * .24;
  const inkStrength = colorMode ? .18 + softnessBoost * .10 : .24 + softnessBoost * .12;

  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      const pixel = y * width + x;
      const center = sourceLuma[pixel];
      const left1 = sourceLuma[pixel - 1];
      const right1 = sourceLuma[pixel + 1];
      const up1 = sourceLuma[pixel - width];
      const down1 = sourceLuma[pixel + width];
      const left2 = sourceLuma[pixel - 2];
      const right2 = sourceLuma[pixel + 2];
      const up2 = sourceLuma[pixel - width * 2];
      const down2 = sourceLuma[pixel + width * 2];
      const blur = (
        center * 4
        + left1 + right1 + up1 + down1
        + (left2 + right2 + up2 + down2) * .5
      ) / 10;
      const detail = range(center - blur, -20, 20);
      const localBright = Math.max(left1, right1, up1, down1, left2, right2, up2, down2);
      const offset = pixel * 4;
      const r = output[offset];
      const g = output[offset + 1];
      const b = output[offset + 2];
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      const neutralInk = chroma <= 30 || center < 88;
      let target = center;

      if (neutralInk && center < 205) {
        const inkDelta = Math.max(0, localBright - center);
        if (inkDelta > 2.5) target -= Math.min(22, inkDelta * inkStrength);
        if (detail < -1) target += detail * detailStrength;
        if (target < 190) target = 205 - (205 - target) * 1.04;
      } else if (detail < -1.5 && center < 178) {
        // Preserve the hue of handwriting and stamps while giving their edges
        // a small clarity lift.
        target += detail * (.12 + softnessBoost * .07);
      }

      if (detail > 1.3 && center < 220) {
        target += detail * (colorMode ? .08 : .13);
      }

      target = range(target, 4, 250);
      if (Math.abs(target - center) < .45) continue;

      if (colorMode) {
        const ratio = target / Math.max(1, center);
        output[offset] = byte(output[offset] * ratio);
        output[offset + 1] = byte(output[offset + 1] * ratio);
        output[offset + 2] = byte(output[offset + 2] * ratio);
      } else {
        const value = byte(target);
        output[offset] = value;
        output[offset + 1] = value;
        output[offset + 2] = value;
      }
      output[offset + 3] = 255;
    }
  }
  return { width, height, data:output };
}
`;

if (!quality.includes('function boostNeutralInkV10934(')) {
  quality = replaceRequired(
    quality,
    'function normalizeNaturalColor(image, metrics) {',
    `${clarityHelper}\nfunction normalizeNaturalColor(image, metrics) {`,
    'neutral ink clarity helper',
  );
}

quality = replaceRequired(
  quality,
  'let targetY = 128 + (sourceY - 128) * 1.075;',
  'let targetY = 128 + (sourceY - 128) * 1.09;',
  'natural color tone contrast',
);
quality = replaceRequired(
  quality,
  '  return detailSharpen({ width:image.width, height:image.height, data }, metrics, true);\n}',
  '  const sharpened = detailSharpen({ width:image.width, height:image.height, data }, metrics, true);\n  return boostNeutralInkV10934(sharpened, metrics, true);\n}',
  'natural color text clarity pass',
);
quality = replaceRequired(
  quality,
  '  return detailSharpen({ width:image.width, height:image.height, data }, metrics, false);\n}',
  '  const sharpened = detailSharpen({ width:image.width, height:image.height, data }, metrics, false);\n  return boostNeutralInkV10934(sharpened, metrics, false);\n}',
  'clean document text clarity pass',
);
quality = replaceRequired(
  quality,
  "engine:'road-ready-auto-quality-bot-v10933'",
  "engine:'road-ready-auto-quality-bot-v10934'",
  'quality engine version',
);
quality = replaceRequired(
  quality,
  "qualityProfile:'native-detail-preserving'",
  "qualityProfile:'native-detail-text-clarity'",
  'quality profile',
);
quality = replaceRequired(
  quality,
  '      adaptiveTextSharpening:true,',
  '      adaptiveTextSharpening:true,\n      neutralInkBoost:true,\n      multiRadiusMicroContrast:true,\n      colorHandwritingProtected:true,',
  'text clarity metadata',
);
write(qualityPath, quality);

const enginePath = 'source/src/modules/scan/v3/ScannerEngineV3.js';
let engine = read(enginePath);
engine = engine.replaceAll('road-ready-scanner-v10933-', 'road-ready-scanner-v10934-');
engine = engine.replaceAll('-v10933', '-v10934');
engine = engine.replaceAll('scanner_v10933', 'scanner_v10934');
engine = engine.replaceAll('0.4.4 native-detail renderer', '0.4.5 text-clarity renderer');
write(enginePath, engine);

const scannerUiPath = 'source/src/modules/scan/v3/RoadReadyScannerV3.jsx';
let scannerUi = read(scannerUiPath);
scannerUi = scannerUi.replaceAll('109.3.3', VERSION);
scannerUi = scannerUi.replaceAll('0.4.4', '0.4.5');
scannerUi = scannerUi.replaceAll('four-corner-044-native-detail', 'four-corner-045-text-clarity');
scannerUi = scannerUi.replaceAll(
  'Local native-detail processing · four corners · final render saved · original preserved',
  'Local native-detail processing · clearer printed text · original preserved',
);
write(scannerUiPath, scannerUi);

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

write(
  'public/sw.js',
  replaceRequired(
    read('public/sw.js'),
    /const OWNER_OP_SW_VERSION = '[^']+';/,
    `const OWNER_OP_SW_VERSION = '${VERSION}';`,
    'service worker version',
  ),
);
write(
  'source/src/core/update/appUpdate.js',
  replaceRequired(
    read('source/src/core/update/appUpdate.js'),
    /const FALLBACK_APP_VERSION = '[^']+';/,
    `const FALLBACK_APP_VERSION = '${VERSION}';`,
    'fallback app version',
  ),
);

write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v10934-road-ready-scanner-text-clarity',
  releasedAt:RELEASED_AT,
  label:'v109.3.4 Road Ready Scanner 0.4.5',
  notes:[
    'Keeps the approved four-corner selector and the corrected page format unchanged.',
    'Adds a second, multi-radius micro-contrast pass after the native-detail render.',
    'Darkens neutral printed ink against its local paper background without whitening the full page.',
    'Uses adaptive strength for soft photos and protects bright paper regions from clipping.',
    'Preserves orange, red and blue handwriting, stamps and signatures while sharpening their edges lightly.',
    'Keeps the immutable original, primary rendered file and separate OCR assets unchanged.',
    'Leaves Logbook, HOS, document classification and upload storage behavior unchanged.'
  ],
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);

const scannerManifest = JSON.parse(read('public/scanner-engine.json'));
Object.assign(scannerManifest, {
  version:VERSION,
  name:'Road Ready Scanner 0.4.5',
  qualityBot:'road-ready-auto-quality-bot-v10934',
  qualityProfile:'native-detail-text-clarity',
  neutralInkBoost:true,
  multiRadiusMicroContrast:true,
  colorHandwritingProtected:true,
});
write('public/scanner-engine.json', `${JSON.stringify(scannerManifest, null, 2)}\n`);

for (const [relative, marker] of [
  [qualityPath, 'boostNeutralInkV10934'],
  [qualityPath, "qualityProfile:'native-detail-text-clarity'"],
  [qualityPath, 'neutralInkBoost:true'],
  [qualityPath, 'multiRadiusMicroContrast:true'],
  [enginePath, 'road-ready-scanner-v10934-'],
  [scannerUiPath, 'Road Ready Scanner 0.4.5'],
  [contractsPath, VERSION],
  [scanSheetPath, VERSION],
  ['public/app-version.json', VERSION],
]) {
  if (!read(relative).includes(marker)) throw new Error(`${relative} is missing ${marker}`);
}

console.log('PASS — v109.3.4 scanner printed-text clarity applied');
