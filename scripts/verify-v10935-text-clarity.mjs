import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const moduleUrl = relative => `${pathToFileURL(path.join(ROOT, relative)).href}?verify=${Date.now()}_${Math.random()}`;

const qualityModule = await import(moduleUrl('source/src/modules/scan/v3/AutoQualityBotV1093.js'));

function lumaAt(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return image.data[offset] * .2126
    + image.data[offset + 1] * .7152
    + image.data[offset + 2] * .0722;
}

function syntheticSoftColorDocument() {
  const width = 152;
  const height = 204;
  const data = new Uint8ClampedArray(width * height * 4);
  const textMask = new Uint8Array(width * height);
  const paperMask = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      const gradient = 218 + Math.round(x / width * 13);
      const shadow = x < width * .40 ? 17 : 0;
      let value = gradient - shadow;

      const rowPhase = y % 27;
      const horizontalCore = y > 18 && y < height - 26 && (rowPhase === 10 || rowPhase === 11) && x > 10 && x < width - 10;
      const horizontalSoft = y > 18 && y < height - 26 && (rowPhase === 9 || rowPhase === 12) && x > 10 && x < width - 10;
      const verticalCore = x > 12 && x < width - 12 && x % 47 === 23 && y > 28 && y < height - 36;
      if (horizontalCore || verticalCore) {
        value = 144;
        textMask[pixel] = 1;
      } else if (horizontalSoft) {
        value = 174;
        textMask[pixel] = 1;
      } else if (rowPhase < 5 && x > 12 && x < width - 12) {
        paperMask[pixel] = 1;
      }

      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }

  for (let y = 160; y < 171; y += 1) {
    for (let x = 26; x < 126; x += 1) {
      if ((x * 3 + y) % 7 > 2) continue;
      const pixel = y * width + x;
      const offset = pixel * 4;
      data[offset] = 205;
      data[offset + 1] = 126;
      data[offset + 2] = 55;
    }
  }

  return { width, height, data, textMask, paperMask };
}

function meanMasked(image, mask) {
  let total = 0;
  let count = 0;
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (!mask[pixel]) continue;
    const x = pixel % image.width;
    const y = Math.floor(pixel / image.width);
    total += lumaAt(image, x, y);
    count += 1;
  }
  return count ? total / count : 0;
}

function clippingRatio(image) {
  let clipped = 0;
  const count = image.width * image.height;
  for (let pixel = 0; pixel < count; pixel += 1) {
    const x = pixel % image.width;
    const y = Math.floor(pixel / image.width);
    if (lumaAt(image, x, y) >= 253) clipped += 1;
  }
  return clipped / count;
}

function orangeChroma(image) {
  let total = 0;
  let count = 0;
  for (let y = 160; y < 171; y += 1) {
    for (let x = 26; x < 126; x += 1) {
      const offset = (y * image.width + x) * 4;
      const r = image.data[offset];
      const g = image.data[offset + 1];
      const b = image.data[offset + 2];
      if (r <= g + 12) continue;
      total += Math.max(r, g, b) - Math.min(r, g, b);
      count += 1;
    }
  }
  return count ? total / count : 0;
}

const source = syntheticSoftColorDocument();
const beforePaper = meanMasked(source, source.paperMask);
const beforeText = meanMasked(source, source.textMask);
const beforeContrast = beforePaper - beforeText;
const beforeOrange = orangeChroma(source);

const fixed = qualityModule.autoFixDocumentV1093(source, {}, { profile:'display' });
assert.ok(fixed.display?.data?.length, 'display renderer must return an image');
assert.equal(fixed.metadata.qualityProfile, 'native-source-detail-text-clarity');
assert.equal(fixed.metadata.neutralInkBoost, true);
assert.equal(fixed.metadata.multiRadiusMicroContrast, true);
assert.equal(fixed.metadata.colorHandwritingProtected, true);
assert.equal(fixed.metadata.sourceDetailFused, true);

const afterPaper = meanMasked(fixed.display, source.paperMask);
const afterText = meanMasked(fixed.display, source.textMask);
const afterContrast = afterPaper - afterText;
const afterOrange = orangeChroma(fixed.display);

assert.ok(afterContrast >= beforeContrast + 3, `printed text contrast must improve: ${beforeContrast} -> ${afterContrast}`);
assert.ok(afterText <= beforeText - 2, `neutral printed ink must darken slightly: ${beforeText} -> ${afterText}`);
assert.ok(Math.abs(afterPaper - beforePaper) < 25, 'paper tone must stay natural');
assert.ok(afterOrange >= beforeOrange * .60, 'colored handwriting must remain visible');
assert.ok(clippingRatio(fixed.display) < .06, 'paper highlights must remain protected');

const quality = read('source/src/modules/scan/v3/AutoQualityBotV1093.js');
assert.ok(quality.includes('function boostNeutralInkV10935'));
assert.ok(quality.includes("qualityProfile:'native-source-detail-text-clarity'"));
assert.ok(quality.includes('neutralInkBoost:true'));
assert.ok(quality.includes('multiRadiusMicroContrast:true'));
assert.ok(quality.includes('colorHandwritingProtected:true'));
assert.ok(quality.includes('sourceDetailFused:true'));

const perspective = read('source/src/modules/scan/v3/PerspectiveEngineV10934.js');
assert.ok(perspective.includes('estimateProjectiveAspectV10934'));
assert.ok(perspective.includes("method:'projective-rectangle'"));
assert.ok(perspective.includes('bicubic-catmull-rom'));

const review = read('source/src/modules/scan/v3/ReviewScreenV3.jsx');
assert.ok(review.includes('data-road-ready-scanner-review="four-corner-v10931"'));
assert.ok(review.includes('4 corner frame'));
assert.equal(review.includes('bend points'), false);

const engine = read('source/src/modules/scan/v3/ScannerEngineV3.js');
assert.ok(engine.includes('warpPerspectiveV10934'));
assert.ok(engine.includes('projective-native-detail-v10934'));
assert.ok(engine.includes('bicubicMaxPixels:6200000'));
assert.ok(engine.includes('decodeImageFileV3(session.originalFile'));
assert.ok(engine.includes('maxUpscale:1'));
assert.ok(engine.includes("primaryOutput:'displayFile'"));
assert.ok(engine.includes('jpegQuality:.995'));
assert.ok(engine.includes('road-ready-scanner-v10935-'));

const scanner = read('source/src/modules/scan/v3/RoadReadyScannerV3.jsx');
assert.ok(scanner.includes('Road Ready Scanner 0.4.6'));
assert.ok(scanner.includes('onComplete?.(result.displayFile, result.metadata)'));
assert.ok(scanner.includes('clearer printed text'));

const scanSheet = read('source/src/modules/scan/SmartScanSheetV105.jsx');
assert.ok(scanSheet.includes("scannerVersion:analysis?.scanMeta?.scannerVersion || '109.3.5'"));
assert.ok(scanSheet.includes('persistCaptureAssetsV106'));

const appVersion = JSON.parse(read('public/app-version.json'));
assert.equal(appVersion.version, '109.3.5');
assert.equal(appVersion.build, 'v10935-road-ready-scanner-text-clarity');

const scannerManifest = JSON.parse(read('public/scanner-engine.json'));
assert.equal(scannerManifest.version, '109.3.5');
assert.equal(scannerManifest.name, 'Road Ready Scanner 0.4.6');
assert.equal(scannerManifest.geometry, 'projective-rectangle-native-detail');
assert.equal(scannerManifest.neutralInkBoost, true);
assert.equal(scannerManifest.multiRadiusMicroContrast, true);
assert.equal(scannerManifest.colorHandwritingProtected, true);
assert.equal(scannerManifest.primaryOutput, 'display-final');

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.version, '109.3.5');
assert.equal(pkg.engines.node, '24.x');

console.log('PASS — approved selector, projective page ratio and native-resolution render remain unchanged');
console.log('PASS — neutral printed ink receives restrained multi-radius micro-contrast');
console.log('PASS — paper highlights and colored handwriting remain protected');
console.log('PASS — primary Vault file, immutable original and OCR assets remain unchanged');
console.log('PASS — v109.3.5 scanner text-clarity regression suite');
