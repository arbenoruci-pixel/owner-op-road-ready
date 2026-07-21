import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '109.3.8';
const BUILD = 'v10938-hybrid-clean-paper-selective-color';
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
    if (!source.includes(pattern)) throw new Error(`v109.3.8 missing ${label}`);
    return source.replace(pattern, replacement);
  }
  if (pattern.test(source)) return source.replace(pattern, replacement);
  if (source.includes(replacement)) return source;
  throw new Error(`v109.3.8 missing ${label}`);
}

// The real BOL reference contains orange handwriting. Earlier Auto mode treated
// that small amount of colored ink as a reason to keep the entire page in the
// soft natural-color renderer. Build the page from the clean document result,
// then restore color only where the source contains locally darker warm/blue ink.
const qualityPath = 'source/src/modules/scan/v3/AutoQualityBotV1093.js';
let quality = read(qualityPath);

const hybridComposer = `function composeHybridDocumentDisplay(clean, color, source, metrics) {
  if (!clean?.data || !color?.data || !source?.data
    || clean.width !== source.width || clean.height !== source.height
    || color.width !== source.width || color.height !== source.height) {
    return color || clean || source;
  }

  const width = source.width;
  const height = source.height;
  const pixelCount = width * height;
  const grid = buildIlluminationGrid(source, metrics);
  const rawAlpha = new Float32Array(pixelCount);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      const r = source.data[offset];
      const g = source.data[offset + 1];
      const b = source.data[offset + 2];
      const sourceY = luminance(r, g, b);
      const maximum = Math.max(r, g, b);
      const minimum = Math.min(r, g, b);
      const chroma = maximum - minimum;

      const warmInk = r > g * 1.055
        && r > b * 1.025
        && r - Math.max(g, b) > 7;
      const blueInk = b > r * 1.045
        && b > g * 1.02
        && b - Math.max(r, g) > 7;
      if (!warmInk && !blueInk) continue;

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
      const microDepth = Math.max(0, neighborY - sourceY);
      const paperBackground = Math.max(sourceY, sampleGrid(grid, x, y, width, height));
      const broadDepth = Math.max(0, paperBackground - sourceY);

      const chromaConfidence = smoothstep(8, 34, chroma);
      const depthConfidence = Math.max(
        smoothstep(.35, 6.5, microDepth),
        smoothstep(1.5, 18, broadDepth),
      );
      const highlightGuard = 1 - smoothstep(226, 249, sourceY);
      rawAlpha[pixel] = range(chromaConfidence * depthConfidence * highlightGuard, 0, .96);
    }
  }

  const alpha = new Float32Array(pixelCount);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const pixel = y * width + x;
      const softened = (
        rawAlpha[pixel] * 4
        + rawAlpha[pixel - 1]
        + rawAlpha[pixel + 1]
        + rawAlpha[pixel - width]
        + rawAlpha[pixel + width]
      ) / 8;
      alpha[pixel] = Math.max(rawAlpha[pixel], softened * .94);
    }
  }

  const data = new Uint8ClampedArray(clean.data.length);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    const mix = range(alpha[pixel], 0, .96);
    const inverse = 1 - mix;
    data[offset] = byte(clean.data[offset] * inverse + color.data[offset] * mix);
    data[offset + 1] = byte(clean.data[offset + 1] * inverse + color.data[offset + 1] * mix);
    data[offset + 2] = byte(clean.data[offset + 2] * inverse + color.data[offset + 2] * mix);
    data[offset + 3] = 255;
  }

  return { width, height, data };
}`;

quality = replaceRequired(
  quality,
  'function adaptiveHighContrast(clean) {',
  `${hybridComposer}\n\nfunction adaptiveHighContrast(clean) {`,
  'hybrid selective-color composer',
);

quality = replaceRequired(
  quality,
  `  if (profile !== 'ocr' && needsColor) enhancedColor = normalizeNaturalColor(source, metrics);
  if (profile !== 'display' || !needsColor) clean = normalizeCleanDocument(source, metrics);`,
  `  if (profile !== 'ocr' && needsColor) enhancedColor = normalizeNaturalColor(source, metrics);
  // Auto display always needs the clean paper/text base. Colored handwriting is
  // restored selectively afterwards instead of keeping the whole page in color mode.
  if (profile !== 'ocr' || !needsColor) clean = normalizeCleanDocument(source, metrics);`,
  'clean display base',
);

quality = replaceRequired(
  quality,
  `  const display = needsColor
    ? (enhancedColor || normalizeNaturalColor(source, metrics))
    : (clean || normalizeCleanDocument(source, metrics));`,
  `  const display = needsColor
    ? composeHybridDocumentDisplay(
      clean || normalizeCleanDocument(source, metrics),
      enhancedColor || normalizeNaturalColor(source, metrics),
      source,
      metrics,
    )
    : (clean || normalizeCleanDocument(source, metrics));`,
  'hybrid display selection',
);

quality = replaceRequired(
  quality,
  "engine:'road-ready-auto-quality-bot-v10936'",
  "engine:'road-ready-auto-quality-bot-v10938'",
  'quality engine version',
);
quality = replaceRequired(
  quality,
  "mode:needsColor ? 'natural-color-shadow-flat-text-clear' : 'clean-document-shadow-flat-text-clear'",
  "mode:needsColor ? 'hybrid-clean-paper-selective-color' : 'clean-document-shadow-flat-text-clear'",
  'quality mode',
);
quality = replaceRequired(
  quality,
  "qualityProfile:'reference-trained-shadow-flat-text-clarity'",
  "qualityProfile:'hybrid-clean-paper-selective-color-v10938'",
  'quality profile',
);
quality = replaceRequired(
  quality,
  'coloredInkProtected:true,',
  `coloredInkProtected:true,
      hybridSelectiveColor:true,
      cleanPaperBase:true,
      coloredInkOverlay:true,
      fullPageColorMode:false,`,
  'hybrid quality metadata',
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
scannerUi = replaceRequired(scannerUi, /Road Ready Scanner 0\.4\.[0-9]+/, 'Road Ready Scanner 0.4.8', 'visible scanner version');
scannerUi = replaceRequired(scannerUi, /· App 109\.[0-9]+\.[0-9]+/, `· App ${VERSION}`, 'visible app version');
write(scannerUiPath, scannerUi);

const reviewPath = 'source/src/modules/scan/v3/ReviewScreenV3.jsx';
write(reviewPath, replaceRequired(read(reviewPath), /build 109\.[0-9]+\.[0-9]+/, `build ${VERSION}`, 'review build marker'));

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
  label:'v109.3.8 Hybrid Clean Scanner 0.4.8',
  force:true,
  notes:[
    'Keeps the approved four-corner selector and projective page ratio unchanged.',
    'Uses the clean document renderer as the base even when a page contains colored handwriting.',
    'Restores orange, red and blue ink only where it is locally darker than the surrounding paper.',
    'Removes the full-page soft color-mode fallback that made BOL scans look almost identical to the original photo.',
    'Keeps the rendered final as the primary Vault asset and preserves the immutable original and separate OCR assets.',
    'Keeps the v109.3.7 immediate iPhone reload completion path and all Logbook data unchanged.',
  ],
}, null, 2)}\n`);

const scannerManifest = JSON.parse(read('public/scanner-engine.json'));
scannerManifest.version = VERSION;
scannerManifest.name = 'Road Ready Scanner 0.4.8';
scannerManifest.qualityBot = 'road-ready-auto-quality-bot-v10938';
scannerManifest.qualityProfile = 'hybrid-clean-paper-selective-color-v10938';
scannerManifest.hybridSelectiveColor = true;
scannerManifest.cleanPaperBase = true;
scannerManifest.coloredInkOverlay = true;
scannerManifest.fullPageColorMode = false;
scannerManifest.primaryOutput = 'display-final';
scannerManifest.originalPreserved = true;
scannerManifest.updateBootstrap = BUILD;
scannerManifest.visibleBuildMarker = VERSION;
scannerManifest.updateNavigation = 'immediate-update-page-v10937';
scannerManifest.bundledVersionBuildSynchronized = true;
write('public/scanner-engine.json', `${JSON.stringify(scannerManifest, null, 2)}\n`);

console.log('PASS — v109.3.8 hybrid clean-paper selective-color scanner applied');
