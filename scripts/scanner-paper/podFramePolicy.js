// A slightly smaller document can enter visual review when resolution is its
// only warning. Keep focus, paper coverage and fine-print evidence independent.
export function needsSmallPrintReview({quality, detection}) {
  if (quality?.ready || quality?.issues?.length !== 1 ||
      quality.issues[0] !== 'Move closer for sharper small print' ||
      !detection?.found || !(detection.confidence >= .88) || detection.corners?.length !== 4) return false;
  const {shortEdge, textSharpness, textTileCount, contrast, mean, area, edgeRatio} = quality.metrics || {};
  return shortEdge >= 800 && shortEdge < 950 && textSharpness >= 90 && textTileCount >= 8 &&
    contrast >= 42 && mean >= 82 && area >= .28 && edgeRatio >= .009 &&
    detection.corners.every(p => p.x >= .015 && p.x <= .985 && p.y >= .015 && p.y <= .985);
}

// The adapter also requires a recent stable observation window and a fresh
// signature match between that page and the selected capture frame.
export function canUseSinglePodFrame(reading, observed) {
  const {quality, detection} = reading;
  if (!detection?.found || !observed?.found || !(detection.confidence >= .88 && observed.confidence >= .88)) return false;
  const {shortEdge, textSharpness, textTileCount} = quality?.metrics || {};
  const sharp = quality?.ready && shortEdge >= 1000 && textSharpness >= 64 && textTileCount >= 4;
  if (!sharp && !needsSmallPrintReview(reading)) return false;
  return detection.corners.length === 4 && observed.corners.length === 4 &&
    detection.corners.every((p, i) => Math.hypot(p.x - observed.corners[i].x, p.y - observed.corners[i].y) <= .018);
}
