import { correctionContourV1064 } from './correctionContourV1064.js';

const clamp01 = value => Math.max(0.002, Math.min(0.998, Number(value || 0)));

function percentile(values = [], ratio = .5) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * ratio)))];
}

function boundsOf(points = []) {
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  return {
    left:Math.min(...xs),
    right:Math.max(...xs),
    top:Math.min(...ys),
    bottom:Math.max(...ys),
  };
}

function polygonArea(points = []) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function fitLine(points = [], dependent = 'y') {
  let values = points.filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  const solve = rows => {
    const xs = rows.map(point => dependent === 'y' ? point.x : point.y);
    const ys = rows.map(point => dependent === 'y' ? point.y : point.x);
    const meanX = xs.reduce((sum, value) => sum + value, 0) / Math.max(1, xs.length);
    const meanY = ys.reduce((sum, value) => sum + value, 0) / Math.max(1, ys.length);
    let numerator = 0;
    let denominator = 0;
    for (let index = 0; index < xs.length; index += 1) {
      numerator += (xs[index] - meanX) * (ys[index] - meanY);
      denominator += (xs[index] - meanX) ** 2;
    }
    const slope = denominator > 1e-9 ? numerator / denominator : 0;
    return { slope, intercept:meanY - slope * meanX };
  };
  let fit = solve(values);
  for (let pass = 0; pass < 2 && values.length >= 10; pass += 1) {
    const residuals = values.map(point => {
      const independent = dependent === 'y' ? point.x : point.y;
      const observed = dependent === 'y' ? point.y : point.x;
      return Math.abs(observed - (fit.slope * independent + fit.intercept));
    });
    const limit = Math.max(1.5, percentile(residuals, .72) * 1.8);
    const kept = values.filter((_, index) => residuals[index] <= limit);
    if (kept.length < Math.max(6, values.length * .5)) break;
    values = kept;
    fit = solve(values);
  }
  return fit;
}

function intersect(topOrBottom, leftOrRight) {
  // v = a*u+b and u = c*v+d
  const denominator = 1 - leftOrRight.slope * topOrBottom.slope;
  if (Math.abs(denominator) < 1e-7) return null;
  const u = (leftOrRight.slope * topOrBottom.intercept + leftOrRight.intercept) / denominator;
  const v = topOrBottom.slope * u + topOrBottom.intercept;
  return { u, v };
}

function orderQuad(points = []) {
  if (points.length !== 4) return [];
  const center = {
    x:points.reduce((sum, point) => sum + point.x, 0) / 4,
    y:points.reduce((sum, point) => sum + point.y, 0) / 4,
  };
  const sorted = [...points].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
  const first = sorted.reduce((best, point, index) => point.x + point.y < sorted[best].x + sorted[best].y ? index : best, 0);
  const rotated = [...sorted.slice(first), ...sorted.slice(0, first)];
  if (polygonArea(rotated) < 1e-5) return [];
  return rotated;
}

export function fitPaperQuadrilateralV1067(boundaryPoints = []) {
  const points = boundaryPoints.filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  if (points.length < 24) return [];
  const cx = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const cy = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const point of points) {
    const dx = point.x - cx;
    const dy = point.y - cy;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  }
  const theta = .5 * Math.atan2(2 * xy, xx - yy);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const rotated = points.map(point => {
    const dx = point.x - cx;
    const dy = point.y - cy;
    return { u:dx * cos + dy * sin, v:-dx * sin + dy * cos };
  });
  const us = rotated.map(point => point.u);
  const vs = rotated.map(point => point.v);
  const u10 = percentile(us, .10);
  const u90 = percentile(us, .90);
  const v10 = percentile(vs, .10);
  const v90 = percentile(vs, .90);
  const top = fitLine(rotated.filter(point => point.v <= v10), 'y');
  const bottom = fitLine(rotated.filter(point => point.v >= v90), 'y');
  const left = fitLine(rotated.filter(point => point.u <= u10).map(point => ({ x:point.u, y:point.v })), 'x');
  const right = fitLine(rotated.filter(point => point.u >= u90).map(point => ({ x:point.u, y:point.v })), 'x');
  const local = [intersect(top, left), intersect(top, right), intersect(bottom, right), intersect(bottom, left)];
  if (local.some(point => !point || !Number.isFinite(point.u) || !Number.isFinite(point.v))) return [];
  const quad = local.map(point => ({
    x:cx + point.u * cos - point.v * sin,
    y:cy + point.u * sin + point.v * cos,
  }));
  const ordered = orderQuad(quad);
  if (ordered.length !== 4 || polygonArea(ordered) < 100) return [];
  return ordered;
}

function canvasForImage(image, maxDimension = 1200) {
  const sourceWidth = Number(image?.naturalWidth || image?.videoWidth || image?.width || 0);
  const sourceHeight = Number(image?.naturalHeight || image?.videoHeight || image?.height || 0);
  if (!sourceWidth || !sourceHeight || typeof document === 'undefined') return null;
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently:true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { canvas, context };
}

function maskAndBoundary(imageData, width, height, roi) {
  const pixels = imageData.data;
  const borderLuma = [];
  const borderSat = [];
  const ring = Math.max(3, Math.round(Math.min(roi.width, roi.height) * .06));
  for (let y = roi.top; y <= roi.bottom; y += 1) {
    for (let x = roi.left; x <= roi.right; x += 1) {
      if (x > roi.left + ring && x < roi.right - ring && y > roi.top + ring && y < roi.bottom - ring) continue;
      const index = (y * width + x) * 4;
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      borderLuma.push(.299 * r + .587 * g + .114 * b);
      borderSat.push(Math.max(r, g, b) - Math.min(r, g, b));
    }
  }
  const backgroundLuma = percentile(borderLuma, .5);
  const backgroundSat = percentile(borderSat, .5);
  const mask = new Uint8Array(width * height);
  for (let y = roi.top; y <= roi.bottom; y += 1) {
    for (let x = roi.left; x <= roi.right; x += 1) {
      const index = (y * width + x) * 4;
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const luma = .299 * r + .587 * g + .114 * b;
      const saturation = Math.max(r, g, b) - Math.min(r, g, b);
      const brighter = luma > backgroundLuma + Math.max(10, (220 - backgroundLuma) * .08);
      const paperLike = luma > 122 && saturation < Math.max(90, backgroundSat + 35);
      if (brighter && paperLike) mask[y * width + x] = 1;
    }
  }
  // Two majority passes close text holes and remove isolated carpet highlights.
  for (let pass = 0; pass < 2; pass += 1) {
    const next = new Uint8Array(mask);
    for (let y = roi.top + 1; y < roi.bottom; y += 1) {
      for (let x = roi.left + 1; x < roi.right; x += 1) {
        let count = 0;
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) count += mask[(y + dy) * width + x + dx];
        next[y * width + x] = count >= 5 ? 1 : 0;
      }
    }
    mask.set(next);
  }
  return mask;
}

function largestComponentBoundary(mask, width, height, roi) {
  const seen = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let best = null;
  for (let y = roi.top; y <= roi.bottom; y += 1) {
    for (let x = roi.left; x <= roi.right; x += 1) {
      const start = y * width + x;
      if (!mask[start] || seen[start]) continue;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      seen[start] = 1;
      const pixels = [];
      while (head < tail) {
        const current = queue[head++];
        pixels.push(current);
        const px = current % width;
        const py = Math.floor(current / width);
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (!dx && !dy) continue;
            const nx = px + dx;
            const ny = py + dy;
            if (nx < roi.left || nx > roi.right || ny < roi.top || ny > roi.bottom) continue;
            const next = ny * width + nx;
            if (!mask[next] || seen[next]) continue;
            seen[next] = 1;
            queue[tail++] = next;
          }
        }
      }
      if (!best || pixels.length > best.length) best = pixels;
    }
  }
  if (!best || best.length < roi.width * roi.height * .06) return [];
  const boundary = [];
  for (const current of best) {
    const x = current % width;
    const y = Math.floor(current / width);
    let edge = false;
    for (let dy = -1; dy <= 1 && !edge; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height || !mask[ny * width + nx]) { edge = true; break; }
      }
    }
    if (edge) boundary.push({ x, y });
  }
  return boundary;
}

function candidateRoi(candidate, width, height) {
  const contour = correctionContourV1064(candidate);
  const bounds = boundsOf(contour.length ? contour : [{ x:.04,y:.04 },{ x:.96,y:.04 },{ x:.96,y:.96 },{ x:.04,y:.96 }]);
  const padX = Math.max(8, Math.round((bounds.right - bounds.left) * width * .08));
  const padY = Math.max(8, Math.round((bounds.bottom - bounds.top) * height * .08));
  const left = Math.max(0, Math.floor(bounds.left * width) - padX);
  const right = Math.min(width - 1, Math.ceil(bounds.right * width) + padX);
  const top = Math.max(0, Math.floor(bounds.top * height) - padY);
  const bottom = Math.min(height - 1, Math.ceil(bounds.bottom * height) + padY);
  return { left, right, top, bottom, width:right-left+1, height:bottom-top+1 };
}

export async function refinePaperCandidateV1067(image, candidate) {
  if (!image || !candidate) return candidate;
  const rendered = canvasForImage(image, 1400);
  if (!rendered) return candidate;
  const { canvas, context } = rendered;
  const roi = candidateRoi(candidate, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const mask = maskAndBoundary(imageData, canvas.width, canvas.height, roi);
  const boundary = largestComponentBoundary(mask, canvas.width, canvas.height, roi);
  const quadPixels = fitPaperQuadrilateralV1067(boundary);
  if (quadPixels.length !== 4) return candidate;
  const contour = quadPixels.map(point => ({ x:clamp01(point.x / canvas.width), y:clamp01(point.y / canvas.height) }));
  const area = polygonArea(contour);
  if (area < .05 || area > .92) return candidate;
  return {
    ...candidate,
    id:`refined_${candidate.id || 'paper'}_v1067`,
    source:'photo-first-angle-refined-v1067',
    label:'Paper edge — angle corrected',
    contour,
    corners:{ topLeft:contour[0], topRight:contour[1], bottomRight:contour[2], bottomLeft:contour[3] },
    geometryMode:'planar',
    score:Math.max(Number(candidate.score || 0), .84),
    metrics:{ ...(candidate.metrics || {}), angleRefinedV1067:true, clippingRisk:0 },
  };
}
