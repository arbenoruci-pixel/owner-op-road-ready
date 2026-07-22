import fs from 'node:fs';

const VERSION = '109.5.6';
const BUILD = 'v10956-single-pass-fast-quality';
const QUALITY_PATH = 'source/src/modules/scan/v3/AutoQualityBotV1093.js';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function writeJson(path, transform) {
  const value = JSON.parse(read(path));
  transform(value);
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

const qualitySource = `import { clampV3 } from './scannerTypesV3.js';

function luminance(r, g, b) {
  return r * .2126 + g * .7152 + b * .0722;
}

function byte(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
}

function range(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function smoothstep(minimum, maximum, value) {
  if (maximum <= minimum) return value >= maximum ? 1 : 0;
  const t = range((Number(value) - minimum) / (maximum - minimum), 0, 1);
  return t * t * (3 - 2 * t);
}

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function histogramPercentile(histogram, total, ratio) {
  if (!total) return 0;
  const target = total * ratio;
  let cumulative = 0;
  for (let index = 0; index < histogram.length; index += 1) {
    cumulative += histogram[index];
    if (cumulative >= target) return (index + .5) * 256 / histogram.length;
  }
  return 255;
}

export function analyzeDocumentColorV1093(image) {
  if (!image?.data || !image.width || !image.height) {
    return {
      mean:0,
      contrast:0,
      low:0,
      high:0,
      colorRatio:0,
      redInkRatio:0,
      blueInkRatio:0,
      glareRatio:0,
      shadowRatio:0,
      edgeEnergy:0,
      preserveColor:false,
      paperBalance:{ red:1, green:1, blue:1 },
      sampledPixels:0,
    };
  }

  const width = image.width;
  const height = image.height;
  const pixelCount = width * height;
  const step = Math.max(1, Math.floor(pixelCount / 180000));
  const histogram = new Uint32Array(64);
  let total = 0;
  let totalSquared = 0;
  let color = 0;
  let redInk = 0;
  let blueInk = 0;
  let glare = 0;
  let shadow = 0;
  let edgeTotal = 0;
  let edgeCount = 0;
  let paperRed = 0;
  let paperGreen = 0;
  let paperBlue = 0;
  let paperCount = 0;
  let count = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += step) {
    const offset = pixel * 4;
    const r = image.data[offset];
    const g = image.data[offset + 1];
    const b = image.data[offset + 2];
    const y = luminance(r, g, b);
    const maximum = Math.max(r, g, b);
    const minimum = Math.min(r, g, b);
    const chroma = maximum - minimum;
    total += y;
    totalSquared += y * y;
    histogram[Math.max(0, Math.min(63, Math.floor(y / 4)))] += 1;
    if (chroma > 20 && y > 28 && y < 248) color += 1;
    if (r > g * 1.10 && r > b * 1.045 && r - Math.max(g, b) > 13 && y > 26) redInk += 1;
    if (b > r * 1.055 && b > g * 1.025 && b - Math.max(r, g) > 11 && y > 25) blueInk += 1;
    if (y > 250) glare += 1;
    if (y < 60) shadow += 1;
    if (y > 170 && chroma < 38) {
      paperRed += r;
      paperGreen += g;
      paperBlue += b;
      paperCount += 1;
    }

    const x = pixel % width;
    const row = Math.floor(pixel / width);
    if (x + 1 < width) {
      const right = offset + 4;
      edgeTotal += Math.abs(y - luminance(image.data[right], image.data[right + 1], image.data[right + 2]));
      edgeCount += 1;
    }
    if (row + 1 < height) {
      const down = offset + width * 4;
      edgeTotal += Math.abs(y - luminance(image.data[down], image.data[down + 1], image.data[down + 2]));
      edgeCount += 1;
    }
    count += 1;
  }

  const mean = count ? total / count : 0;
  const contrast = count ? Math.sqrt(Math.max(0, totalSquared / count - mean * mean)) : 0;
  const averageRed = paperCount ? paperRed / paperCount : 1;
  const averageGreen = paperCount ? paperGreen / paperCount : 1;
  const averageBlue = paperCount ? paperBlue / paperCount : 1;
  const neutral = (averageRed + averageGreen + averageBlue) / 3;
  const colorRatio = count ? color / count : 0;
  const redInkRatio = count ? redInk / count : 0;
  const blueInkRatio = count ? blueInk / count : 0;

  return {
    mean,
    contrast,
    low:histogramPercentile(histogram, count, .018),
    high:histogramPercentile(histogram, count, .982),
    colorRatio,
    redInkRatio,
    blueInkRatio,
    glareRatio:count ? glare / count : 0,
    shadowRatio:count ? shadow / count : 0,
    edgeEnergy:edgeCount ? edgeTotal / edgeCount : 0,
    preserveColor:colorRatio >= .0035 || redInkRatio >= .00025 || blueInkRatio >= .00045,
    paperBalance:{
      red:range(neutral / Math.max(1, averageRed), .94, 1.06),
      green:range(neutral / Math.max(1, averageGreen), .94, 1.06),
      blue:range(neutral / Math.max(1, averageBlue), .94, 1.06),
    },
    sampledPixels:count,
  };
}

function buildFastIlluminationGrid(image, metrics) {
  const width = image.width;
  const height = image.height;
  const columns = Math.max(5, Math.min(10, Math.ceil(width / 420)));
  const rows = Math.max(5, Math.min(10, Math.ceil(height / 420)));
  const bins = 32;
  const histograms = new Uint32Array(columns * rows * bins);
  const counts = new Uint32Array(columns * rows);
  const pixelCount = width * height;
  const step = Math.max(1, Math.floor(pixelCount / 180000));

  for (let pixel = 0; pixel < pixelCount; pixel += step) {
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const offset = pixel * 4;
    const r = image.data[offset];
    const g = image.data[offset + 1];
    const b = image.data[offset + 2];
    const value = luminance(r, g, b);
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (chroma > 65 && value < 205) continue;
    const column = Math.min(columns - 1, Math.floor(x * columns / width));
    const row = Math.min(rows - 1, Math.floor(y * rows / height));
    const cell = row * columns + column;
    const bin = Math.max(0, Math.min(bins - 1, Math.floor(value * bins / 256)));
    histograms[cell * bins + bin] += 1;
    counts[cell] += 1;
  }

  let values = new Float32Array(columns * rows);
  for (let cell = 0; cell < values.length; cell += 1) {
    const total = counts[cell];
    if (!total) {
      values[cell] = Math.max(150, Number(metrics.high || metrics.mean || 220));
      continue;
    }
    const target = total * .88;
    let cumulative = 0;
    let selected = bins - 1;
    for (let bin = 0; bin < bins; bin += 1) {
      cumulative += histograms[cell * bins + bin];
      if (cumulative >= target) {
        selected = bin;
        break;
      }
    }
    values[cell] = (selected + .5) * 256 / bins;
  }

  for (let pass = 0; pass < 2; pass += 1) {
    const smoothed = new Float32Array(values.length);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        let total = 0;
        let weight = 0;
        for (let oy = -1; oy <= 1; oy += 1) {
          const safeRow = Math.max(0, Math.min(rows - 1, row + oy));
          for (let ox = -1; ox <= 1; ox += 1) {
            const safeColumn = Math.max(0, Math.min(columns - 1, column + ox));
            const sampleWeight = ox === 0 && oy === 0 ? 5 : ox === 0 || oy === 0 ? 2 : 1;
            total += values[safeRow * columns + safeColumn] * sampleWeight;
            weight += sampleWeight;
          }
        }
        smoothed[row * columns + column] = total / Math.max(1, weight);
      }
    }
    values = smoothed;
  }

  return { columns, rows, values };
}

function sampleGrid(grid, x, y, width, height) {
  const gx = range((x / Math.max(1, width - 1)) * (grid.columns - 1), 0, grid.columns - 1);
  const gy = range((y / Math.max(1, height - 1)) * (grid.rows - 1), 0, grid.rows - 1);
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(grid.columns - 1, x0 + 1);
  const y1 = Math.min(grid.rows - 1, y0 + 1);
  const dx = gx - x0;
  const dy = gy - y0;
  const at = (column, row) => grid.values[row * grid.columns + column];
  return at(x0, y0) * (1 - dx) * (1 - dy)
    + at(x1, y0) * dx * (1 - dy)
    + at(x0, y1) * (1 - dx) * dy
    + at(x1, y1) * dx * dy;
}

function readLumaRow(image, y) {
  const row = new Float32Array(image.width);
  const safeY = Math.max(0, Math.min(image.height - 1, y));
  for (let x = 0; x < image.width; x += 1) {
    const offset = (safeY * image.width + x) * 4;
    row[x] = luminance(image.data[offset], image.data[offset + 1], image.data[offset + 2]);
  }
  return row;
}

function renderDocumentSinglePass(image, metrics, options = {}) {
  const ocrMode = options.ocr === true;
  const width = image.width;
  const height = image.height;
  const grid = buildFastIlluminationGrid(image, metrics);
  const data = new Uint8ClampedArray(image.data.length);
  const balance = metrics.paperBalance || { red:1, green:1, blue:1 };
  const targetPaper = ocrMode ? 242 : 238;
  let previous = readLumaRow(image, 0);
  let current = readLumaRow(image, 0);
  let next = readLumaRow(image, Math.min(1, height - 1));

  for (let y = 0; y < height; y += 1) {
    if (y > 0) {
      previous = current;
      current = next;
      next = readLumaRow(image, Math.min(height - 1, y + 1));
    }
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const sourceR = image.data[offset];
      const sourceG = image.data[offset + 1];
      const sourceB = image.data[offset + 2];
      const sourceY = current[x];
      const leftY = current[Math.max(0, x - 1)];
      const rightY = current[Math.min(width - 1, x + 1)];
      const neighborY = (leftY + rightY + previous[x] + next[x]) / 4;
      const background = Math.max(sourceY, sampleGrid(grid, x, y, width, height));
      const microDepth = Math.max(0, neighborY - sourceY);
      const broadDepth = Math.max(0, background - sourceY);
      const maximum = Math.max(sourceR, sourceG, sourceB);
      const minimum = Math.min(sourceR, sourceG, sourceB);
      const chroma = maximum - minimum;
      const neutrality = 1 - smoothstep(20, 62, chroma);
      const colorConfidence = smoothstep(14, 48, chroma)
        * Math.max(smoothstep(.9, 7.2, microDepth), smoothstep(3.5, 25, broadDepth))
        * (1 - smoothstep(226, 249, sourceY));
      const textConfidence = Math.max(
        smoothstep(.55, 7.8, microDepth),
        smoothstep(4.5, 46, broadDepth),
      ) * (.66 + neutrality * .34);
      const paperConfidence = range(
        (1 - Math.max(textConfidence, colorConfidence)) * smoothstep(105, 232, sourceY),
        0,
        1,
      );

      const localGain = range(targetPaper / Math.max(92, background), .90, 1.30);
      const illuminationBlend = .42 + paperConfidence * (ocrMode ? .42 : .34);
      let targetY = sourceY * (1 + (localGain - 1) * illuminationBlend);
      targetY = 128 + (targetY - 128) * (ocrMode ? 1.12 : 1.09);
      targetY += (targetPaper - targetY) * paperConfidence * (ocrMode ? .36 : .25);

      const correctedBackground = range(background * localGain, 120, 248);
      const desiredDepth = Math.min(96, broadDepth * 1.24 + microDepth * 2.15 + textConfidence * 4);
      const textTarget = correctedBackground - desiredDepth;
      if (textTarget < targetY) {
        targetY += (textTarget - targetY) * textConfidence * (ocrMode ? .88 : .76);
      }
      targetY = range(targetY, 4, ocrMode ? 252 : 249);

      if (ocrMode) {
        const output = byte(targetY);
        data[offset] = output;
        data[offset + 1] = output;
        data[offset + 2] = output;
        data[offset + 3] = 255;
        continue;
      }

      let r = sourceR * balance.red;
      let g = sourceG * balance.green;
      let b = sourceB * balance.blue;
      const balancedY = luminance(r, g, b);
      const ratio = range(targetY / Math.max(1, balancedY), .62, 1.45);
      r *= ratio;
      g *= ratio;
      b *= ratio;

      if (colorConfidence > .02 && metrics.preserveColor) {
        const average = (r + g + b) / 3;
        const saturation = 1.04 + colorConfidence * .10;
        r = average + (r - average) * saturation;
        g = average + (g - average) * saturation;
        b = average + (b - average) * saturation;
        const colorMix = range(.28 + colorConfidence * .72, 0, 1);
        data[offset] = byte(targetY * (1 - colorMix) + r * colorMix);
        data[offset + 1] = byte(targetY * (1 - colorMix) + g * colorMix);
        data[offset + 2] = byte(targetY * (1 - colorMix) + b * colorMix);
      } else {
        const neutralBlend = range(paperConfidence * .82 + textConfidence * neutrality * .90, 0, .96);
        data[offset] = byte(r + (targetY - r) * neutralBlend);
        data[offset + 1] = byte(g + (targetY - g) * neutralBlend);
        data[offset + 2] = byte(b + (targetY - b) * neutralBlend);
      }
      data[offset + 3] = 255;
    }
  }

  return { width, height, data };
}

function adaptiveHighContrast(clean) {
  const data = new Uint8ClampedArray(clean.data.length);
  const pixelCount = clean.width * clean.height;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    const value = clean.data[offset];
    const normalized = clampV3((value - 54) / 188);
    const output = byte(Math.pow(normalized, .82) * 255);
    data[offset] = output;
    data[offset + 1] = output;
    data[offset + 2] = output;
    data[offset + 3] = 255;
  }
  return { width:clean.width, height:clean.height, data };
}

function clippingRatio(image) {
  if (!image?.data?.length) return 0;
  const pixelCount = image.width * image.height;
  const step = Math.max(1, Math.floor(pixelCount / 100000));
  let clipped = 0;
  let count = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += step) {
    const offset = pixel * 4;
    if (luminance(image.data[offset], image.data[offset + 1], image.data[offset + 2]) >= 253) clipped += 1;
    count += 1;
  }
  return count ? clipped / count : 0;
}

export function autoFixDocumentV1093(source, restored = {}, options = {}) {
  const started = nowMs();
  const metrics = analyzeDocumentColorV1093(source);
  const analyzedAt = nowMs();
  const profile = options.profile || 'full';
  let display = null;
  let clean = null;
  let highContrast = null;
  let ocr = null;

  if (profile !== 'ocr') {
    display = renderDocumentSinglePass(source, metrics, { ocr:false });
  }
  if (profile !== 'display') {
    clean = renderDocumentSinglePass(source, metrics, { ocr:true });
    highContrast = adaptiveHighContrast(clean);
    ocr = metrics.shadowRatio > .15 || metrics.contrast < 40
      ? highContrast
      : (restored.highContrast || clean);
  }
  if (!display) display = clean;

  const finished = nowMs();
  return {
    display,
    ocr,
    enhancedColor:profile === 'ocr' ? null : display,
    clean,
    grayscale:clean,
    highContrast,
    metadata:{
      engine:'road-ready-auto-quality-bot-v10956',
      mode:profile === 'ocr' ? 'fast-ocr-clean' : 'single-pass-paper-text-color',
      qualityProfile:'single-grid-single-pass-v10956',
      strategy:'sample-analysis-one-shadow-grid-one-final-pass',
      profile,
      preserveColor:metrics.preserveColor,
      colorRatio:Number(metrics.colorRatio.toFixed(6)),
      redInkRatio:Number(metrics.redInkRatio.toFixed(6)),
      blueInkRatio:Number(metrics.blueInkRatio.toFixed(6)),
      glareRatio:Number(metrics.glareRatio.toFixed(6)),
      shadowRatio:Number(metrics.shadowRatio.toFixed(6)),
      contrast:Number(metrics.contrast.toFixed(3)),
      edgeEnergy:Number(metrics.edgeEnergy.toFixed(3)),
      outputClippingRatio:Number(clippingRatio(display).toFixed(6)),
      analysisSampleCap:180000,
      illuminationSampleCap:180000,
      fullResolutionPasses:profile === 'display' ? 1 : 2,
      fullResolutionMaskBuffers:0,
      repeatedIlluminationGrids:false,
      layeredRender:false,
      fidelityRepass:false,
      localIlluminationGrid:true,
      paperWhiteBalanced:true,
      sourceAnchoredTextClarity:true,
      selectiveColorPreservation:true,
      generativeReconstruction:false,
      ocrRewrite:false,
      originalPreserved:true,
      analysisMs:Number((analyzedAt - started).toFixed(1)),
      qualityMs:Number((finished - started).toFixed(1)),
    },
  };
}
`;

write(QUALITY_PATH, qualitySource);

const enginePath = 'source/src/modules/scan/v3/ScannerEngineV3.js';
let engine = read(enginePath);
engine = engine.replace(
  '    this.maxOutputDimension = options.maxOutputDimension || 3600;',
  '    this.maxOutputDimension = options.maxOutputDimension || 3000;',
);
engine = engine.replace(
  '    this.maxOcrDimension = options.maxOcrDimension || 2400;',
  '    this.maxOcrDimension = options.maxOcrDimension || 1800;',
);
engine = engine.replace(
  "options.onStatus?.('Restoring source text detail and natural paper tone…');",
  "options.onStatus?.('Cleaning paper and sharpening text in one fast pass…');",
);
engine = engine.replace(
  "'road-ready-final-source-detail.jpg',\n      .995,",
  "'road-ready-final-source-detail.jpg',\n      .985,",
);
write(enginePath, engine);

for (const [path, pattern, replacement] of [
  ['source/src/modules/scan/v3/scannerTypesV3.js', /export const ROAD_READY_SCANNER_V3_VERSION = '[^']+';/, `export const ROAD_READY_SCANNER_V3_VERSION = '${VERSION}';`],
  ['source/src/modules/scan/scannerContractsV106.js', /export const ROAD_READY_SCANNER_VERSION_V106 = '[^']+';/, `export const ROAD_READY_SCANNER_VERSION_V106 = '${VERSION}';`],
]) {
  write(path, read(path).replace(pattern, replacement));
}

const scanSheetPath = 'source/src/modules/scan/SmartScanSheetV105.jsx';
write(scanSheetPath, read(scanSheetPath).replace(
  /scannerVersion:analysis\?\.scanMeta\?\.scannerVersion \|\| '[^']+'/, 
  `scannerVersion:analysis?.scanMeta?.scannerVersion || '${VERSION}'`,
));

const scannerUiPath = 'source/src/modules/scan/v3/RoadReadyScannerV3.jsx';
let scannerUi = read(scannerUiPath);
scannerUi = scannerUi.replace(/Road Ready Scanner 0\.[0-9]+\.[0-9]+/, 'Road Ready Scanner 0.6.0');
scannerUi = scannerUi.replace(/· App 109\.[0-9]+\.[0-9]+/, `· App ${VERSION}`);
scannerUi = scannerUi.replace(
  /Straight four-corner correction,[\s\S]*?rendering for clearer trucking documents\./,
  'Fast four-corner correction with one-pass paper cleanup, stronger text and protected colored handwriting.',
);
write(scannerUiPath, scannerUi);

const reviewPath = 'source/src/modules/scan/v3/ReviewScreenV3.jsx';
let review = read(reviewPath);
review = review.replace(/Auto upright · build 109\.[0-9]+\.[0-9]+/, `Fast quality · build ${VERSION}`);
write(reviewPath, review);

writeJson('package.json', pkg => {
  pkg.version = VERSION;
  pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
});
if (fs.existsSync('package-lock.json')) {
  writeJson('package-lock.json', lock => {
    lock.version = VERSION;
    if (lock.packages?.['']) {
      lock.packages[''].version = VERSION;
      lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
    }
  });
}

const releasedAt = new Date().toISOString();
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:BUILD,
  releasedAt,
  updatedAt:releasedAt,
  label:'v109.5.6 Fast Quality Scanner 0.6.0',
  force:true,
  notes:[
    'Replaces the stacked multi-layer quality pipeline with one sampled analysis, one illumination grid and one final-resolution display pass.',
    'Improves paper uniformity and text contrast in the same source-anchored pass while selectively preserving colored handwriting.',
    'Reduces final display processing to 3000 px and OCR processing to 1800 px for faster iPhone completion.',
    'Removes full-resolution mask arrays, repeated illumination grids, layered rendering and repeated Fidelity Lock passes.',
    'Keeps four-corner geometry, auto upright, immutable original, separate OCR assets and all Logbook data unchanged.'
  ]
}, null, 2)}\n`);

let sw = read('public/sw.js');
sw = sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`);
sw = sw.replace(/const OWNER_OP_SW_BUILD = '[^']+';/, `const OWNER_OP_SW_BUILD = '${BUILD}';`);
write('public/sw.js', sw);

let update = read('source/src/core/update/appUpdate.js');
update = update.replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`);
update = update.replace(/const FALLBACK_APP_BUILD = '[^']+';/, `const FALLBACK_APP_BUILD = '${BUILD}';`);
write('source/src/core/update/appUpdate.js', update);

const scannerManifest = JSON.parse(read('public/scanner-engine.json'));
Object.assign(scannerManifest, {
  version:VERSION,
  name:'Road Ready Scanner 0.6.0',
  qualityBot:'road-ready-auto-quality-bot-v10956',
  qualityProfile:'single-grid-single-pass-v10956',
  qualityStrategy:'sample-analysis-one-shadow-grid-one-final-pass',
  displayMaxLongSide:3000,
  ocrMaxLongSide:1800,
  displayFullResolutionPasses:1,
  repeatedIlluminationGrids:false,
  fullResolutionMaskBuffers:0,
  layeredRender:false,
  fidelityRepass:false,
  selectiveColorPreservation:true,
  originalPreserved:true,
  primaryOutput:'display-final',
  updateBootstrap:BUILD,
  visibleBuildMarker:VERSION,
});
write('public/scanner-engine.json', `${JSON.stringify(scannerManifest, null, 2)}\n`);

const legacyVerifierPath = 'scripts/verify-v10943-auto-upright.mjs';
let legacyVerifier = read(legacyVerifierPath);
legacyVerifier = legacyVerifier.replace(/assert\.ok\(review\.includes\('[^']*build 109\.[^']*'\)\);/, `assert.ok(review.includes('Fast quality · build ${VERSION}'));`);
legacyVerifier = legacyVerifier.replace(/assert\.equal\(release\.version, '[^']+'\);/, `assert.equal(release.version, '${VERSION}');`);
legacyVerifier = legacyVerifier.replace(/assert\.equal\(release\.build, '[^']+'\);/, `assert.equal(release.build, '${BUILD}');`);
legacyVerifier = legacyVerifier.replace(/assert\.equal\(manifest\.version, '[^']+'\);/, `assert.equal(manifest.version, '${VERSION}');`);
legacyVerifier = legacyVerifier.replace(/assert\.equal\(manifest\.name, '[^']+'\);/, `assert.equal(manifest.name, 'Road Ready Scanner 0.6.0');`);
legacyVerifier = legacyVerifier.replace(/assert\.equal\(packageJson\.version, '[^']+'\);/, `assert.equal(packageJson.version, '${VERSION}');`);
write(legacyVerifierPath, legacyVerifier);

if (!qualitySource.includes("qualityProfile:'single-grid-single-pass-v10956'")) throw new Error('v109.5.6 quality profile missing');
if (!qualitySource.includes('fullResolutionMaskBuffers:0')) throw new Error('v109.5.6 mask removal missing');
if (!engine.includes('maxOutputDimension || 3000')) throw new Error('v109.5.6 display dimension cap missing');
if (!engine.includes('maxOcrDimension || 1800')) throw new Error('v109.5.6 OCR dimension cap missing');

console.log('PASS — v109.5.6 installs the single-grid single-pass fast quality strategy');
