import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const enginePath = path.join(ROOT, 'source/src/modules/scan/documentScannerEngine.js');
let source = fs.readFileSync(enginePath, 'utf8');

const importLine = "import { enhanceDocumentCanvasV1069, warpPerspectiveCanvasV1069 } from './opencvDocumentWarpV1069.js'; // opencv-homography-v1069";
if (!source.includes(importLine)) source = `${importLine}\n${source}`;

const perspectiveReplacement = `export async function perspectiveCropFile(file, corners, options = {}) {
  const image = await fileToImage(file);
  const c = normalizeDocumentCorners(corners);
  const { cv, scanner } = await loadDocumentVision(options.onStatus);
  options.onStatus?.('Straightening document perspective…');
  try {
    const canvas = await warpPerspectiveCanvasV1069(image, c, cv);
    return canvasToFile(canvas, options.name || 'road-ready-cropped.jpg', 'image/jpeg', .97);
  } catch (opencvError) {
    try {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      const actual = {
        topLeftCorner:{ x:c.topLeft.x * width, y:c.topLeft.y * height },
        topRightCorner:{ x:c.topRight.x * width, y:c.topRight.y * height },
        bottomLeftCorner:{ x:c.bottomLeft.x * width, y:c.bottomLeft.y * height },
        bottomRightCorner:{ x:c.bottomRight.x * width, y:c.bottomRight.y * height },
      };
      const topWidth = distance(actual.topLeftCorner, actual.topRightCorner);
      const bottomWidth = distance(actual.bottomLeftCorner, actual.bottomRightCorner);
      const leftHeight = distance(actual.topLeftCorner, actual.bottomLeftCorner);
      const rightHeight = distance(actual.topRightCorner, actual.bottomRightCorner);
      const rawWidth = Math.max(topWidth, bottomWidth, 1);
      const rawHeight = Math.max(leftHeight, rightHeight, 1);
      const scale = Math.min(1.5, 2800 / Math.max(rawWidth, rawHeight));
      const outputWidth = Math.max(480, Math.round(rawWidth * scale));
      const outputHeight = Math.max(480, Math.round(rawHeight * scale));
      const canvas = scanner.extractPaper(image, outputWidth, outputHeight, actual);
      if (!canvas) throw new Error('jscanify_perspective_empty');
      return canvasToFile(canvas, options.name || 'road-ready-cropped.jpg', 'image/jpeg', .97);
    } catch (fallbackError) {
      const error = new Error('perspective_warp_failed');
      error.cause = { opencv:String(opencvError?.message || opencvError), fallback:String(fallbackError?.message || fallbackError) };
      throw error;
    }
  }
}`;

if (!source.includes('warpPerspectiveCanvasV1069(image, c, cv)')) {
  const startNeedle = 'export async function perspectiveCropFile(file, corners, options = {}) {';
  const endNeedle = '\nfunction rotateCanvas';
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (start < 0 || end < 0 || end <= start) throw new Error(`v106.9 perspective function boundaries missing start=${start} end=${end}`);
  source = `${source.slice(0, start)}${perspectiveReplacement}${source.slice(end)}`;
}

const renderReplacement = `export async function renderDocumentFile(file, options = {}) {
  const image = await fileToImage(file);
  const maxDimension = options.maxDimension || 2500;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  let canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently:true, alpha:false });
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  canvas = rotateCanvas(canvas, options.rotation || 0);
  const filter = options.filter || 'auto';
  if (filter !== 'original') {
    try {
      const { cv } = await loadDocumentVision(options.onStatus);
      const mode = filter === 'bw' ? 'bw' : filter === 'gray' ? 'gray' : 'color';
      canvas = await enhanceDocumentCanvasV1069(canvas, cv, mode);
    } catch {
      const filteredContext = canvas.getContext('2d', { willReadFrequently:true });
      const imageData = filteredContext.getImageData(0, 0, canvas.width, canvas.height);
      filteredContext.putImageData(autoContrast(imageData, filter), 0, 0);
    }
  }
  return canvasToFile(canvas, options.name || \`road-ready-\${filter}.jpg\`, 'image/jpeg', options.quality || .96);
}`;

if (!source.includes('enhanceDocumentCanvasV1069(canvas, cv, mode)')) {
  const startNeedle = 'export async function renderDocumentFile(file, options = {}) {';
  const endNeedle = '\nexport async function captureVideoFile';
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (start < 0 || end < 0 || end <= start) throw new Error(`v106.9 render function boundaries missing start=${start} end=${end}`);
  source = `${source.slice(0, start)}${renderReplacement}${source.slice(end)}`;
}

for (const marker of [
  'opencv-homography-v1069',
  'warpPerspectiveCanvasV1069(image, c, cv)',
  "throw new Error('perspective_warp_failed')",
  'enhanceDocumentCanvasV1069(canvas, cv, mode)',
]) {
  if (!source.includes(marker)) throw new Error(`v106.9 engine verification missing ${marker}`);
}
if (source.includes('const canvas = boundingCrop(image, c);')) throw new Error('v106.9 silent bounding crop fallback still present');

fs.writeFileSync(enginePath, source);
console.log('v106.9 OpenCV homography and enhancement patched');
