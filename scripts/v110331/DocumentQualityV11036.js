// Deterministic capture guidance. Scores are image heuristics, never OCR accuracy.
import {cleanupDocumentPaper} from './paperCleanupV110331.js';
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const gray = (data, i) => data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722;
export function polygonArea(points = []) {
  return Math.abs(points.reduce((n, p, i) => { const q = points[(i + 1) % points.length]; return n + p.x * q.y - q.x * p.y; }, 0)) / 2;
}
function inside(x, y, points) {
  let odd = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) odd = !odd;
  }
  return odd;
}
export function assessDocumentQuality(image, options = {}) {
  if (!image?.data || image.width < 8 || image.height < 8) return { status:'retake', ready:false, issues:['Image is too small'], score:0, metrics:{} };
  const { width:w, height:h, data } = image;
  const points = options.corners?.length === 4 ? options.corners : [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
  const stride = Math.max(1, Math.floor(Math.sqrt(w * h / 100000)));
  const bins = new Uint32Array(256);
  let count = 0, sum = 0, lap = 0, lap2 = 0, edges = 0;
  for (let y = stride; y < h - stride; y += stride) for (let x = stride; x < w - stride; x += stride) {
    if (!inside(x / w, y / h, points)) continue;
    const i = (y * w + x) * 4, v = gray(data, i);
    const left = gray(data, i - stride * 4), right = gray(data, i + stride * 4);
    const above = gray(data, i - w * stride * 4), below = gray(data, i + w * stride * 4);
    const l = left + right + above + below - 4 * v;
    count++; sum += v; lap += l; lap2 += l * l; bins[Math.round(v)]++;
    if (Math.abs(right - left) + Math.abs(below - above) > 45) edges++;
  }
  const percentile = fraction => { let n = 0; for (let i = 0; i < 256; i++) { n += bins[i]; if (n >= count * fraction) return i; } return 255; };
  const mean = sum / Math.max(1, count), sharpness = Math.max(0, lap2 / Math.max(1, count) - (lap / Math.max(1,count)) ** 2);
  const contrast = percentile(.95) - percentile(.05), area = polygonArea(points);
  const nativeW = options.nativeWidth || w, nativeH = options.nativeHeight || h;
  const length = (a, b) => Math.hypot((a.x - b.x) * nativeW, (a.y - b.y) * nativeH);
  const shortEdge = Math.min(length(points[0],points[1]), length(points[1],points[2]), length(points[2],points[3]), length(points[3],points[0]));
  const issues = [];
  const detected=options.detectionFound!==false&&Number(options.detectionConfidence||0)>=.70;
  if (options.live && !detected) issues.push('Finding the paper… Tap Capture to adjust it manually.');
  if (options.live && detected && area < .20) issues.push('Move closer to the paper');
  if (options.live && detected && points.some(p => p.x < .006 || p.x > .994 || p.y < .006 || p.y > .994)) issues.push('Leave a little space around the paper');
  if (mean < 80) issues.push('Add light to the page');
  if (contrast < 18 || edges / Math.max(1,count) < .003) issues.push('Text is faint or missing — check focus and glare');
  else if (sharpness < 32) issues.push('Hold steady — text looks blurred');
  if (shortEdge < 950) issues.push(options.live ? 'Move closer for sharper small print' : 'Low resolution — move closer or use the phone camera');
  const score = clamp(Math.log1p(sharpness) / 9) * .65 + clamp(contrast / 100) * .2 + clamp(mean / 150) * .15;
  return { status:issues.length ? 'review' : 'ready', ready:issues.length === 0, issues, score, metrics:{mean, sharpness, contrast, area, shortEdge, edgeRatio:edges / Math.max(1,count)}, method:'page-region-heuristic-v11036' };
}

// Smooth per-channel paper illumination retains colored stamps/ink;
// no thresholding, content synthesis, or modification of the immutable input.
export function normalizePaperLighting(image) {return cleanupDocumentPaper(image);}
export function updateCaptureStability(previous, detection, quality, now) {
  const old = previous?.corners, corners=detection.corners;
  const movement=old?.length===4 ? Math.max(...corners.map((p,i)=>Math.hypot(p.x-old[i].x,p.y-old[i].y))) : Infinity;
  const stable=quality.ready && movement<.018 && (!previous || now-previous.lastAt<900);
  const since=stable && previous?.since != null ? previous.since : now;
  return {corners,lastAt:now,since,ready:stable && now-since>=1300,movement};
}
