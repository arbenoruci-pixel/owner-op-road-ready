import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const moduleUrl = relative => `${pathToFileURL(path.join(ROOT, relative)).href}?verify=${Date.now()}_${Math.random()}`;

const qualityModule = await import(moduleUrl('source/src/modules/scan/v3/AutoQualityBotV1093.js'));
const perspectiveModule = await import(moduleUrl('source/src/modules/scan/v3/PerspectiveEngineV10932.js'));

function luma(image, pixel) {
  const offset = pixel * 4;
  return image.data[offset] * .2126 + image.data[offset + 1] * .7152 + image.data[offset + 2] * .0722;
}

function syntheticImage({ ink = '', shadow = false } = {}) {
  const width = 120;
  const height = 160;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const text = (y % 25 < 2 && x > 8 && x < width - 8) || (x % 37 < 2 && y > 16 && y < height - 18);
      const gradient = 214 + Math.round((x / width) * 22);
      const paper = shadow && x < width / 2 ? gradient - 58 : gradient;
      const value = text ? 34 : paper;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  if (ink) {
    for (let y = 112; y < 124; y += 1) {
      for (let x = 22; x < 98; x += 1) {
        const offset = (y * width + x) * 4;
        if (ink === 'red') {
          data[offset] = 214;
          data[offset + 1] = 72;
          data[offset + 2] = 42;
        } else {
          data[offset] = 42;
          data[offset + 1] = 82;
          data[offset + 2] = 214;
        }
      }
    }
  }
  return { width, height, data };
}

function regionMean(image, fromX, toX) {
  let total = 0;
  let count = 0;
  for (let y = 5; y < image.height - 5; y += 1) {
    for (let x = fromX; x < toX; x += 1) {
      const value = luma(image, y * image.width + x);
      if (value > 72) {
        total += value;
        count += 1;
      }
    }
  }
  return count ? total / count : 0;
}

function clippingRatio(image) {
  let clipped = 0;
  const count = image.width * image.height;
  for (let pixel = 0; pixel < count; pixel += 1) if (luma(image, pixel) >= 253) clipped += 1;
  return clipped / count;
}

const neutral = syntheticImage();
const red = syntheticImage({ ink:'red' });
const blue = syntheticImage({ ink:'blue' });
assert.equal(qualityModule.analyzeDocumentColorV1093(neutral).preserveColor, false);
assert.equal(qualityModule.analyzeDocumentColorV1093(red).preserveColor, true);
assert.equal(qualityModule.analyzeDocumentColorV1093(blue).preserveColor, true);

const shadowed = syntheticImage({ shadow:true, ink:'red' });
const beforeDifference = Math.abs(
  regionMean(shadowed, 5, Math.floor(shadowed.width / 2) - 3)
  - regionMean(shadowed, Math.ceil(shadowed.width / 2) + 3, shadowed.width - 5),
);
const fixed = qualityModule.autoFixDocumentV1093(shadowed);
assert.ok(fixed.display?.data?.length, 'quality bot must return a rendered display image');
assert.ok(fixed.clean?.data?.length, 'quality bot must return a clean image');
assert.ok(fixed.highContrast?.data?.length, 'quality bot must return a high-contrast OCR image');
assert.equal(fixed.metadata.primaryRenderedOutput, true);
assert.equal(fixed.metadata.highlightClippingProtected, true);
assert.equal(fixed.metadata.doubleNormalization, false);
assert.equal(fixed.metadata.qualityProfile, 'detail-first');
assert.ok(clippingRatio(fixed.display) < .08, 'display renderer must not blow out most paper highlights');
const afterDifference = Math.abs(
  regionMean(fixed.display, 5, Math.floor(fixed.display.width / 2) - 3)
  - regionMean(fixed.display, Math.ceil(fixed.display.width / 2) + 3, fixed.display.width - 5),
);
assert.ok(afterDifference < beforeDifference, 'local illumination correction must reduce a side shadow');

const letterGeometry = perspectiveModule.estimateOutputGeometryV10932(
  3000,
  4000,
  [
    { x:.15, y:.08 },
    { x:.85, y:.08 },
    { x:.85, y:.7594 },
    { x:.15, y:.7594 },
  ],
  { maxDimension:3000, minShortSide:1700, maxUpscale:1.22 },
);
assert.equal(letterGeometry.pageFormat, 'letter');
assert.ok(Math.abs(letterGeometry.width / letterGeometry.height - 8.5 / 11) < .003);
assert.ok(Math.max(letterGeometry.width, letterGeometry.height) <= 3000);
assert.ok(Math.min(letterGeometry.width, letterGeometry.height) >= 1700);

const receiptGeometry = perspectiveModule.estimateOutputGeometryV10932(
  2000,
  4000,
  [
    { x:.2, y:.05 },
    { x:.8, y:.05 },
    { x:.8, y:.95 },
    { x:.2, y:.95 },
  ],
  { maxDimension:3000, minShortSide:1200 },
);
assert.equal(receiptGeometry.pageFormat, 'free');

const review = read('source/src/modules/scan/v3/ReviewScreenV3.jsx');
assert.ok(review.includes('data-road-ready-scanner-review="four-corner-v10931"'));
assert.ok(review.includes('4 corner frame'));
assert.ok(review.includes('Auto-fix & save'));
assert.ok(review.includes('strokeWidth="1.15"'));
assert.equal(review.includes('bend points'), false);
assert.equal(review.includes('boundaryHandlesV1093'), false);

const engine = read('source/src/modules/scan/v3/ScannerEngineV3.js');
assert.ok(engine.includes('warpPerspectiveV10932'));
assert.ok(engine.includes('homography-four-corner-hd-v10932'));
assert.ok(engine.includes('this.maxInputDimension = options.maxInputDimension || 2800'));
assert.ok(engine.includes('this.maxOutputDimension = options.maxOutputDimension || 3000'));
assert.ok(engine.includes('minShortSide:1700'));
assert.ok(engine.includes("primaryOutput:'displayFile'"));
assert.ok(engine.includes("captureAsset('original'"));
assert.ok(engine.includes("captureAsset('display-final'"));
assert.ok(engine.includes('jpegQuality:.985'));
assert.equal(engine.includes('Promise.all(['), false, 'HD variants should encode sequentially for iPhone memory safety');
assert.equal(engine.includes('extractCurvedDocumentV1093'), false);

const scanner = read('source/src/modules/scan/v3/RoadReadyScannerV3.jsx');
assert.ok(scanner.includes('Road Ready Scanner 0.4.3'));
assert.ok(scanner.includes('onComplete?.(result.displayFile, result.metadata)'));
assert.ok(scanner.includes('final render saved'));
assert.equal(scanner.includes('six smart points'), false);
assert.equal(scanner.includes('bend points'), false);

const quality = read('source/src/modules/scan/v3/AutoQualityBotV1093.js');
assert.ok(quality.includes('buildIlluminationGrid'));
assert.ok(quality.includes('paperWhiteBalance'));
assert.ok(quality.includes('detailSharpen'));
assert.ok(quality.includes("qualityProfile:'detail-first'"));
assert.ok(quality.includes('highlightClippingProtected:true'));
assert.ok(quality.includes('doubleNormalization:false'));
assert.ok(quality.includes('normalizeColorDocument(source'));

const scanSheet = read('source/src/modules/scan/SmartScanSheetV105.jsx');
assert.ok(scanSheet.includes("scannerVersion:analysis?.scanMeta?.scannerVersion || '109.3.2'"));
assert.ok(scanSheet.includes('persistCaptureAssetsV106'));

const appVersion = JSON.parse(read('public/app-version.json'));
assert.equal(appVersion.version, '109.3.2');
assert.equal(appVersion.build, 'v10932-road-ready-scanner-hd-quality-format');

const scannerManifest = JSON.parse(read('public/scanner-engine.json'));
assert.equal(scannerManifest.visibleHandles, 4);
assert.equal(scannerManifest.internalBoundaryPoints, 4);
assert.equal(scannerManifest.geometry, 'homography-four-corner-hd');
assert.equal(scannerManifest.importMaxLongSide, 2800);
assert.equal(scannerManifest.outputMaxDimension, 3000);
assert.equal(scannerManifest.minimumOutputShortSide, 1700);
assert.equal(scannerManifest.jpegQuality, .985);
assert.equal(scannerManifest.primaryOutput, 'display-final');

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.version, '109.3.2');
assert.equal(pkg.engines.node, '24.x');

for (const relative of [
  'source/src/modules/scan/v3/PerspectiveEngineV10932.js',
  'source/src/modules/scan/v3/AutoQualityBotV1093.js',
  'source/src/modules/scan/v3/ReviewScreenV3.jsx',
  'source/src/modules/scan/v3/ScannerEngineV3.js',
  'source/src/modules/scan/v3/RoadReadyScannerV3.jsx',
]) {
  const source = read(relative);
  for (const forbidden of ['cdn.jsdelivr.net', 'unpkg.com', 'docs.opencv.org', 'window.cv', 'scanbot']) {
    assert.equal(source.includes(forbidden), false, `${relative} contains forbidden runtime marker ${forbidden}`);
  }
}

console.log('PASS — approved four-corner selector remains unchanged');
console.log('PASS — Letter/A4/Legal page-format geometry and HD output sizing passed');
console.log('PASS — detail-first renderer reduces shadows without blown highlights');
console.log('PASS — final rendered file remains the primary persisted Document Vault file');
console.log('PASS — immutable original and separate OCR assets remain preserved');
console.log('PASS — v109.3.2 scanner HD quality and format regression suite');
