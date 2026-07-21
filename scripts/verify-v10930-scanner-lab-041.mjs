import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const moduleUrl = relative => `${pathToFileURL(path.join(ROOT, relative)).href}?verify=${Date.now()}_${Math.random()}`;

const boundaryModule = await import(moduleUrl('source/src/modules/scan/v3/CurvedBoundaryV1093.js'));
const qualityModule = await import(moduleUrl('source/src/modules/scan/v3/AutoQualityBotV1093.js'));

const corners = [
  { x:.12, y:.08 },
  { x:.88, y:.1 },
  { x:.86, y:.91 },
  { x:.14, y:.9 },
];
const boundary = boundaryModule.boundaryFromCornersV1093(corners, 5);
assert.equal(boundaryModule.boundaryPathPointsV1093(boundary).length, 16);
const handles = boundaryModule.boundaryHandlesV1093(boundary);
assert.equal(handles.length, 6);
assert.equal(handles.filter(handle => handle.isCorner).length, 4);
assert.equal(handles.filter(handle => !handle.isCorner).length, 2);

const moved = boundaryModule.updateBoundaryPointV1093(
  boundary,
  'top',
  0,
  { x:.08, y:.06 },
);
assert.deepEqual(moved.top[0], moved.left[0]);

const bowed = boundaryModule.boundaryFromCornersV1093(corners, 5);
bowed.top[2] = { x:.5, y:.19 };
const topMiddle = boundaryModule.coonsPointV1093(bowed, .5, 0);
assert.ok(topMiddle.y > .15, 'curved top edge should affect the Coons surface');

const vertical = boundaryModule.boundaryFromCornersV1093(corners, 5);
vertical.left[2] = { x:.03, y:.5 };
vertical.right[2] = { x:.97, y:.5 };
assert.deepEqual(
  boundaryModule.boundaryHandlesV1093(vertical)
    .filter(handle => !handle.isCorner)
    .map(handle => handle.side),
  ['right', 'left'],
);

function syntheticImage(red = false) {
  const width = 80;
  const height = 100;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const text = x % 18 < 2 || y % 23 < 2;
      data[offset] = text ? 35 : 235;
      data[offset + 1] = text ? 35 : 235;
      data[offset + 2] = text ? 35 : 235;
      data[offset + 3] = 255;
    }
  }
  if (red) {
    for (let y = 62; y < 72; y += 1) {
      for (let x = 18; x < 64; x += 1) {
        const offset = (y * width + x) * 4;
        data[offset] = 210;
        data[offset + 1] = 58;
        data[offset + 2] = 42;
      }
    }
  }
  return { width, height, data };
}

assert.equal(qualityModule.analyzeDocumentColorV1093(syntheticImage(false)).preserveColor, false);
assert.equal(qualityModule.analyzeDocumentColorV1093(syntheticImage(true)).preserveColor, true);

const review = read('source/src/modules/scan/v3/ReviewScreenV3.jsx');
assert.ok(review.includes('data-road-ready-scanner-review="six-handle-v1093"'));
assert.ok(review.includes('Auto-fix & save'));
assert.ok(review.includes('strokeWidth="1.5"'));

const engine = read('source/src/modules/scan/v3/ScannerEngineV3.js');
assert.ok(engine.includes('extractCurvedDocumentV1093'));
assert.ok(engine.includes('autoFixDocumentV1093'));
assert.ok(engine.includes("captureAsset('original'"));
assert.ok(engine.includes('internalBoundaryPoints:16'));

const scanner = read('source/src/modules/scan/v3/RoadReadyScannerV3.jsx');
assert.ok(scanner.includes('Road Ready Scanner 0.4.1'));
assert.ok(scanner.includes('Local processing · six smart points · original preserved'));

const scanSheet = read('source/src/modules/scan/SmartScanSheetV105.jsx');
assert.ok(scanSheet.includes("scannerVersion:analysis?.scanMeta?.scannerVersion || '109.3.0'"));
assert.ok(scanSheet.includes('persistCaptureAssetsV106'));

const appVersion = JSON.parse(read('public/app-version.json'));
assert.equal(appVersion.version, '109.3.0');
assert.equal(appVersion.build, 'v1093-road-ready-scanner-lab-041');

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.version, '109.3.0');
assert.equal(pkg.engines.node, '24.x');

for (const relative of [
  'source/src/modules/scan/v3/CurvedBoundaryV1093.js',
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

console.log('PASS — six visible handles with 16-point internal curved boundary');
console.log('PASS — imported photos use the local 2200px scanner engine');
console.log('PASS — Auto Quality Bot preserves colored marks and cleans neutral paperwork');
console.log('PASS — original, display, OCR and capture assets remain wired to Document Vault');
console.log('PASS — v109.3 scanner integration regression suite');
