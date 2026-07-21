import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const moduleUrl = relative => `${pathToFileURL(path.join(ROOT, relative)).href}?verify=${Date.now()}_${Math.random()}`;

const qualityModule = await import(moduleUrl('source/src/modules/scan/v3/AutoQualityBotV1093.js'));
const perspectiveModule = await import(moduleUrl('source/src/modules/scan/v3/PerspectiveEngineV10933.js'));

function luma(image, pixel) {
  const offset = pixel * 4;
  return image.data[offset] * .2126 + image.data[offset + 1] * .7152 + image.data[offset + 2] * .0722;
}

function syntheticImage({ ink = '', shadow = false } = {}) {
  const width = 140;
  const height = 180;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const text = (y % 24 < 2 && x > 8 && x < width - 8) || (x % 41 < 2 && y > 16 && y < height - 18);
      const gradient = 214 + Math.round((x / width) * 20);
      const paper = shadow && x < width / 2 ? gradient - 54 : gradient;
      const value = text ? 32 : paper;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  if (ink) {
    for (let y = 126; y < 139; y += 1) {
      for (let x = 24; x < 112; x += 1) {
        const offset = (y * width + x) * 4;
        if (ink === 'red') {
          data[offset] = 214;
          data[offset + 1] = 70;
          data[offset + 2] = 42;
        } else {
          data[offset] = 42;
          data[offset + 1] = 80;
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
      if (value > 70) {
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
assert.equal(fixed.metadata.nativeDetailSource, true);
assert.equal(fixed.metadata.qualityProfile, 'native-detail-preserving');
assert.ok(clippingRatio(fixed.display) < .06, 'display renderer must protect paper highlights');
const afterDifference = Math.abs(
  regionMean(fixed.display, 5, Math.floor(fixed.display.width / 2) - 3)
  - regionMean(fixed.display, Math.ceil(fixed.display.width / 2) + 3, fixed.display.width - 5),
);
assert.ok(afterDifference < beforeDifference, 'restrained illumination correction must reduce a side shadow');

// A page that measures too wide because of perspective must resolve to US Letter
// in this US trucking app instead of preserving the distorted 0.84 ratio.
const wideLetterGeometry = perspectiveModule.estimateOutputGeometryV10933(
  3000,
  4000,
  [
    { x:.10, y:.06 },
    { x:.90, y:.06 },
    { x:.90, y:.77 },
    { x:.10, y:.77 },
  ],
  { maxDimension:3600, maxUpscale:1, usLetterBias:true },
);
assert.equal(wideLetterGeometry.pageFormat, 'letter');
assert.equal(wideLetterGeometry.formatReason, 'us-letter-page-prior');
assert.ok(Math.abs(wideLetterGeometry.width / wideLetterGeometry.height - 8.5 / 11) < .003);
assert.ok(wideLetterGeometry.scale <= 1, 'final geometry must not invent source detail by upscaling');
assert.ok(Math.max(wideLetterGeometry.width, wideLetterGeometry.height) <= 3600);

const a4Geometry = perspectiveModule.estimateOutputGeometryV10933(
  2800,
  4000,
  [
    { x:.10, y:.05 },
    { x:.90, y:.05 },
    { x:.90, y:.85 },
    { x:.10, y:.85 },
  ],
  { maxDimension:3600, maxUpscale:1, usLetterBias:false },
);
assert.equal(a4Geometry.pageFormat, 'a4');

const receiptGeometry = perspectiveModule.estimateOutputGeometryV10933(
  2000,
  4000,
  [
    { x:.30, y:.04 },
    { x:.70, y:.04 },
    { x:.70, y:.96 },
    { x:.30, y:.96 },
  ],
  { maxDimension:3600, maxUpscale:1 },
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
assert.ok(engine.includes('warpPerspectiveV10933'));
assert.ok(engine.includes('homography-native-detail-v10933'));
assert.ok(engine.includes('this.maxPreviewDimension = options.maxPreviewDimension || 2200'));
assert.ok(engine.includes('this.maxFinalInputDimension = options.maxFinalInputDimension || 4096'));
assert.ok(engine.includes('this.maxOutputDimension = options.maxOutputDimension || 3600'));
assert.ok(engine.includes('this.maxOcrDimension = options.maxOcrDimension || 2400'));
assert.ok(engine.includes('decodeImageFileV3(session.originalFile'));
assert.ok(engine.includes('maxUpscale:1'));
assert.ok(engine.includes("primaryOutput:'displayFile'"));
assert.ok(engine.includes("captureAsset('original'"));
assert.ok(engine.includes("captureAsset('display-final'"));
assert.ok(engine.includes('jpegQuality:.995'));
assert.ok(engine.includes("profile:'display'"));
assert.ok(engine.includes("profile:'ocr'"));
assert.equal(engine.includes('Promise.all(['), false, 'large variants should encode sequentially for iPhone memory safety');
assert.equal(engine.includes('extractCurvedDocumentV1093'), false);

const scanner = read('source/src/modules/scan/v3/RoadReadyScannerV3.jsx');
assert.ok(scanner.includes('Road Ready Scanner 0.4.4'));
assert.ok(scanner.includes('onComplete?.(result.displayFile, result.metadata)'));
assert.ok(scanner.includes('final render saved'));
assert.equal(scanner.includes('six smart points'), false);
assert.equal(scanner.includes('bend points'), false);

const quality = read('source/src/modules/scan/v3/AutoQualityBotV1093.js');
assert.ok(quality.includes('buildIlluminationGrid'));
assert.ok(quality.includes('paperWhiteBalance'));
assert.ok(quality.includes('detailSharpen'));
assert.ok(quality.includes("qualityProfile:'native-detail-preserving'"));
assert.ok(quality.includes('adaptiveTextSharpening:true'));
assert.ok(quality.includes('nativeDetailSource:true'));
assert.ok(quality.includes('highlightClippingProtected:true'));
assert.ok(quality.includes('doubleNormalization:false'));

const scanSheet = read('source/src/modules/scan/SmartScanSheetV105.jsx');
assert.ok(scanSheet.includes("scannerVersion:analysis?.scanMeta?.scannerVersion || '109.3.3'"));
assert.ok(scanSheet.includes('persistCaptureAssetsV106'));

const appVersion = JSON.parse(read('public/app-version.json'));
assert.equal(appVersion.version, '109.3.3');
assert.equal(appVersion.build, 'v10933-road-ready-scanner-native-detail-format');

const scannerManifest = JSON.parse(read('public/scanner-engine.json'));
assert.equal(scannerManifest.visibleHandles, 4);
assert.equal(scannerManifest.internalBoundaryPoints, 4);
assert.equal(scannerManifest.geometry, 'homography-native-detail');
assert.equal(scannerManifest.reviewMaxLongSide, 2200);
assert.equal(scannerManifest.finalInputMaxLongSide, 4096);
assert.equal(scannerManifest.outputMaxDimension, 3600);
assert.equal(scannerManifest.ocrMaxLongSide, 2400);
assert.equal(scannerManifest.jpegQuality, .995);
assert.equal(scannerManifest.noPerspectiveUpscale, true);
assert.equal(scannerManifest.primaryOutput, 'display-final');

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.version, '109.3.3');
assert.equal(pkg.engines.node, '24.x');

for (const relative of [
  'source/src/modules/scan/v3/PerspectiveEngineV10933.js',
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
console.log('PASS — full-page trucking documents receive a non-deformed US Letter aspect');
console.log('PASS — final rendering reopens the original photo and never upscales beyond source detail');
console.log('PASS — native-detail renderer reduces shadows without washing out highlights');
console.log('PASS — final rendered file remains the primary persisted Document Vault file');
console.log('PASS — immutable original and separate OCR assets remain preserved');
console.log('PASS — v109.3.3 scanner native-detail quality and format regression suite');
