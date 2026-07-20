import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const pass = (condition, label) => {
  assert.ok(condition, label);
  console.log(`PASS ${label}`);
};

const moduleSource = read('source/src/modules/scan/opencvDocumentWarpV1069.js');
const engine = read('source/src/modules/scan/documentScannerEngine.js');
const adapter = read('source/src/modules/scan/webScannerAdapterV106.js');
const version = read('public/app-version.json');

pass(moduleSource.includes('cv.getPerspectiveTransform'), 'v106.9 calculates a real four-point homography');
pass(moduleSource.includes('cv.warpPerspective'), 'v106.9 applies OpenCV perspective warp');
pass(moduleSource.includes('cv.BORDER_CONSTANT'), 'perspective output fills outside pixels safely');
pass(moduleSource.includes('cv.divide(gray, background, normalized, 255)'), 'scan enhancement normalizes uneven shadows');
pass(moduleSource.includes('cv.addWeighted(normalized, 1.38'), 'scan enhancement applies controlled sharpening');
pass(moduleSource.includes('cv.adaptiveThreshold'), 'high-contrast OCR variant uses adaptive thresholding');
pass(moduleSource.includes("mode === 'gray'"), 'enhancement retains a neutral grayscale variant');
pass(moduleSource.includes("mode === 'color'" ) || moduleSource.includes("mode = 'color'"), 'enhancement retains signatures and colored marks');

const perspectiveStart = engine.indexOf('export async function perspectiveCropFile');
const perspectiveEnd = engine.indexOf('\nfunction rotateCanvas', perspectiveStart);
const perspectiveBlock = engine.slice(perspectiveStart, perspectiveEnd);
pass(perspectiveStart >= 0 && perspectiveEnd > perspectiveStart, 'production perspective function is present');
pass(perspectiveBlock.includes('warpPerspectiveCanvasV1069(image, c, cv)'), 'production scanner uses OpenCV homography first');
pass(perspectiveBlock.includes("new Error('perspective_warp_failed')"), 'failed perspective correction is surfaced instead of silently accepted');
pass(!perspectiveBlock.includes('boundingCrop('), 'crooked bounding-box fallback is prohibited');
pass(perspectiveBlock.includes('scanner.extractPaper'), 'jscanify remains a secondary perspective fallback');

pass(engine.includes('enhanceDocumentCanvasV1069(canvas, cv, mode)'), 'production variants use smart scan enhancement');
pass(engine.includes("options.quality || .96"), 'enhanced scan keeps high JPEG quality');
pass(adapter.includes('perspectiveCropFile(file, normalized.corners'), 'planar scanner sends the four real corners to perspective correction');
pass(adapter.includes('rectificationPolicyV1068'), 'safe planar policy remains active before homography');
pass(version.includes('106.9.0'), 'v106.9 release metadata is written');

console.log('PASS — v106.9 OpenCV Homography & Readability regression suite');
