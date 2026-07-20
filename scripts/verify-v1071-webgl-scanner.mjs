import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homographyFromUnitSquareV1071 } from '../source/src/modules/scan/lightweightDocumentEngineV1071.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const pass = (condition, label) => {
  assert.ok(condition, label);
  console.log(`PASS ${label}`);
};

function map(h, u, v) {
  const denominator = h[6] * u + h[7] * v + 1;
  return {
    x:(h[0] * u + h[1] * v + h[2]) / denominator,
    y:(h[3] * u + h[4] * v + h[5]) / denominator,
  };
}

const identity = homographyFromUnitSquareV1071({
  topLeft:{ x:0, y:0 },
  topRight:{ x:1, y:0 },
  bottomRight:{ x:1, y:1 },
  bottomLeft:{ x:0, y:1 },
});
const identityCenter = map(identity, .5, .5);
pass(Math.abs(identityCenter.x - .5) < 1e-8 && Math.abs(identityCenter.y - .5) < 1e-8, 'WebGL homography preserves an identity page');

const trapezoid = {
  topLeft:{ x:.22, y:.12 },
  topRight:{ x:.78, y:.20 },
  bottomRight:{ x:.91, y:.88 },
  bottomLeft:{ x:.08, y:.80 },
};
const transform = homographyFromUnitSquareV1071(trapezoid);
for (const [label, u, v, expected] of [
  ['top-left',0,0,trapezoid.topLeft],
  ['top-right',1,0,trapezoid.topRight],
  ['bottom-right',1,1,trapezoid.bottomRight],
  ['bottom-left',0,1,trapezoid.bottomLeft],
]) {
  const actual = map(transform, u, v);
  pass(Math.abs(actual.x - expected.x) < 1e-8 && Math.abs(actual.y - expected.y) < 1e-8, `homography maps ${label} exactly`);
}

const moduleSource = read('source/src/modules/scan/lightweightDocumentEngineV1071.js');
pass(moduleSource.includes("canvas.getContext('webgl'"), 'perspective correction runs through WebGL on the device GPU');
pass(moduleSource.includes('detectPageCornersLightweightV1071'), 'post-capture paper detection has a lightweight Canvas path');
pass(moduleSource.includes('enhanceDocumentCanvasLightweightV1071'), 'readability enhancement has a lightweight local path');
pass(!moduleSource.includes('docs.opencv.org'), 'non-blocking scanner module has no remote OpenCV dependency');

const engine = read('source/src/modules/scan/documentScannerEngine.js');
pass(engine.includes('webgl-nonblocking-v1071'), 'production scanner imports the v107.1 engine');
const detection = engine.slice(engine.indexOf('export async function detectDocumentCorners'), engine.indexOf('export async function fileToImage'));
pass(detection.includes('detectPageCornersLightweightV1071'), 'production paper detection uses the lightweight engine');
pass(!detection.includes('loadDocumentVision'), 'paper detection does not wait for OpenCV');
const perspective = engine.slice(engine.indexOf('export async function perspectiveCropFile'), engine.indexOf('function rotateCanvas'));
pass(perspective.includes('warpPerspectiveWebGLV1071'), 'production straighten uses WebGL homography');
pass(!perspective.includes('loadDocumentVision'), 'straightening does not initialize OpenCV');
pass(!perspective.includes('boundingCrop'), 'straightening cannot silently return a crooked bounding crop');
const rendering = engine.slice(engine.indexOf('export async function renderDocumentFile'), engine.indexOf('export async function captureVideoFile'));
pass(rendering.includes('enhanceDocumentCanvasLightweightV1071'), 'cleaned variants use non-blocking local enhancement');
pass(!rendering.includes('loadDocumentVision'), 'enhancement does not wait for OpenCV');

const chain = read('scripts/run-v106-smart-capture.mjs');
pass(chain.includes('patch-v1071-webgl-scanner.mjs'), 'release chain installs the WebGL scanner');
pass(chain.includes('finalize-v1071-webgl-scanner.mjs'), 'release chain pins v107.1 metadata');
console.log('PASS — v107.1 Non-blocking WebGL Scanner regression suite');
