import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const moduleUrl = relative => `${pathToFileURL(path.join(ROOT, relative)).href}?verify=${Date.now()}_${Math.random()}`;

const perspectiveModule = await import(moduleUrl('source/src/modules/scan/v3/PerspectiveEngineV10933.js'));
const qualityModule = await import(moduleUrl('source/src/modules/scan/v3/AutoQualityBotV1093.js'));

function multiplyMatrix(left, right) {
  return left.map(row => right[0].map((_, column) => (
    row.reduce((sum, value, index) => sum + value * right[index][column], 0)
  )));
}

function rotationX(degrees) {
  const angle = degrees * Math.PI / 180;
  return [
    [1, 0, 0],
    [0, Math.cos(angle), -Math.sin(angle)],
    [0, Math.sin(angle), Math.cos(angle)],
  ];
}

function rotationY(degrees) {
  const angle = degrees * Math.PI / 180;
  return [
    [Math.cos(angle), 0, Math.sin(angle)],
    [0, 1, 0],
    [-Math.sin(angle), 0, Math.cos(angle)],
  ];
}

function rotationZ(degrees) {
  const angle = degrees * Math.PI / 180;
  return [
    [Math.cos(angle), -Math.sin(angle), 0],
    [Math.sin(angle), Math.cos(angle), 0],
    [0, 0, 1],
  ];
}

function projectLetterPage() {
  const width = 8.5;
  const height = 11;
  const imageWidth = 1200;
  const imageHeight = 1600;
  const focalLength = 1200;
  const centerX = imageWidth / 2;
  const centerY = imageHeight / 2;
  const rotation = multiplyMatrix(
    multiplyMatrix(rotationZ(10), rotationY(20)),
    rotationX(-10),
  );
  const points = [
    [0, 0, 0],
    [width, 0, 0],
    [width, height, 0],
    [0, height, 0],
  ].map(point => [point[0] - width / 2, point[1] - height / 2, 0]);

  const corners = points.map(point => {
    const rotated = rotation.map(row => (
      row[0] * point[0] + row[1] * point[1] + row[2] * point[2]
    ));
    rotated[2] += 40;
    return {
      x:(focalLength * rotated[0] / rotated[2] + centerX) / imageWidth,
      y:(focalLength * rotated[1] / rotated[2] + centerY) / imageHeight,
    };
  });
  return { imageWidth, imageHeight, corners };
}

const projectedLetter = projectLetterPage();
const recovered = perspectiveModule.estimateProjectiveAspectV10933(
  projectedLetter.imageWidth,
  projectedLetter.imageHeight,
  projectedLetter.corners,
);
assert.ok(recovered.aspect, 'projective aspect must be recovered');
assert.ok(
  Math.abs(recovered.aspect - (8.5 / 11)) < .02,
  `projective aspect ${recovered.aspect} must stay near US Letter`,
);
const geometry = perspectiveModule.estimateOutputGeometryV10933(
  projectedLetter.imageWidth,
  projectedLetter.imageHeight,
  projectedLetter.corners,
  {
    maxDimension:3000,
    maxUpscale:1.015,
    snapToStandard:true,
    snapTolerance:.085,
  },
);
assert.equal(geometry.pageFormat, 'letter');
assert.ok(Math.abs(geometry.outputAspect - (8.5 / 11)) < .002);
assert.ok(geometry.scale <= 1.016, 'renderer must not force a large upscale');
assert.ok(geometry.aspectMethod.includes('projective-rectangle'));

function syntheticImage({ ink = '', shadow = false } = {}) {
  const width = 180;
  const height = 240;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const fineText = x % 29 < 2 || y % 41 < 2 || (x + y) % 67 < 2;
      const paper = shadow && x < width / 2 ? 145 : 228;
      const value = fineText ? 34 : paper;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  if (ink) {
    for (let y = 165; y < 179; y += 1) {
      for (let x = 34; x < 146; x += 1) {
        const offset = (y * width + x) * 4;
        if (ink === 'red') {
          data[offset] = 214;
          data[offset + 1] = 62;
          data[offset + 2] = 42;
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

function fineTextContrast(image) {
  let dark = 0;
  let light = 0;
  let darkCount = 0;
  let lightCount = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const value = image.data[(y * image.width + x) * 4];
      const fineText = x % 29 < 2 || y % 41 < 2 || (x + y) % 67 < 2;
      if (fineText) {
        dark += value;
        darkCount += 1;
      } else {
        light += value;
        lightCount += 1;
      }
    }
  }
  return light / Math.max(1, lightCount) - dark / Math.max(1, darkCount);
}

const neutral = syntheticImage();
const red = syntheticImage({ ink:'red' });
const blue = syntheticImage({ ink:'blue' });
assert.equal(qualityModule.analyzeDocumentColorV1093(neutral).preserveColor, false);
assert.equal(qualityModule.analyzeDocumentColorV1093(red).preserveColor, true);
assert.equal(qualityModule.analyzeDocumentColorV1093(blue).preserveColor, true);

const shadowed = syntheticImage({ ink:'red', shadow:true });
const beforeDifference = Math.abs(
  regionMean(shadowed, 4, Math.floor(shadowed.width / 2) - 2)
  - regionMean(shadowed, Math.ceil(shadowed.width / 2) + 2, shadowed.width - 4),
);
const beforeContrast = fineTextContrast(shadowed);
const fixed = qualityModule.autoFixDocumentV1093(shadowed);
const afterDifference = Math.abs(
  regionMean(fixed.display, 4, Math.floor(fixed.display.width / 2) - 2)
  - regionMean(fixed.display, Math.ceil(fixed.display.width / 2) + 2, fixed.display.width - 4),
);
const afterContrast = fineTextContrast(fixed.display);
assert.ok(afterDifference < beforeDifference, 'shadow correction must reduce uneven paper lighting');
assert.ok(afterContrast >= beforeContrast * .98, 'fine printed detail must not be softened');
assert.equal(fixed.metadata.sourceDetailFused, true);
assert.equal(fixed.metadata.naturalPaperTone, true);
assert.ok(fixed.metadata.outputClippingRatio < .03, 'display highlights must stay below clipping threshold');

const review = read('source/src/modules/scan/v3/ReviewScreenV3.jsx');
assert.ok(review.includes('data-road-ready-scanner-review="four-corner-v10931"'));
assert.ok(review.includes('4 corner frame'));
assert.ok(review.includes('Auto-fix & save'));
assert.equal(review.includes('bend points'), false);
assert.equal(review.includes('boundaryHandlesV1093'), false);

const perspective = read('source/src/modules/scan/v3/PerspectiveEngineV10933.js');
assert.ok(perspective.includes('estimateProjectiveAspectV10933'));
assert.ok(perspective.includes('bicubic-catmull-rom'));
assert.ok(perspective.includes('maxUpscale ?? 1.035'));
assert.equal(perspective.includes('minShortSide'), false);

const engine = read('source/src/modules/scan/v3/ScannerEngineV3.js');
assert.ok(engine.includes('warpPerspectiveV10933'));
assert.ok(engine.includes('projective-four-corner-v10933'));
assert.ok(engine.includes('maxUpscale:1.015'));
assert.ok(engine.includes("primaryOutput:'displayFile'"));
assert.ok(engine.includes("captureAsset('original'"));
assert.ok(engine.includes("captureAsset('display-final'"));
assert.ok(engine.includes('source-detail-fusion-v10933'));
assert.equal(engine.includes('extractCurvedDocumentV1093'), false);

const scanner = read('source/src/modules/scan/v3/RoadReadyScannerV3.jsx');
assert.ok(scanner.includes('Road Ready Scanner 0.4.4'));
assert.ok(scanner.includes('onComplete?.(result.displayFile, result.metadata)'));
assert.ok(scanner.includes('real ratio'));
assert.equal(scanner.includes('bend points'), false);

const quality = read('source/src/modules/scan/v3/AutoQualityBotV1093.js');
assert.ok(quality.includes('sourceDetailPlane'));
assert.ok(quality.includes('fuseSourceDetail'));
assert.ok(quality.includes("qualityProfile:'source-detail-fusion'"));
assert.ok(quality.includes('sourceDetailFused:true'));
assert.ok(quality.includes('naturalPaperTone:true'));

const scanSheet = read('source/src/modules/scan/SmartScanSheetV105.jsx');
assert.ok(scanSheet.includes("scannerVersion:analysis?.scanMeta?.scannerVersion || '109.3.3'"));
assert.ok(scanSheet.includes('persistCaptureAssetsV106'));

const appVersion = JSON.parse(read('public/app-version.json'));
assert.equal(appVersion.version, '109.3.3');
assert.equal(appVersion.build, 'v10933-road-ready-scanner-projective-detail');

const scannerManifest = JSON.parse(read('public/scanner-engine.json'));
assert.equal(scannerManifest.visibleHandles, 4);
assert.equal(scannerManifest.internalBoundaryPoints, 4);
assert.equal(scannerManifest.geometry, 'projective-rectangle-aspect-homography');
assert.equal(scannerManifest.primaryOutput, 'display-final');
assert.equal(scannerManifest.maximumUpscale, 1.015);
assert.equal(scannerManifest.sourceDetailFusion, true);

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
console.log('PASS — projective camera geometry recovers the physical Letter page ratio');
console.log('PASS — no forced minimum-resolution upscale remains');
console.log('PASS — source-detail fusion reduces shadows without softening fine text');
console.log('PASS — final rendered file remains the primary persisted Document Vault file');
console.log('PASS — immutable original and separate OCR assets remain preserved');
console.log('PASS — v109.3.3 scanner projective ratio and detail regression suite');
