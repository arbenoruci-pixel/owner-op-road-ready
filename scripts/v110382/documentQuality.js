// Deterministic capture guidance. Scores are image heuristics, never OCR accuracy.
import {cleanupDocumentPaper} from '../v110345/paperQuality.js';
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
  if (!image?.data || ![image.width,image.height].every(n=>Number.isInteger(n)&&n>=8) || image.data.length!==image.width*image.height*4) return { status:'retake', ready:false, issues:['Image is too small'], score:0, metrics:{} };
  const { width:w, height:h, data } = image;
  if(options.corners&&(!Array.isArray(options.corners)||options.corners.length!==4||options.corners.some(p=>!p)))return {status:'retake',ready:false,issues:['Adjust the four paper corners'],score:0,metrics:{}};
  const points = options.corners?.length === 4 ? options.corners : [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
  const cross=points.map((p,i)=>{const q=points[(i+1)%4],r=points[(i+2)%4];return (q.x-p.x)*(r.y-q.y)-(q.y-p.y)*(r.x-q.x);});
  if(points.some(p=>![p.x,p.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1))||polygonArea(points)<.001||!cross.every(n=>n>0)&&!cross.every(n=>n<0))return {status:'retake',ready:false,issues:['Adjust the four paper corners'],score:0,metrics:{}};
  const bounds={left:Math.min(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),right:Math.max(...points.map(p=>p.x)),bottom:Math.max(...points.map(p=>p.y))};
  const tiles=Array.from({length:24},()=>({count:0,lap:0,lap2:0,edges:0}));
  const stride = Math.max(1, Math.floor(Math.sqrt(w * h / 100000)));
  const bins = new Uint32Array(256);
  let count = 0, sum = 0, lap = 0, lap2 = 0, edges = 0;
  for (let y = stride; y < h - stride; y += stride) for (let x = stride; x < w - stride; x += stride) {
    // Keep every derivative neighbor inside the paper.
    if (!inside(x/w,y/h,points)||!inside((x-stride)/w,y/h,points)||!inside((x+stride)/w,y/h,points)||!inside(x/w,(y-stride)/h,points)||!inside(x/w,(y+stride)/h,points)) continue;
    const i = (y * w + x) * 4, v = gray(data, i);
    const left = gray(data, i - stride * 4), right = gray(data, i + stride * 4);
    const above = gray(data, i - w * stride * 4), below = gray(data, i + w * stride * 4);
    const l = left + right + above + below - 4 * v;
    count++; sum += v; lap += l; lap2 += l * l; bins[Math.round(v)]++;
    const edge=Math.abs(right-left)+Math.abs(below-above)>45;if(edge)edges++;
    const column=Math.min(3,Math.floor((x/w-bounds.left)/(bounds.right-bounds.left)*4)),row=Math.min(5,Math.floor((y/h-bounds.top)/(bounds.bottom-bounds.top)*6));
    const tile=tiles[row*4+column];tile.count++;tile.lap+=l;tile.lap2+=l*l;if(edge)tile.edges++;
  }
  if(!count)return {status:'retake',ready:false,issues:['Paper region is too small'],score:0,metrics:{}};
  const percentile = fraction => { let n = 0; for (let i = 0; i < 256; i++) { n += bins[i]; if (n >= count * fraction) return i; } return 255; };
  const mean = sum / Math.max(1, count), sharpness = Math.max(0, lap2 / Math.max(1, count) - (lap / Math.max(1,count)) ** 2);
  const contrast = percentile(.95) - percentile(.05), area = polygonArea(points);
  const nativeW = options.nativeWidth || w, nativeH = options.nativeHeight || h;
  const length = (a, b) => Math.hypot((a.x - b.x) * nativeW, (a.y - b.y) * nativeH);
  const shortEdge = Math.min(length(points[0],points[1]), length(points[1],points[2]), length(points[2],points[3]), length(points[3],points[0]));
  // Diagnose text-bearing tiles without diluting focus with blank margins.
  const textTiles=tiles.filter(t=>t.count>=64&&t.edges/t.count>=.005);
  const tileSharpness=textTiles.map(t=>Math.max(0,t.lap2/t.count-(t.lap/t.count)**2)).sort((a,b)=>a-b);
  const textSharpness=tileSharpness.length?tileSharpness[Math.floor((tileSharpness.length-1)*.25)]:null;
  const issues = [];
  const detected=options.detectionFound!==false&&Number(options.detectionConfidence||0)>=.70;
  if (options.live && !detected) issues.push('Finding the paper… Tap Capture to adjust it manually.');
  if (options.live && detected && area < .20) issues.push('Move closer to the paper');
  if (options.live && detected && points.some(p => p.x < .006 || p.x > .994 || p.y < .006 || p.y > .994)) issues.push('Leave a little space around the paper');
  if (mean < 80) issues.push('Add light to the page');
  if (contrast < 18 || edges / Math.max(1,count) < .003) issues.push('Text is faint or missing — check focus and glare');
  else if (sharpness < 32 || textTiles.length>=3&&textSharpness<32) issues.push('Hold steady — text looks blurred');
  if (shortEdge < 950) issues.push(options.live ? 'Move closer for sharper small print' : 'Low resolution — move closer or use the phone camera');
  const score = clamp(Math.log1p(sharpness) / 9) * .65 + clamp(contrast / 100) * .2 + clamp(mean / 150) * .15;
  return { status:issues.length ? 'review' : 'ready', ready:issues.length === 0, issues, score, metrics:{mean, sharpness, contrast, area, shortEdge, edgeRatio:edges / count, sampledPixels:count,textSharpness,textTileCount:textTiles.length}, method:'paper-interior-focus-v110382' };
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
