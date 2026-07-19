import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
function pass(condition, label) {
  assert.ok(condition, label);
  console.log(`PASS ${label}`);
}

const contracts = await import('../source/src/modules/scan/scannerContractsV106.js');
const web = await import('../source/src/modules/scan/webScannerAdapterV106.js');

const xs = Array.from({ length:21 }, (_, index) => .16 + (.68 * index / 20));
const top = xs.map((x, index) => ({
  x,
  y:index >= 8 && index <= 12 ? .035 + Math.abs(index - 10) * .012 : .155 + (x - .5) * .018,
}));
const bottom = xs.map(x => ({ x, y:.86 + (x - .5) * .012 }));
const mesh = { top, bottom };
const fallbackContour = [
  { x:.16, y:.16 },
  { x:.5, y:.035 },
  { x:.84, y:.17 },
  { x:.84, y:.86 },
  { x:.5, y:.88 },
  { x:.16, y:.85 },
];
const residual = web.paperBoundaryResidualV1063(mesh);
const contour = web.robustPaperContourV1063(mesh, fallbackContour);
pass(residual > .045, 'house-shaped segmentation spike is detected as an unstable boundary');
pass(contour.length === 4, 'unstable mesh becomes a four-corner page boundary');
pass(contour[0].y > .1 && contour[1].y > .1, 'center spike cannot become the top page corner');
pass(Math.abs(contour[0].y - contour[1].y) < .05, 'top page edge remains stable across the sheet');
pass(contour[3].y - contour[0].y > .6 && contour[2].y - contour[1].y > .6, 'stable boundary retains full page height');

function convex(points = []) {
  if (points.length !== 4) return false;
  const signs = [];
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const c = points[(index + 2) % points.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) > 1e-8) signs.push(Math.sign(cross));
  }
  return signs.length >= 3 && signs.every(sign => sign === signs[0]);
}
pass(convex(contour), 'automatic page boundary is convex');

const webSource = read('source/src/modules/scan/webScannerAdapterV106.js');
const captureSource = read('source/src/modules/scan/SmartDocumentCaptureV106.jsx');
pass(webSource.includes('stable-paper-boundary-v1063'), 'web detector includes robust paper-line fitting');
pass(webSource.includes('robustPaperContourV1063(mesh, rawContour)'), 'paper segmentation uses the robust quadrilateral');
pass(webSource.includes('stableTop') && webSource.includes('stableBottom'), 'spike fallback uses stable page bands instead of extreme pixels');
pass(captureSource.includes('stable-live-boundary-v1063'), 'camera overlay includes live-boundary stabilization');
pass(captureSource.includes('chooseLiveCandidateV1063(found, stableRef.current.candidate)'), 'live camera keeps candidate continuity across frames');
pass(captureSource.includes('smoothLiveCandidateV1063'), 'live corners are temporally smoothed');
pass(captureSource.includes('candidateDelta(previous, strongest.contour) < .02'), 'auto capture requires a tight four-corner stability threshold');
pass(captureSource.includes('count >= 5'), 'auto capture waits for five stable detections');
pass(captureSource.includes('normalizeContourV106(liveCandidate.contour).length === 4'), 'camera accepts only a four-corner live document frame');
pass(contracts.ROAD_READY_SCANNER_VERSION_V106 === '106.3.0', 'scanner version is pinned to v106.3');
pass(read('public/app-version.json').includes('106.3.0'), 'v106.3 release metadata is written');

console.log('PASS — v106.3 Stable Page Boundary regression suite');
