import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, 'source/src/modules/scan/documentScannerEngine.js');
let source = fs.readFileSync(target, 'utf8');

const importLine = "import { detectPageCornersLightweightV1071, enhanceDocumentCanvasLightweightV1071, warpPerspectiveWebGLV1071 } from './lightweightDocumentEngineV1071.js'; // webgl-nonblocking-v1071";
if (!source.includes(importLine)) source = `${importLine}\n${source}`;

function replaceFunction(startNeedle, endNeedle, replacement, label) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (start < 0 || end < 0 || end <= start) throw new Error(`v107.1 missing ${label} boundaries start=${start} end=${end}`);
  source = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

const detectReplacement = `export async function detectDocumentCorners(source, options = {}) {
  try {
    return await detectPageCornersLightweightV1071(source, {
      ...options,
      onStatus:message => options.onStatus?.(message),
    });
  } catch (error) {
    options.onStatus?.('Paper detection needs manual adjustment');
    return null;
  }
}`;
replaceFunction(
  'export async function detectDocumentCorners(source, options = {}) {',
  '\nexport async function fileToImage',
  detectReplacement,
  'lightweight detector',
);

const perspectiveReplacement = `export async function perspectiveCropFile(file, corners, options = {}) {
  const image = await fileToImage(file);
  const normalized = normalizeDocumentCorners(corners);
  options.onStatus?.('Straightening page…');
  try {
    const canvas = await warpPerspectiveWebGLV1071(image, normalized);
    return canvasToFile(canvas, options.name || 'road-ready-cropped.jpg', 'image/jpeg', .97);
  } catch (webglError) {
    const error = new Error('webgl_perspective_failed');
    error.cause = String(webglError?.message || webglError);
    throw error;
  }
}`;
replaceFunction(
  'export async function perspectiveCropFile(file, corners, options = {}) {',
  '\nfunction rotateCanvas',
  perspectiveReplacement,
  'WebGL perspective function',
);

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
    options.onStatus?.('Enhancing readability…');
    const mode = filter === 'bw' ? 'bw' : filter === 'gray' ? 'gray' : 'color';
    canvas = await enhanceDocumentCanvasLightweightV1071(canvas, mode);
  }
  return canvasToFile(canvas, options.name || \`road-ready-\${filter}.jpg\`, 'image/jpeg', options.quality || .96);
}`;
replaceFunction(
  'export async function renderDocumentFile(file, options = {}) {',
  '\nexport async function captureVideoFile',
  renderReplacement,
  'lightweight enhancement function',
);

for (const marker of [
  'webgl-nonblocking-v1071',
  'detectPageCornersLightweightV1071(source',
  'warpPerspectiveWebGLV1071(image, normalized)',
  'enhanceDocumentCanvasLightweightV1071(canvas, mode)',
]) {
  if (!source.includes(marker)) throw new Error(`v107.1 missing ${marker}`);
}

const detectBlock = source.slice(
  source.indexOf('export async function detectDocumentCorners'),
  source.indexOf('export async function fileToImage'),
);
if (detectBlock.includes('loadDocumentVision')) throw new Error('v107.1 detector still blocks on OpenCV');
const perspectiveBlock = source.slice(
  source.indexOf('export async function perspectiveCropFile'),
  source.indexOf('function rotateCanvas'),
);
if (perspectiveBlock.includes('loadDocumentVision') || perspectiveBlock.includes('boundingCrop')) throw new Error('v107.1 perspective still uses blocking legacy engine');

fs.writeFileSync(target, source);
console.log('v107.1 non-blocking WebGL scanner patched');
