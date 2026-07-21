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
  const width = 144;
  const height = 192;
  const data = new Uint8ClampedArray(width * height * 4);
  const textRows = new Set();

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const gradient = 220 + Math.round(x / width * 12);
      const shadow = x < width * .42 ? 18 : 0;
      let value = gradient - shadow;

      const rowPhase = y % 25;
      const columnPhase = x % 43;
      const horizontalText = y > 16 && y < height - 24 && rowPhase >= 8 && rowPhase <= 11 && x > 10 && x < width - 10;
      const verticalText = x > 12 && x < width - 12 && columnPhase >= 18 && columnPhase <= 20 && y > 24 && y < height - 32;
      if (horizontalText || verticalText) {
        textRows.add(y);
        value = rowPhase === 9 || rowPhase === 10 ? 142 : 174;
      }

      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }

  // Orange handwriting forces the real display path to preserve color.
  for (let y = 148; y < 158; y += 1) {
    for (let x = 24; x < 116; x += 1) {
      if ((x + y) % 5 > 1) continue;
      const offset = (y * width + x) * 4;
      data[offset] = 205;
      data[offset + 1] = 126;
      data[offset + 2] = 55;
    }
  }

  return { width, height, data, textRows };
}

function meanFor(image, predicate) {
  let total = 0;
  let count = 0;
  for (let y = 4; y < image.height - 4; y += 1) {
    for (let x = 4; x < image.width - 4; x += 1) {
      if (!predicate(x, y)) continue;
      total += lumaAt(image, x, y);
      count += 1;
    }
  }
  return count ? total / count : 0;
}

function clippingRatio(image) {
  let clipped = 0;
  let count = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (lumaAt(image, x, y) >= 253) clipped += 1;
      count += 1;
    }
  }
  return count ? clipped / count : 0;
}

function orangeChroma(image) {
  let total = 0;
  let count = 0;
  for (let y = 148; y < 158; y += 1) {
    for (let x = 24; x < 116; x += 1) {
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
const beforePaper = meanFor(source, (x, y) => y % 25 < 5 && x > 12 && x < source.width - 12);
const beforeText = meanFor(source, (x, y) => source.textRows.has(y) && x > 12 && x < source.width - 12);
const beforeContrast = beforePaper - beforeText;
const beforeOrange = orangeChroma(source);

const fixed = qualityModule.autoFixDocumentV1093(source, {}, { profile:'display' });
assert.ok(fixed.display?.data?.length, 'display renderer must return an image');
assert.equal(fixed.metadata.qualityProfile, 'native-detail-text-clarity');
assert.equal(fixed.metadata.neutralInkBoost, true);
assert.equal(fixed.metadata.multiRadiusMicroContrast, true);
assert.equal(fixed.metadata.colorHandwritingProtected, true);
assert.equal(fixed.metadata.primaryRenderedOutput, true);

const afterPaper = meanFor(fixed.display, (x, y) => y % 25 < 5 && x > 12 && x < fixed.display.width - 12);
const afterText = meanFor(fixed.display, (x, y) => source.textRows.has(y) && x > 12 && x < fixed.display.width - 12);
const afterContrast = afterPaper - afterText;
const afterOrange = orangeChroma(fixed.display);

assert.ok(afterContrast >= beforeContrast + 7, `printed text contrast must improve: ${beforeContrast} -> ${afterContrast}`);
assert.ok(afterText <= beforeText - 4, `neutral text must become clearer: ${beforeText} -> ${afterText}`);
assert.ok(Math.abs(afterPaper - beforePaper) < 24, 'paper tone must stay natural');
assert.ok(afterOrange >= beforeOrange * .62, 'orange handwriting color must remain visible');
assert.ok(clippingRatio(fixed.display) < .06, 'quality pass must protect highlights');

const quality = read('source/src/modules/scan/v3/AutoQualityBotV1093.js');
assert.ok(quality.includes('function boostNeutralInkV10934'));
assert.ok(quality.includes('multiRadiusMicroContrast:true'));
assert.ok(quality.includes('neutralInkBoost:true'));
assert.ok(quality.includes("qualityProfile:'native-detail-text-clarity'"));
assert.ok(quality.includes('colorHandwritingProtected:true'));

const perspective = read('source/src/modules/scan/v3/PerspectiveEngineV10933.js');
assert.ok(perspective.includes('estimateOutputGeometryV10933'));
assert.ok(perspective.includes("reason:'us-letter-page-prior'"));

const review = read('source/src/modules/scan/v3/ReviewScreenV3.jsx');
assert.ok(review.includes('data-road-ready-scanner-review="four-corner-v10931"'));
assert.ok(review.includes('4 corner frame'));
assert.equal(review.includes('bend points'), false);

const engine = read('source/src/modules/scan/v3/ScannerEngineV3.js');
assert.ok(engine.includes('warpPerspectiveV10933'));
assert.ok(engine.includes('homography-native-detail-v10934'));
assert.ok(engine.includes('decodeImageFileV3(session.originalFile'));
assert.ok(engine.includes('maxUpscale:1'));
assert.ok(engine.includes("primaryOutput:'displayFile'"));
assert.ok(engine.includes('jpegQuality:.995'));
assert.ok(engine.includes('road-ready-scanner-v10934-'));

const scanner = read('source/src/modules/scan/v3/RoadReadyScannerV3.jsx');
assert.ok(scanner.includes('Road Ready Scanner 0.4.5'));
assert.ok(scanner.includes('onComplete?.(result.displayFile, result.metadata)'));
assert.ok(scanner.includes('clearer printed text'));

const scanSheet = read('source/src/modules/scan/SmartScanSheetV105.jsx');
assert.ok(scanSheet.includes("scannerVersion:analysis?.scanMeta?.scannerVersion || '109.3.4'"));
assert.ok(scanSheet.includes('persistCaptureAssetsV106'));

const appVersion = JSON.parse(read('public/app-version.json'));
assert.equal(appVersion.version, '109.3.4');
assert.equal(appVersion.build, 'v10934-road-ready-scanner-text-clarity');

const scannerManifest = JSON.parse(read('public/scanner-engine.json'));
assert.equal(scannerManifest.version, '109.3.4');
assert.equal(scannerManifest.name, 'Road Ready Scanner 0.4.5');
assert.equal(scannerManifest.geometry, 'homography-native-detail');
assert.equal(scannerManifest.neutralInkBoost, true);
assert.equal(scannerManifest.multiRadiusMicroContrast, true);
assert.equal(scannerManifest.colorHandwritingProtected, true);
assert.equal(scannerManifest.primaryOutput, 'display-final');

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.version, '109.3.4');
assert.equal(pkg.engines.node, '24.x');

console.log('PASS — approved four-corner selector and corrected page format remain unchanged');
console.log('PASS — neutral printed text gains local contrast and multi-radius clarity');
console.log('PASS — paper highlights and colored handwriting remain protected');
console.log('PASS — native-resolution final render and primary Vault persistence remain unchanged');
console.log('PASS — v109.3.4 scanner text-clarity regression suite');
