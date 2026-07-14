import {
  canvasToFile,
  defaultDocumentCorners,
  documentPolygonArea,
  fileToImage,
  loadDocumentVision,
  normalizeDocumentCorners,
} from './documentScannerEngine.js';
import {
  detectDocumentCornersCanvas as detectDocumentCornersFallback,
  processDocumentImage as processDocumentImageFallback,
} from './documentImagePipeline.js';

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function sourceSize(source) {
  return {
    width:Number(source?.videoWidth || source?.naturalWidth || source?.width || 0),
    height:Number(source?.videoHeight || source?.naturalHeight || source?.height || 0),
  };
}

function sourceToCanvas(source, maxDimension = 1200) {
  const { width, height } = sourceSize(source);
  if (!width || !height) throw new Error('source_dimensions_missing');
  const scale = Math.min(1, Math.max(320, Number(maxDimension || 1200)) / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d', { alpha:false, willReadFrequently:true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function objectFromArray(points = []) {
  const fallback = defaultDocumentCorners();
  const [topLeft, topRight, bottomRight, bottomLeft] = points.length === 4
    ? points
    : [fallback.topLeft, fallback.topRight, fallback.bottomRight, fallback.bottomLeft];
  return normalizeDocumentCorners({ topLeft, topRight, bottomLeft, bottomRight });
}

function arrayFromObject(value = {}) {
  const corners = normalizeDocumentCorners(value);
  return [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
}

function orderPoints(points = []) {
  if (points.length !== 4) return points;
  const sums = points.map(point => point.x + point.y);
  const differences = points.map(point => point.y - point.x);
  return [
    points[sums.indexOf(Math.min(...sums))],
    points[differences.indexOf(Math.min(...differences))],
    points[sums.indexOf(Math.max(...sums))],
    points[differences.indexOf(Math.max(...differences))],
  ].map(point => ({ x:Number(point.x), y:Number(point.y) }));
}

function distance(a, b) {
  return Math.hypot(Number(a?.x || 0) - Number(b?.x || 0), Number(a?.y || 0) - Number(b?.y || 0));
}

function polygonArea(points = []) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += (current.x * next.y) - (next.x * current.y);
  }
  return Math.abs(sum) / 2;
}

function angleQuality(previous, current, next) {
  const ax = previous.x - current.x;
  const ay = previous.y - current.y;
  const bx = next.x - current.x;
  const by = next.y - current.y;
  const denominator = Math.max(1e-6, Math.hypot(ax, ay) * Math.hypot(bx, by));
  return 1 - clamp(Math.abs(((ax * bx) + (ay * by)) / denominator), 0, 1);
}

function quadMetrics(points, width, height, contourArea = 0) {
  const ordered = orderPoints(points);
  if (ordered.length !== 4) return null;
  const [topLeft, topRight, bottomRight, bottomLeft] = ordered;
  const area = polygonArea(ordered);
  const frameArea = Math.max(1, width * height);
  const coverage = area / frameArea;
  if (!Number.isFinite(coverage) || coverage < .075 || coverage > 1.04) return null;

  const top = distance(topLeft, topRight);
  const right = distance(topRight, bottomRight);
  const bottom = distance(bottomLeft, bottomRight);
  const left = distance(topLeft, bottomLeft);
  const longSide = Math.max(top, right, bottom, left, 1);
  const shortSide = Math.min(top, right, bottom, left);
  if (shortSide / longSide < .14) return null;

  const angles = [
    angleQuality(bottomLeft, topLeft, topRight),
    angleQuality(topLeft, topRight, bottomRight),
    angleQuality(topRight, bottomRight, bottomLeft),
    angleQuality(bottomRight, bottomLeft, topLeft),
  ];
  const angleScore = angles.reduce((sum, value) => sum + value, 0) / angles.length;
  const oppositeScore = (
    (Math.min(top, bottom) / Math.max(top, bottom, 1))
    + (Math.min(left, right) / Math.max(left, right, 1))
  ) / 2;
  const centerX = ordered.reduce((sum, point) => sum + point.x, 0) / 4;
  const centerY = ordered.reduce((sum, point) => sum + point.y, 0) / 4;
  const centerDistance = Math.hypot((centerX / width) - .5, (centerY / height) - .5);
  const centerScore = 1 - clamp(centerDistance / .72, 0, 1);
  const rectangularity = clamp(Number(contourArea || area) / Math.max(area, 1), 0, 1);
  const edgeMargin = Math.min(
    topLeft.x,
    topLeft.y,
    width - topRight.x,
    topRight.y,
    width - bottomRight.x,
    height - bottomRight.y,
    bottomLeft.x,
    height - bottomLeft.y,
  ) / Math.max(width, height);
  const marginScore = clamp((edgeMargin + .025) / .09, 0, 1);
  const score = (coverage * 2.5)
    + (angleScore * 1.65)
    + (oppositeScore * .7)
    + (rectangularity * .35)
    + (centerScore * .28)
    + (marginScore * .12);
  const confidence = clamp((score - .7) / 3.45, 0, .99);
  return { ordered, coverage, angleScore, oppositeScore, rectangularity, score, confidence };
}

function matPoints(mat) {
  const data = mat?.data32S;
  if (!data || data.length < 8) return [];
  const points = [];
  for (let index = 0; index + 1 < data.length; index += 2) points.push({ x:data[index], y:data[index + 1] });
  return points;
}

function collectContourCandidates(cv, mask, width, height, candidates) {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  try {
    cv.findContours(mask, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    const entries = [];
    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index);
      const area = Math.abs(cv.contourArea(contour));
      if (area > width * height * .045) entries.push({ contour, area });
      else contour.delete();
    }
    entries.sort((a, b) => b.area - a.area);
    for (const entry of entries.slice(0, 28)) {
      const perimeter = cv.arcLength(entry.contour, true);
      for (const epsilonRatio of [.012, .018, .024, .032, .044]) {
        const approx = new cv.Mat();
        try {
          cv.approxPolyDP(entry.contour, approx, perimeter * epsilonRatio, true);
          if (approx.rows !== 4) continue;
          try {
            if (typeof cv.isContourConvex === 'function' && !cv.isContourConvex(approx)) continue;
          } catch {}
          const metrics = quadMetrics(matPoints(approx), width, height, entry.area);
          if (metrics) candidates.push(metrics);
        } finally {
          approx.delete();
        }
      }
      entry.contour.delete();
    }
    for (const entry of entries.slice(28)) entry.contour.delete();
  } finally {
    contours.delete();
    hierarchy.delete();
  }
}

async function detectWithOpenCv(source, maxDimension = 1100) {
  const { cv } = await loadDocumentVision();
  const canvas = sourceToCanvas(source, maxDimension);
  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const blur = new cv.Mat();
  const edgesLow = new cv.Mat();
  const edgesHigh = new cv.Mat();
  const adaptive = new cv.Mat();
  const closed = new cv.Mat();
  const kernel5 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
  const kernel3 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
  const candidates = [];
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

    cv.Canny(blur, edgesLow, 28, 105, 3, false);
    cv.morphologyEx(edgesLow, closed, cv.MORPH_CLOSE, kernel5);
    collectContourCandidates(cv, closed, canvas.width, canvas.height, candidates);

    cv.Canny(blur, edgesHigh, 58, 178, 3, false);
    cv.morphologyEx(edgesHigh, closed, cv.MORPH_CLOSE, kernel5);
    collectContourCandidates(cv, closed, canvas.width, canvas.height, candidates);

    let blockSize = Math.max(21, Math.min(51, Math.round(Math.min(canvas.width, canvas.height) / 16)));
    if (blockSize % 2 === 0) blockSize += 1;
    cv.adaptiveThreshold(
      blur,
      adaptive,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      blockSize,
      9
    );
    cv.morphologyEx(adaptive, closed, cv.MORPH_CLOSE, kernel3);
    collectContourCandidates(cv, closed, canvas.width, canvas.height, candidates);
  } finally {
    src.delete();
    gray.delete();
    blur.delete();
    edgesLow.delete();
    edgesHigh.delete();
    adaptive.delete();
    closed.delete();
    kernel5.delete();
    kernel3.delete();
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) return null;
  const normalized = best.ordered.map(point => ({ x:point.x / canvas.width, y:point.y / canvas.height }));
  return {
    corners:objectFromArray(normalized),
    confidence:best.confidence,
    coverage:best.coverage,
    score:best.score,
    angleScore:best.angleScore,
  };
}

export async function detectDocumentV985(source, options = {}) {
  try {
    const detected = await detectWithOpenCv(source, options.maxDimension || 1100);
    if (detected?.confidence >= .42 && detected.coverage >= .1) return detected;
  } catch {}

  try {
    const canvas = sourceToCanvas(source, options.maxDimension || 900);
    const fallback = detectDocumentCornersFallback(canvas);
    const corners = objectFromArray(fallback.corners || []);
    return {
      corners,
      confidence:Number(fallback.confidence || 0),
      coverage:Number(fallback.coverage || documentPolygonArea(corners)),
      score:0,
      fallback:true,
    };
  } catch {
    const corners = defaultDocumentCorners();
    return { corners, confidence:0, coverage:documentPolygonArea(corners), score:0, fallback:true };
  }
}

export function smoothDocumentCornersV985(previous, next, alpha = .38) {
  if (!previous) return normalizeDocumentCorners(next);
  const before = normalizeDocumentCorners(previous);
  const after = normalizeDocumentCorners(next);
  const blend = clamp(alpha, .08, .88);
  const keys = ['topLeft','topRight','bottomLeft','bottomRight'];
  const out = {};
  for (const key of keys) {
    out[key] = {
      x:(before[key].x * (1 - blend)) + (after[key].x * blend),
      y:(before[key].y * (1 - blend)) + (after[key].y * blend),
    };
  }
  return normalizeDocumentCorners(out);
}

function pointInsideQuad(x, y, points) {
  let sign = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const cross = ((b.x - a.x) * (y - a.y)) - ((b.y - a.y) * (x - a.x));
    if (Math.abs(cross) < 1e-5) continue;
    const nextSign = cross > 0 ? 1 : -1;
    if (!sign) sign = nextSign;
    else if (sign !== nextSign) return false;
  }
  return true;
}

export async function analyzeDocumentFrameV985(source, options = {}) {
  const canvas = sourceToCanvas(source, options.maxDimension || 420);
  const detection = await detectDocumentV985(canvas, { maxDimension:Math.min(620, options.maxDimension || 520) });
  const context = canvas.getContext('2d', { alpha:false, willReadFrequently:true });
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const normalized = arrayFromObject(detection.corners);
  const points = normalized.map(point => ({ x:point.x * canvas.width, y:point.y * canvas.height }));
  const paperDetected = detection.confidence >= .42 && detection.coverage >= .1;
  const samplePoints = paperDetected
    ? points
    : [
      { x:canvas.width * .18, y:canvas.height * .13 },
      { x:canvas.width * .82, y:canvas.height * .13 },
      { x:canvas.width * .82, y:canvas.height * .87 },
      { x:canvas.width * .18, y:canvas.height * .87 },
    ];

  let count = 0;
  let sum = 0;
  let sumSq = 0;
  let dark = 0;
  let glare = 0;
  let lapSum = 0;
  let lapSq = 0;
  const step = Math.max(1, Math.round(Math.min(canvas.width, canvas.height) / 210));
  const gray = index => (data[index] * .299) + (data[index + 1] * .587) + (data[index + 2] * .114);
  for (let y = step; y < canvas.height - step; y += step) {
    for (let x = step; x < canvas.width - step; x += step) {
      if (!pointInsideQuad(x, y, samplePoints)) continue;
      const index = (y * canvas.width + x) * 4;
      const value = gray(index);
      sum += value;
      sumSq += value * value;
      if (value < 54) dark += 1;
      if (value > 246) glare += 1;
      const lap = (4 * value)
        - gray(index - step * 4)
        - gray(index + step * 4)
        - gray(index - step * canvas.width * 4)
        - gray(index + step * canvas.width * 4);
      lapSum += lap;
      lapSq += lap * lap;
      count += 1;
    }
  }

  const brightness = count ? sum / count : 0;
  const contrast = count ? Math.sqrt(Math.max(0, (sumSq / count) - (brightness * brightness))) : 0;
  const lapMean = count ? lapSum / count : 0;
  const sharpness = count ? Math.sqrt(Math.max(0, (lapSq / count) - (lapMean * lapMean))) : 0;
  const darkRatio = count ? dark / count : 0;
  const glareRatio = count ? glare / count : 0;
  const tooDark = paperDetected && (brightness < 60 || darkRatio > .48);
  const tooBright = paperDetected && brightness > 232;
  const blurry = sharpness < 10.5;
  const glareDetected = glareRatio > .075;
  const tooFar = detection.coverage < .26;
  const autoFlashNeeded = paperDetected && brightness < 48 && darkRatio > .34 && glareRatio < .025;
  let score = Math.round(
    (detection.confidence * 30)
    + (clamp((detection.coverage - .16) / .58, 0, 1) * 22)
    + (clamp((sharpness - 6) / 19, 0, 1) * 26)
    + (clamp(1 - Math.abs(brightness - 154) / 150, 0, 1) * 17)
    + (clamp(1 - glareRatio / .11, 0, 1) * 5)
  );
  if (!paperDetected) score = Math.min(score, 45);
  if (tooDark) score -= 16;
  if (tooBright) score -= 12;
  if (glareDetected) score -= 18;
  score = Math.max(0, Math.min(100, score));
  const good = paperDetected && score >= 76 && !blurry && !tooDark && !tooBright && !glareDetected && !tooFar;

  let hint = 'Find the full document';
  if (paperDetected && tooDark) hint = autoFlashNeeded ? 'Low light — Auto Flash will fire at capture' : 'Move to brighter, even light';
  else if (paperDetected && glareDetected) hint = 'Tilt the phone slightly to remove glare';
  else if (paperDetected && blurry) hint = 'Hold still and let the camera focus';
  else if (paperDetected && tooFar) hint = 'Move closer so the paper fills the frame';
  else if (paperDetected && good) hint = 'Document locked — hold steady';
  else if (paperDetected) hint = 'Align all four edges and hold steady';

  return {
    ...detection,
    brightness,
    contrast,
    sharpness,
    darkRatio,
    glare:glareRatio,
    glareRatio,
    tooDark,
    tooBright,
    blurry,
    glareDetected,
    tooFar,
    autoFlashNeeded,
    paperDetected,
    good,
    score,
    hint,
  };
}

function trimCanvas(source, ratio = .004) {
  const insetX = Math.max(0, Math.round(source.width * ratio));
  const insetY = Math.max(0, Math.round(source.height * ratio));
  if (!insetX && !insetY) return source;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, source.width - (insetX * 2));
  canvas.height = Math.max(1, source.height - (insetY * 2));
  const context = canvas.getContext('2d', { alpha:false });
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, insetX, insetY, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function perspectiveCropFileV985(file, corners, options = {}) {
  const image = await fileToImage(file);
  const maxEdge = Math.max(1200, Number(options.maxEdge || 3000));
  try {
    const { cv } = await loadDocumentVision(options.onStatus);
    const source = sourceToCanvas(image, Math.max(maxEdge, 3400));
    const normalized = normalizeDocumentCorners(corners);
    const ordered = arrayFromObject(normalized).map(point => ({ x:point.x * source.width, y:point.y * source.height }));
    const [topLeft, topRight, bottomRight, bottomLeft] = ordered;
    const naturalWidth = Math.max(distance(topLeft, topRight), distance(bottomLeft, bottomRight), 320);
    const naturalHeight = Math.max(distance(topLeft, bottomLeft), distance(topRight, bottomRight), 320);
    const scale = Math.min(1, maxEdge / Math.max(naturalWidth, naturalHeight));
    const outputWidth = Math.max(480, Math.round(naturalWidth * scale));
    const outputHeight = Math.max(480, Math.round(naturalHeight * scale));
    const src = cv.imread(source);
    const dst = new cv.Mat();
    const sourcePoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      topLeft.x, topLeft.y,
      topRight.x, topRight.y,
      bottomRight.x, bottomRight.y,
      bottomLeft.x, bottomLeft.y,
    ]);
    const destinationPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      outputWidth - 1, 0,
      outputWidth - 1, outputHeight - 1,
      0, outputHeight - 1,
    ]);
    const transform = cv.getPerspectiveTransform(sourcePoints, destinationPoints);
    const output = document.createElement('canvas');
    try {
      cv.warpPerspective(
        src,
        dst,
        transform,
        new cv.Size(outputWidth, outputHeight),
        cv.INTER_CUBIC,
        cv.BORDER_REPLICATE,
        new cv.Scalar(255, 255, 255, 255)
      );
      cv.imshow(output, dst);
    } finally {
      src.delete();
      dst.delete();
      sourcePoints.delete();
      destinationPoints.delete();
      transform.delete();
    }
    const trimmed = trimCanvas(output, .0045);
    return canvasToFile(trimmed, options.name || `road-ready-cropped-${Date.now()}.jpg`, 'image/jpeg', .97);
  } catch {
    return processDocumentImageFallback(file, {
      corners:arrayFromObject(corners),
      filter:'original',
      maxEdge,
      fileName:options.name || file?.name || 'road-ready-cropped',
    });
  }
}

function boxBlur(values, width, height, radius) {
  const horizontal = new Float32Array(values.length);
  const output = new Float32Array(values.length);
  const r = Math.max(1, Math.round(radius));
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = 0;
    let start = 0;
    let end = Math.min(width - 1, r);
    for (let x = start; x <= end; x += 1) sum += values[row + x];
    for (let x = 0; x < width; x += 1) {
      horizontal[row + x] = sum / Math.max(1, end - start + 1);
      const nextStart = Math.max(0, x - r + 1);
      const nextEnd = Math.min(width - 1, x + r + 1);
      if (nextStart > start) sum -= values[row + start];
      if (nextEnd > end) sum += values[row + nextEnd];
      start = nextStart;
      end = nextEnd;
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    let start = 0;
    let end = Math.min(height - 1, r);
    for (let y = start; y <= end; y += 1) sum += horizontal[(y * width) + x];
    for (let y = 0; y < height; y += 1) {
      output[(y * width) + x] = sum / Math.max(1, end - start + 1);
      const nextStart = Math.max(0, y - r + 1);
      const nextEnd = Math.min(height - 1, y + r + 1);
      if (nextStart > start) sum -= horizontal[(start * width) + x];
      if (nextEnd > end) sum += horizontal[(nextEnd * width) + x];
      start = nextStart;
      end = nextEnd;
    }
  }
  return output;
}

function percentile(values, ratio, step = 1) {
  const histogram = new Uint32Array(256);
  let count = 0;
  for (let index = 0; index < values.length; index += Math.max(1, step)) {
    histogram[Math.max(0, Math.min(255, Math.round(values[index])))] += 1;
    count += 1;
  }
  const target = count * ratio;
  let seen = 0;
  for (let value = 0; value < 256; value += 1) {
    seen += histogram[value];
    if (seen >= target) return value;
  }
  return 255;
}

function rotateCanvas(source, rotation = 0) {
  const normalized = ((Number(rotation || 0) % 360) + 360) % 360;
  if (!normalized) return source;
  const swap = normalized === 90 || normalized === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? source.height : source.width;
  canvas.height = swap ? source.width : source.height;
  const context = canvas.getContext('2d', { alpha:false });
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((normalized * Math.PI) / 180);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

function enhanceCanvas(source, preset = 'auto') {
  const mode = preset === 'auto' ? 'clean' : preset;
  if (mode === 'original') return source;
  const context = source.getContext('2d', { alpha:false, willReadFrequently:true });
  const image = context.getImageData(0, 0, source.width, source.height);
  const data = image.data;
  const width = source.width;
  const height = source.height;
  const pixels = width * height;
  const gray = new Uint8Array(pixels);
  let saturationSum = 0;
  for (let pixel = 0, index = 0; pixel < pixels; pixel += 1, index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    gray[pixel] = Math.round((red * .299) + (green * .587) + (blue * .114));
    saturationSum += Math.max(red, green, blue) - Math.min(red, green, blue);
  }

  const backgroundRadius = Math.max(18, Math.min(58, Math.round(Math.min(width, height) / 24)));
  const background = boxBlur(gray, width, height, backgroundRadius);
  const normalized = new Uint8Array(pixels);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    normalized[pixel] = Math.round(clamp((gray[pixel] / Math.max(22, background[pixel])) * 238, 0, 255));
  }
  const low = percentile(normalized, .009, 2);
  const high = Math.max(low + 35, percentile(normalized, .994, 2));
  const stretched = new Uint8Array(pixels);
  const range = Math.max(1, high - low);
  for (let pixel = 0; pixel < pixels; pixel += 1) stretched[pixel] = Math.round(clamp(((normalized[pixel] - low) * 255) / range, 0, 255));
  const smallBlur = boxBlur(stretched, width, height, 1);

  if (mode === 'bw') {
    const localRadius = Math.max(11, Math.min(30, Math.round(Math.min(width, height) / 46)));
    const localMean = boxBlur(stretched, width, height, localRadius);
    const constant = Math.max(7, Math.min(13, Math.round(localRadius * .42)));
    for (let pixel = 0, index = 0; pixel < pixels; pixel += 1, index += 4) {
      const value = stretched[pixel] > localMean[pixel] - constant ? 255 : 0;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return source;
  }

  if (mode === 'color') {
    let brightRed = 0;
    let brightGreen = 0;
    let brightBlue = 0;
    let brightCount = 0;
    for (let pixel = 0, index = 0; pixel < pixels; pixel += 3, index = pixel * 4) {
      if (stretched[pixel] < 205) continue;
      brightRed += data[index];
      brightGreen += data[index + 1];
      brightBlue += data[index + 2];
      brightCount += 1;
    }
    const brightAverage = brightCount ? (brightRed + brightGreen + brightBlue) / (brightCount * 3) : 220;
    const redScale = brightCount ? clamp(brightAverage / Math.max(1, brightRed / brightCount), .72, 1.45) : 1;
    const greenScale = brightCount ? clamp(brightAverage / Math.max(1, brightGreen / brightCount), .72, 1.45) : 1;
    const blueScale = brightCount ? clamp(brightAverage / Math.max(1, brightBlue / brightCount), .72, 1.45) : 1;
    for (let pixel = 0, index = 0; pixel < pixels; pixel += 1, index += 4) {
      const detail = stretched[pixel] - smallBlur[pixel];
      const target = clamp(132 + ((stretched[pixel] - 128) * 1.08) + (detail * .34), 0, 255);
      const red = data[index] * redScale;
      const green = data[index + 1] * greenScale;
      const blue = data[index + 2] * blueScale;
      const luminance = Math.max(1, (red * .299) + (green * .587) + (blue * .114));
      const whiten = clamp((target - 188) / 67, 0, 1);
      const saturation = .72 * (1 - (whiten * .68));
      data[index] = clamp(target + ((red - luminance) * saturation), 0, 255);
      data[index + 1] = clamp(target + ((green - luminance) * saturation), 0, 255);
      data[index + 2] = clamp(target + ((blue - luminance) * saturation), 0, 255);
      data[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return source;
  }

  const grayStrength = mode === 'gray' ? 1.18 : 1.08;
  const backgroundLift = mode === 'clean' ? .58 : .32;
  for (let pixel = 0, index = 0; pixel < pixels; pixel += 1, index += 4) {
    const detail = stretched[pixel] - smallBlur[pixel];
    let value = clamp(132 + ((stretched[pixel] - 128) * grayStrength) + (detail * .42), 0, 255);
    if (value > 196) value = clamp(value + ((value - 196) * backgroundLift), 0, 255);
    if (value < 145) value = clamp(value * .94, 0, 255);
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return source;
}

export async function renderDocumentFileV985(file, options = {}) {
  const image = await fileToImage(file);
  const maxDimension = Math.max(1000, Number(options.maxDimension || 2600));
  let canvas = sourceToCanvas(image, maxDimension);
  canvas = rotateCanvas(canvas, options.rotation || 0);
  canvas = enhanceCanvas(canvas, options.filter || 'auto');
  return canvasToFile(
    canvas,
    options.name || `road-ready-${options.filter || 'auto'}-${Date.now()}.jpg`,
    'image/jpeg',
    Number(options.quality || .97)
  );
}

export function filterDisplayNameV985(value = 'auto') {
  if (value === 'auto') return 'Smart Clean';
  if (value === 'gray') return 'Gray';
  if (value === 'bw') return 'B/W';
  if (value === 'color') return 'Color';
  return 'Original';
}
