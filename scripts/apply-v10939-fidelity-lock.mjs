import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '109.3.9';
const BUILD = 'v10939-content-fidelity-lock';
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
    if (!source.includes(pattern)) throw new Error(`v109.3.9 missing ${label}`);
    return source.replace(pattern, replacement);
  }
  if (pattern.test(source)) return source.replace(pattern, replacement);
  if (source.includes(replacement)) return source;
  throw new Error(`v109.3.9 missing ${label}`);
}

// Fidelity lock: enhancement is limited to deterministic per-pixel tone and color
// changes anchored to the source page. It does not synthesize, redraw, OCR-rewrite,
// inpaint, or move any character strokes. Existing source ink may gain contrast;
// blank source paper cannot become a new dark mark.
const qualityPath = 'source/src/modules/scan/v3/AutoQualityBotV1093.js';
let quality = read(qualityPath);

const fidelityLock = `function applyDocumentFidelityLock(processed, source, metrics) {
  if (!processed?.data || !source?.data
    || processed.width !== source.width || processed.height !== source.height) {
    return processed;
  }

  const width = source.width;
  const height = source.height;
  const sourceGrid = buildIlluminationGrid(source, metrics);
  const processedMetrics = analyzeDocumentColorV1093(processed);
  const processedGrid = buildIlluminationGrid(processed, processedMetrics);
  const data = new Uint8ClampedArray(processed.data);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      const sourceR = source.data[offset];
      const sourceG = source.data[offset + 1];
      const sourceB = source.data[offset + 2];
      const sourceY = luminance(sourceR, sourceG, sourceB);
      const maximum = Math.max(sourceR, sourceG, sourceB);
      const minimum = Math.min(sourceR, sourceG, sourceB);
      const chroma = maximum - minimum;

      const leftOffset = offset - 4;
      const rightOffset = offset + 4;
      const upOffset = offset - width * 4;
      const downOffset = offset + width * 4;
      const neighborY = (
        luminance(source.data[leftOffset], source.data[leftOffset + 1], source.data[leftOffset + 2])
        + luminance(source.data[rightOffset], source.data[rightOffset + 1], source.data[rightOffset + 2])
        + luminance(source.data[upOffset], source.data[upOffset + 1], source.data[upOffset + 2])
        + luminance(source.data[downOffset], source.data[downOffset + 1], source.data[downOffset + 2])
      ) / 4;

      const sourceBackground = Math.max(sourceY, sampleGrid(sourceGrid, x, y, width, height));
      const microDepth = Math.max(0, neighborY - sourceY);
      const broadDepth = Math.max(0, sourceBackground - sourceY);
      const sourceDepth = Math.max(microDepth, broadDepth);

      const processedY = luminance(data[offset], data[offset + 1], data[offset + 2]);
      const processedBackground = Math.max(
        processedY,
        sampleGrid(processedGrid, x, y, width, height),
      );
      const processedDepth = Math.max(0, processedBackground - processedY);

      const warmInk = sourceR > sourceG * 1.055
        && sourceR > sourceB * 1.025
        && sourceR - Math.max(sourceG, sourceB) > 7;
      const blueInk = sourceB > sourceR * 1.045
        && sourceB > sourceG * 1.02
        && sourceB - Math.max(sourceR, sourceG) > 7;
      const coloredInk = warmInk || blueInk;
      const neutrality = 1 - smoothstep(17, 52, chroma);
      const sourceInkConfidence = Math.max(
        smoothstep(.55, 7.5, microDepth),
        smoothstep(2.2, 28, broadDepth),
      ) * (coloredInk ? .72 : neutrality);
      const paperConfidence = (1 - smoothstep(1.8, 7.5, sourceDepth))
        * (1 - smoothstep(14, 52, chroma));

      let targetY = processedY;

      // Remove dark shapes that do not exist in the source pixel structure.
      const maximumAllowedDepth = 2.8 + sourceDepth * 1.30 + microDepth * .38;
      if (paperConfidence > .12 && processedDepth > maximumAllowedDepth) {
        const safePaperY = processedBackground - maximumAllowedDepth;
        targetY += (safePaperY - targetY) * paperConfidence * .92;
      }

      // Rebuild contrast only from source ink depth, preserving every stroke's
      // original location and topology. No new digit or letter can be introduced.
      if (sourceInkConfidence > .01) {
        const desiredDepth = Math.min(
          82,
          sourceDepth * (1.08 + sourceInkConfidence * .16) + microDepth * .24,
        );
        const desiredY = processedBackground - desiredDepth;
        if (desiredY < targetY) {
          targetY += (desiredY - targetY) * (.52 + sourceInkConfidence * .30);
        }

        // Prevent aggressive enhancement from closing gaps or thickening a digit
        // beyond the source-supported depth envelope.
        const minimumSafeY = processedBackground - Math.min(90, sourceDepth * 1.43 + 7);
        targetY = Math.max(targetY, minimumSafeY);
      }

      targetY = range(targetY, 3, 251);
      if (Math.abs(targetY - processedY) < .35) continue;

      if (!coloredInk && neutrality > .72) {
        const neutralBlend = .88 * neutrality;
        const average = (data[offset] + data[offset + 1] + data[offset + 2]) / 3;
        const ratio = range(targetY / Math.max(1, processedY), .76, 1.18);
        const r = data[offset] * ratio;
        const g = data[offset + 1] * ratio;
        const b = data[offset + 2] * ratio;
        data[offset] = byte(r + (average * ratio - r) * neutralBlend);
        data[offset + 1] = byte(g + (average * ratio - g) * neutralBlend);
        data[offset + 2] = byte(b + (average * ratio - b) * neutralBlend);
      } else {
        const ratio = range(targetY / Math.max(1, processedY), .74, 1.20);
        data[offset] = byte(data[offset] * ratio);
        data[offset + 1] = byte(data[offset + 1] * ratio);
        data[offset + 2] = byte(data[offset + 2] * ratio);
      }
      data[offset + 3] = 255;
    }
  }

  return { width, height, data };
}`;

quality = replaceRequired(
  quality,
  'function adaptiveHighContrast(clean) {',
  `${fidelityLock}\n\nfunction adaptiveHighContrast(clean) {`,
  'content fidelity lock',
);

quality = replaceRequired(
  quality,
  `  const display = needsColor
    ? composeHybridDocumentDisplay(
      clean || normalizeCleanDocument(source, metrics),
      enhancedColor || normalizeNaturalColor(source, metrics),
      source,
      metrics,
    )
    : (clean || normalizeCleanDocument(source, metrics));
  const grayscale = clean || null;`,
  `  const enhancedDisplay = needsColor
    ? composeHybridDocumentDisplay(
      clean || normalizeCleanDocument(source, metrics),
      enhancedColor || normalizeNaturalColor(source, metrics),
      source,
      metrics,
    )
    : (clean || normalizeCleanDocument(source, metrics));
  const fidelityDisplay = applyDocumentFidelityLock(enhancedDisplay, source, metrics);
  const grayscale = clean || null;`,
  'fidelity display selection',
);

quality = replaceRequired(
  quality,
  `  return {
    display,
    ocr,`,
  `  return {
    display:fidelityDisplay,
    ocr,`,
  'fidelity display return',
);
quality = replaceRequired(quality, 'clippingRatio(display)', 'clippingRatio(fidelityDisplay)', 'fidelity clipping metric');
quality = replaceRequired(quality, "engine:'road-ready-auto-quality-bot-v10938'", "engine:'road-ready-auto-quality-bot-v10939'", 'quality engine version');
quality = replaceRequired(
  quality,
  "qualityProfile:'hybrid-clean-paper-selective-color-v10938'",
  "qualityProfile:'content-fidelity-lock-v10939'",
  'quality profile',
);
quality = replaceRequired(
  quality,
  'fullPageColorMode:false,',
  `fullPageColorMode:false,
      contentFidelityLock:true,
      pixelOnlyEnhancement:true,
      generativeReconstruction:false,
      ocrRewrite:false,
      sourceStrokeTopologyPreserved:true,
      sourceAnchoredToneMapping:true,`,
  'fidelity metadata',
);
write(qualityPath, quality);

const scannerTypesPath = 'source/src/modules/scan/v3/scannerTypesV3.js';
write(scannerTypesPath, replaceRequired(read(scannerTypesPath), /export const ROAD_READY_SCANNER_V3_VERSION = '[^']+';/, `export const ROAD_READY_SCANNER_V3_VERSION = '${VERSION}';`, 'scanner version constant'));
const contractsPath = 'source/src/modules/scan/scannerContractsV106.js';
write(contractsPath, replaceRequired(read(contractsPath), /export const ROAD_READY_SCANNER_VERSION_V106 = '[^']+';/, `export const ROAD_READY_SCANNER_VERSION_V106 = '${VERSION}';`, 'scanner contract version'));
const scanSheetPath = 'source/src/modules/scan/SmartScanSheetV105.jsx';
write(scanSheetPath, replaceRequired(read(scanSheetPath), /scannerVersion:analysis\?\.scanMeta\?\.scannerVersion \|\| '[^']+'/, `scannerVersion:analysis?.scanMeta?.scannerVersion || '${VERSION}'`, 'scan persistence version'));

const scannerUiPath = 'source/src/modules/scan/v3/RoadReadyScannerV3.jsx';
let scannerUi = read(scannerUiPath);
scannerUi = replaceRequired(scannerUi, /Road Ready Scanner 0\.4\.[0-9]+/, 'Road Ready Scanner 0.4.9', 'visible scanner version');
scannerUi = replaceRequired(scannerUi, /· App 109\.[0-9]+\.[0-9]+/, `· App ${VERSION}`, 'visible app version');
write(scannerUiPath, scannerUi);

const reviewPath = 'source/src/modules/scan/v3/ReviewScreenV3.jsx';
let review = read(reviewPath);
review = replaceRequired(review, /build 109\.[0-9]+\.[0-9]+/, `Fidelity lock · build ${VERSION}`, 'review fidelity marker');
write(reviewPath, review);

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
if (packageLock.packages?.['']) {
  packageLock.packages[''].version = VERSION;
  packageLock.packages[''].engines = { ...(packageLock.packages[''].engines || {}), node:'24.x' };
}
write('package-lock.json', `${JSON.stringify(packageLock, null, 2)}\n`);

write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:BUILD,
  releasedAt:RELEASED_AT,
  updatedAt:RELEASED_AT,
  label:'v109.3.9 Content Fidelity Scanner 0.4.9',
  force:true,
  notes:[
    'Keeps the approved four-corner selector, physical page ratio and clean selective-color result unchanged.',
    'Adds a source-pixel fidelity lock so every enhanced printed stroke must already exist in the original photo.',
    'Prevents blank paper from becoming a new dark mark and prevents enhancement from closing digit or letter gaps.',
    'Uses deterministic pixel-only tone and color processing with no generative reconstruction, inpainting or OCR text rewriting.',
    'Preserves orange, red and blue handwriting while anchoring its shape and position to the immutable original.',
    'Keeps the rendered final as the primary Vault asset and preserves the immutable original and separate OCR assets.',
    'Keeps the immediate iPhone reload path, Logbook, HOS, classification and upload storage unchanged.',
  ],
}, null, 2)}\n`);

const scannerManifest = JSON.parse(read('public/scanner-engine.json'));
scannerManifest.version = VERSION;
scannerManifest.name = 'Road Ready Scanner 0.4.9';
scannerManifest.qualityBot = 'road-ready-auto-quality-bot-v10939';
scannerManifest.qualityProfile = 'content-fidelity-lock-v10939';
scannerManifest.contentFidelityLock = true;
scannerManifest.pixelOnlyEnhancement = true;
scannerManifest.generativeReconstruction = false;
scannerManifest.ocrRewrite = false;
scannerManifest.sourceStrokeTopologyPreserved = true;
scannerManifest.sourceAnchoredToneMapping = true;
scannerManifest.primaryOutput = 'display-final';
scannerManifest.originalPreserved = true;
scannerManifest.updateBootstrap = BUILD;
scannerManifest.visibleBuildMarker = VERSION;
scannerManifest.bundledVersionBuildSynchronized = true;
write('public/scanner-engine.json', `${JSON.stringify(scannerManifest, null, 2)}\n`);

console.log('PASS — v109.3.9 content fidelity lock scanner applied');
