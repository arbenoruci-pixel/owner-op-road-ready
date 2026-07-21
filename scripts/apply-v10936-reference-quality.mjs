import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '109.3.6';
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
    if (!source.includes(pattern)) throw new Error(`v109.3.6 missing ${label}`);
    return source.replace(pattern, replacement);
  }
  if (pattern.test(source)) return source.replace(pattern, replacement);
  if (source.includes(replacement)) return source;
  throw new Error(`v109.3.6 missing ${label}`);
}

function replaceBlock(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`v109.3.6 missing ${label}`);
  return `${source.slice(0, start)}${replacement}\n\n${source.slice(end)}`;
}

const qualityPath = 'source/src/modules/scan/v3/AutoQualityBotV1093.js';
let quality = read(qualityPath);

quality = replaceRequired(
  quality,
  `function range(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}`,
  `function range(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function smoothstep(minimum, maximum, value) {
  if (maximum <= minimum) return value >= maximum ? 1 : 0;
  const t = range((Number(value) - minimum) / (maximum - minimum), 0, 1);
  return t * t * (3 - 2 * t);
}`,
  'smoothstep helper',
);

quality = replaceRequired(
  quality,
  'const columns = Math.max(6, Math.min(14, Math.ceil(width / 250)));',
  'const columns = Math.max(7, Math.min(18, Math.ceil(width / 180)));',
  'illumination columns',
);
quality = replaceRequired(
  quality,
  'const rows = Math.max(6, Math.min(14, Math.ceil(height / 250)));',
  'const rows = Math.max(7, Math.min(18, Math.ceil(height / 180)));',
  'illumination rows',
);
quality = replaceRequired(
  quality,
  'const step = Math.max(1, Math.floor(pixelCount / 720000));',
  'const step = Math.max(1, Math.floor(pixelCount / 880000));',
  'illumination sample density',
);
quality = replaceRequired(
  quality,
  'const target = total * .89;',
  'const target = total * .90;',
  'illumination paper percentile',
);
quality = replaceRequired(
  quality,
  'const threshold = Math.max(154, Number(metrics.high || 224) * .75);',
  'const threshold = Math.max(150, Number(metrics.high || 224) * .73);',
  'paper balance threshold',
);
quality = replaceRequired(
  quality,
  'red:range(neutral / Math.max(1, averageRed), .955, 1.045),',
  'red:range(neutral / Math.max(1, averageRed), .935, 1.065),',
  'red paper balance',
);
quality = replaceRequired(
  quality,
  'green:range(neutral / Math.max(1, averageGreen), .955, 1.045),',
  'green:range(neutral / Math.max(1, averageGreen), .935, 1.065),',
  'green paper balance',
);
quality = replaceRequired(
  quality,
  'blue:range(neutral / Math.max(1, averageBlue), .955, 1.045),',
  'blue:range(neutral / Math.max(1, averageBlue), .935, 1.065),',
  'blue paper balance',
);
quality = replaceRequired(
  quality,
  'const baseAmount = colorMode ? .72 : .9;',
  'const baseAmount = colorMode ? .82 : 1.02;',
  'source detail base amount',
);
quality = replaceRequired(
  quality,
  'const amount = baseAmount + softnessBoost * (colorMode ? .36 : .46);',
  'const amount = baseAmount + softnessBoost * (colorMode ? .38 : .50);',
  'source detail adaptive amount',
);
quality = replaceRequired(
  quality,
  'const detail = range(sourceCenter - blur, -23, 23);',
  'const detail = range(sourceCenter - blur, -25, 25);',
  'source detail range',
);
quality = replaceRequired(
  quality,
  'if (Math.abs(detail) < .72) continue;',
  'if (Math.abs(detail) < .62) continue;',
  'source detail threshold',
);

const naturalAndInk = `function applyNeutralInkClarityInPlace(processed, source, grid, metrics, colorMode = false) {
  if (!processed?.data || !source?.data || processed.width !== source.width || processed.height !== source.height) {
    return processed;
  }

  const width = source.width;
  const height = source.height;
  const softnessBoost = range((12.5 - Number(metrics.edgeEnergy || 0)) / 12.5, 0, 1);
  const depthAmount = .22 + softnessBoost * .10;
  const microAmount = 1.25 + softnessBoost * .42;
  let previous = readLumaRow(source, 0);
  let current = readLumaRow(source, 1);

  for (let y = 1; y < height - 1; y += 1) {
    const next = readLumaRow(source, y + 1);
    for (let x = 1; x < width - 1; x += 1) {
      const offset = (y * width + x) * 4;
      const sourceR = source.data[offset];
      const sourceG = source.data[offset + 1];
      const sourceB = source.data[offset + 2];
      const sourceY = current[x];
      const maximum = Math.max(sourceR, sourceG, sourceB);
      const minimum = Math.min(sourceR, sourceG, sourceB);
      const chroma = maximum - minimum;
      const warmInk = sourceR > sourceG * 1.075
        && sourceR > sourceB * 1.035
        && sourceR - Math.max(sourceG, sourceB) > 11;
      const blueInk = sourceB > sourceR * 1.05
        && sourceB > sourceG * 1.025
        && sourceB - Math.max(sourceR, sourceG) > 10;
      const colorGuard = warmInk || blueInk ? .08 : 1;
      const neutrality = (1 - smoothstep(18, 55, chroma)) * colorGuard;
      if (neutrality <= .01 || sourceY > 226) continue;

      const localBlur = (
        sourceY * 4
        + current[x - 1] * 2
        + current[x + 1] * 2
        + previous[x] * 2
        + next[x] * 2
        + previous[x - 1]
        + previous[x + 1]
        + next[x - 1]
        + next[x + 1]
      ) / 16;
      const micro = Math.max(0, localBlur - sourceY);
      const background = Math.max(sourceY, sampleGrid(grid, x, y, width, height));
      const depth = Math.max(0, background - sourceY);
      const microConfidence = smoothstep(.35, 9.5, micro);
      const depthConfidence = smoothstep(3, 38, depth);
      const darkConfidence = 1 - smoothstep(205, 236, sourceY);
      const textConfidence = Math.max(depthConfidence, microConfidence * .88)
        * neutrality
        * darkConfidence;
      if (textConfidence <= .01) continue;

      const processedY = luminance(
        processed.data[offset],
        processed.data[offset + 1],
        processed.data[offset + 2],
      );
      const boost = Math.min(
        46,
        Math.max(0, micro - .25) * microAmount
          + Math.max(0, depth - 7) * depthAmount,
      );
      const highlightGuard = 1 - smoothstep(214, 244, processedY) * .82;
      const target = byte(processedY - boost * textConfidence * highlightGuard);

      if (colorMode) {
        const ratio = range(target / Math.max(1, processedY), .68, 1);
        processed.data[offset] = byte(processed.data[offset] * ratio);
        processed.data[offset + 1] = byte(processed.data[offset + 1] * ratio);
        processed.data[offset + 2] = byte(processed.data[offset + 2] * ratio);
      } else {
        processed.data[offset] = target;
        processed.data[offset + 1] = target;
        processed.data[offset + 2] = target;
      }
      processed.data[offset + 3] = 255;
    }
    previous = current;
    current = next;
  }

  return processed;
}

function normalizeNaturalColor(image, metrics) {
  const grid = buildIlluminationGrid(image, metrics);
  const balance = paperWhiteBalance(image, metrics);
  const data = new Uint8ClampedArray(image.data.length);
  const targetPaper = range(Number(metrics.high || 230), 230, 238);
  const globalBackground = Math.max(150, Number(metrics.high || metrics.mean || 220));
  const globalGain = range(targetPaper / globalBackground, .92, 1.10);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const sourceR = image.data[offset];
      const sourceG = image.data[offset + 1];
      const sourceB = image.data[offset + 2];
      const sourceYRaw = luminance(sourceR, sourceG, sourceB);
      const sourceMaximum = Math.max(sourceR, sourceG, sourceB);
      const sourceMinimum = Math.min(sourceR, sourceG, sourceB);
      const sourceChroma = sourceMaximum - sourceMinimum;
      const background = Math.max(90, sampleGrid(grid, x, y, image.width, image.height));
      const localGain = range(targetPaper / background, .84, 1.45);
      const paperWeight = range(.30 + smoothstep(55, 215, sourceYRaw) * .48, .30, .78);
      const illuminationGain = globalGain * (1 - paperWeight) + localGain * paperWeight;

      let r = sourceR * illuminationGain * balance.red;
      let g = sourceG * illuminationGain * balance.green;
      let b = sourceB * illuminationGain * balance.blue;
      const correctedY = luminance(r, g, b);
      let targetY = 128 + (correctedY - 128) * 1.08;
      if (targetY < 55) targetY += (55 - targetY) * .04;
      if (targetY > 232) targetY = 232 + (targetY - 232) * .45;
      targetY = range(targetY, 4, 250);

      const inkDepth = Math.max(0, background - sourceYRaw);
      const paperConfidence = smoothstep(145, 232, targetY)
        * (1 - smoothstep(5, 20, inkDepth))
        * (1 - smoothstep(18, 58, sourceChroma));
      targetY += (238 - targetY) * .14 * paperConfidence;

      const toneRatio = targetY / Math.max(1, correctedY);
      r *= toneRatio;
      g *= toneRatio;
      b *= toneRatio;

      const average = (r + g + b) / 3;
      const paperNeutral = smoothstep(125, 232, targetY)
        * (1 - smoothstep(16, 60, sourceChroma));
      const neutralBlend = .72 * paperNeutral;
      r += (average - r) * neutralBlend;
      g += (average - g) * neutralBlend;
      b += (average - b) * neutralBlend;

      const colorBoost = 1 + .035 * smoothstep(20, 70, sourceChroma);
      data[offset] = byte(average + (r - average) * colorBoost);
      data[offset + 1] = byte(average + (g - average) * colorBoost);
      data[offset + 2] = byte(average + (b - average) * colorBoost);
      data[offset + 3] = 255;
    }
  }

  const processed = { width:image.width, height:image.height, data };
  fuseNativeDetailInPlace(processed, image, metrics, true);
  applyNeutralInkClarityInPlace(processed, image, grid, metrics, true);
  return processed;
}`;

quality = replaceBlock(
  quality,
  'function normalizeNaturalColor(image, metrics) {',
  'function normalizeCleanDocument(image, metrics) {',
  naturalAndInk,
  'natural color block',
);

const clean = `function normalizeCleanDocument(image, metrics) {
  const grid = buildIlluminationGrid(image, metrics);
  const data = new Uint8ClampedArray(image.data.length);
  const targetPaper = 236;
  const low = range(Number(metrics.low || 18) * .94, 3, 110);
  const high = range(Math.max(low + 106, Number(metrics.high || 232)), low + 106, 252);
  const span = Math.max(106, high - low);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const source = luminance(image.data[offset], image.data[offset + 1], image.data[offset + 2]);
      const background = Math.max(90, sampleGrid(grid, x, y, image.width, image.height));
      const localGain = range(targetPaper / background, .84, 1.45);
      const localWeight = range(.42 + smoothstep(50, 215, source) * .40, .42, .82);
      const illuminated = range(source * (1 + (localGain - 1) * localWeight), 0, 252);
      let normalized = clampV3((illuminated - low) / span);
      normalized = Math.pow(normalized, .98);
      let value = 7 + normalized * 242;
      if (value < 132) value = 122 + (value - 122) * 1.16;
      if (value > 228) value = 228 + (value - 228) * .52;

      const inkDepth = Math.max(0, background - source);
      const paperConfidence = smoothstep(150, 232, value) * (1 - smoothstep(5, 20, inkDepth));
      value += (240 - value) * .14 * paperConfidence;
      const output = byte(range(value, 4, 250));

      data[offset] = output;
      data[offset + 1] = output;
      data[offset + 2] = output;
      data[offset + 3] = 255;
    }
  }

  const processed = { width:image.width, height:image.height, data };
  fuseNativeDetailInPlace(processed, image, metrics, false);
  applyNeutralInkClarityInPlace(processed, image, grid, metrics, false);
  return processed;
}`;

quality = replaceBlock(
  quality,
  'function normalizeCleanDocument(image, metrics) {',
  'function adaptiveHighContrast(clean) {',
  clean,
  'clean document block',
);

quality = replaceRequired(
  quality,
  "engine:'road-ready-auto-quality-bot-v10934'",
  "engine:'road-ready-auto-quality-bot-v10936'",
  'quality engine version',
);
quality = replaceRequired(
  quality,
  "mode:needsColor ? 'natural-color-source-detail' : 'clean-document-source-detail'",
  "mode:needsColor ? 'natural-color-shadow-flat-text-clear' : 'clean-document-shadow-flat-text-clear'",
  'quality mode',
);
quality = replaceRequired(
  quality,
  "qualityProfile:'native-source-detail-fusion'",
  "qualityProfile:'reference-trained-shadow-flat-text-clarity'",
  'quality profile',
);
quality = replaceRequired(
  quality,
  'localIlluminationGrid:true,',
  `localIlluminationGrid:true,
      localShadowFlattening:true,`,
  'shadow flattening metadata',
);
quality = replaceRequired(
  quality,
  'paperWhiteBalanced:true,',
  `paperWhiteBalanced:true,
      paperNeutralized:true,`,
  'paper neutral metadata',
);
quality = replaceRequired(
  quality,
  'adaptiveTextSharpening:true,',
  `adaptiveTextSharpening:true,
      neutralInkBoost:true,
      coloredInkProtected:true,`,
  'ink metadata',
);
write(qualityPath, quality);

const scannerTypesPath = 'source/src/modules/scan/v3/scannerTypesV3.js';
write(
  scannerTypesPath,
  replaceRequired(
    read(scannerTypesPath),
    /export const ROAD_READY_SCANNER_V3_VERSION = '[^']+';/,
    `export const ROAD_READY_SCANNER_V3_VERSION = '${VERSION}';`,
    'scanner version constant',
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

const scannerUiPath = 'source/src/modules/scan/v3/RoadReadyScannerV3.jsx';
let scannerUi = read(scannerUiPath);
scannerUi = replaceRequired(
  scannerUi,
  /Road Ready Scanner 0\.4\.[0-9]+/,
  'Road Ready Scanner 0.4.7',
  'visible scanner version',
);
write(scannerUiPath, scannerUi);

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
  build:'v10936-road-ready-scanner-reference-quality',
  releasedAt:RELEASED_AT,
  label:'v109.3.6 Road Ready Scanner 0.4.7',
  notes:[
    'Keeps the approved four-corner selector and projective page ratio unchanged.',
    'Uses a stronger local paper-light model to flatten broad shadows without bleaching the full page.',
    'Neutralizes the pink or warm paper cast only in bright low-color paper areas.',
    'Adds neutral black and gray ink detection against the local paper background.',
    'Uses source-detail and neutral-ink micro-contrast to make printed text visibly darker and sharper.',
    'Protects orange, red and blue handwriting, signatures and stamps from the black-ink boost.',
    'Keeps the rendered final file as the primary Vault asset and preserves the immutable original and OCR assets.',
    'Leaves Logbook, HOS, duty status, classification and upload storage unchanged.'
  ],
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);

const scannerManifest = JSON.parse(read('public/scanner-engine.json'));
scannerManifest.version = VERSION;
scannerManifest.name = 'Road Ready Scanner 0.4.7';
scannerManifest.qualityBot = 'road-ready-auto-quality-bot-v10936';
scannerManifest.qualityProfile = 'reference-trained-shadow-flat-text-clarity';
scannerManifest.localShadowFlattening = true;
scannerManifest.paperNeutralization = true;
scannerManifest.neutralInkBoost = true;
scannerManifest.coloredInkProtected = true;
scannerManifest.primaryOutput = 'display-final';
scannerManifest.originalPreserved = true;
write('public/scanner-engine.json', `${JSON.stringify(scannerManifest, null, 2)}\n`);

console.log('PASS — v109.3.6 reference-trained scanner quality applied');
