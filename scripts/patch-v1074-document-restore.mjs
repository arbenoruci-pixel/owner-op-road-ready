import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
const write = (relative, content) => {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
};

const restoreModule = `const clampV1074 = (value, min = 0, max = 255) => Math.max(min, Math.min(max, Number(value || 0)));

export function restorePixelV1074(input = {}) {
  const red = clampV1074(input.red);
  const green = clampV1074(input.green);
  const blue = clampV1074(input.blue);
  const background = clampV1074(input.background, 24, 255);
  const soft = clampV1074(input.soft, 0, 255);
  const mode = input.mode || 'color';
  const luminance = red * .299 + green * .587 + blue * .114;
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
  const inkDepth = Math.max(0, background - luminance);
  const highlight = Math.max(0, luminance - background);
  const detail = luminance - soft;
  let value = 246 - (inkDepth * 2.18) + (highlight * .18) + (detail * 1.08);
  if (inkDepth < 9 && chroma < 36) value = Math.max(value, 243 + (highlight * .12));
  if (inkDepth > 26) value -= Math.min(24, (inkDepth - 26) * .32);
  value = clampV1074(value, 5, 250);

  if (mode === 'bw') {
    const threshold = background - Math.max(13, Math.min(30, background * .085));
    const binary = luminance < threshold || inkDepth > 18 ? 0 : 255;
    return { red:binary, green:binary, blue:binary, value:binary };
  }
  if (mode === 'gray') return { red:value, green:value, blue:value, value };

  const coloredMark = chroma > 24 && inkDepth > 12;
  const saturation = coloredMark ? .92 : chroma > 10 && inkDepth > 14 ? .50 : .18;
  const redDelta = red - luminance;
  const greenDelta = green - luminance;
  const blueDelta = blue - luminance;
  return {
    red:clampV1074(value + redDelta * saturation),
    green:clampV1074(value + greenDelta * saturation),
    blue:clampV1074(value + blueDelta * saturation),
    value,
  };
}

function canvasFromV1074(source, maxDimension = 2400) {
  const width = Number(source?.width || source?.naturalWidth || 0);
  const height = Number(source?.height || source?.naturalHeight || 0);
  if (!width || !height) throw new Error('restore_source_dimensions_missing');
  const scale = Math.min(1, Math.max(800, Number(maxDimension || 2400)) / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d', { alpha:false, willReadFrequently:true });
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function expandedMapV1074(source, divisor, blurPx = 0) {
  const small = document.createElement('canvas');
  small.width = Math.max(24, Math.round(source.width / divisor));
  small.height = Math.max(24, Math.round(source.height / divisor));
  const smallContext = small.getContext('2d', { alpha:false });
  smallContext.imageSmoothingEnabled = true;
  smallContext.imageSmoothingQuality = 'high';
  smallContext.drawImage(source, 0, 0, small.width, small.height);
  const output = document.createElement('canvas');
  output.width = source.width;
  output.height = source.height;
  const context = output.getContext('2d', { alpha:false, willReadFrequently:true });
  context.fillStyle = '#fff';
  context.fillRect(0, 0, output.width, output.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  if (blurPx > 0 && 'filter' in context) context.filter = `blur(${blurPx}px)`;
  context.drawImage(small, 0, 0, output.width, output.height);
  context.filter = 'none';
  return context.getImageData(0, 0, output.width, output.height).data;
}

function whiteBalanceV1074(data) {
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  const stride = 4 * 13;
  for (let index = 0; index < data.length; index += stride) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const luminance = r * .299 + g * .587 + b * .114;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (luminance < 145 || chroma > 48) continue;
    red += r;
    green += g;
    blue += b;
    count += 1;
  }
  if (!count) return { red:1, green:1, blue:1 };
  const averageRed = red / count;
  const averageGreen = green / count;
  const averageBlue = blue / count;
  const neutral = (averageRed + averageGreen + averageBlue) / 3;
  return {
    red:Math.max(.78, Math.min(1.25, neutral / Math.max(1, averageRed))),
    green:Math.max(.78, Math.min(1.25, neutral / Math.max(1, averageGreen))),
    blue:Math.max(.78, Math.min(1.25, neutral / Math.max(1, averageBlue))),
  };
}

function borderWhitenV1074(data, width, height) {
  const borderX = Math.max(2, Math.round(width * .006));
  const borderY = Math.max(2, Math.round(height * .006));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= borderX && x < width - borderX && y >= borderY && y < height - borderY) continue;
      const index = (y * width + x) * 4;
      const luminance = data[index] * .299 + data[index + 1] * .587 + data[index + 2] * .114;
      if (luminance < 175) continue;
      data[index] = Math.max(data[index], 245);
      data[index + 1] = Math.max(data[index + 1], 245);
      data[index + 2] = Math.max(data[index + 2], 245);
    }
  }
}

export async function restoreDocumentCanvasV1074(source, mode = 'color', options = {}) {
  const canvas = canvasFromV1074(source, options.maxDimension || 2400);
  const context = canvas.getContext('2d', { alpha:false, willReadFrequently:true });
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const background = expandedMapV1074(canvas, 34, 12);
  const soft = expandedMapV1074(canvas, 5, 0);
  const balance = whiteBalanceV1074(data);

  for (let index = 0; index < data.length; index += 4) {
    const red = clampV1074(data[index] * balance.red);
    const green = clampV1074(data[index + 1] * balance.green);
    const blue = clampV1074(data[index + 2] * balance.blue);
    const backgroundLuminance = Math.max(30, background[index] * .299 + background[index + 1] * .587 + background[index + 2] * .114);
    const softLuminance = soft[index] * .299 + soft[index + 1] * .587 + soft[index + 2] * .114;
    const restored = restorePixelV1074({ red, green, blue, background:backgroundLuminance, soft:softLuminance, mode });
    data[index] = restored.red;
    data[index + 1] = restored.green;
    data[index + 2] = restored.blue;
    data[index + 3] = 255;
  }
  borderWhitenV1074(data, canvas.width, canvas.height);
  context.putImageData(image, 0, 0);
  return canvas;
}

export function documentRestoreProfileV1074() {
  return Object.freeze({
    version:'107.4.0',
    perspectiveInputRequired:true,
    paperWhitening:'multi-scale-illumination',
    textEnhancement:'local-detail-unsharp',
    handwritingPreservation:'chroma-aware',
    networkRequired:false,
    generative:false,
  });
}
`;
write('source/src/modules/scan/documentRestoreEngineV1074.js', restoreModule);

const enginePath = 'source/src/modules/scan/documentScannerEngine.js';
let engine = read(enginePath);
const importLine = "import { restoreDocumentCanvasV1074 } from './documentRestoreEngineV1074.js'; // document-restore-v1074";
if (!engine.includes(importLine)) engine = `${importLine}\n${engine}`;
engine = engine.replace(
  "canvas = await enhanceDocumentCanvasLightweightV1071(canvas, mode);",
  "canvas = await restoreDocumentCanvasV1074(canvas, mode, { maxDimension:options.maxDimension || 2400 });",
);
if (!engine.includes('document-restore-v1074') || !engine.includes('restoreDocumentCanvasV1074(canvas, mode')) {
  throw new Error('v107.4 production restore integration missing');
}
write(enginePath, engine);

const adapterPath = 'source/src/modules/scan/webScannerAdapterV106.js';
let adapter = read(adapterPath);
adapter = adapter.replace(
  "renderDocumentFile(corrected, { filter:'color', maxDimension:2800, name:`road-ready-clean-color-${Date.now()}.jpg` })",
  "renderDocumentFile(corrected, { filter:'color', maxDimension:2400, quality:.985, name:`road-ready-document-restore-${Date.now()}.jpg` })",
);
if (!adapter.includes('road-ready-document-restore-')) throw new Error('v107.4 restored visible variant missing');
write(adapterPath, adapter);

console.log('v107.4 Document Restore engine patched');
