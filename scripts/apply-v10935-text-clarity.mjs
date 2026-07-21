import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '109.3.5';
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
    if (!source.includes(pattern)) throw new Error(`v109.3.5 missing ${label}`);
    return source.replace(pattern, replacement);
  }
  if (pattern.test(source)) return source.replace(pattern, replacement);
  if (source.includes(replacement)) return source;
  throw new Error(`v109.3.5 missing ${label}`);
}

const qualityPath = 'source/src/modules/scan/v3/AutoQualityBotV1093.js';
let quality = read(qualityPath);

const clarityHelper = `
function boostNeutralInkV10935(image, metrics, colorMode = false) {
  if (!image?.data || image.width < 5 || image.height < 5) return image;
  const width = image.width;
  const height = image.height;
  const softnessBoost = range((12.5 - Number(metrics.edgeEnergy || 0)) / 12.5, 0, 1);
  const detailStrength = colorMode ? .32 + softnessBoost * .20 : .42 + softnessBoost * .24;
  const inkStrength = colorMode ? .20 + softnessBoost * .11 : .26 + softnessBoost * .13;
  let rowMinus2 = readLumaRow(image, 0);
  let rowMinus1 = readLumaRow(image, 1);
  let row = readLumaRow(image, 2);
  let rowPlus1 = readLumaRow(image, 3);

  for (let y = 2; y < height - 2; y += 1) {
    const rowPlus2 = readLumaRow(image, y + 2);
    for (let x = 2; x < width - 2; x += 1) {
      const center = row[x];
      const left1 = row[x - 1];
      const right1 = row[x + 1];
      const up1 = rowMinus1[x];
      const down1 = rowPlus1[x];
      const left2 = row[x - 2];
      const right2 = row[x + 2];
      const up2 = rowMinus2[x];
      const down2 = rowPlus2[x];
      const blur = (
        center * 4
        + left1 + right1 + up1 + down1
        + (left2 + right2 + up2 + down2) * .5
      ) / 10;
      const detail = range(center - blur, -20, 20);
      const localBright = Math.max(left1, right1, up1, down1, left2, right2, up2, down2);
      const offset = (y * width + x) * 4;
      const r = image.data[offset];
      const g = image.data[offset + 1];
      const b = image.data[offset + 2];
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      const neutralInk = chroma <= 30 || center < 88;
      let target = center;

      if (neutralInk && center < 205) {
        const inkDelta = Math.max(0, localBright - center);
        if (inkDelta > 2.5) target -= Math.min(23, inkDelta * inkStrength);
        if (detail < -1) target += detail * detailStrength;
        if (target < 190) target = 205 - (205 - target) * 1.045;
      } else if (detail < -1.5 && center < 178) {
        target += detail * (.12 + softnessBoost * .07);
      }

      if (detail > 1.3 && center < 220) {
        target += detail * (colorMode ? .08 : .13);
      }

      target = range(target, 4, 250);
      if (Math.abs(target - center) < .45) continue;

      if (colorMode) {
        const ratio = range(target / Math.max(1, center), .76, 1.22);
        image.data[offset] = byte(image.data[offset] * ratio);
        image.data[offset + 1] = byte(image.data[offset + 1] * ratio);
        image.data[offset + 2] = byte(image.data[offset + 2] * ratio);
      } else {
        const value = byte(target);
        image.data[offset] = value;
        image.data[offset + 1] = value;
        image.data[offset + 2] = value;
      }
      image.data[offset + 3] = 255;
    }
    rowMinus2 = rowMinus1;
    rowMinus1 = row;
    row = rowPlus1;
    rowPlus1 = rowPlus2;
  }
  return image;
}
`;

if (!quality.includes('function boostNeutralInkV10935(')) {
  quality = replaceRequired(
    quality,
    'function normalizeNaturalColor(image, metrics) {',
    `${clarityHelper}\nfunction normalizeNaturalColor(image, metrics) {`,
    'neutral ink clarity helper',
  );
}

quality = replaceRequired(
  quality,
  'let targetY = 128 + (sourceY - 128) * 1.055;',
  'let targetY = 128 + (sourceY - 128) * 1.075;',
  'natural color tone contrast',
);
quality = replaceRequired(
  quality,
  `  return fuseNativeDetailInPlace(
    { width:image.width, height:image.height, data },
    image,
    metrics,
    true,
  );
}`,
  `  const fused = fuseNativeDetailInPlace(
    { width:image.width, height:image.height, data },
    image,
    metrics,
    true,
  );
  return boostNeutralInkV10935(fused, metrics, true);
}`,
  'natural color neutral ink pass',
);
quality = replaceRequired(
  quality,
  `  return fuseNativeDetailInPlace(
    { width:image.width, height:image.height, data },
    image,
    metrics,
    false,
  );
}`,
  `  const fused = fuseNativeDetailInPlace(
    { width:image.width, height:image.height, data },
    image,
    metrics,
    false,
  );
  return boostNeutralInkV10935(fused, metrics, false);
}`,
  'clean document neutral ink pass',
);
quality = replaceRequired(
  quality,
  "engine:'road-ready-auto-quality-bot-v10934'",
  "engine:'road-ready-auto-quality-bot-v10935'",
  'quality engine version',
);
quality = replaceRequired(
  quality,
  "qualityProfile:'native-source-detail-fusion'",
  "qualityProfile:'native-source-detail-text-clarity'",
  'quality profile',
);
quality = replaceRequired(
  quality,
  '      sourceDetailFused:true,',
  '      sourceDetailFused:true,\n      neutralInkBoost:true,\n      multiRadiusMicroContrast:true,\n      colorHandwritingProtected:true,',
  'text clarity metadata',
);
write(qualityPath, quality);

const enginePath = 'source/src/modules/scan/v3/ScannerEngineV3.js';
let engine = read(enginePath);
engine = engine.replaceAll("filter:'source-detail-primary-v10934'", "filter:'source-detail-text-clarity-v10935'");
engine = engine.replaceAll("filter:'clean-ocr-v10934'", "filter:'clean-ocr-v10935'");
engine = engine.replaceAll("filter:'high-contrast-ocr-v10934'", "filter:'high-contrast-ocr-v10935'");
engine = engine.replaceAll("filter:`selected-${ocr.selected?.name || 'clean'}-v10934`", "filter:`selected-${ocr.selected?.name || 'clean'}-v10935`");
engine = engine.replaceAll("source:`road-ready-scanner-v10934-${session.source}`", "source:`road-ready-scanner-v10935-${session.source}`");
engine = engine.replaceAll("engine:'Road Ready Scanner 0.4.5 projective source-detail renderer'", "engine:'Road Ready Scanner 0.4.6 projective text-clarity renderer'");
write(enginePath, engine);

const scannerUiPath = 'source/src/modules/scan/v3/RoadReadyScannerV3.jsx';
let scannerUi = read(scannerUiPath);
scannerUi = scannerUi.replaceAll("source:'road-ready-file-import-v10934'", "source:'road-ready-file-import-v10935'");
scannerUi = scannerUi.replaceAll("scannerVersion:'109.3.4'", "scannerVersion:'109.3.5'");
scannerUi = scannerUi.replaceAll('data-road-ready-scanner="four-corner-045-projective-source-detail"', 'data-road-ready-scanner="four-corner-046-text-clarity"');
scannerUi = scannerUi.replaceAll('Road Ready Scanner 0.4.5', 'Road Ready Scanner 0.4.6');
scannerUi = scannerUi.replaceAll(
  'Local source-detail processing · four corners · real ratio · original preserved',
  'Local source-detail processing · clearer printed text · original preserved',
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
  build:'v10935-road-ready-scanner-text-clarity',
  releasedAt:RELEASED_AT,
  label:'v109.3.5 Road Ready Scanner 0.4.6',
  notes:[
    'Keeps the approved four-corner selector, projective page ratio and source-resolution render unchanged.',
    'Adds a restrained second micro-contrast pass for soft printed text.',
    'Darkens neutral black and gray ink only where it is locally darker than the surrounding paper.',
    'Protects paper highlights and avoids whitening the full document.',
    'Preserves orange, red and blue handwriting, stamps and signatures.',
    'Keeps the primary rendered file, immutable original and separate OCR assets unchanged.',
    'Leaves Logbook, HOS, classification and document upload storage unchanged.'
  ],
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);

const scannerManifest = JSON.parse(read('public/scanner-engine.json'));
Object.assign(scannerManifest, {
  version:VERSION,
  name:'Road Ready Scanner 0.4.6',
  qualityBot:'road-ready-auto-quality-bot-v10935',
  qualityProfile:'native-source-detail-text-clarity',
  neutralInkBoost:true,
  multiRadiusMicroContrast:true,
  colorHandwritingProtected:true,
});
write('public/scanner-engine.json', `${JSON.stringify(scannerManifest, null, 2)}\n`);

for (const [relative, marker] of [
  [qualityPath, 'boostNeutralInkV10935'],
  [qualityPath, "qualityProfile:'native-source-detail-text-clarity'"],
  [qualityPath, 'neutralInkBoost:true'],
  [qualityPath, 'multiRadiusMicroContrast:true'],
  [enginePath, 'road-ready-scanner-v10935-'],
  [enginePath, 'warpPerspectiveV10934'],
  [scannerUiPath, 'Road Ready Scanner 0.4.6'],
  [contractsPath, VERSION],
  [scanSheetPath, VERSION],
  ['public/app-version.json', VERSION],
]) {
  if (!read(relative).includes(marker)) throw new Error(`${relative} is missing ${marker}`);
}

console.log('PASS — v109.3.5 scanner printed-text clarity applied');
