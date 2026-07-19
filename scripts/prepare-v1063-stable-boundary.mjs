import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
const write = (relative, content) => {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
};
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v106.3 missing ${label}`);
  return content.replace(before, after);
}

const webAssetPath = 'scripts/v106-assets/webScannerAdapterV106.js.gz.b64';
let web = gunzipSync(Buffer.from(read(webAssetPath), 'base64')).toString('utf8');
if (!web.includes('stable-paper-boundary-v1063')) {
  const helpers = `// stable-paper-boundary-v1063
function percentileV1063(values = [], ratio = .5) {
  const ordered = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!ordered.length) return 0;
  const index = Math.max(0, Math.min(ordered.length - 1, Math.round((ordered.length - 1) * ratio)));
  return ordered[index];
}

function lineFitV1063(points = []) {
  const values = points.filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  if (values.length < 2) return { slope:0, intercept:values[0]?.y || 0, residual:1 };
  const meanX = values.reduce((sum, point) => sum + point.x, 0) / values.length;
  const meanY = values.reduce((sum, point) => sum + point.y, 0) / values.length;
  let numerator = 0;
  let denominator = 0;
  for (const point of values) {
    numerator += (point.x - meanX) * (point.y - meanY);
    denominator += (point.x - meanX) ** 2;
  }
  const slope = Math.abs(denominator) > 1e-8 ? numerator / denominator : 0;
  const intercept = meanY - slope * meanX;
  const residuals = values.map(point => Math.abs(point.y - (slope * point.x + intercept)));
  return { slope, intercept, residual:percentileV1063(residuals, .75) };
}

function trimmedLineFitV1063(points = []) {
  let values = points.filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  let fit = lineFitV1063(values);
  for (let pass = 0; pass < 2 && values.length >= 5; pass += 1) {
    const residuals = values.map(point => Math.abs(point.y - (fit.slope * point.x + fit.intercept)));
    const limit = Math.max(.006, percentileV1063(residuals, .7) * 1.7);
    const kept = values.filter((point, index) => residuals[index] <= limit);
    if (kept.length < Math.max(4, Math.round(values.length * .55))) break;
    values = kept;
    fit = lineFitV1063(values);
  }
  return fit;
}

function boundsContourV1063(bounds = {}, padding = .006) {
  const left = clamp01V106(Number(bounds.left || 0) - padding);
  const top = clamp01V106(Number(bounds.top || 0) - padding);
  const right = clamp01V106(Number(bounds.right || 1) + padding);
  const bottom = clamp01V106(Number(bounds.bottom || 1) + padding);
  return [
    { x:left, y:top },
    { x:right, y:top },
    { x:right, y:bottom },
    { x:left, y:bottom },
  ];
}

export function paperBoundaryResidualV1063(mesh = {}) {
  const top = (mesh.top || []).filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  const bottom = (mesh.bottom || []).filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  if (top.length < 4 || bottom.length < 4) return 1;
  return Math.max(trimmedLineFitV1063(top).residual, trimmedLineFitV1063(bottom).residual);
}

export function robustPaperContourV1063(mesh = {}, fallbackContour = []) {
  const top = (mesh.top || []).filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  const bottom = (mesh.bottom || []).filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  const fallbackBounds = contourBoundsV106(fallbackContour);
  if (top.length < 4 || bottom.length < 4) return boundsContourV1063(fallbackBounds);
  const allX = [...top, ...bottom].map(point => point.x);
  const left = clamp01V106(percentileV1063(allX, .025));
  const right = clamp01V106(percentileV1063(allX, .975));
  const topFit = trimmedLineFitV1063(top);
  const bottomFit = trimmedLineFitV1063(bottom);
  const topAt = x => clamp01V106(topFit.slope * x + topFit.intercept);
  const bottomAt = x => clamp01V106(bottomFit.slope * x + bottomFit.intercept);
  let contour = [
    { x:left, y:topAt(left) },
    { x:right, y:topAt(right) },
    { x:right, y:bottomAt(right) },
    { x:left, y:bottomAt(left) },
  ];
  const leftHeight = contour[3].y - contour[0].y;
  const rightHeight = contour[2].y - contour[1].y;
  const residual = Math.max(topFit.residual, bottomFit.residual);
  const invalid = right - left < .16
    || Math.min(leftHeight, rightHeight) < .16
    || !contour.every(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (invalid || residual > .045) return boundsContourV1063(fallbackBounds);
  const topBand = percentileV1063(top.map(point => point.y), .2);
  const bottomBand = percentileV1063(bottom.map(point => point.y), .8);
  contour = contour.map((point, index) => ({
    x:clamp01V106(point.x + (index === 0 || index === 3 ? -.004 : .004)),
    y:clamp01V106(index < 2 ? Math.min(point.y, topBand + .012) - .004 : Math.max(point.y, bottomBand - .012) + .004),
  }));
  return contour;
}

`;
  web = replaceOnce(web, 'function fullPhotoCandidateV106() {', `${helpers}function fullPhotoCandidateV106() {`, 'stable paper boundary helpers');

  const oldPaperCandidate = `        const mesh = meshFromComponentV106(component, grid, component.maxX - component.minX > 45 ? 24 : 16);
        return createDocumentCandidateV106({
          source:'paper-segmentation',
          label:\`Paper candidate \${index + 1}\`,
          contour:contourFromMeshV106(mesh),
          mesh,
          metrics:regionMetricsV106(component, grid, mesh),
        });`;
  const newPaperCandidate = `        const mesh = meshFromComponentV106(component, grid, component.maxX - component.minX > 45 ? 24 : 16);
        const rawContour = contourFromMeshV106(mesh);
        const contour = robustPaperContourV1063(mesh, rawContour);
        const metrics = regionMetricsV106(component, grid, mesh);
        const boundaryResidual = paperBoundaryResidualV1063(mesh);
        return createDocumentCandidateV106({
          source:'paper-segmentation',
          label:\`Paper candidate \${index + 1}\`,
          contour,
          mesh,
          metrics:{
            ...metrics,
            boundaryResidual,
            curvatureScore:boundaryResidual > .028 ? Math.min(Number(metrics.curvatureScore || 0), .1) : Number(metrics.curvatureScore || 0),
          },
        });`;
  web = replaceOnce(web, oldPaperCandidate, newPaperCandidate, 'paper segmentation robust quadrilateral');
}
write(webAssetPath, gzipSync(Buffer.from(web), { mtime:0 }).toString('base64'));

const captureAssetPath = 'scripts/v106-assets/SmartDocumentCaptureV106.jsx.gz.b64';
let capture = gunzipSync(Buffer.from(read(captureAssetPath), 'base64')).toString('utf8');
if (!capture.includes('stable-live-boundary-v1063')) {
  const deltaBlock = `function candidateDelta(left = [], right = []) {
  const a = normalizeContourV106(left);
  const b = normalizeContourV106(right);
  if (a.length !== b.length) return 1;
  return a.reduce((sum, point, index) => sum + Math.hypot(point.x - b[index].x, point.y - b[index].y), 0) / a.length;
}`;
  const liveHelpers = `// stable-live-boundary-v1063
function liveBoundsV1063(contour = []) {
  const points = normalizeContourV106(contour);
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return { left, right, top, bottom, width:right-left, height:bottom-top, area:Math.max(0,(right-left)*(bottom-top)) };
}
function liveCornersV1063(candidate = {}) {
  const corners = candidate.corners || {};
  const ordered = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  if (ordered.every(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))) {
    return ordered.map(point => ({ x:Math.max(.002,Math.min(.998,point.x)), y:Math.max(.002,Math.min(.998,point.y)) }));
  }
  const bounds = liveBoundsV1063(candidate.contour || []);
  return [
    { x:bounds.left, y:bounds.top },
    { x:bounds.right, y:bounds.top },
    { x:bounds.right, y:bounds.bottom },
    { x:bounds.left, y:bounds.bottom },
  ];
}
function normalizeLiveCandidateV1063(candidate = null) {
  if (!candidate) return null;
  const contour = liveCornersV1063(candidate);
  return { ...candidate, contour, geometryMode:'planar' };
}
function liveBoundsIoUV1063(left = {}, right = {}) {
  const x1 = Math.max(left.left || 0, right.left || 0);
  const y1 = Math.max(left.top || 0, right.top || 0);
  const x2 = Math.min(left.right || 0, right.right || 0);
  const y2 = Math.min(left.bottom || 0, right.bottom || 0);
  const intersection = Math.max(0,x2-x1) * Math.max(0,y2-y1);
  const union = Math.max(1e-6,(left.area||0)+(right.area||0)-intersection);
  return intersection / union;
}
function liveCenterDistanceV1063(left = {}, right = {}) {
  const lx = ((left.left||0)+(left.right||0))/2;
  const ly = ((left.top||0)+(left.bottom||0))/2;
  const rx = ((right.left||0)+(right.right||0))/2;
  const ry = ((right.top||0)+(right.bottom||0))/2;
  return Math.hypot(lx-rx,ly-ry);
}
function liveSourceBonusV1063(source = '') {
  if (source === 'paper-text-fusion') return .1;
  if (source === 'rectangle-detection') return .085;
  if (source === 'paper-segmentation') return .065;
  if (source === 'saliency') return .015;
  if (source === 'edge-density') return 0;
  if (source === 'text-density') return -.1;
  return 0;
}
function chooseLiveCandidateV1063(candidates = [], previous = null) {
  const previousBounds = previous ? liveBoundsV1063(previous.contour) : null;
  return (candidates || [])
    .filter(candidate => candidate && !candidate.fullPhoto)
    .map(candidate => normalizeLiveCandidateV1063(candidate))
    .map(candidate => {
      const bounds = liveBoundsV1063(candidate.contour);
      const edgeTouches = [bounds.left <= .018,bounds.top <= .018,bounds.right >= .982,bounds.bottom >= .982].filter(Boolean).length;
      let rank = Number(candidate.score || 0) + liveSourceBonusV1063(candidate.source);
      if (bounds.area < .08) rank -= .2;
      if (bounds.area > .86) rank -= (bounds.area-.86)*1.4;
      if (edgeTouches >= 2) rank -= edgeTouches*.12;
      if (previousBounds) {
        const overlap = liveBoundsIoUV1063(previousBounds,bounds);
        const centerDistance = liveCenterDistanceV1063(previousBounds,bounds);
        const areaDelta = Math.abs(Math.log(Math.max(1e-5,bounds.area)/Math.max(1e-5,previousBounds.area)));
        rank += overlap*.2 - centerDistance*.2 - areaDelta*.055;
      }
      return { candidate, rank };
    })
    .sort((left,right) => right.rank-left.rank || String(left.candidate.id||'').localeCompare(String(right.candidate.id||'')))[0]?.candidate || null;
}
function smoothLiveCandidateV1063(previous = null, next = null) {
  if (!next) return null;
  if (!previous) return normalizeLiveCandidateV1063(next);
  const a = liveCornersV1063(previous);
  const b = liveCornersV1063(next);
  const previousBounds = liveBoundsV1063(a);
  const nextBounds = liveBoundsV1063(b);
  const overlap = liveBoundsIoUV1063(previousBounds,nextBounds);
  const distance = liveCenterDistanceV1063(previousBounds,nextBounds);
  if (overlap < .12 && distance > .24) return normalizeLiveCandidateV1063(next);
  const alpha = overlap >= .62 ? .24 : overlap >= .35 ? .36 : .5;
  const contour = a.map((point,index) => ({
    x:point.x+(b[index].x-point.x)*alpha,
    y:point.y+(b[index].y-point.y)*alpha,
  }));
  return { ...next, contour, geometryMode:'planar' };
}`;
  capture = replaceOnce(capture, deltaBlock, `${deltaBlock}\n\n${liveHelpers}`, 'live boundary helpers');
  capture = capture.replace('const stableRef = useRef({ contour:null, count:0 });', 'const stableRef = useRef({ contour:null, count:0, candidate:null });');
  capture = capture.replaceAll('stableRef.current = { contour:null, count:0 };', 'stableRef.current = { contour:null, count:0, candidate:null };');

  const oldLiveLoop = `          const found = await adapter().detectDocumentRegions(canvas, { maxDimension:560, gridMax:64 });
          const strongest = found.find(candidate => !candidate.fullPhoto) || null;
          if (!mountedRef.current) return;
          setLiveCandidate(strongest);
          const previous = stableRef.current.contour;
          const stable = Boolean(
            strongest
            && strongest.score >= .62
            && contourAreaV106(strongest.contour) >= .16
            && nextQuality.good
            && (!previous || candidateDelta(previous, strongest.contour) < .035)
          );
          const count = stable ? Math.min(5, stableRef.current.count + 1) : 0;
          stableRef.current = { contour:strongest?.contour || null, count };
          setStableFrames(count);
          setStatus(exactCameraHint(nextQuality, Boolean(strongest), count));
          if (autoCapture && count >= 4 && !captureBusyRef.current) capturePage();`;
  const newLiveLoop = `          const found = await adapter().detectDocumentRegions(canvas, { maxDimension:560, gridMax:64 });
          const chosen = chooseLiveCandidateV1063(found, stableRef.current.candidate);
          const strongest = smoothLiveCandidateV1063(stableRef.current.candidate, chosen);
          if (!mountedRef.current) return;
          setLiveCandidate(strongest);
          const previous = stableRef.current.contour;
          const previousCandidate = stableRef.current.candidate;
          const overlap = previousCandidate && strongest
            ? liveBoundsIoUV1063(liveBoundsV1063(previousCandidate.contour), liveBoundsV1063(strongest.contour))
            : 0;
          const stable = Boolean(
            strongest
            && strongest.score >= .58
            && contourAreaV106(strongest.contour) >= .16
            && contourAreaV106(strongest.contour) <= .82
            && nextQuality.good
            && previous
            && candidateDelta(previous, strongest.contour) < .02
            && overlap >= .7
          );
          const count = stable ? Math.min(6, stableRef.current.count + 1) : strongest ? 1 : 0;
          stableRef.current = { contour:strongest?.contour || null, count, candidate:strongest };
          setStableFrames(count);
          setStatus(exactCameraHint(nextQuality, Boolean(strongest), count));
          if (autoCapture && count >= 5 && !captureBusyRef.current) capturePage();`;
  capture = replaceOnce(capture, oldLiveLoop, newLiveLoop, 'temporally stable live candidate');

  capture = replaceOnce(
    capture,
    `        const first = found[0];
        setCandidates(found);
        setSelectedCandidateId(first?.id || '');
        setAutomaticContour(first?.contour || []);
        setContour(first?.contour || []);`,
    `        const first = chooseLiveCandidateV1063(found, null) || found[0] || null;
        setCandidates(found);
        setSelectedCandidateId(first?.id || '');
        setAutomaticContour(first?.contour || []);
        setContour(first?.contour || []);`,
    'full-resolution first paper selection',
  );

  capture = replaceOnce(
    capture,
    `  function selectCandidate(candidate) {
    setSelectedCandidateId(candidate.id);
    setAutomaticContour(candidate.contour || []);
    setContour(candidate.contour || []);`,
    `  function selectCandidate(candidate) {
    const normalizedCandidate = normalizeLiveCandidateV1063(candidate);
    setSelectedCandidateId(candidate.id);
    setAutomaticContour(normalizedCandidate?.contour || []);
    setContour(normalizedCandidate?.contour || []);`,
    'manual candidate boundary normalization',
  );

  capture = replaceOnce(
    capture,
    `  const frameFound = Boolean(liveCandidate && contourAreaV106(liveCandidate.contour) >= .12);`,
    `  const frameFound = Boolean(liveCandidate && normalizeContourV106(liveCandidate.contour).length === 4 && contourAreaV106(liveCandidate.contour) >= .12);`,
    'four-corner live frame requirement',
  );
}
write(captureAssetPath, gzipSync(Buffer.from(capture), { mtime:0 }).toString('base64'));

console.log('v106.3 stable page boundary assets prepared');
