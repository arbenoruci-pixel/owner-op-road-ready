import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const moduleUrl = relative => `${pathToFileURL(path.join(ROOT, relative)).href}?verify=${Date.now()}_${Math.random()}`;

const qualityModule = await import(moduleUrl('source/src/modules/scan/v3/AutoQualityBotV1093.js'));
const perspectiveModule = await import(moduleUrl('source/src/modules/scan/v3/PerspectiveEngineV10934.js'));

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

function projectedLetterPage() {
  const physicalWidth = 8.5;
  const physicalHeight = 11;
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
    [physicalWidth, 0, 0],
    [physicalWidth, physicalHeight, 0],
    [0, physicalHeight, 0],
  ].map(point => [
    point[0] - physicalWidth / 2,
    point[1] - physicalHeight / 2,
    0,
  ]);
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

const projected = projectedLetterPage();
const recovered = perspectiveModule.estimateProjectiveAspectV10934(
  projected.imageWidth,
  projected.imageHeight,
  projected.corners,
);
assert.equal(recovered.method, 'projective-rectangle');
assert.ok(recovered.aspect, 'projective aspect must be recovered');
assert.ok(
  Math.abs(recovered.aspect - (8.5 / 11)) < .02,
  `recovered ratio ${recovered.aspect} must stay near US Letter`,
);
assert.ok(
  Math.abs(recovered.edgeAspect - (8.5 / 11)) > .02,
  'test camera angle must visibly distort the raw edge ratio',
);

const letterGeometry = perspectiveModule.estimateOutputGeometryV10934(
  projected.imageWidth,
  projected.imageHeight,
  projected.corners,
  {
    maxDimension:3600,
    maxUpscale:1,
    snapToStandard:true,
    snapTolerance:.095,
    usLetterBias:true,
  },
);
assert.equal(letterGeometry.pageFormat, 'letter');
assert.ok(letterGeometry.aspectMethod.includes('projective-rectangle'));
assert.ok(Math.abs(letterGeometry.outputAspect - (8.5 / 11)) < .002);
assert.ok(letterGeometry.scale <= 1, 'perspective render must not invent resolution');

const lowResolutionGeometry = perspectiveModule.estimateOutputGeometryV10934(
  500,
  700,
  [
    { x:.1, y:.1 },
    { x:.9, y:.1 },
    { x:.9, y:.9 },
    { x:.1, y:.9 },
  ],
  { maxDimension:3600, maxUpscale:1, snapToStandard:false },
);
assert.ok(Math.max(lowResolutionGeometry.width, lowResolutionGeometry.height) <= 700);
assert.ok(lowResolutionGeometry.scale <= 1);

const receiptGeometry = perspectiveModule.estimateOutputGeometryV10934(
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

function luma(image, pixel) {
  const offset = pixel * 4;
  return image.data[offset] * .2126 + image.data[offset + 1] * .7152 + image.data[offset + 2] * .0722;
}

function syntheticImage({ ink = '', shadow = false } = {}) {
  const width = 180;
  const height = 240;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const text = x % 29 < 2 || y % 41 < 2 || (x + y) % 67 < 2;
      const paper = shadow && x < width / 2 ? 145 : 228;
      const value = text ? 34 : paper;
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
      const value = luma(image, y * image.width + x);
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
      const value = luma(image, y * image.width + x);
      const text = x % 29 < 2 || y % 41 < 2 || (x + y) % 67 < 2;
      if (text) {
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
  regionMean(shadowed, 4, Math.floor(shadowed.width / 2) - 2)
  - regionMean(shadowed, Math.ceil(shadowed.width / 2) + 2, shadowed.width - 4),
);
const beforeTextContrast = fineTextContrast(shadowed);
const fixed = qualityModule.autoFixDocumentV1093(shadowed);
assert.ok(fixed.display?.data?.length, 'quality bot must return a display image');
assert.ok(fixed.clean?.data?.length, 'quality bot must return a clean OCR image');
assert.ok(fixed.highContrast?.data?.length, 'quality bot must return a high-contrast OCR image');
assert.equal(fixed.metadata.primaryRenderedOutput, true);
assert.equal(fixed.metadata.highlightClippingProtected, true);
assert.equal(fixed.metadata.doubleNormalization, false);
assert.equal(fixed.metadata.nativeDetailSource, true);
assert.equal(fixed.metadata.sourceDetailFused, true);
assert.equal(fixed.metadata.naturalPaperTone, true);
assert.equal(fixed.metadata.qualityProfile, 'native-source-detail-fusion');
assert.ok(clippingRatio(fixed.display) < .06, 'display renderer must protect paper highlights');
const afterDifference = Math.abs(
  regionMean(fixed.display, 4, Math.floor(fixed.display.width / 2) - 2)
  - regionMean(fixed.display, Math.ceil(fixed.display.width / 2) + 2, fixed.display.width - 4),
);
const afterTextContrast = fineTextContrast(fixed.display);
assert.ok(afterDifference < beforeDifference, 'shadow correction must reduce uneven lighting');
assert.ok(afterTextContrast >= beforeTextContrast * .98, 'fine printed text must not be softened');

const review = read('source/src/modules/scan/v3/ReviewScreenV3.jsx');
assert.ok(review.includes('data-road-ready-scanner-review="four-corner-v10931"'));
assert.ok(review.includes('4 corner frame'));
assert.ok(review.includes('Auto-fix & save'));
assert.ok(review.includes('strokeWidth="1.15"'));
assert.equal(review.includes('bend points'), false);
assert.equal(review.includes('boundaryHandlesV1093'), false);

const perspective = read('source/src/modules/scan/v3/PerspectiveEngineV10934.js');
assert.ok(perspective.includes('estimateProjectiveAspectV10934'));
assert.ok(perspective.includes("method:'projective-rectangle'"));
assert.ok(perspective.includes('bicubic-catmull-rom'));
assert.equal(perspective.includes('minShortSide'), false);
assert.equal(perspective.includes('Math.max(1200'), false);

const engine = read('source/src/modules/scan/v3/ScannerEngineV3.js');
assert.ok(engine.includes('warpPerspectiveV10934'));
assert.ok(engine.includes('projective-native-detail-v10934'));
assert.ok(engine.includes('this.maxPreviewDimension = options.maxPreviewDimension || 2200'));
assert.ok(engine.includes('this.maxFinalInputDimension = options.maxFinalInputDimension || 4096'));
assert.ok(engine.includes('this.maxOutputDimension = options.maxOutputDimension || 3600'));
assert.ok(engine.includes('this.maxOcrDimension = options.maxOcrDimension || 2400'));
assert.ok(engine.includes('decodeImageFileV3(session.originalFile'));
assert.ok(engine.includes('maxUpscale:1'));
assert.ok(engine.includes('bicubicMaxPixels:6200000'));
assert.ok(engine.includes("primaryOutput:'displayFile'"));
assert.ok(engine.includes("captureAsset('original'"));
assert.ok(engine.includes("captureAsset('display-final'"));
assert.ok(engine.includes('source-detail-primary-v10934'));
assert.ok(engine.includes('jpegQuality:.995'));
assert.ok(engine.includes("profile:'display'"));
assert.ok(engine.includes("profile:'ocr'"));
assert.ok(engine.includes('projectiveAspect:corrected.projectiveAspect'));
assert.ok(engine.includes('interpolation:corrected.interpolation'));
assert.equal(engine.includes('Promise.all(['), false, 'large variants must encode sequentially');
assert.equal(engine.includes('extractCurvedDocumentV1093'), false);

const scanner = read('source/src/modules/scan/v3/RoadReadyScannerV3.jsx');
assert.ok(scanner.includes('Road Ready Scanner 0.4.5'));
assert.ok(scanner.includes('onComplete?.(result.displayFile, result.metadata)'));
assert.ok(scanner.includes('real ratio'));
assert.equal(scanner.includes('six smart points'), false);
assert.equal(scanner.includes('bend points'), false);

const quality = read('source/src/modules/scan/v3/AutoQualityBotV1093.js');
assert.ok(quality.includes('buildIlluminationGrid'));
assert.ok(quality.includes('paperWhiteBalance'));
assert.ok(quality.includes('fuseNativeDetailInPlace'));
assert.ok(quality.includes("qualityProfile:'native-source-detail-fusion'"));
assert.ok(quality.includes('sourceDetailFused:true'));
assert.ok(quality.includes('naturalPaperTone:true'));
assert.ok(quality.includes('nativeDetailSource:true'));
assert.ok(quality.includes('highlightClippingProtected:true'));
assert.ok(quality.includes('doubleNormalization:false'));

const scanSheet = read('source/src/modules/scan/SmartScanSheetV105.jsx');
assert.ok(scanSheet.includes("scannerVersion:analysis?.scanMeta?.scannerVersion || '109.3.4'"));
assert.ok(scanSheet.includes('persistCaptureAssetsV106'));

const appVersion = JSON.parse(read('public/app-version.json'));
assert.equal(appVersion.version, '109.3.4');
assert.equal(appVersion.build, 'v10934-road-ready-scanner-projective-source-detail');

const scannerManifest = JSON.parse(read('public/scanner-engine.json'));
assert.equal(scannerManifest.visibleHandles, 4);
assert.equal(scannerManifest.internalBoundaryPoints, 4);
assert.equal(scannerManifest.geometry, 'projective-rectangle-native-detail');
assert.equal(scannerManifest.reviewMaxLongSide, 2200);
assert.equal(scannerManifest.finalInputMaxLongSide, 4096);
assert.equal(scannerManifest.outputMaxDimension, 3600);
assert.equal(scannerManifest.ocrMaxLongSide, 2400);
assert.equal(scannerManifest.maximumUpscale, 1);
assert.equal(scannerManifest.jpegQuality, .995);
assert.equal(scannerManifest.noPerspectiveUpscale, true);
assert.equal(scannerManifest.sourceDetailFusion, true);
assert.equal(scannerManifest.primaryOutput, 'display-final');

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.version, '109.3.4');
assert.equal(pkg.engines.node, '24.x');

for (const relative of [
  'source/src/modules/scan/v3/PerspectiveEngineV10934.js',
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
console.log('PASS — projective camera geometry recovers the physical US Letter page ratio');
console.log('PASS — low-resolution sources are no longer forced to a large minimum output');
console.log('PASS — bicubic perspective resampling is active with a memory-safe fallback');
console.log('PASS — source-detail fusion reduces shadows without softening fine text');
console.log('PASS — final rendering still reopens the original photo and preserves separate OCR assets');
console.log('PASS — v109.3.4 scanner projective ratio and source-detail regression suite');
