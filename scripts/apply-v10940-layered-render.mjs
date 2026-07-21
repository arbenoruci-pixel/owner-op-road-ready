import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '109.4.0';
const BUILD = 'v10940-layered-paper-text-fusion';
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
    if (!source.includes(pattern)) throw new Error(`v109.4.0 missing ${label}`);
    return source.replace(pattern, replacement);
  }
  if (pattern.test(source)) return source.replace(pattern, replacement);
  if (source.includes(replacement)) return source;
  throw new Error(`v109.4.0 missing ${label}`);
}

const qualityPath = 'source/src/modules/scan/v3/AutoQualityBotV1093.js';
let quality = read(qualityPath);

const layeredRenderer = `function composeLayeredDocumentRender(fidelity, source, metrics) {
  if (!fidelity?.data || !source?.data
    || fidelity.width !== source.width || fidelity.height !== source.height) {
    return fidelity;
  }

  const width = source.width;
  const height = source.height;
  const pixelCount = width * height;
  const sourceGrid = buildIlluminationGrid(source, metrics);
  const outputMetrics = analyzeDocumentColorV1093(fidelity);
  const outputGrid = buildIlluminationGrid(fidelity, outputMetrics);
  const textMask = new Float32Array(pixelCount);
  const colorMask = new Float32Array(pixelCount);
  const paperPass = new Uint8ClampedArray(fidelity.data.length);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      const sr = source.data[offset];
      const sg = source.data[offset + 1];
      const sb = source.data[offset + 2];
      const sy = luminance(sr, sg, sb);
      const maximum = Math.max(sr, sg, sb);
      const minimum = Math.min(sr, sg, sb);
      const chroma = maximum - minimum;

      const left = pixel - 1;
      const right = pixel + 1;
      const up = pixel - width;
      const down = pixel + width;
      const neighborY = (
        luminance(source.data[left * 4], source.data[left * 4 + 1], source.data[left * 4 + 2])
        + luminance(source.data[right * 4], source.data[right * 4 + 1], source.data[right * 4 + 2])
        + luminance(source.data[up * 4], source.data[up * 4 + 1], source.data[up * 4 + 2])
        + luminance(source.data[down * 4], source.data[down * 4 + 1], source.data[down * 4 + 2])
      ) / 4;
      const localDepth = Math.max(0, neighborY - sy);
      const sourcePaper = Math.max(sy, sampleGrid(sourceGrid, x, y, width, height));
      const broadDepth = Math.max(0, sourcePaper - sy);
      const neutrality = 1 - smoothstep(16, 48, chroma);
      const warmInk = sr > sg * 1.05 && sr > sb * 1.025 && sr - Math.max(sg, sb) > 6;
      const blueInk = sb > sr * 1.04 && sb > sg * 1.018 && sb - Math.max(sr, sg) > 6;
      const colored = warmInk || blueInk;

      textMask[pixel] = range(Math.max(
        smoothstep(.45, 6.8, localDepth),
        smoothstep(2.0, 22, broadDepth),
      ) * (colored ? .64 : neutrality), 0, 1);
      colorMask[pixel] = colored
        ? range(smoothstep(6, 30, chroma) * Math.max(
          smoothstep(.3, 5.5, localDepth),
          smoothstep(1.2, 15, broadDepth),
        ), 0, 1)
        : 0;

      const fy = luminance(fidelity.data[offset], fidelity.data[offset + 1], fidelity.data[offset + 2]);
      const outputPaper = Math.max(fy, sampleGrid(outputGrid, x, y, width, height));
      const paperConfidence = (1 - smoothstep(1.4, 6.5, Math.max(localDepth, broadDepth)))
        * (1 - smoothstep(12, 44, chroma));
      const normalizedPaperY = range(outputPaper + (246 - outputPaper) * .38, 8, 250);
      const paperTargetY = fy + (normalizedPaperY - fy) * paperConfidence * .76;
      const paperRatio = range(paperTargetY / Math.max(1, fy), .82, 1.24);
      paperPass[offset] = byte(fidelity.data[offset] * paperRatio);
      paperPass[offset + 1] = byte(fidelity.data[offset + 1] * paperRatio);
      paperPass[offset + 2] = byte(fidelity.data[offset + 2] * paperRatio);
      paperPass[offset + 3] = 255;
    }
  }

  const softenedText = new Float32Array(pixelCount);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const pixel = y * width + x;
      softenedText[pixel] = Math.max(
        textMask[pixel],
        (textMask[pixel] * 4 + textMask[pixel - 1] + textMask[pixel + 1]
          + textMask[pixel - width] + textMask[pixel + width]) / 8 * .9,
      );
    }
  }

  const data = new Uint8ClampedArray(paperPass);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      const mask = range(softenedText[pixel], 0, 1);
      const color = range(colorMask[pixel], 0, 1);
      if (mask < .01 && color < .01) continue;

      const currentY = luminance(data[offset], data[offset + 1], data[offset + 2]);
      const sourceY = luminance(source.data[offset], source.data[offset + 1], source.data[offset + 2]);
      const sourceNeighbor = (
        luminance(source.data[offset - 4], source.data[offset - 3], source.data[offset - 2])
        + luminance(source.data[offset + 4], source.data[offset + 5], source.data[offset + 6])
        + luminance(source.data[offset - width * 4], source.data[offset - width * 4 + 1], source.data[offset - width * 4 + 2])
        + luminance(source.data[offset + width * 4], source.data[offset + width * 4 + 1], source.data[offset + width * 4 + 2])
      ) / 4;
      const edgeDepth = Math.max(0, sourceNeighbor - sourceY);
      const sharpenDepth = Math.min(24, edgeDepth * (.72 + mask * .46));
      const targetY = Math.max(3, currentY - sharpenDepth * mask);
      const ratio = range(targetY / Math.max(1, currentY), .76, 1.04);

      if (color > .04) {
        const sourceMix = range(.22 + color * .46, 0, .68);
        const inverse = 1 - sourceMix;
        data[offset] = byte(data[offset] * ratio * inverse + source.data[offset] * sourceMix);
        data[offset + 1] = byte(data[offset + 1] * ratio * inverse + source.data[offset + 1] * sourceMix);
        data[offset + 2] = byte(data[offset + 2] * ratio * inverse + source.data[offset + 2] * sourceMix);
      } else {
        const average = (data[offset] + data[offset + 1] + data[offset + 2]) / 3;
        const neutralBlend = .82 * mask;
        data[offset] = byte(data[offset] * ratio + (average * ratio - data[offset] * ratio) * neutralBlend);
        data[offset + 1] = byte(data[offset + 1] * ratio + (average * ratio - data[offset + 1] * ratio) * neutralBlend);
        data[offset + 2] = byte(data[offset + 2] * ratio + (average * ratio - data[offset + 2] * ratio) * neutralBlend);
      }
      data[offset + 3] = 255;
    }
  }

  return applyDocumentFidelityLock({ width, height, data }, source, metrics);
}`;

quality = replaceRequired(
  quality,
  'function adaptiveHighContrast(clean) {',
  `${layeredRenderer}\n\nfunction adaptiveHighContrast(clean) {`,
  'layered renderer',
);
quality = replaceRequired(
  quality,
  '  const fidelityDisplay = applyDocumentFidelityLock(enhancedDisplay, source, metrics);',
  '  const fidelityDisplay = composeLayeredDocumentRender(\n    applyDocumentFidelityLock(enhancedDisplay, source, metrics),\n    source,\n    metrics,\n  );',
  'layered display selection',
);
quality = replaceRequired(quality, "engine:'road-ready-auto-quality-bot-v10939'", "engine:'road-ready-auto-quality-bot-v10940'", 'quality engine version');
quality = replaceRequired(quality, "qualityProfile:'content-fidelity-lock-v10939'", "qualityProfile:'layered-paper-text-fusion-v10940'", 'quality profile');
quality = replaceRequired(
  quality,
  'sourceAnchoredToneMapping:true,',
  `sourceAnchoredToneMapping:true,
      layeredPaperPass:true,
      sourceAnchoredTextPass:true,
      edgeAwareFusion:true,
      adaptiveMicroContrast:true,
      handwritingLayerPreserved:true,`,
  'layered metadata',
);
write(qualityPath, quality);

const replacements = [
  ['source/src/modules/scan/v3/scannerTypesV3.js', /export const ROAD_READY_SCANNER_V3_VERSION = '[^']+';/, `export const ROAD_READY_SCANNER_V3_VERSION = '${VERSION}';`],
  ['source/src/modules/scan/scannerContractsV106.js', /export const ROAD_READY_SCANNER_VERSION_V106 = '[^']+';/, `export const ROAD_READY_SCANNER_VERSION_V106 = '${VERSION}';`],
];
for (const [target, pattern, replacement] of replacements) write(target, replaceRequired(read(target), pattern, replacement, target));

const scanSheetPath = 'source/src/modules/scan/SmartScanSheetV105.jsx';
write(scanSheetPath, replaceRequired(read(scanSheetPath), /scannerVersion:analysis\?\.scanMeta\?\.scannerVersion \|\| '[^']+'/, `scannerVersion:analysis?.scanMeta?.scannerVersion || '${VERSION}'`, 'scan persistence version'));

const scannerUiPath = 'source/src/modules/scan/v3/RoadReadyScannerV3.jsx';
let scannerUi = read(scannerUiPath);
scannerUi = replaceRequired(scannerUi, /Road Ready Scanner 0\.4\.[0-9]+/, 'Road Ready Scanner 0.5.0', 'visible scanner version');
scannerUi = replaceRequired(scannerUi, /· App 109\.[0-9]+\.[0-9]+/, `· App ${VERSION}`, 'visible app version');
write(scannerUiPath, scannerUi);

const reviewPath = 'source/src/modules/scan/v3/ReviewScreenV3.jsx';
write(reviewPath, replaceRequired(read(reviewPath), /Fidelity lock · build 109\.[0-9]+\.[0-9]+/, `Layered render · build ${VERSION}`, 'review marker'));

const updatePath = 'source/src/core/update/appUpdate.js';
let update = read(updatePath);
update = replaceRequired(update, /const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`, 'fallback app version');
update = replaceRequired(update, /const FALLBACK_APP_BUILD = '[^']+';/, `const FALLBACK_APP_BUILD = '${BUILD}';`, 'fallback app build');
write(updatePath, update);

const bannerPath = 'source/src/modules/update/UpdateBanner.jsx';
write(bannerPath, replaceRequired(read(bannerPath), /data-owner-op-update-banner="[^"]+"/, `data-owner-op-update-banner="${VERSION}"`, 'update banner marker'));

const bootPath = 'public/update.html';
let boot = read(bootPath);
boot = replaceRequired(boot, /const version = params\.get\('version'\) \|\| '[^']+';/, `const version = params.get('version') || '${VERSION}';`, 'update page version');
boot = replaceRequired(boot, /const build = params\.get\('build'\) \|\| '[^']+';/, `const build = params.get('build') || '${BUILD}';`, 'update page build');
write(bootPath, boot);

const swPath = 'public/sw.js';
let sw = read(swPath);
sw = replaceRequired(sw, /const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`, 'service worker version');
sw = replaceRequired(sw, /const OWNER_OP_SW_BUILD = '[^']+';/, `const OWNER_OP_SW_BUILD = '${BUILD}';`, 'service worker build');
write(swPath, sw);

const packageJson = JSON.parse(read('package.json'));
packageJson.version = VERSION;
packageJson.engines = { ...(packageJson.engines || {}), node:'24.x' };
write('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);
const packageLock = JSON.parse(read('package-lock.json'));
packageLock.version = VERSION;
if (packageLock.packages?.['']) packageLock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(packageLock, null, 2)}\n`);

write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:BUILD,
  releasedAt:RELEASED_AT,
  updatedAt:RELEASED_AT,
  label:'v109.4.0 Layered Document Scanner 0.5.0',
  force:true,
  notes:[
    'Adds separate paper, printed-text and colored-handwriting passes with edge-aware fusion.',
    'Uses a local illumination map to flatten broad shadows without applying one global filter to the whole page.',
    'Adds source-anchored micro-contrast and edge-aware text sharpening while preserving digit and letter topology.',
    'Keeps Fidelity Lock active after the layered fusion so dates, amounts, VINs and handwritten values cannot be reconstructed or rewritten.',
    'Keeps the four-corner selector, projective page ratio, immutable original, OCR asset and display-final storage unchanged.',
  ],
}, null, 2)}\n`);

const manifest = JSON.parse(read('public/scanner-engine.json'));
Object.assign(manifest, {
  version:VERSION,
  name:'Road Ready Scanner 0.5.0',
  qualityBot:'road-ready-auto-quality-bot-v10940',
  qualityProfile:'layered-paper-text-fusion-v10940',
  layeredPaperPass:true,
  sourceAnchoredTextPass:true,
  edgeAwareFusion:true,
  adaptiveMicroContrast:true,
  handwritingLayerPreserved:true,
  contentFidelityLock:true,
  generativeReconstruction:false,
  ocrRewrite:false,
  updateBootstrap:BUILD,
  visibleBuildMarker:VERSION,
});
write('public/scanner-engine.json', `${JSON.stringify(manifest, null, 2)}\n`);

console.log('PASS — v109.4.0 layered paper/text/handwriting renderer applied');
