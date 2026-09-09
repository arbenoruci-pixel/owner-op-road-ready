// Deterministic capture guidance. Scores are image heuristics, never OCR accuracy.
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
  if (options.live && Number(options.detectionConfidence || 0) < .65) issues.push('Show all four paper corners');
  if (options.live && area < .27) issues.push('Move closer to the paper');
  if (options.live && points.some(p => p.x < .012 || p.x > .988 || p.y < .012 || p.y > .988)) issues.push('Keep the whole page inside the camera');
  if (mean < 80) issues.push('Add light to the page');
  if (contrast < 18 || edges / Math.max(1,count) < .003) issues.push('Text is faint or missing — check focus and glare');
  else if (sharpness < 32) issues.push('Hold steady — text looks blurred');
  if (shortEdge < 950) issues.push(options.live ? 'Move closer for sharper small print' : 'Low resolution — move closer or use the phone camera');
  const score = clamp(Math.log1p(sharpness) / 9) * .65 + clamp(contrast / 100) * .2 + clamp(mean / 150) * .15;
  return { status:issues.length ? 'review' : 'ready', ready:issues.length === 0, issues, score, metrics:{mean, sharpness, contrast, area, shortEdge, edgeRatio:edges / Math.max(1,count)}, method:'page-region-heuristic-v11036' };
}

// Smooth per-channel paper illumination retains colored stamps/ink;
// no thresholding, content synthesis, or modification of the immutable input.
export function normalizePaperLighting(image) {
  const {width:w,height:h,data} = image;
  const cell = Math.max(48, Math.round(Math.min(w,h) / 16));
  const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
  const paper = new Float32Array(cols * rows * 3);
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    const hist = [new Uint32Array(256),new Uint32Array(256),new Uint32Array(256)]; let n = 0;
    for (let y = cy * cell; y < Math.min(h,(cy+1)*cell); y+=3) for (let x = cx * cell; x < Math.min(w,(cx+1)*cell); x+=3) {for(let c=0;c<3;c++)hist[c][data[(y*w+x)*4+c]]++; n++; }
    for(let c=0;c<3;c++){let total=0,p=255;for(let k=0;k<256;k++){total+=hist[c][k];if(total>=n*.88){p=k;break;}}paper[(cy*cols+cx)*3+c]=Math.max(110,p);}
  }
  const out = new Uint8ClampedArray(data.length);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const gx=clamp(x/cell-.5,0,cols-1), gy=clamp(y/cell-.5,0,rows-1), x0=Math.floor(gx),y0=Math.floor(gy), x1=Math.min(cols-1,x0+1),y1=Math.min(rows-1,y0+1), fx=gx-x0,fy=gy-y0;
    const i=(y*w+x)*4;
    for(let c=0;c<3;c++) {
      const bg=(paper[(y0*cols+x0)*3+c]*(1-fx)+paper[(y0*cols+x1)*3+c]*fx)*(1-fy)+(paper[(y1*cols+x0)*3+c]*(1-fx)+paper[(y1*cols+x1)*3+c]*fx)*fy;
      out[i+c]=244*Math.pow(clamp(data[i+c]/bg,0,1.03),1.25);
    }
    out[i+3]=data[i+3];
  }
  return {width:w,height:h,data:out};
}

export function updateCaptureStability(previous, detection, quality, now) {
  const old = previous?.corners, corners=detection.corners;
  const movement=old?.length===4 ? Math.max(...corners.map((p,i)=>Math.hypot(p.x-old[i].x,p.y-old[i].y))) : Infinity;
  const stable=quality.ready && movement<.018 && (!previous || now-previous.lastAt<900);
  const since=stable && previous?.since != null ? previous.since : now;
  return {corners,lastAt:now,since,ready:stable && now-since>=1300,movement};
}
