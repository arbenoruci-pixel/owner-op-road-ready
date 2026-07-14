const DEFAULT_CORNERS = [
  { x:0.055, y:0.055 },
  { x:0.945, y:0.055 },
  { x:0.945, y:0.945 },
  { x:0.055, y:0.945 },
];

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function distance(a, b) {
  return Math.hypot(Number(a.x || 0) - Number(b.x || 0), Number(a.y || 0) - Number(b.y || 0));
}

function normalizeCorners(value = DEFAULT_CORNERS) {
  const input = Array.isArray(value) && value.length === 4 ? value : DEFAULT_CORNERS;
  const points = input.map(point => ({ x:clamp(point?.x, 0.002, 0.998), y:clamp(point?.y, 0.002, 0.998) }));
  const [tl, tr, br, bl] = points;
  const minGap = 0.04;
  tr.x = Math.max(tr.x, tl.x + minGap);
  br.x = Math.max(br.x, bl.x + minGap);
  bl.y = Math.max(bl.y, tl.y + minGap);
  br.y = Math.max(br.y, tr.y + minGap);
  return [tl, tr, br, bl];
}

function canvasBlob(canvas, type = 'image/jpeg', quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('canvas_blob_failed')), type, quality);
  });
}

async function loadImageSource(file) {
  if (!file) throw new Error('scan_file_required');
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation:'from-image' });
      return { image:bitmap, width:bitmap.width, height:bitmap.height, close:() => bitmap.close?.() };
    } catch {
      try {
        const bitmap = await createImageBitmap(file);
        return { image:bitmap, width:bitmap.width, height:bitmap.height, close:() => bitmap.close?.() };
      } catch {}
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error('image_decode_failed'));
      next.src = url;
    });
    return { image, width:image.naturalWidth, height:image.naturalHeight, close:() => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function renderImageCanvas(file, { rotation = 0, maxEdge = 2200 } = {}) {
  const source = await loadImageSource(file);
  try {
    const normalizedRotation = ((Number(rotation || 0) % 360) + 360) % 360;
    const scale = Math.min(1, Math.max(480, Number(maxEdge || 2200)) / Math.max(source.width, source.height));
    const drawWidth = Math.max(1, Math.round(source.width * scale));
    const drawHeight = Math.max(1, Math.round(source.height * scale));
    const swap = normalizedRotation === 90 || normalizedRotation === 270;
    const canvas = document.createElement('canvas');
    canvas.width = swap ? drawHeight : drawWidth;
    canvas.height = swap ? drawWidth : drawHeight;
    const ctx = canvas.getContext('2d', { alpha:false, willReadFrequently:true });
    if (!ctx) throw new Error('canvas_context_unavailable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(normalizedRotation * Math.PI / 180);
    ctx.drawImage(source.image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();
    return canvas;
  } finally {
    source.close();
  }
}

function sampledImageData(canvas, maxEdge = 360) {
  const scale = Math.min(1, maxEdge / Math.max(canvas.width, canvas.height));
  const width = Math.max(48, Math.round(canvas.width * scale));
  const height = Math.max(48, Math.round(canvas.height * scale));
  const sample = document.createElement('canvas');
  sample.width = width;
  sample.height = height;
  const ctx = sample.getContext('2d', { alpha:false, willReadFrequently:true });
  ctx.drawImage(canvas, 0, 0, width, height);
  return { width, height, image:ctx.getImageData(0, 0, width, height) };
}

function averagePatch(data, width, height, x0, y0, size) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  const startX = Math.max(0, Math.round(x0));
  const startY = Math.max(0, Math.round(y0));
  const endX = Math.min(width, startX + size);
  const endY = Math.min(height, startY + size);
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const index = (y * width + x) * 4;
      r += data[index];
      g += data[index + 1];
      b += data[index + 2];
      count += 1;
    }
  }
  return count ? [r / count, g / count, b / count] : [245, 245, 245];
}

function colorDistance(data, index, color) {
  const dr = data[index] - color[0];
  const dg = data[index + 1] - color[1];
  const db = data[index + 2] - color[2];
  return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
}

function grayAt(data, index) {
  return (data[index] * 0.299) + (data[index + 1] * 0.587) + (data[index + 2] * 0.114);
}

function findBoundary(counts, threshold, fromStart = true) {
  if (fromStart) {
    for (let index = 0; index < counts.length; index += 1) if (counts[index] >= threshold) return index;
    return 0;
  }
  for (let index = counts.length - 1; index >= 0; index -= 1) if (counts[index] >= threshold) return index;
  return counts.length - 1;
}

export function detectDocumentCornersCanvas(canvas) {
  if (!canvas?.width || !canvas?.height) return { corners:DEFAULT_CORNERS, confidence:0, coverage:0 };
  const { width, height, image } = sampledImageData(canvas, 380);
  const data = image.data;
  const patch = Math.max(6, Math.round(Math.min(width, height) * 0.055));
  const backgrounds = [
    averagePatch(data, width, height, 0, 0, patch),
    averagePatch(data, width, height, width - patch, 0, patch),
    averagePatch(data, width, height, width - patch, height - patch, patch),
    averagePatch(data, width, height, 0, height - patch, patch),
  ];
  const mask = new Uint8Array(width * height);
  const rowCounts = new Uint32Array(height);
  const colCounts = new Uint32Array(width);
  let foreground = 0;
  let contrastTotal = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const pixel = y * width + x;
      const index = pixel * 4;
      let backgroundDistance = Infinity;
      for (const color of backgrounds) backgroundDistance = Math.min(backgroundDistance, colorDistance(data, index, color));
      const gx = Math.abs(grayAt(data, index + 4) - grayAt(data, index - 4));
      const gy = Math.abs(grayAt(data, index + width * 4) - grayAt(data, index - width * 4));
      const edge = gx + gy;
      const isForeground = backgroundDistance > 38 || edge > 52;
      if (isForeground) {
        mask[pixel] = 1;
        rowCounts[y] += 1;
        colCounts[x] += 1;
        foreground += 1;
        contrastTotal += Math.min(120, backgroundDistance);
      }
    }
  }

  const rowThreshold = Math.max(5, Math.round(width * 0.065));
  const colThreshold = Math.max(5, Math.round(height * 0.065));
  let top = findBoundary(rowCounts, rowThreshold, true);
  let bottom = findBoundary(rowCounts, rowThreshold, false);
  let left = findBoundary(colCounts, colThreshold, true);
  let right = findBoundary(colCounts, colThreshold, false);

  if (bottom - top < height * 0.26 || right - left < width * 0.26) {
    return { corners:DEFAULT_CORNERS.map(point => ({ ...point })), confidence:0.12, coverage:0.78 };
  }

  const padX = Math.round(width * 0.012);
  const padY = Math.round(height * 0.012);
  left = Math.max(1, left - padX);
  right = Math.min(width - 2, right + padX);
  top = Math.max(1, top - padY);
  bottom = Math.min(height - 2, bottom + padY);

  const candidates = {
    tl:{ x:left, y:top, score:Infinity },
    tr:{ x:right, y:top, score:Infinity },
    br:{ x:right, y:bottom, score:Infinity },
    bl:{ x:left, y:bottom, score:Infinity },
  };
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (!mask[y * width + x]) continue;
      const scores = {
        tl:(x - left) + (y - top),
        tr:(right - x) + (y - top),
        br:(right - x) + (bottom - y),
        bl:(x - left) + (bottom - y),
      };
      for (const key of Object.keys(scores)) {
        if (scores[key] < candidates[key].score) candidates[key] = { x, y, score:scores[key] };
      }
    }
  }

  const raw = [candidates.tl, candidates.tr, candidates.br, candidates.bl].map((point, index) => {
    if (!Number.isFinite(point.score)) return DEFAULT_CORNERS[index];
    return { x:point.x / width, y:point.y / height };
  });
  const corners = normalizeCorners(raw);
  const area = Math.max(0, (right - left) * (bottom - top));
  const coverage = area / Math.max(1, width * height);
  const foregroundRatio = foreground / Math.max(1, width * height);
  const averageContrast = foreground ? contrastTotal / foreground : 0;
  const confidence = clamp(
    0.22 + (Math.min(0.85, coverage) * 0.55) + (Math.min(1, foregroundRatio * 2.4) * 0.12) + (Math.min(1, averageContrast / 70) * 0.16),
    0,
    0.96
  );
  return { corners, confidence, coverage };
}

export function analyzeDocumentQualityCanvas(canvas) {
  if (!canvas?.width || !canvas?.height) return { score:0, message:'Point the camera at the document.' };
  const { width, height, image } = sampledImageData(canvas, 300);
  const data = image.data;
  let luminance = 0;
  let glare = 0;
  let shadows = 0;
  let lapSum = 0;
  let lapSq = 0;
  let lapCount = 0;
  const pixels = width * height;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      const center = grayAt(data, index);
      luminance += center;
      if (center > 247) glare += 1;
      if (center < 28) shadows += 1;
      const lap = (4 * center)
        - grayAt(data, index - 4)
        - grayAt(data, index + 4)
        - grayAt(data, index - width * 4)
        - grayAt(data, index + width * 4);
      lapSum += lap;
      lapSq += lap * lap;
      lapCount += 1;
    }
  }

  const brightness = luminance / Math.max(1, lapCount);
  const lapMean = lapSum / Math.max(1, lapCount);
  const lapVariance = Math.max(0, (lapSq / Math.max(1, lapCount)) - (lapMean * lapMean));
  const sharpness = Math.min(100, Math.sqrt(lapVariance) * 2.3);
  const glareRatio = glare / Math.max(1, pixels);
  const shadowRatio = shadows / Math.max(1, pixels);
  const detection = detectDocumentCornersCanvas(canvas);
  const tooDark = brightness < 72 || shadowRatio > 0.34;
  const tooBright = brightness > 226;
  const blurry = sharpness < 24;
  const glareDetected = glareRatio > 0.17;
  const tooFar = detection.coverage < 0.43;
  let score = 100;
  if (tooDark) score -= 30;
  if (tooBright) score -= 18;
  if (blurry) score -= 28;
  if (glareDetected) score -= 22;
  if (tooFar) score -= 22;
  if (detection.confidence < 0.4) score -= 12;
  score = Math.max(0, Math.round(score));

  let message = 'Hold steady — document detected.';
  if (tooDark) message = 'Low light — use Flash or move to brighter light.';
  else if (glareDetected) message = 'Glare detected — tilt the phone slightly.';
  else if (blurry) message = 'Hold still and let the camera focus.';
  else if (tooFar) message = 'Move closer so the document fills the frame.';
  else if (score >= 82) message = 'Ready — hold still for auto capture.';

  return {
    score,
    message,
    brightness,
    sharpness,
    glareRatio,
    shadowRatio,
    tooDark,
    tooBright,
    blurry,
    glareDetected,
    tooFar,
    corners:detection.corners,
    cornerConfidence:detection.confidence,
    coverage:detection.coverage,
  };
}

function solveLinearSystem(matrix, vector) {
  const size = vector.length;
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (Math.abs(rows[pivot][column]) < 1e-10) return null;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let item = column; item <= size; item += 1) rows[column][item] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      if (!factor) continue;
      for (let item = column; item <= size; item += 1) rows[row][item] -= factor * rows[column][item];
    }
  }
  return rows.map(row => row[size]);
}

function homography(source, destination) {
  const matrix = [];
  const vector = [];
  for (let index = 0; index < 4; index += 1) {
    const x = source[index].x;
    const y = source[index].y;
    const u = destination[index].x;
    const v = destination[index].y;
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    vector.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    vector.push(v);
  }
  return solveLinearSystem(matrix, vector);
}

function boundingCrop(source, points, outputWidth, outputHeight) {
  const minX = Math.max(0, Math.floor(Math.min(...points.map(point => point.x))));
  const maxX = Math.min(source.width, Math.ceil(Math.max(...points.map(point => point.x))));
  const minY = Math.max(0, Math.floor(Math.min(...points.map(point => point.y))));
  const maxY = Math.min(source.height, Math.ceil(Math.max(...points.map(point => point.y))));
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d', { alpha:false, willReadFrequently:true });
  ctx.drawImage(source, minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY), 0, 0, outputWidth, outputHeight);
  return canvas;
}

function warpPerspective(source, normalizedCorners, maxEdge = 1800) {
  const corners = normalizeCorners(normalizedCorners).map(point => ({ x:point.x * source.width, y:point.y * source.height }));
  const [tl, tr, br, bl] = corners;
  const naturalWidth = Math.max(distance(tl, tr), distance(bl, br), 320);
  const naturalHeight = Math.max(distance(tl, bl), distance(tr, br), 320);
  const scale = Math.min(1, Math.max(720, maxEdge) / Math.max(naturalWidth, naturalHeight));
  const outputWidth = Math.max(320, Math.round(naturalWidth * scale));
  const outputHeight = Math.max(320, Math.round(naturalHeight * scale));
  const destination = [
    { x:0, y:0 },
    { x:outputWidth - 1, y:0 },
    { x:outputWidth - 1, y:outputHeight - 1 },
    { x:0, y:outputHeight - 1 },
  ];
  const map = homography(destination, corners);
  if (!map) return boundingCrop(source, corners, outputWidth, outputHeight);

  const sourceCtx = source.getContext('2d', { alpha:false, willReadFrequently:true });
  const sourceImage = sourceCtx.getImageData(0, 0, source.width, source.height);
  const output = document.createElement('canvas');
  output.width = outputWidth;
  output.height = outputHeight;
  const outputCtx = output.getContext('2d', { alpha:false, willReadFrequently:true });
  const target = outputCtx.createImageData(outputWidth, outputHeight);
  const sourceData = sourceImage.data;
  const targetData = target.data;

  for (let y = 0; y < outputHeight; y += 1) {
    for (let x = 0; x < outputWidth; x += 1) {
      const denominator = (map[6] * x) + (map[7] * y) + 1;
      const sourceX = ((map[0] * x) + (map[1] * y) + map[2]) / denominator;
      const sourceY = ((map[3] * x) + (map[4] * y) + map[5]) / denominator;
      const targetIndex = (y * outputWidth + x) * 4;
      if (sourceX < 0 || sourceY < 0 || sourceX >= source.width - 1 || sourceY >= source.height - 1) {
        targetData[targetIndex] = 255;
        targetData[targetIndex + 1] = 255;
        targetData[targetIndex + 2] = 255;
        targetData[targetIndex + 3] = 255;
        continue;
      }
      const x0 = Math.floor(sourceX);
      const y0 = Math.floor(sourceY);
      const x1 = x0 + 1;
      const y1 = y0 + 1;
      const dx = sourceX - x0;
      const dy = sourceY - y0;
      const i00 = (y0 * source.width + x0) * 4;
      const i10 = (y0 * source.width + x1) * 4;
      const i01 = (y1 * source.width + x0) * 4;
      const i11 = (y1 * source.width + x1) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const topValue = sourceData[i00 + channel] + ((sourceData[i10 + channel] - sourceData[i00 + channel]) * dx);
        const bottomValue = sourceData[i01 + channel] + ((sourceData[i11 + channel] - sourceData[i01 + channel]) * dx);
        targetData[targetIndex + channel] = topValue + ((bottomValue - topValue) * dy);
      }
      targetData[targetIndex + 3] = 255;
    }
  }
  outputCtx.putImageData(target, 0, 0);
  return output;
}

function percentile(histogram, count, ratio) {
  const target = count * ratio;
  let running = 0;
  for (let index = 0; index < histogram.length; index += 1) {
    running += histogram[index];
    if (running >= target) return index;
  }
  return ratio < 0.5 ? 0 : 255;
}

function otsuThreshold(histogram, count) {
  let total = 0;
  for (let index = 0; index < 256; index += 1) total += index * histogram[index];
  let backgroundWeight = 0;
  let backgroundSum = 0;
  let maxVariance = 0;
  let threshold = 150;
  for (let index = 0; index < 256; index += 1) {
    backgroundWeight += histogram[index];
    if (!backgroundWeight) continue;
    const foregroundWeight = count - backgroundWeight;
    if (!foregroundWeight) break;
    backgroundSum += index * histogram[index];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (total - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * ((backgroundMean - foregroundMean) ** 2);
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = index;
    }
  }
  return threshold;
}

function applyFilter(canvas, preset = 'clean') {
  if (preset === 'original') return canvas;
  const ctx = canvas.getContext('2d', { alpha:false, willReadFrequently:true });
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const histogram = new Uint32Array(256);
  const pixelCount = canvas.width * canvas.height;
  for (let index = 0; index < data.length; index += 4) histogram[Math.round(grayAt(data, index))] += 1;
  const low = percentile(histogram, pixelCount, 0.018);
  const high = Math.max(low + 28, percentile(histogram, pixelCount, 0.988));
  const threshold = otsuThreshold(histogram, pixelCount);
  const range = Math.max(1, high - low);

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const gray = (r * 0.299) + (g * 0.587) + (b * 0.114);
    if (preset === 'bw') {
      const value = gray > threshold ? 255 : 0;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      continue;
    }
    const normalize = value => clamp((value - low) / range, 0, 1) * 255;
    if (preset === 'color') {
      const lifted = gray > 205 ? Math.min(255, (gray - 205) * 0.38) : 0;
      data[index] = Math.min(255, normalize(r) + lifted);
      data[index + 1] = Math.min(255, normalize(g) + lifted);
      data[index + 2] = Math.min(255, normalize(b) + lifted);
    } else {
      let value = normalize(gray);
      value = value > 182 ? Math.min(255, value + ((value - 182) * 0.55)) : Math.max(0, value * 0.92);
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export async function buildScanEditorPreview(file, { rotation = 0 } = {}) {
  const canvas = await renderImageCanvas(file, { rotation, maxEdge:1500 });
  const quality = analyzeDocumentQualityCanvas(canvas);
  const blob = await canvasBlob(canvas, 'image/jpeg', 0.88);
  return {
    previewUrl:URL.createObjectURL(blob),
    width:canvas.width,
    height:canvas.height,
    corners:quality.corners || DEFAULT_CORNERS.map(point => ({ ...point })),
    quality,
  };
}

export async function processDocumentImage(file, {
  rotation = 0,
  corners = DEFAULT_CORNERS,
  filter = 'clean',
  maxEdge = 1800,
  fileName = '',
} = {}) {
  const source = await renderImageCanvas(file, { rotation, maxEdge:2600 });
  const warped = warpPerspective(source, corners, maxEdge);
  const filtered = applyFilter(warped, filter);
  const blob = await canvasBlob(filtered, 'image/jpeg', 0.93);
  const baseName = String(fileName || file?.name || 'road-ready-scan')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 90) || 'road-ready-scan';
  return new File([blob], `${baseName}-scan.jpg`, { type:'image/jpeg', lastModified:Date.now() });
}

export function defaultDocumentCorners() {
  return DEFAULT_CORNERS.map(point => ({ ...point }));
}
