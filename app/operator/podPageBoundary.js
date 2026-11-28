// A printed form line can be stronger than a pale sheet edge. If the ordinary
// detector verified three sides, follow the two neighboring sides beyond that
// line. Only accept a fourth edge where both side boundaries actually end.
export function recoverPageBoundary(image, detection, geometry, capture) {
  const evidence = detection?.metrics;
  if (!geometry.review || detection?.method !== 'internal-rule-rejected-v110428' ||
      !evidence?.rejectedCorners || evidence.rejectedConfidence < .84 ||
      (capture && (capture.detection?.found || geometry.reason !== 'capture-edges-uncertain'))) return geometry;
  const weak = evidence.continuation.findIndex(value => value >= .75);
  if (weak < 0 || evidence.continuation.some((value, i) => i !== weak && value > .5)) return geometry;

  const {width, height, data} = image;
  const unit = Math.min(width, height);
  const points = evidence.rejectedCorners.map(p => ({x:p.x * (width - 1), y:p.y * (height - 1)}));
  const a = points[weak], b = points[(weak + 1) % 4];
  const across = Math.hypot(a.x-b.x, a.y-b.y);
  const beforeA = points[(weak + 3) % 4], beforeB = points[(weak + 2) % 4];
  const length = (Math.hypot(a.x-beforeA.x, a.y-beforeA.y) + Math.hypot(b.x-beforeB.x, b.y-beforeB.y)) / 2;
  if (unit < 96 || length < unit * .22 || across < unit * .35) return geometry;

  const extend = (from, to, distance) => ({
    x:to.x + (to.x-from.x) * distance/length, y:to.y + (to.y-from.y) * distance/length,
  });
  function colorAt(x, y) {
    const i = (Math.round(y) * width + Math.round(x)) * 4;
    return [data[i + 1], 2 * (data[i] - data[i + 1]), 2 * (data[i + 2] - data[i + 1])];
  }
  // Average several samples on either side. A narrow black rule can never
  // qualify just because it has strong contrast at the middle pixel.
  function difference(p, nx, ny, reach) {
    const delta = [0, 0, 0];
    for (const scale of [.6, 1, 1.4]) {
      const d = reach * scale;
      const inside = colorAt(p.x + d*nx, p.y + d*ny);
      const outside = colorAt(p.x - d*nx, p.y - d*ny);
      for (let c = 0; c < 3; c++) delta[c] += inside[c] - outside[c];
    }
    return Math.max(...delta.map(v => Math.abs(v)/3));
  }
  const sideNormals = [[beforeA,a], [beforeB,b]].map(([p,q]) => {
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    return [-(q.y-p.y)/len, (q.x-p.x)/len];
  });
  const room = unit * .035;
  const fits = p => p.x >= room && p.y >= room && p.x < width-room && p.y < height-room;
  const step = Math.max(2, unit * .006);
  const strong = [0,0];
  let quiet = 0;
  for (let d = step; d < unit * 1.4; d += step) {
    const ends = [extend(beforeA,a,d), extend(beforeB,b,d)];
    const [left, right] = ends;
    const widthRatio = ((right.x-left.x)*(b.x-a.x) + (right.y-left.y)*(b.y-a.y)) / (across*across);
    if (!ends.every(fits) || widthRatio < .55 || widthRatio > 1.65) break;
    const lateral = ends.map((p, i) => difference(p, ...sideNormals[i], unit * .016));
    lateral.forEach((contrast,i) => { if (contrast >= 14) strong[i]++; });
    if (lateral.every(v => v < 10)) quiet++;
    else quiet = 0;
    if (quiet < 5 || d < unit * .13) continue;
    // Refuse to jump a gap to another sheet or a desk edge farther away.
    if (Math.min(...strong) < (d / step - quiet) * .60) return geometry;
    let best = null;
    for (let edge = d - (quiet + 3)*step; edge <= d - (quiet - 1)*step; edge += step/2) {
      const u = extend(beforeA, a, edge), v = extend(beforeB, b, edge);
      const len = Math.hypot(v.x-u.x,v.y-u.y), nx = -(v.y-u.y)/len, ny = (v.x-u.x)/len;
      const strengths = [];
      for (let j = 1; j <= 23; j++) {
        const t = j/24;
        strengths.push(difference({x:u.x + (v.x-u.x)*t, y:u.y + (v.y-u.y)*t}, nx, ny, unit*.009));
      }
      strengths.sort((l,r) => l-r);
      if (strengths[5] >= 9 && strengths[11] >= 14 && (!best || strengths[5] > best.score)) {
        best = {u, v, score:strengths[5]};
      }
    }
    if (!best) return geometry;
    points[weak] = best.u;
    points[(weak+1)%4] = best.v;
    // Extrapolated sides on a wrinkled sheet can drift a few pixels. Use a
    // generous safety margin for fine print, bottom signatures and folds.
    const center = points.reduce((s,p) => ({x:s.x+p.x/4,y:s.y+p.y/4}), {x:0,y:0});
    const corners = points.map(p => ({
      x:Math.max(0,Math.min(1,(p.x+(p.x-center.x)*.035)/(width-1))),
      y:Math.max(0,Math.min(1,(p.y+(p.y-center.y)*.035)/(height-1))),
    }));
    return {corners,reason:'pod-outer-edge-extension',review:false};
  }
  return geometry;
}
