import {
  canvasToFile,
  fileToImage,
  loadDocumentVision,
} from './documentScannerEngine.js';
import { recognizeDocumentText } from './webOcr.js';
import { extractProDocumentFieldsV984 } from './smartScanExtractionV984.js';

function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function uniqueTextBlocks(values = []) {
  const out = [];
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text) continue;
    const normalized = text.replace(/\s+/g, ' ').toLowerCase();
    if (out.some(item => item.normalized === normalized)) continue;
    out.push({ text, normalized });
  }
  return out.map(item => item.text);
}

function otsuThreshold(histogram, total) {
  let totalSum = 0;
  for (let level = 0; level < 256; level += 1) totalSum += level * histogram[level];
  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestVariance = -1;
  let threshold = 160;
  for (let level = 0; level < 256; level += 1) {
    backgroundWeight += histogram[level];
    if (!backgroundWeight) continue;
    const foregroundWeight = total - backgroundWeight;
    if (!foregroundWeight) break;
    backgroundSum += level * histogram[level];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (totalSum - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * Math.pow(backgroundMean - foregroundMean, 2);
    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = level;
    }
  }
  return threshold;
}

function fallbackEnhance(canvas, mode = 'gray') {
  const context = canvas.getContext('2d', { willReadFrequently:true });
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  const histogram = new Uint32Array(256);
  let sampled = 0;
  for (let index = 0; index < data.length; index += 16) {
    const gray = Math.round((data[index] * .299) + (data[index + 1] * .587) + (data[index + 2] * .114));
    histogram[gray] += 1;
    sampled += 1;
  }
  const percentile = ratio => {
    const target = sampled * ratio;
    let seen = 0;
    for (let level = 0; level < 256; level += 1) {
      seen += histogram[level];
      if (seen >= target) return level;
    }
    return 255;
  };
  const low = percentile(.008);
  const high = Math.max(low + 24, percentile(.994));
  const range = Math.max(1, high - low);
  const stretchedHistogram = new Uint32Array(256);
  const grayValues = new Uint8ClampedArray(data.length / 4);
  for (let pixel = 0, index = 0; index < data.length; pixel += 1, index += 4) {
    const gray = (data[index] * .299) + (data[index + 1] * .587) + (data[index + 2] * .114);
    const stretched = Math.round(clamp(((gray - low) * 255) / range));
    grayValues[pixel] = stretched;
    stretchedHistogram[stretched] += 1;
  }
  const threshold = Math.max(105, Math.min(210, otsuThreshold(stretchedHistogram, grayValues.length) + 8));
  for (let pixel = 0, index = 0; index < data.length; pixel += 1, index += 4) {
    const gray = grayValues[pixel];
    const value = mode === 'bw'
      ? (gray > threshold ? 255 : 0)
      : Math.round(clamp(((gray - 128) * 1.18) + 128));
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
  }
  context.putImageData(imageData, 0, 0);
}

async function openCvEnhance(canvas, mode = 'gray') {
  const { cv } = await loadDocumentVision();
  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const blur = new cv.Mat();
  const output = new cv.Mat();
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
    cv.GaussianBlur(gray, blur, new cv.Size(3, 3), 0, 0, cv.BORDER_DEFAULT);
    if (mode === 'bw') {
      const shortSide = Math.min(canvas.width, canvas.height);
      let blockSize = Math.max(31, Math.min(61, Math.round(shortSide / 42)));
      if (blockSize % 2 === 0) blockSize += 1;
      cv.adaptiveThreshold(
        blur,
        output,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY,
        blockSize,
        13
      );
    } else {
      cv.addWeighted(gray, 1.75, blur, -0.75, 0, output);
    }
    cv.imshow(canvas, output);
  } finally {
    src.delete();
    gray.delete();
    blur.delete();
    output.delete();
  }
}

async function prepareOcrFile(file, options = {}) {
  const image = await fileToImage(file);
  const region = options.region || { x:0, y:0, width:1, height:1 };
  const sourceX = Math.max(0, Math.round(image.naturalWidth * Number(region.x || 0)));
  const sourceY = Math.max(0, Math.round(image.naturalHeight * Number(region.y || 0)));
  const sourceWidth = Math.max(1, Math.min(image.naturalWidth - sourceX, Math.round(image.naturalWidth * Number(region.width || 1))));
  const sourceHeight = Math.max(1, Math.min(image.naturalHeight - sourceY, Math.round(image.naturalHeight * Number(region.height || 1))));
  const maxDimension = Number(options.maxDimension || 3400);
  const minShortSide = Number(options.minShortSide || 1800);
  const minScale = Math.max(1, minShortSide / Math.min(sourceWidth, sourceHeight));
  const maxScale = maxDimension / Math.max(sourceWidth, sourceHeight);
  const scale = Math.max(.25, Math.min(3, minScale, maxScale));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently:true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  try {
    await openCvEnhance(canvas, options.mode || 'gray');
  } catch {
    fallbackEnhance(canvas, options.mode || 'gray');
  }
  return canvasToFile(
    canvas,
    options.name || `road-ready-ocr-${options.mode || 'gray'}-${Date.now()}.jpg`,
    'image/jpeg',
    .98
  );
}

async function runPass(file, options = {}) {
  const prepared = await prepareOcrFile(file, options);
  return recognizeDocumentText(prepared, {
    pageSegMode:String(options.pageSegMode || '6'),
    onProgress(progress, status) {
      const start = Number(options.progressStart || 0);
      const span = Number(options.progressSpan || 1);
      options.onProgress?.(
        start + (Number(progress || 0) * span),
        String(status || options.label || 'Reading document').replace(/_/g, ' ')
      );
    },
  });
}

function missingPrimaryBolFields(fields = {}) {
  return ['date','loadNo','origin','destination','poNumber'].filter(key => !fields[key]);
}

export async function recognizeDocumentTextV984(file, preferredType = 'auto', onProgress = () => {}) {
  if (!String(file?.type || '').startsWith('image/')) return null;
  const passes = [];

  onProgress(.01, 'Sharpening the full page…');
  try {
    const primary = await runPass(file, {
      mode:'gray',
      pageSegMode:'11',
      minShortSide:1850,
      maxDimension:3400,
      progressStart:.03,
      progressSpan:.38,
      onProgress,
      label:'Reading full page',
      name:`road-ready-ocr-gray-${Date.now()}.jpg`,
    });
    if (primary?.text) passes.push({ ...primary, id:'full-gray' });
  } catch {}

  const primaryText = uniqueTextBlocks(passes.map(pass => pass.text)).join('\n');
  const primaryConfidence = Math.max(0, ...passes.map(pass => Number(pass.confidence || 0)));
  const alwaysUseSecondPass = ['bol','pod','rate_confirmation','carrier_settlement'].includes(preferredType);
  if (alwaysUseSecondPass || primaryText.length < 220 || primaryConfidence < .68) {
    onProgress(.43, 'Building a high-contrast page…');
    try {
      const blackAndWhite = await runPass(file, {
        mode:'bw',
        pageSegMode:'6',
        minShortSide:1850,
        maxDimension:3400,
        progressStart:.45,
        progressSpan:.27,
        onProgress,
        label:'Reading high contrast',
        name:`road-ready-ocr-adaptive-${Date.now()}.jpg`,
      });
      if (blackAndWhite?.text) passes.push({ ...blackAndWhite, id:'full-bw' });
    } catch {}
  }

  let combined = uniqueTextBlocks(passes.map(pass => pass.text)).join('\n');
  let fields = extractProDocumentFieldsV984(combined, preferredType === 'auto' ? 'other' : preferredType);

  if (['bol','pod'].includes(preferredType)) {
    const missingTop = missingPrimaryBolFields(fields);
    if (missingTop.length >= 2) {
      onProgress(.74, 'Zooming into BOL numbers and addresses…');
      try {
        const top = await runPass(file, {
          mode:'gray',
          pageSegMode:'6',
          region:{ x:0, y:0, width:1, height:.58 },
          minShortSide:1900,
          maxDimension:3300,
          progressStart:.75,
          progressSpan:.14,
          onProgress,
          label:'Reading BOL header',
          name:`road-ready-ocr-header-${Date.now()}.jpg`,
        });
        if (top?.text) passes.push({ ...top, id:'bol-header' });
      } catch {}
    }

    combined = uniqueTextBlocks(passes.map(pass => pass.text)).join('\n');
    fields = extractProDocumentFieldsV984(combined, preferredType);
    if (!fields.checkIn || !fields.appointmentTime || !fields.checkOut) {
      onProgress(.9, 'Zooming into signatures and stop times…');
      try {
        const bottom = await runPass(file, {
          mode:'bw',
          pageSegMode:'6',
          region:{ x:0, y:.63, width:1, height:.37 },
          minShortSide:1700,
          maxDimension:3000,
          progressStart:.91,
          progressSpan:.08,
          onProgress,
          label:'Reading stop times',
          name:`road-ready-ocr-footer-${Date.now()}.jpg`,
        });
        if (bottom?.text) passes.push({ ...bottom, id:'bol-footer' });
      } catch {}
    }
  }

  const text = uniqueTextBlocks(passes.map(pass => pass.text)).join('\n').trim();
  if (!text) return null;
  const confidences = passes.map(pass => Number(pass.confidence || 0)).filter(value => value > 0);
  const confidence = confidences.length
    ? Math.min(.99, (Math.max(...confidences) * .72) + ((confidences.reduce((sum, value) => sum + value, 0) / confidences.length) * .28))
    : 0;
  onProgress(1, 'OCR passes complete');
  return {
    text,
    confidence,
    method:'web-ocr-pro',
    pageSegMode:'multi',
    passes:passes.map(pass => ({ id:pass.id, confidence:Number(pass.confidence || 0) })),
  };
}
