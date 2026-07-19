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

const { fitPaperQuadrilateralV1067 } = await import('../source/src/modules/scan/refinePaperCornersV1067.js');

function interpolate(a, b, steps = 40) {
  return Array.from({ length:steps + 1 }, (_, index) => {
    const ratio = index / steps;
    return {
      x:a.x + (b.x - a.x) * ratio + Math.sin(index * 1.7) * .18,
      y:a.y + (b.y - a.y) * ratio + Math.cos(index * 1.3) * .18,
    };
  });
}

const expected = [
  { x:145, y:85 },
  { x:520, y:135 },
  { x:470, y:735 },
  { x:95, y:675 },
];
const boundary = [
  ...interpolate(expected[0], expected[1]),
  ...interpolate(expected[1], expected[2]),
  ...interpolate(expected[2], expected[3]),
  ...interpolate(expected[3], expected[0]),
  { x:40, y:40 }, { x:580, y:40 }, { x:600, y:780 },
];
const quad = fitPaperQuadrilateralV1067(boundary);
pass(quad.length === 4, 'angled still photo produces four perspective corners');
const topAngle = Math.atan2(quad[1].y - quad[0].y, quad[1].x - quad[0].x);
pass(Math.abs(topAngle) > .07, 'detected page keeps its real camera angle before rectification');
pass(Math.abs(topAngle) < .35, 'angle fit rejects isolated carpet and glare outliers');
const widthTop = Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y);
const widthBottom = Math.hypot(quad[2].x - quad[3].x, quad[2].y - quad[3].y);
const heightLeft = Math.hypot(quad[3].x - quad[0].x, quad[3].y - quad[0].y);
pass(widthTop > 320 && widthBottom > 320 && heightLeft > 500, 'refined quadrilateral retains the complete sheet');
pass(quad[0].x < quad[1].x && quad[3].x < quad[2].x, 'perspective corners remain in document order');

const moduleSource = read('source/src/modules/scan/refinePaperCornersV1067.js');
const captureSource = read('source/src/modules/scan/SmartDocumentCaptureV106.jsx');
const contractsSource = read('source/src/modules/scan/scannerContractsV106.js');
pass(moduleSource.includes('largestComponentBoundary') && moduleSource.includes('fitPaperQuadrilateralV1067'), 'still-photo refinement separates paper from background and fits its edges');
pass(moduleSource.includes("source:'photo-first-angle-refined-v1067'"), 'refined paper candidate has a versioned recognition trace');
pass(captureSource.includes("refinePaperCandidateV1067"), 'Photo First runs angle refinement after the high-resolution photo');
pass(captureSource.includes('Paper angle found — it will be straightened'), 'driver receives a clear automatic-straightening status');
pass(contractsSource.includes("ROAD_READY_SCANNER_VERSION_V106 = '106.7.0'"), 'scanner version is pinned to v106.7');
pass(read('public/app-version.json').includes('106.7.0'), 'v106.7 release metadata is written');

console.log('PASS — v106.7 Angle-Aware Paper Rectification regression suite');
