import {
  candidateFingerprintV106,
  clamp01V106,
  contourAreaV106,
  contourBoundsV106,
  normalizeContourV106,
  normalizePointV106,
  stableSortCandidatesV106,
} from './scannerContractsV106.js';

function distanceV106(a = {}, b = {}) {
  return Math.hypot(Number(a.x || 0) - Number(b.x || 0), Number(a.y || 0) - Number(b.y || 0));
}

function interpolateV106(a, b, ratio) {
  return {
    x:Number(a.x || 0) + (Number(b.x || 0) - Number(a.x || 0)) * ratio,
    y:Number(a.y || 0) + (Number(b.y || 0) - Number(a.y || 0)) * ratio,
  };
}

export function cornersFromContourV106(contour = []) {
  const points = normalizeContourV106(contour);
  const topLeft = points.reduce((best, point) => point.x + point.y < best.x + best.y ? point : best, points[0]);
  const bottomRight = points.reduce((best, point) => point.x + point.y > best.x + best.y ? point : best, points[0]);
  const topRight = points.reduce((best, point) => point.x - point.y > best.x - best.y ? point : best, points[0]);
  const bottomLeft = points.reduce((best, point) => point.x - point.y < best.x - best.y ? point : best, points[0]);
  return {
    topLeft:normalizePointV106(topLeft),
    topRight:normalizePointV106(topRight),
    bottomRight:normalizePointV106(bottomRight),
    bottomLeft:normalizePointV106(bottomLeft),
  };
}

export function contourFromCornersV106(corners = {}, controlPoints = 8) {
  const values = {
    topLeft:normalizePointV106(corners.topLeft || { x:.04, y:.04 }),
    topRight:normalizePointV106(corners.topRight || { x:.96, y:.04 }),
    bottomRight:normalizePointV106(corners.bottomRight || { x:.96, y:.96 }),
    bottomLeft:normalizePointV106(corners.bottomLeft || { x:.04, y:.96 }),
  };
  if (controlPoints <= 4) return [values.topLeft, values.topRight, values.bottomRight, values.bottomLeft];
  return [
    values.topLeft,
    interpolateV106(values.topLeft, values.topRight, .5),
    values.topRight,
    interpolateV106(values.topRight, values.bottomRight, .5),
    values.bottomRight,
    interpolateV106(values.bottomRight, values.bottomLeft, .5),
    values.bottomLeft,
    interpolateV106(values.bottomLeft, values.topLeft, .5),
  ];
}


export function meshFromContourV106(contour = [], segments = 20) {
  const points = normalizeContourV106(contour);
  const bounds = contourBoundsV106(points);
  const count = Math.max(8, Math.min(64, Number(segments || 20)));
  const top = [];
  const bottom = [];
  for (let index = 0; index <= count; index += 1) {
    const x = bounds.left + (bounds.width * index / count);
    const intersections = [];
    for (let edge = 0; edge < points.length; edge += 1) {
      const a = points[edge];
      const b = points[(edge + 1) % points.length];
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);
      if (x < minX - 1e-7 || x > maxX + 1e-7 || Math.abs(a.x - b.x) < 1e-7) continue;
      const ratio = (x - a.x) / (b.x - a.x);
      if (ratio < -1e-7 || ratio > 1 + 1e-7) continue;
      intersections.push(a.y + ((b.y - a.y) * ratio));
    }
    intersections.sort((left, right) => left - right);
    if (intersections.length >= 2) {
      top.push({ x, y:intersections[0] });
      bottom.push({ x, y:intersections[intersections.length - 1] });
    } else {
      top.push({ x, y:bounds.top });
      bottom.push({ x, y:bounds.bottom });
    }
  }
  return { top, bottom };
}

export function linearMeshV106(corners = {}, segments = 16) {
  const count = Math.max(4, Math.min(64, Number(segments || 16)));
  const normalized = cornersFromContourV106(contourFromCornersV106(corners, 4));
  const top = [];
  const bottom = [];
  for (let index = 0; index <= count; index += 1) {
    const ratio = index / count;
    top.push(interpolateV106(normalized.topLeft, normalized.topRight, ratio));
    bottom.push(interpolateV106(normalized.bottomLeft, normalized.bottomRight, ratio));
  }
  return { top, bottom };
}

function lineDeviationV106(points = []) {
  if (points.length < 3) return 0;
  const first = points[0];
  const last = points[points.length - 1];
  const length = Math.max(1e-6, distanceV106(first, last));
  return points.reduce((sum, point, index) => {
    const ratio = index / (points.length - 1);
    const expected = interpolateV106(first, last, ratio);
    return sum + distanceV106(point, expected) / length;
  }, 0) / points.length;
}

export function curvatureScoreV106(mesh = {}) {
  return clamp01V106((lineDeviationV106(mesh.top || []) + lineDeviationV106(mesh.bottom || [])) * 3.2);
}

export function perspectiveSeverityV106(corners = {}) {
  const value = cornersFromContourV106(contourFromCornersV106(corners, 4));
  const top = distanceV106(value.topLeft, value.topRight);
  const bottom = distanceV106(value.bottomLeft, value.bottomRight);
  const left = distanceV106(value.topLeft, value.bottomLeft);
  const right = distanceV106(value.topRight, value.bottomRight);
  const horizontal = Math.abs(top - bottom) / Math.max(top, bottom, 1e-6);
  const vertical = Math.abs(left - right) / Math.max(left, right, 1e-6);
  return clamp01V106(Math.max(horizontal, vertical) * 1.7);
}

function aspectProbabilityV106(bounds = {}) {
  if (!bounds.width || !bounds.height) return 0;
  const ratio = bounds.width / bounds.height;
  const accepted = [
    [0.42, 0.88],
    [0.9, 1.55],
    [1.65, 4.8],
  ];
  if (accepted.some(([min, max]) => ratio >= min && ratio <= max)) return 1;
  if (ratio < .25 || ratio > 6.5) return .1;
  return .55;
}

export function scoreDocumentCandidateV106(metrics = {}) {
  const values = {
    documentArea:clamp01V106(metrics.documentArea),
    visibleBoundaryPercentage:clamp01V106(metrics.visibleBoundaryPercentage),
    textContained:clamp01V106(metrics.textContained),
    textCutOff:clamp01V106(metrics.textCutOff),
    rectangleConfidence:clamp01V106(metrics.rectangleConfidence),
    edgeStrength:clamp01V106(metrics.edgeStrength),
    cornerConfidence:clamp01V106(metrics.cornerConfidence),
    backgroundSeparation:clamp01V106(metrics.backgroundSeparation),
    expectedAspect:clamp01V106(metrics.expectedAspect),
    interiorBrightnessConsistency:clamp01V106(metrics.interiorBrightnessConsistency),
    wordCountProbability:clamp01V106(metrics.wordCountProbability),
    pageLayoutProbability:clamp01V106(metrics.pageLayoutProbability),
  };
  const positive = (
    values.documentArea * .12
    + values.visibleBoundaryPercentage * .10
    + values.textContained * .13
    + values.rectangleConfidence * .09
    + values.edgeStrength * .10
    + values.cornerConfidence * .08
    + values.backgroundSeparation * .08
    + values.expectedAspect * .06
    + values.interiorBrightnessConsistency * .06
    + values.wordCountProbability * .09
    + values.pageLayoutProbability * .09
  );
  const penalty = values.textCutOff * .24;
  return clamp01V106(positive - penalty);
}

export function createDocumentCandidateV106(input = {}) {
  const contour = normalizeContourV106(input.contour);
  const bounds = contourBoundsV106(contour);
  const corners = input.corners || cornersFromContourV106(contour);
  const mesh = input.mesh || linearMeshV106(corners, input.meshSegments || 16);
  const metrics = {
    documentArea:input.metrics?.documentArea ?? contourAreaV106(contour),
    visibleBoundaryPercentage:input.metrics?.visibleBoundaryPercentage ?? 1,
    textContained:input.metrics?.textContained ?? .4,
    textCutOff:input.metrics?.textCutOff ?? 0,
    rectangleConfidence:input.metrics?.rectangleConfidence ?? .55,
    edgeStrength:input.metrics?.edgeStrength ?? .4,
    cornerConfidence:input.metrics?.cornerConfidence ?? .55,
    backgroundSeparation:input.metrics?.backgroundSeparation ?? .4,
    expectedAspect:input.metrics?.expectedAspect ?? aspectProbabilityV106(bounds),
    interiorBrightnessConsistency:input.metrics?.interiorBrightnessConsistency ?? .5,
    wordCountProbability:input.metrics?.wordCountProbability ?? .35,
    pageLayoutProbability:input.metrics?.pageLayoutProbability ?? .4,
    clippingRisk:clamp01V106(input.metrics?.clippingRisk),
    curvatureScore:input.metrics?.curvatureScore ?? curvatureScoreV106(mesh),
    perspectiveSeverity:input.metrics?.perspectiveSeverity ?? perspectiveSeverityV106(corners),
  };
  const candidate = {
    source:input.source || 'unknown',
    contour,
    corners,
    mesh,
    bounds,
    metrics,
    geometryMode:metrics.curvatureScore > .12 ? 'mesh' : 'planar',
    score:input.score ?? scoreDocumentCandidateV106(metrics),
    label:input.label || 'Document',
    pageLike:input.pageLike !== false,
    fullPhoto:Boolean(input.fullPhoto),
  };
  return {
    ...candidate,
    id:input.id || `candidate_${candidateFingerprintV106(candidate)}`,
  };
}

function intersectionOverUnionV106(a = {}, b = {}) {
  const left = Math.max(a.left || 0, b.left || 0);
  const top = Math.max(a.top || 0, b.top || 0);
  const right = Math.min(a.right || 0, b.right || 0);
  const bottom = Math.min(a.bottom || 0, b.bottom || 0);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = Math.max(1e-6, Number(a.area || 0) + Number(b.area || 0) - intersection);
  return intersection / union;
}

export function dedupeCandidatesV106(candidates = [], threshold = .82) {
  const ordered = stableSortCandidatesV106(candidates);
  const kept = [];
  for (const candidate of ordered) {
    const duplicate = kept.some(existing => intersectionOverUnionV106(existing.bounds, candidate.bounds) >= threshold);
    if (!duplicate) kept.push(candidate);
  }
  return kept;
}

export function candidateWithContourV106(candidate = {}, contour = []) {
  const normalized = normalizeContourV106(contour);
  const corners = cornersFromContourV106(normalized);
  const mesh = meshFromContourV106(normalized, Math.max(12, Math.min(64, normalized.length * 4)));
  return createDocumentCandidateV106({
    ...candidate,
    id:candidate.id,
    contour:normalized,
    corners,
    mesh,
    metrics:{
      ...(candidate.metrics || {}),
      documentArea:contourAreaV106(normalized),
      curvatureScore:curvatureScoreV106(mesh),
      perspectiveSeverity:perspectiveSeverityV106(corners),
    },
  });
}

export function moveContourV106(contour = [], delta = {}) {
  const points = normalizeContourV106(contour);
  const bounds = contourBoundsV106(points);
  const dx = Math.max(-bounds.left, Math.min(1 - bounds.right, Number(delta.x || 0)));
  const dy = Math.max(-bounds.top, Math.min(1 - bounds.bottom, Number(delta.y || 0)));
  return points.map(point => ({ x:point.x + dx, y:point.y + dy }));
}

export function addContourControlPointV106(contour = []) {
  const points = normalizeContourV106(contour);
  let bestIndex = 0;
  let bestLength = -1;
  for (let index = 0; index < points.length; index += 1) {
    const length = distanceV106(points[index], points[(index + 1) % points.length]);
    if (length > bestLength) {
      bestLength = length;
      bestIndex = index;
    }
  }
  const nextIndex = (bestIndex + 1) % points.length;
  const midpoint = interpolateV106(points[bestIndex], points[nextIndex], .5);
  const output = [...points];
  output.splice(bestIndex + 1, 0, midpoint);
  return output.slice(0, 64);
}

export function removeContourControlPointV106(contour = [], index = -1) {
  const points = normalizeContourV106(contour);
  if (points.length <= 4 || index < 0 || index >= points.length) return points;
  return points.filter((_, pointIndex) => pointIndex !== index);
}
