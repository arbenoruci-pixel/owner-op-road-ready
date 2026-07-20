import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pass = (condition, label) => {
  assert.ok(condition, label);
  console.log(`PASS ${label}`);
};
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const opencvPath = path.join(ROOT, 'public/vendor/opencv-4.10.0.js');
const jscanifyPath = path.join(ROOT, 'public/vendor/jscanify-1.4.0.min.js');
pass(fs.existsSync(opencvPath) && fs.statSync(opencvPath).size > 7_000_000, 'OpenCV runtime is vendored into the production build');
pass(fs.existsSync(jscanifyPath) && fs.statSync(jscanifyPath).size > 5_000, 'jscanify helper is vendored into the production build');

const engine = read('source/src/modules/scan/documentScannerEngine.js');
pass(engine.includes("'/vendor/opencv-4.10.0.js?v=1070'"), 'local OpenCV runtime is the first loader source');
pass(engine.includes("'/vendor/jscanify-1.4.0.min.js?v=1070'"), 'local jscanify runtime is the first loader source');
pass(engine.includes('loadOpenCvFromSources'), 'OpenCV loader can try multiple sources');
pass(engine.includes('loadJscanifyFromSources'), 'perspective helper can try multiple sources');
pass(engine.includes('clearFailedVisionScript'), 'failed runtime scripts are cleared before retry');
pass(!engine.includes('await loadScript(OPENCV_URL,'), 'single docs.opencv.org dependency is removed');
pass(engine.indexOf("'/vendor/opencv-4.10.0.js?v=1070'") < engine.indexOf("'https://docs.opencv.org/4.10.0/opencv.js'"), 'local runtime is attempted before remote mirrors');
pass(engine.includes('warpPerspectiveCanvasV1069'), 'real OpenCV homography remains active');

const run = read('scripts/run-v106-smart-capture.mjs');
pass(run.includes("prepare-v1070-local-vision.mjs"), 'release chain vendors the vision runtime before build');
pass(run.includes("patch-v1070-local-vision-loader.mjs"), 'release chain installs the local-first loader');
pass(run.includes("finalize-v1070-local-vision.mjs"), 'release chain pins v107.0 metadata');

const version = read('public/app-version.json');
pass(version.includes('107.0.0'), 'v107.0 release metadata is written');
console.log('PASS — v107.0 Local Vision Runtime regression suite');
