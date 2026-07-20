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

const contourModule = await import('../source/src/modules/scan/correctionContourV1064.js');
const photoFirst = await import('../source/src/modules/scan/photoFirstCandidateV1065.js');

const interiorDiamond = [
  { x:.5, y:.12 },
  { x:.88, y:.45 },
  { x:.5, y:.9 },
  { x:.12, y:.86 },
];
pass(contourModule.paperQuadNeedsOuterBoundsV1066ForTest(interiorDiamond), 'interior diamond is rejected as a paper crop');
const recovered = contourModule.correctionContourV1064({
  source:'paper-segmentation',
  contour:interiorDiamond,
});
pass(recovered.length === 4, 'recovered paper crop has four corners');
pass(recovered[0].x < .14 && recovered[0].y < .14, 'recovered crop restores the outer top-left corner');
pass(recovered[1].x > .86 && recovered[1].y < .14, 'recovered crop restores the outer top-right corner');
pass(recovered[2].x > .86 && recovered[2].y > .88, 'recovered crop restores the outer bottom-right corner');
pass(recovered[3].x < .14 && recovered[3].y > .84, 'recovered crop restores the outer bottom-left corner');

const validPerspective = [
  { x:.15, y:.12 },
  { x:.82, y:.16 },
  { x:.78, y:.9 },
  { x:.1, y:.86 },
];
pass(!contourModule.paperQuadNeedsOuterBoundsV1066ForTest(validPerspective), 'valid perspective corners stay valid');
const preserved = contourModule.correctionContourV1064({
  source:'paper-segmentation',
  contour:validPerspective,
});
pass(Math.abs(preserved[0].x - .15) < .02, 'valid perspective top-left is preserved');
pass(Math.abs(preserved[1].y - .16) < .02, 'valid perspective top-right is preserved');

const eightPointPerimeter = [
  { x:.12, y:.12 }, { x:.5, y:.12 }, { x:.88, y:.12 }, { x:.88, y:.5 },
  { x:.88, y:.9 }, { x:.5, y:.9 }, { x:.12, y:.9 }, { x:.12, y:.5 },
];
const reduced = contourModule.correctionContourV1064({ source:'paper-segmentation', contour:eightPointPerimeter });
pass(reduced.length === 4, 'multi-point paper perimeter is reduced to four outer corners');

const selected = photoFirst.selectPhotoFirstCandidateV1065([{
  id:'paper-diamond',
  source:'paper-segmentation',
  contour:interiorDiamond,
  score:.7,
  metrics:{
    clippingRisk:0,
    visibleBoundaryPercentage:.8,
    rectangleConfidence:.72,
    cornerConfidence:.7,
    textContained:.78,
    wordCountProbability:.8,
    pageLayoutProbability:.8,
  },
}]);
pass(selected?.contour?.length === 4, 'Photo First selection receives a four-corner crop');
pass(selected.contour[0].x < .14 && selected.contour[1].x > .86, 'Photo First uses recovered outer page width');
pass(selected.contour[0].y < .14 && selected.contour[2].y > .88, 'Photo First uses recovered outer page height');

const source = read('source/src/modules/scan/correctionContourV1064.js');
pass(source.includes('paperQuadNeedsOuterBoundsV1066'), 'production contour resolver includes outer-corner validation');
pass(source.includes("quad = boundsQuad(points)"), 'invalid paper quadrilateral falls back to the full detected bounds');
pass(read('public/app-version.json').includes('106.6.0'), 'v106.6 release metadata is written');

console.log('PASS — v106.6 Outer Paper Corner Validation regression suite');
