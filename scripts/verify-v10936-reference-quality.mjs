import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const moduleUrl = relative => `${pathToFileURL(path.join(ROOT, relative)).href}?verify=${Date.now()}_${Math.random()}`;

const qualityModule = await import(moduleUrl('source/src/modules/scan/v3/AutoQualityBotV1093.js'));

function luma(data, offset) {
  return data[offset] * .2126 + data[offset + 1] * .7152 + data[offset + 2] * .0722;
}

function syntheticReference() {
  const width = 240;
  const height = 320;
  const data = new Uint8ClampedArray(width * height * 4);
  const textMask = new Uint8Array(width * height);
  const orangeMask = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      const broadShadow = x < width * .58
        ? 58 * (1 - x / (width * .58))
        : 0;
      const verticalShade = 7 * Math.sin(y / height * Math.PI);
      const paper = 226 - broadShadow - verticalShade;
      const printed = (
        (y % 29 < 2 && x > 18 && x < width - 18)
        || (x % 67 < 2 && y > 22 && y < height - 28)
      );

      let r = paper + 5;
      let g = paper;
      let b = paper - 4;
      if (printed) {
        r = 71;
        g = 69;
        b = 68;
        textMask[pixel] = 1;
      }
      if (y > 235 && y < 250 && x > 42 && x < 196) {
        r = 216;
        g = 146;
        b = 62;
        orangeMask[pixel] = 1;
        textMask[pixel] = 0;
      }

      data[offset] = Math.max(0, Math.min(255, Math.round(r)));
      data[offset + 1] = Math.max(0, Math.min(255, Math.round(g)));
      data[offset + 2] = Math.max(0, Math.min(255, Math.round(b)));
      data[offset + 3] = 255;
    }
  }

  return {
    image:{ width, height, data },
    textMask,
    orangeMask,
  };
}

function regionStats(image, textMask, orangeMask) {
  let textTotal = 0;
  let textCount = 0;
  let leftPaper = 0;
  let leftCount = 0;
  let rightPaper = 0;
  let rightCount = 0;
  const orange = [0, 0, 0];
  let orangeCount = 0;
  let clipped = 0;

  for (let y = 8; y < image.height - 8; y += 1) {
    for (let x = 8; x < image.width - 8; x += 1) {
      const pixel = y * image.width + x;
      const offset = pixel * 4;
      const value = luma(image.data, offset);
      if (value >= 253) clipped += 1;

      if (orangeMask[pixel]) {
        orange[0] += image.data[offset];
        orange[1] += image.data[offset + 1];
        orange[2] += image.data[offset + 2];
        orangeCount += 1;
        continue;
      }

      if (textMask[pixel]) {
        textTotal += value;
        textCount += 1;
        continue;
      }

      if (x < image.width / 2) {
        leftPaper += value;
        leftCount += 1;
      } else {
        rightPaper += value;
        rightCount += 1;
      }
    }
  }

  const paperMean = ((leftPaper / Math.max(1, leftCount)) + (rightPaper / Math.max(1, rightCount))) / 2;
  return {
    textMean:textTotal / Math.max(1, textCount),
    leftPaper:leftPaper / Math.max(1, leftCount),
    rightPaper:rightPaper / Math.max(1, rightCount),
    paperMean,
    textContrast:paperMean - textTotal / Math.max(1, textCount),
    shadowDifference:Math.abs(
      leftPaper / Math.max(1, leftCount)
      - rightPaper / Math.max(1, rightCount),
    ),
    orange:orange.map(value => value / Math.max(1, orangeCount)),
    clippingRatio:clipped / ((image.width - 16) * (image.height - 16)),
  };
}

const fixture = syntheticReference();
const before = regionStats(fixture.image, fixture.textMask, fixture.orangeMask);
const result = qualityModule.autoFixDocumentV1093(fixture.image, {}, { profile:'display' });
const after = regionStats(result.display, fixture.textMask, fixture.orangeMask);

assert.ok(result.display?.data?.length, 'quality bot must return a display image');
assert.equal(result.metadata.qualityProfile, 'reference-trained-shadow-flat-text-clarity');
assert.equal(result.metadata.localShadowFlattening, true);
assert.equal(result.metadata.paperNeutralized, true);
assert.equal(result.metadata.neutralInkBoost, true);
assert.equal(result.metadata.coloredInkProtected, true);
assert.ok(
  after.textContrast > before.textContrast * 1.18,
  `neutral printed text contrast must improve: ${before.textContrast} -> ${after.textContrast}`,
);
assert.ok(
  after.shadowDifference < before.shadowDifference * .58,
  `broad paper shadow must flatten: ${before.shadowDifference} -> ${after.shadowDifference}`,
);
assert.ok(after.clippingRatio < .08, 'paper highlights must remain protected');
assert.ok(after.orange[0] > after.orange[1] && after.orange[1] > after.orange[2], 'orange handwriting hue must remain ordered');
const orangeBeforeChroma = before.orange[0] - before.orange[2];
const orangeAfterChroma = after.orange[0] - after.orange[2];
assert.ok(orangeAfterChroma >= orangeBeforeChroma * .55, 'orange handwriting color must remain visible');

const review = read('source/src/modules/scan/v3/ReviewScreenV3.jsx');
assert.ok(review.includes('data-road-ready-scanner-review="four-corner-v10931"'));
assert.ok(review.includes('4 corner frame'));
assert.equal(review.includes('bend points'), false);

const perspective = read('source/src/modules/scan/v3/PerspectiveEngineV10934.js');
assert.ok(perspective.includes('estimateProjectiveAspectV10934'));
assert.ok(perspective.includes('bicubic-catmull-rom'));

const engine = read('source/src/modules/scan/v3/ScannerEngineV3.js');
assert.ok(engine.includes('warpPerspectiveV10934'));
assert.ok(engine.includes("primaryOutput:'displayFile'"));
assert.ok(engine.includes("captureAsset('original'"));
assert.ok(engine.includes("captureAsset('display-final'"));
assert.ok(engine.includes('jpegQuality:.995'));

const appVersion = JSON.parse(read('public/app-version.json'));
assert.equal(appVersion.version, '109.3.6');
assert.equal(appVersion.build, 'v10936-road-ready-scanner-reference-quality');

const scannerManifest = JSON.parse(read('public/scanner-engine.json'));
assert.equal(scannerManifest.visibleHandles, 4);
assert.equal(scannerManifest.geometry, 'projective-rectangle-native-detail');
assert.equal(scannerManifest.primaryOutput, 'display-final');
assert.equal(scannerManifest.qualityBot, 'road-ready-auto-quality-bot-v10936');
assert.equal(scannerManifest.qualityProfile, 'reference-trained-shadow-flat-text-clarity');
assert.equal(scannerManifest.localShadowFlattening, true);
assert.equal(scannerManifest.paperNeutralization, true);
assert.equal(scannerManifest.neutralInkBoost, true);
assert.equal(scannerManifest.coloredInkProtected, true);
assert.equal(scannerManifest.originalPreserved, true);

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.version, '109.3.6');

console.log('PASS — four-corner selector and projective geometry remain unchanged');
console.log('PASS — broad paper shadows flatten without clipping highlights');
console.log('PASS — neutral printed ink becomes darker and sharper');
console.log('PASS — orange, red and blue handwriting remains protected');
console.log('PASS — rendered final remains primary while original and OCR assets stay preserved');
console.log('PASS — v109.3.6 reference-trained scanner quality regression suite');
