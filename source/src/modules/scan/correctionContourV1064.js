const clamp = value => Math.max(0.002, Math.min(0.998, Number(value || 0)));

function normalizePoint(point = {}) {
  return { x:clamp(point.x), y:clamp(point.y) };
}

function uniquePoints(points = []) {
  const seen = new Set();
  return points.map(normalizePoint).filter(point => {
    const key = `${point.x.toFixed(5)}:${point.y.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function boundsQuad(points = []) {
  const bounds = boundsOf(points);
  return [
    { x:bounds.left, y:bounds.top },
    { x:bounds.right, y:bounds.top },
    { x:bounds.right, y:bounds.bottom },
    { x:bounds.left, y:bounds.bottom },
  ];
}

function distinctQuad(points = []) {
  const values = uniquePoints(points);
  if (values.length < 4) return null;
  const pick = reducer => values.reduce(reducer, values[0]);
  const topLeft = pick((best, point) => point.x + point.y < best.x + best.y ? point : best);
  const topRight = pick((best, point) => point.x - point.y > best.x - best.y ? point : best);
  const bottomRight = pick((best, point) => point.x + point.y > best.x + best.y ? point : best);
  const bottomLeft = pick((best, point) => point.x - point.y < best.x - best.y ? point : best);
  const quad = uniquePoints([topLeft, topRight, bottomRight, bottomLeft]);
  return quad.length === 4 ? quad : null;
}

function meshSampleQuad(points = []) {
  const values = uniquePoints(points);
  if (values.length < 6 || values.length % 2 !== 0) return null;
  const split = values.length / 2;
  const top = values.slice(0, split);
  const bottom = values.slice(split);
  const topLeft = top.reduce((best, point) => point.x < best.x ? point : best, top[0]);
  const topRight = top.reduce((best, point) => point.x > best.x ? point : best, top[0]);
  const bottomRight = bottom.reduce((best, point) => point.x > best.x ? point : best, bottom[0]);
  const bottomLeft = bottom.reduce((best, point) => point.x < best.x ? point : best, bottom[0]);
  const quad = uniquePoints([topLeft, topRight, bottomRight, bottomLeft]);
  if (quad.length !== 4) return null;
  const leftHeight = bottomLeft.y - topLeft.y;
  const rightHeight = bottomRight.y - topRight.y;
  return Math.min(leftHeight, rightHeight) >= .08 ? quad : null;
}

function expandQuad(points = [], amount = .004) {
  const values = uniquePoints(points);
  if (values.length !== 4) return values;
  const center = {
    x:values.reduce((sum, point) => sum + point.x, 0) / 4,
    y:values.reduce((sum, point) => sum + point.y, 0) / 4,
  };
  return values.map(point => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const length = Math.max(1e-6, Math.hypot(dx, dy));
    return normalizePoint({
      x:point.x + dx / length * amount,
      y:point.y + dy / length * amount,
    });
  });
}

/**
 * Converts automatic scanner candidates into one outer four-corner boundary.
 * Paper segmentation returns top-edge samples followed by reversed bottom-edge
 * samples; middle samples are evidence for the edge and must never become crop
 * corners.
 */
export function correctionContourV1064(candidate = null) {
  if (!candidate) return [];
  const points = uniquePoints(candidate.contour || []);
  if (points.length < 4) return [];

  const paperSource = ['paper-segmentation','paper-text-fusion'].includes(String(candidate.source || ''));
  const meshQuad = paperSource ? meshSampleQuad(points) : null;
  const quad = meshQuad || distinctQuad(points) || boundsQuad(points);
  return expandQuad(quad).slice(0, 4);
}

export function isFourCornerContourV1064(contour = []) {
  return uniquePoints(contour).length === 4;
}
