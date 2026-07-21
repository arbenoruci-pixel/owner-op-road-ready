import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const moduleUrl = relative => `${pathToFileURL(path.join(ROOT, relative)).href}?verify=${Date.now()}_${Math.random()}`;

const qualityModule = await import(moduleUrl('source/src/modules/scan/v3/AutoQualityBotV1093.js'));

function syntheticImage({ ink = '', shadow = false } = {}) {
  const width = 96;
  const height = 120;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const text = x % 21 < 2 || y % 27 < 2;
      const paper = shadow && x < width / 2 ? 138 : 235;
      const value = text ? 34 : paper;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  if (ink) {
    for (let y = 70; y < 82; y += 1) {
      for (let x = 18; x < 78; x += 1) {
        const offset = (y * width + x) * 4;
        if (ink === 'red') {
          data[offset] = 214;
          data[offset + 1] = 54;
          data[offset + 2] = 39;
        } else {
          data[offset] = 42;
          data[offset + 1] = 76;
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
  for (let y = 4; y < image.height - 4; y += 1) {
    for (let x = fromX; x < toX; x += 1) {
      const value = image.data[(y * image.width + x) * 4];
      if (value > 70) {
        total += value;
        count += 1;
      }
    }
  }
  return count ? total / count : 0;
}

const neutral = syntheticImage();
const red = syntheticImage({ ink:'red' });
const blue = syntheticImage({ ink:'blue' });
assert.equal(qualityModule.analyzeDocumentColorV1093(neutral).preserveColor, false);
assert.equal(qualityModule.analyzeDocumentColorV1093(red).preserveColor, true);
assert.equal(qualityModule.analyzeDocumentColorV1093(blue).preserveColor, true);

const shadowed = syntheticImage({ shadow:true });
const beforeDifference = Math.abs(
  regionMean(shadowed, 4, Math.floor(shadowed.width / 2) - 2)
  - regionMean(shadowed, Math.ceil(shadowed.width / 2) + 2, shadowed.width - 4),
);
const fixed = qualityModule.autoFixDocumentV1093(shadowed);
assert.ok(fixed.display?.data?.length, 'quality bot must return a rendered display image');
assert.ok(fixed.clean?.data?.length, 'quality bot must return a clean image');
assert.ok(fixed.highContrast?.data?.length, 'quality bot must return a high-contrast OCR image');
assert.equal(fixed.metadata.primaryRenderedOutput, true);
const afterDifference = Math.abs(
  regionMean(fixed.clean, 4, Math.floor(fixed.clean.width / 2) - 2)
  - regionMean(fixed.clean, Math.ceil(fixed.clean.width / 2) + 2, fixed.clean.width - 4),
);
assert.ok(afterDifference < beforeDifference, 'local illumination correction must reduce a side shadow');

const review = read('source/src/modules/scan/v3/ReviewScreenV3.jsx');
assert.ok(review.includes('data-road-ready-scanner-review="four-corner-v10931"'));
assert.ok(review.includes('4 corner frame'));
assert.ok(review.includes('Auto-fix & save'));
assert.ok(review.includes('strokeWidth="1.15"'));
assert.equal(review.includes('bend points'), false);
assert.equal(review.includes('boundaryHandlesV1093'), false);

const engine = read('source/src/modules/scan/v3/ScannerEngineV3.js');
assert.ok(engine.includes('warpPerspectiveV3'));
assert.ok(engine.includes('homography-four-corner-v10931'));
assert.ok(engine.includes("primaryOutput:'displayFile'"));
assert.ok(engine.includes("captureAsset('original'"));
assert.ok(engine.includes("captureAsset('display-final'"));
assert.ok(engine.includes('autoFixed.display'));
assert.equal(engine.includes('extractCurvedDocumentV1093'), false);
assert.equal(engine.includes('coons-curved-mesh'), false);

const scanner = read('source/src/modules/scan/v3/RoadReadyScannerV3.jsx');
assert.ok(scanner.includes('Road Ready Scanner 0.4.2'));
assert.ok(scanner.includes('onComplete?.(result.displayFile, result.metadata)'));
assert.ok(scanner.includes('rendered scan saved'));
assert.equal(scanner.includes('six smart points'), false);
assert.equal(scanner.includes('bend points'), false);

const quality = read('source/src/modules/scan/v3/AutoQualityBotV1093.js');
assert.ok(quality.includes('buildIlluminationGrid'));
assert.ok(quality.includes('paperWhiteBalance'));
assert.ok(quality.includes('sharpenInPlace'));
assert.ok(quality.includes('localIlluminationGrid:true'));
assert.ok(quality.includes('primaryRenderedOutput:true'));

const scanSheet = read('source/src/modules/scan/SmartScanSheetV105.jsx');
assert.ok(scanSheet.includes("scannerVersion:analysis?.scanMeta?.scannerVersion || '109.3.1'"));
assert.ok(scanSheet.includes('persistCaptureAssetsV106'));

const appVersion = JSON.parse(read('public/app-version.json'));
assert.equal(appVersion.version, '109.3.1');
assert.equal(appVersion.build, 'v10931-road-ready-scanner-four-corner-render');

const scannerManifest = JSON.parse(read('public/scanner-engine.json'));
assert.equal(scannerManifest.visibleHandles, 4);
assert.equal(scannerManifest.internalBoundaryPoints, 4);
assert.equal(scannerManifest.geometry, 'homography-four-corner');
assert.equal(scannerManifest.primaryOutput, 'display-final');

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.version, '109.3.1');
assert.equal(pkg.engines.node, '24.x');

for (const relative of [
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

console.log('PASS — scanner review exposes four straight corner handles only');
console.log('PASS — Auto-fix rendered file is the primary persisted Document Vault file');
console.log('PASS — immutable original and separate OCR assets remain preserved');
console.log('PASS — local illumination, shadow, white-balance and sharpening checks passed');
console.log('PASS — v109.3.1 scanner four-corner regression suite');
