import { correctionContourV1064 } from './correctionContourV1064.js';

const clamp = value => Math.max(0, Math.min(1, Number(value || 0)));

function boundsOf(contour = []) {
  if (!Array.isArray(contour) || contour.length < 4) return null;
  const xs = contour.map(point => Number(point?.x)).filter(Number.isFinite);
  const ys = contour.map(point => Number(point?.y)).filter(Number.isFinite);
  if (xs.length < 4 || ys.length < 4) return null;
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return {
    left,
    right,
    top,
    bottom,
    width:Math.max(0, right - left),
    height:Math.max(0, bottom - top),
    area:Math.max(0, (right - left) * (bottom - top)),
    centerX:(left + right) / 2,
    centerY:(top + bottom) / 2,
  };
}

function sourceBonus(source = '') {
  if (source === 'paper-text-fusion') return .24;
  if (source === 'photo-first-paper') return .22;
  if (source === 'paper-segmentation') return .18;
  if (source === 'rectangle-detection') return .11;
  if (source === 'saliency') return -.03;
  if (source === 'edge-density') return -.08;
  if (source === 'text-density') return -.24;
  return 0;
}

export function photoFirstCandidateScoreV1065(candidate = null) {
  if (!candidate || candidate.fullPhoto) return Number.NEGATIVE_INFINITY;
  const contour = correctionContourV1064(candidate);
  const bounds = boundsOf(contour);
  if (!bounds || bounds.width < .16 || bounds.height < .16 || bounds.area < .045) {
    return Number.NEGATIVE_INFINITY;
  }

  const aspect = bounds.width / Math.max(.0001, bounds.height);
  if (aspect < .22 || aspect > 5.5) return Number.NEGATIVE_INFINITY;

  const edgeTouches = [
    bounds.left <= .012,
    bounds.top <= .012,
    bounds.right >= .988,
    bounds.bottom >= .988,
  ].filter(Boolean).length;
  const centerDistance = Math.hypot(bounds.centerX - .5, bounds.centerY - .5);
  const clippingRisk = clamp(candidate.metrics?.clippingRisk);
  const textSupport = Math.max(
    clamp(candidate.metrics?.textContained),
    clamp(candidate.metrics?.wordCountProbability),
    clamp(candidate.metrics?.pageLayoutProbability),
  );
  const boundarySupport = Math.max(
    clamp(candidate.metrics?.visibleBoundaryPercentage),
    clamp(candidate.metrics?.rectangleConfidence),
    clamp(candidate.metrics?.cornerConfidence),
  );

  let score = clamp(candidate.score) + sourceBonus(String(candidate.source || ''));
  score += textSupport * .08 + boundarySupport * .08;
  score -= clippingRisk * .28 + centerDistance * .08 + edgeTouches * .12;
  if (bounds.area > .9) score -= (bounds.area - .9) * 2.2;
  if (bounds.area < .1) score -= (.1 - bounds.area) * 1.8;
  return score;
}

export function selectPhotoFirstCandidateV1065(candidates = []) {
  const ranked = (Array.isArray(candidates) ? candidates : [])
    .map(candidate => ({
      candidate,
      contour:correctionContourV1064(candidate),
      score:photoFirstCandidateScoreV1065(candidate),
    }))
    .filter(item => Number.isFinite(item.score) && item.contour.length === 4)
    .sort((left, right) => right.score - left.score
      || String(left.candidate?.id || '').localeCompare(String(right.candidate?.id || '')));

  const best = ranked[0];
  if (!best) return null;
  return {
    ...best.candidate,
    contour:best.contour,
    geometryMode:'planar',
    photoFirstScoreV1065:best.score,
    photoFirstSelectedV1065:true,
  };
}

export const PHOTO_FIRST_CAPTURE_VERSION_V1065 = '106.5.0';
