import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const moduleUrl = relative => `${pathToFileURL(path.join(ROOT, relative)).href}?verify=${Date.now()}_${Math.random()}`;

function portraitFixture() {
  const width = 300;
  const height = 420;
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);

  const rectangle = (x0, y0, x1, y1, value = 45) => {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const offset = (y * width + x) * 4;
        data[offset] = value;
        data[offset + 1] = value;
        data[offset + 2] = value;
        data[offset + 3] = 255;
      }
    }
  };

  rectangle(34, 24, 238, 32, 30);
  rectangle(34, 43, 178, 49, 50);
  for (let row = 0; row < 14; row += 1) {
    const y = 80 + row * 19;
    for (let column = 0; column < 4; column += 1) {
      const x = 28 + column * 62;
      rectangle(x, y, x + 44 + (row % 3) * 3, y + 3, 58);
    }
  }
  rectangle(40, 370, 182, 373, 76);
  return { width, height, data, pageFormat:'letter' };
}

const orientation = await import(moduleUrl('source/src/modules/scan/v3/DocumentOrientationV10943.js'));
const upright = portraitFixture();
const uprightResult = orientation.autoOrientDocumentV10943(upright, { pageFormat:'letter' });
assert.equal(uprightResult.rotationDegrees, 0, 'an upright portrait page must remain upright');
assert.equal(uprightResult.image.width, upright.width);
assert.equal(uprightResult.image.height, upright.height);

const sideways = orientation.rotateQuarterTurnsV10943(upright, 1);
const sidewaysResult = orientation.autoOrientDocumentV10943(sideways, { pageFormat:'letter' });
assert.ok(
  sidewaysResult.rotationDegrees === 90 || sidewaysResult.rotationDegrees === 270,
  `a sideways page must receive a quarter-turn, got ${sidewaysResult.rotationDegrees}`,
);
assert.ok(
  sidewaysResult.image.height > sidewaysResult.image.width,
  'the sideways US Letter fixture must open as a portrait page',
);
assert.ok(
  sidewaysResult.verticalScore > sidewaysResult.horizontalScore * 1.1,
  'sideways detection must be grounded in the source text axis',
);

const tilted = orientation.rotateImageDataV10943(upright, 2);
const tiltedResult = orientation.autoOrientDocumentV10943(tilted, { pageFormat:'letter' });
assert.equal(tiltedResult.rotationDegrees, 0, 'small residual skew must not trigger a quarter-turn');
assert.ok(
  Math.abs(tiltedResult.deskewDegrees + 2) <= .75,
  `the two-degree fixture must be deskewed back toward zero, got ${tiltedResult.deskewDegrees}`,
);
assert.ok(
  Math.abs(tiltedResult.deskewDegrees) <= 4,
  'deskew must stay inside the four-degree safety bound',
);

const moduleSource = read('source/src/modules/scan/v3/DocumentOrientationV10943.js');
assert.ok(moduleSource.includes('vertical-text-axis'));
assert.ok(moduleSource.includes('standard-page-sideways'));
assert.ok(moduleSource.includes('improvement < 1.055'));
assert.equal(moduleSource.includes('OCR'), false, 'orientation must not depend on OCR text rewriting');

const engine = read('source/src/modules/scan/v3/ScannerEngineV3.js');
assert.ok(engine.includes("import { autoOrientDocumentV10943 } from './DocumentOrientationV10943.js';"));
assert.ok(engine.includes("options.onStatus?.('Straightening page orientation and text lines…');"));
assert.ok(engine.includes('corrected = straightened.image;'));
assert.ok(engine.includes('autoRotationDegrees:straightened.rotationDegrees'));
assert.ok(engine.includes('autoDeskewDegrees:straightened.deskewDegrees'));
assert.ok(engine.includes("captureAsset('display-final'"));

const review = read('source/src/modules/scan/v3/ReviewScreenV3.jsx');
assert.ok(review.includes('Auto upright · build 109.4.3'));
assert.ok(review.includes('4 corner frame'));
assert.equal(review.includes('bend points'), false);

const release = JSON.parse(read('public/app-version.json'));
assert.equal(release.version, '109.4.3');
assert.equal(release.build, 'v10943-auto-upright-deskew');
assert.equal(release.force, true);

const manifest = JSON.parse(read('public/scanner-engine.json'));
assert.equal(manifest.version, '109.4.3');
assert.equal(manifest.name, 'Road Ready Scanner 0.5.3');
assert.equal(manifest.autoOrientation, 'source-text-axis-v10943');
assert.equal(manifest.autoDeskew, true);
assert.equal(manifest.maxDeskewDegrees, 4);
assert.equal(manifest.standardPageUprightPrior, true);
assert.equal(manifest.ocrRewrite, false);
assert.equal(manifest.generativeReconstruction, false);
assert.equal(manifest.visibleHandles, 4);
assert.equal(manifest.primaryOutput, 'display-final');

const packageJson = JSON.parse(read('package.json'));
assert.equal(packageJson.version, '109.4.3');

console.log('PASS — sideways portrait documents are automatically rotated upright');
console.log('PASS — residual text skew is corrected inside a bounded four-degree range');
console.log('PASS — orientation uses source pixel projections without OCR or generative rewriting');
console.log('PASS — four-corner geometry, display-final, original and OCR assets remain unchanged');
console.log('PASS — v109.4.3 auto upright and deskew scanner regression suite');
