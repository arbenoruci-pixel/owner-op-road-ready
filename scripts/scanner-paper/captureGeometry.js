import {validBoundary,FULL_FRAME} from './documentBoundaryV110329.js';
import {paperContinuation} from './safeDocumentBoundaryV110428.js';

export function bindCapture(file,reading,details={}){
  return {version:1,file:{name:file.name,size:file.size,type:file.type,lastModified:file.lastModified},width:reading.width,height:reading.height,
    detection:{found:reading.detection.found,confidence:reading.detection.confidence,corners:reading.detection.corners?.map(p=>({...p}))},...details};
}

// Geometry belongs to the exact selected still/frame. Never reuse live-video
// coordinates after a changed resolution, orientation or document boundary.
export function captureGeometry(file,image,capture,detection){
  const full=reason=>({corners:FULL_FRAME.map(p=>({...p})),reason,review:true});
  if(!capture)return {corners:detection?.found&&detection.confidence>=.80&&validBoundary(detection.corners)?detection.corners:FULL_FRAME.map(p=>({...p})),reason:'detected',review:!detection?.found};
  if(capture.version!==1||!capture.file||!['name','size','type','lastModified'].every(k=>capture.file[k]===file[k]))return full('capture-file-mismatch');
  if(!(capture.width>0&&capture.height>0)||Math.abs((capture.width/capture.height)/(image.width/image.height)-1)>.02)return full('capture-orientation-mismatch');
  const saved=capture.detection;
  if(!saved?.found||saved.confidence<.80||!validBoundary(saved.corners))return full('capture-edges-uncertain');
  if(!detection?.found||detection.confidence<.80||!validBoundary(detection.corners))return full('final-edges-uncertain');
  const movement=Math.max(...saved.corners.map((p,i)=>Math.hypot(p.x-detection.corners[i].x,p.y-detection.corners[i].y)));
  if(movement>.035)return full('capture-edges-disagree');
  return {corners:saved.corners.map(p=>({...p})),reason:'selected-capture',review:false};
}

// Confirm an outer paper edge directly on the pixels that will be exported.
// Check both near and distant exterior samples: a thin printed table or dark
// rule inside the sheet should have paper on its far side. The conservative
// dark-surrounding test is only a recovery path after normal detection fails.
function hasDarkSurroundOnFourEdges(image, corners) {
  const {width, height, data} = image;
  if (width < 96 || height < 96 || data?.length !== width * height * 4) return false;
  const unit = Math.min(width, height);
  function light(x, y) {
    const i = (Math.round(y) * width + Math.round(x)) * 4;
    return .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
  }
  const center = corners.reduce((p, q) => ({x:p.x + q.x / 4, y:p.y + q.y / 4}), {x:0, y:0});
  return corners.every((a, i) => {
    const b = corners[(i + 1) % 4];
    const dx = (b.x - a.x) * (width - 1), dy = (b.y - a.y) * (height - 1);
    const len = Math.hypot(dx, dy);
    if (len < unit * .15) return false;
    let nx = -dy / len, ny = dx / len;
    if ((center.x - a.x) * (width - 1) * nx + (center.y - a.y) * (height - 1) * ny < 0) {
      nx = -nx; ny = -ny;
    }
    let good = 0;
    for (let k = 1; k <= 15; k++) {
      const t = k / 16, x = a.x * (width - 1) + dx * t, y = a.y * (height - 1) + dy * t;
      const sample = distance => {
        const px = x + nx * unit * distance, py = y + ny * unit * distance;
        return px < 0 || py < 0 || px > width - 1 || py > height - 1 ? NaN : light(px, py);
      };
      const inside = Math.max(sample(.016), sample(.03));
      const nearOutside = Math.max(sample(-.016), sample(-.035), sample(-.065));
      // A thick printed border can extend past the first probes. Look farther
      // for paper continuation wherever the original photo includes the margin.
      const farOutside = [-.10, -.15].map(sample).filter(Number.isFinite);
      const outside = Math.max(nearOutside, ...farOutside);
      if (inside >= 65 && inside - outside >= 34 && outside <= .57 * inside) good++;
    }
    return good >= 12;
  });
}

export function podCaptureGeometry(file, image, capture, detection) {
  const result = captureGeometry(file, image, capture, detection);
  const usable = d => d?.found && d.confidence >= .80 && validBoundary(d.corners);
  const crossesDimPaper = corners => image.data?.length === image.width * image.height * 4 &&
    paperContinuation(image, corners, {shadows:true, dimPaperOnly:true}).some(support => support >= .65);
  const keepWhole = () => ({corners:FULL_FRAME.map(p => ({...p})), reason:'pod-paper-beyond-edge', review:true});
  if (!result.review && (capture || usable(detection)) && crossesDimPaper(result.corners)) return keepWhole();
  if (!capture) return usable(detection) ? result : {...result, review:true};
  if (!result.review || result.reason === 'capture-file-mismatch' ||
      result.reason === 'capture-orientation-mismatch') return result;
  const saved = capture.detection;
  // Conflicting reliable candidates or specific internal-rule vetoes get a
  // manual suggestion. The exported image stays whole until the driver agrees.
  const proposed = usable(saved) ? saved : usable(detection) ? detection : null;
  if (!proposed) return result;
  const suggestedCorners = proposed.corners.map(p => ({...p}));
  if (crossesDimPaper(suggestedCorners)) return keepWhole();
  if (result.reason !== 'capture-edges-disagree' &&
      (result.reason === 'final-edges-uncertain' || result.reason === 'capture-edges-uncertain') &&
      !/internal-rule|already-framed/.test(detection?.method || '') &&
      proposed.confidence >= .86 && hasDarkSurroundOnFourEdges(image, suggestedCorners)) {
    // Retain a little exterior paper margin around fine print and signatures.
    const cx = suggestedCorners.reduce((sum, p) => sum + p.x / 4, 0);
    const cy = suggestedCorners.reduce((sum, p) => sum + p.y / 4, 0);
    const pad = (p, c) => Math.min(1, Math.max(0, p + (p - c) * .015));
    return {corners:suggestedCorners.map(p => ({x:pad(p.x,cx),y:pad(p.y,cy)})), reason:'pod-verified-outer-edges', review:false};
  }
  return {...result, suggestedCorners};
}
