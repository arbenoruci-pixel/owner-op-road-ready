const OPENCV_URL = 'https://docs.opencv.org/4.10.0/opencv.js';
const JSCANIFY_URL = 'https://cdn.jsdelivr.net/gh/puffinsoft/jscanify@v1.4.0/src/jscanify.min.js';

const DEFAULT_CORNERS = {
  topLeft:{ x:0.055, y:0.055 },
  topRight:{ x:0.945, y:0.055 },
  bottomLeft:{ x:0.055, y:0.945 },
  bottomRight:{ x:0.945, y:0.945 },
};

let visionPromise = null;

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function distance(a, b) {
  return Math.hypot(Number(a?.x || 0) - Number(b?.x || 0), Number(a?.y || 0) - Number(b?.y || 0));
}

function sourceSize(source) {
  return {
    width:Number(source?.videoWidth || source?.naturalWidth || source?.width || 0),
    height:Number(source?.videoHeight || source?.naturalHeight || source?.height || 0),
  };
}

function loadScript(src, ready) {
  if (typeof window === 'undefined') return Promise.reject(new Error('browser_required'));
  if (ready?.()) return Promise.resolve();
  window.__roadReadyScriptPromises ||= {};
  if (window.__roadReadyScriptPromises[src]) return window.__roadReadyScriptPromises[src];
  window.__roadReadyScriptPromises[src] = new Promise((resolve, reject) => {
    const existing = [...document.scripts].find(script => script.src === src);
    const done = () => {
      const startedAt = Date.now();
      const check = () => {
        if (ready?.()) return resolve();
        if (Date.now() - startedAt > 35_000) return reject(new Error(`script_not_ready:${src}`));
        setTimeout(check, 80);
      };
      check();
    };
    if (existing) {
      existing.addEventListener('load', done, { once:true });
      existing.addEventListener('error', () => reject(new Error(`script_load_failed:${src}`)), { once:true });
      done();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = done;
    script.onerror = () => reject(new Error(`script_load_failed:${src}`));
    document.head.appendChild(script);
  });
  return window.__roadReadyScriptPromises[src];
}

async function waitForOpenCv() {
  let cv = window.cv;
  if (cv && typeof cv.then === 'function') cv = await cv;
  if (cv?.Mat) {
    window.cv = cv;
    return cv;
  }
  await new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = async () => {
      try {
        let candidate = window.cv;
        if (candidate && typeof candidate.then === 'function') candidate = await candidate;
        if (candidate?.Mat) {
          window.cv = candidate;
          resolve();
          return;
        }
      } catch {}
      if (Date.now() - startedAt > 35_000) {
        reject(new Error('opencv_runtime_timeout'));
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
  return window.cv;
}

export async function loadDocumentVision(onStatus = () => {}) {
  if (typeof window === 'undefined') throw new Error('browser_required');
  if (window.cv?.Mat && window.jscanify) return { cv:window.cv, scanner:new window.jscanify() };
  if (!visionPromise) {
    visionPromise = (async () => {
      onStatus('Loading smart edges…');
      await loadScript(OPENCV_URL, () => Boolean(window.cv));
      const cv = await waitForOpenCv();
      onStatus('Loading perspective correction…');
      await loadScript(JSCANIFY_URL, () => Boolean(window.jscanify));
      if (!window.jscanify) throw new Error('jscanify_unavailable');
      onStatus('Smart edges ready');
      return { cv, scanner:new window.jscanify() };
    })().catch(error => {
      visionPromise = null;
      throw error;
    });
  }
  return visionPromise;
}

export function defaultDocumentCorners() {
  return JSON.parse(JSON.stringify(DEFAULT_CORNERS));
}

export function normalizeDocumentCorners(value = {}) {
  const fallback = defaultDocumentCorners();
  return {
    topLeft:{ x:clamp(value.topLeft?.x ?? fallback.topLeft.x), y:clamp(value.topLeft?.y ?? fallback.topLeft.y) },
    topRight:{ x:clamp(value.topRight?.x ?? fallback.topRight.x), y:clamp(value.topRight?.y ?? fallback.topRight.y) },
    bottomLeft:{ x:clamp(value.bottomLeft?.x ?? fallback.bottomLeft.x), y:clamp(value.bottomLeft?.y ?? fallback.bottomLeft.y) },
    bottomRight:{ x:clamp(value.bottomRight?.x ?? fallback.bottomRight.x), y:clamp(value.bottomRight?.y ?? fallback.bottomRight.y) },
  };
}

export function documentPolygonArea(corners = DEFAULT_CORNERS) {
  const c = normalizeDocumentCorners(corners);
  const points = [c.topLeft, c.topRight, c.bottomRight, c.bottomLeft];
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    sum += (a.x * b.y) - (b.x * a.y);
  }
  return Math.abs(sum) / 2;
}

export function cornerDelta(a, b) {
  if (!a || !b) return 1;
  const keys = ['topLeft','topRight','bottomLeft','bottomRight'];
  return keys.reduce((sum, key) => sum + distance(a[key], b[key]), 0) / keys.length;
}

export function drawVideoSample(video, maxWidth = 520) {
  const { width, height } = sourceSize(video);
  if (!width || !height) return null;
  const scale = Math.min(1, maxWidth / width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d', { willReadFrequently:true });
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function assessDocumentFrame(canvas) {
  if (!canvas) return { brightness:0, contrast:0, sharpness:0, glare:0, hint:'Point the camera at the document', good:false };
  const context = canvas.getContext('2d', { willReadFrequently:true });
  const { width, height } = canvas;
  const data = context.getImageData(0, 0, width, height).data;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 180));
  const rowStride = width * 4;
  let count = 0;
  let sum = 0;
  let sumSq = 0;
  let glare = 0;
  let gradient = 0;
  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const index = (y * width + x) * 4;
      const gray = (data[index] * .299) + (data[index + 1] * .587) + (data[index + 2] * .114);
      const rightIndex = index + (step * 4);
      const downIndex = index + (step * rowStride);
      const right = (data[rightIndex] * .299) + (data[rightIndex + 1] * .587) + (data[rightIndex + 2] * .114);
      const down = (data[downIndex] * .299) + (data[downIndex + 1] * .587) + (data[downIndex + 2] * .114);
      sum += gray;
      sumSq += gray * gray;
      gradient += Math.abs(gray - right) + Math.abs(gray - down);
      if (gray > 246) glare += 1;
      count += 1;
    }
  }
  const brightness = count ? sum / count : 0;
  const contrast = count ? Math.sqrt(Math.max(0, (sumSq / count) - (brightness * brightness))) : 0;
  const sharpness = count ? gradient / (count * 2) : 0;
  const glareRatio = count ? glare / count : 0;
  let hint = 'Hold steady';
  if (brightness < 55) hint = 'More light needed';
  else if (brightness > 225 || glareRatio > .11) hint = 'Reduce glare';
  else if (sharpness < 10) hint = 'Move closer and hold steady';
  else if (contrast < 24) hint = 'Use a darker background';
  else hint = 'Document ready';
  return {
    brightness,
    contrast,
    sharpness,
    glare:glareRatio,
    hint,
    good:brightness >= 55 && brightness <= 225 && glareRatio <= .11 && sharpness >= 10 && contrast >= 24,
  };
}

function scaledCanvas(source, maxDimension = 1100) {
  const { width, height } = sourceSize(source);
  if (!width || !height) throw new Error('source_dimensions_missing');
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return { canvas, scale, width, height };
}

function validDetectedCorners(corners, width, height) {
  if (!corners) return null;
  const normalized = normalizeDocumentCorners({
    topLeft:{ x:corners.topLeftCorner?.x / width, y:corners.topLeftCorner?.y / height },
    topRight:{ x:corners.topRightCorner?.x / width, y:corners.topRightCorner?.y / height },
    bottomLeft:{ x:corners.bottomLeftCorner?.x / width, y:corners.bottomLeftCorner?.y / height },
    bottomRight:{ x:corners.bottomRightCorner?.x / width, y:corners.bottomRightCorner?.y / height },
  });
  const finite = Object.values(normalized).every(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!finite || documentPolygonArea(normalized) < .10) return null;
  return normalized;
}

export async function detectDocumentCorners(source, options = {}) {
  const { scanner, cv } = await loadDocumentVision(options.onStatus);
  const { canvas } = scaledCanvas(source, options.maxDimension || 1000);
  const mat = cv.imread(canvas);
  let contour = null;
  try {
    contour = scanner.findPaperContour(mat);
    if (!contour) return null;
    const corners = scanner.getCornerPoints(contour, mat);
    return validDetectedCorners(corners, canvas.width, canvas.height);
  } finally {
    try { contour?.delete?.(); } catch {}
    try { mat.delete(); } catch {}
  }
}

export async function fileToImage(file) {
  if (!file) throw new Error('file_required');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return image;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function canvasToBlob(canvas, type = 'image/jpeg', quality = .94) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('canvas_encode_failed')), type, quality);
  });
}

export async function canvasToFile(canvas, name = 'road-ready-scan.jpg', type = 'image/jpeg', quality = .94) {
  const blob = await canvasToBlob(canvas, type, quality);
  return new File([blob], name, { type, lastModified:Date.now() });
}

function boundingCrop(image, corners) {
  const c = normalizeDocumentCorners(corners);
  const points = Object.values(c);
  const minX = Math.min(...points.map(point => point.x));
  const maxX = Math.max(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));
  const maxY = Math.max(...points.map(point => point.y));
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  const sx = Math.round(minX * sourceWidth);
  const sy = Math.round(minY * sourceHeight);
  const sw = Math.max(1, Math.round((maxX - minX) * sourceWidth));
  const sh = Math.max(1, Math.round((maxY - minY) * sourceHeight));
  const scale = Math.min(1, 2300 / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  canvas.getContext('2d').drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function perspectiveCropFile(file, corners, options = {}) {
  const image = await fileToImage(file);
  const c = normalizeDocumentCorners(corners);
  try {
    const { scanner } = await loadDocumentVision(options.onStatus);
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
    const scale = Math.min(1.35, 2300 / Math.max(rawWidth, rawHeight));
    const outputWidth = Math.max(900, Math.round(rawWidth * scale));
    const outputHeight = Math.max(1100, Math.round(rawHeight * scale));
    const canvas = scanner.extractPaper(image, outputWidth, outputHeight, actual);
    if (!canvas) throw new Error('paper_extract_failed');
    return canvasToFile(canvas, options.name || 'road-ready-cropped.jpg');
  } catch {
    const canvas = boundingCrop(image, c);
    return canvasToFile(canvas, options.name || 'road-ready-cropped.jpg');
  }
}

function rotateCanvas(source, rotation = 0) {
  const normalized = ((Number(rotation || 0) % 360) + 360) % 360;
  if (!normalized) return source;
  const swap = normalized === 90 || normalized === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? source.height : source.width;
  canvas.height = swap ? source.width : source.height;
  const context = canvas.getContext('2d');
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((normalized * Math.PI) / 180);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

function percentile(histogram, total, ratio) {
  const target = total * ratio;
  let seen = 0;
  for (let index = 0; index < histogram.length; index += 1) {
    seen += histogram[index];
    if (seen >= target) return index;
  }
  return 255;
}

function autoContrast(imageData, mode = 'auto') {
  const { data } = imageData;
  const histogram = new Uint32Array(256);
  let saturationSum = 0;
  let count = 0;
  for (let index = 0; index < data.length; index += 16) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const gray = Math.round((red * .299) + (green * .587) + (blue * .114));
    histogram[gray] += 1;
    saturationSum += Math.max(red, green, blue) - Math.min(red, green, blue);
    count += 1;
  }
  const low = percentile(histogram, count, .012);
  const high = Math.max(low + 28, percentile(histogram, count, .988));
  const range = Math.max(1, high - low);
  const averageSaturation = count ? saturationSum / count : 0;
  const effectiveMode = mode === 'auto' ? (averageSaturation > 23 ? 'color' : 'gray') : mode;

  if (effectiveMode === 'bw') {
    const grayValues = new Uint8ClampedArray(data.length / 4);
    const bwHistogram = new Uint32Array(256);
    for (let pixel = 0, index = 0; index < data.length; pixel += 1, index += 4) {
      const gray = clamp((((data[index] * .299) + (data[index + 1] * .587) + (data[index + 2] * .114)) - low) * 255 / range, 0, 255);
      grayValues[pixel] = gray;
      bwHistogram[Math.round(gray)] += 1;
    }
    const total = grayValues.length;
    let sum = 0;
    for (let level = 0; level < 256; level += 1) sum += level * bwHistogram[level];
    let background = 0;
    let backgroundWeight = 0;
    let bestVariance = -1;
    let threshold = 160;
    for (let level = 0; level < 256; level += 1) {
      backgroundWeight += bwHistogram[level];
      if (!backgroundWeight) continue;
      const foregroundWeight = total - backgroundWeight;
      if (!foregroundWeight) break;
      background += level * bwHistogram[level];
      const meanBackground = background / backgroundWeight;
      const meanForeground = (sum - background) / foregroundWeight;
      const variance = backgroundWeight * foregroundWeight * Math.pow(meanBackground - meanForeground, 2);
      if (variance > bestVariance) {
        bestVariance = variance;
        threshold = level;
      }
    }
    threshold = Math.max(105, Math.min(205, threshold + 10));
    for (let pixel = 0, index = 0; index < data.length; pixel += 1, index += 4) {
      const value = grayValues[pixel] > threshold ? 255 : 0;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
    }
    return imageData;
  }

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const gray = (red * .299) + (green * .587) + (blue * .114);
    const mapped = clamp((gray - low) * 255 / range, 0, 255);
    if (effectiveMode === 'gray') {
      const value = Math.round(mapped);
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      continue;
    }
    const factor = gray > 1 ? mapped / gray : 1;
    data[index] = clamp(((red * factor) - 128) * 1.06 + 128, 0, 255);
    data[index + 1] = clamp(((green * factor) - 128) * 1.06 + 128, 0, 255);
    data[index + 2] = clamp(((blue * factor) - 128) * 1.06 + 128, 0, 255);
  }
  return imageData;
}

export async function renderDocumentFile(file, options = {}) {
  const image = await fileToImage(file);
  const maxDimension = options.maxDimension || 2500;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  let canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently:true });
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  canvas = rotateCanvas(canvas, options.rotation || 0);
  const filter = options.filter || 'auto';
  if (filter !== 'original') {
    const filteredContext = canvas.getContext('2d', { willReadFrequently:true });
    const imageData = filteredContext.getImageData(0, 0, canvas.width, canvas.height);
    filteredContext.putImageData(autoContrast(imageData, filter), 0, 0);
  }
  return canvasToFile(canvas, options.name || `road-ready-${filter}.jpg`, 'image/jpeg', options.quality || .94);
}

export async function captureVideoFile(video, track, name = `road-ready-page-${Date.now()}.jpg`) {
  if (typeof window !== 'undefined' && typeof window.ImageCapture === 'function' && track) {
    try {
      const imageCapture = new window.ImageCapture(track);
      const blob = await imageCapture.takePhoto();
      if (blob?.size) return new File([blob], name, { type:blob.type || 'image/jpeg', lastModified:Date.now() });
    } catch {}
  }
  const { width, height } = sourceSize(video);
  if (!width || !height) throw new Error('camera_not_ready');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(video, 0, 0, width, height);
  return canvasToFile(canvas, name);
}

export async function composePageFiles(files = [], name = `road-ready-scan-${Date.now()}.jpg`) {
  const pages = (files || []).filter(Boolean);
  if (!pages.length) throw new Error('pages_required');
  if (pages.length === 1) return new File([pages[0]], name, { type:pages[0].type || 'image/jpeg', lastModified:Date.now() });
  const images = await Promise.all(pages.map(fileToImage));
  const targetWidth = Math.min(1900, Math.max(...images.map(image => image.naturalWidth)));
  const separator = 24;
  let heights = images.map(image => Math.round(image.naturalHeight * (targetWidth / image.naturalWidth)));
  const rawHeight = heights.reduce((sum, height) => sum + height, 0) + separator * (images.length - 1);
  const overallScale = Math.min(1, 14_000 / rawHeight);
  const width = Math.max(1, Math.round(targetWidth * overallScale));
  heights = images.map(image => Math.round(image.naturalHeight * (width / image.naturalWidth)));
  const totalHeight = heights.reduce((sum, height) => sum + height, 0) + separator * (images.length - 1);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = totalHeight;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, totalHeight);
  let y = 0;
  images.forEach((image, index) => {
    context.drawImage(image, 0, y, width, heights[index]);
    y += heights[index];
    if (index < images.length - 1) {
      context.fillStyle = '#d1d5db';
      context.fillRect(0, y, width, separator);
      y += separator;
    }
  });
  return canvasToFile(canvas, name, 'image/jpeg', .92);
}

export async function setTrackTorch(track, enabled) {
  if (!track?.applyConstraints) return false;
  try {
    await track.applyConstraints({ advanced:[{ torch:Boolean(enabled) }] });
    return true;
  } catch {
    return false;
  }
}

function base64ToFile(value, name, type = 'image/jpeg') {
  const raw = String(value || '').replace(/^data:[^,]+,/, '');
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], name, { type, lastModified:Date.now() });
}

export async function filesFromNativeScan(result = {}) {
  const inputs = Array.isArray(result.files) ? result.files : Array.isArray(result.pages) ? result.pages : [];
  const files = [];
  for (let index = 0; index < inputs.length; index += 1) {
    const item = inputs[index];
    if (item instanceof File) files.push(item);
    else if (item instanceof Blob) files.push(new File([item], `native-scan-${index + 1}.jpg`, { type:item.type || 'image/jpeg' }));
    else if (item?.base64 || typeof item === 'string') files.push(base64ToFile(item?.base64 || item, item?.fileName || `native-scan-${index + 1}.jpg`, item?.mimeType || 'image/jpeg'));
  }
  if (!files.length && result.pdfBase64) files.push(base64ToFile(result.pdfBase64, result.fileName || 'road-ready-scan.pdf', 'application/pdf'));
  return files;
}
