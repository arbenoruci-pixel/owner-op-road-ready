import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { correctionContourV1064, isFourCornerContourV1064 } from '../source/src/modules/scan/correctionContourV1064.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pass = (condition, label) => {
  assert.ok(condition, label);
  console.log(`PASS ${label}`);
};

const housePaper = {
  source:'paper-segmentation',
  contour:[
    { x:.18, y:.19 },
    { x:.5, y:.055 },
    { x:.82, y:.18 },
    { x:.83, y:.84 },
    { x:.5, y:.87 },
    { x:.17, y:.85 },
  ],
};
const houseQuad = correctionContourV1064(housePaper);
pass(isFourCornerContourV1064(houseQuad), 'paper segmentation produces exactly four correction handles');
pass(houseQuad[0].x < .2 && houseQuad[1].x > .8, 'outer top paper corners are retained');
pass(houseQuad[0].y > .12 && houseQuad[1].y > .12, 'middle segmentation spike cannot become a crop corner');
pass(houseQuad[3].y - houseQuad[0].y > .6 && houseQuad[2].y - houseQuad[1].y > .6, 'four-corner contour retains the complete page height');

const perimeterCandidate = {
  source:'rectangle-detection',
  contour:[
    { x:.12, y:.1 }, { x:.5, y:.09 }, { x:.88, y:.13 }, { x:.9, y:.5 },
    { x:.87, y:.9 }, { x:.5, y:.92 }, { x:.1, y:.88 }, { x:.08, y:.5 },
  ],
};
const perimeterQuad = correctionContourV1064(perimeterCandidate);
pass(isFourCornerContourV1064(perimeterQuad), 'eight-point rectangle perimeter is reduced to four corners');
pass(perimeterQuad.every(point => point.x > 0 && point.x < 1 && point.y > 0 && point.y < 1), 'expanded correction corners remain inside the image');

const fourPoint = correctionContourV1064({
  source:'rectangle-detection',
  contour:[{ x:.2,y:.1 },{ x:.8,y:.12 },{ x:.82,y:.88 },{ x:.18,y:.86 }],
});
pass(isFourCornerContourV1064(fourPoint), 'valid four-corner detection stays four-corner');

const captureSource = fs.readFileSync(path.join(ROOT, 'source/src/modules/scan/SmartDocumentCaptureV106.jsx'), 'utf8');
pass(captureSource.includes('correction-contour-v1064'), 'production capture component imports the correction resolver');
pass(captureSource.includes('const firstContourV1064 = correctionContourV1064(first);'), 'initial automatic selection uses four outer corners');
pass(captureSource.includes('const nextContourV1064 = correctionContourV1064(candidate);'), 'candidate switching keeps four outer corners');
pass(captureSource.includes('preparedCandidate(candidate, correctionContourV1064(candidate))'), 'scan-all normalizes every automatic document candidate');
pass(fs.readFileSync(path.join(ROOT, 'public/app-version.json'), 'utf8').includes('106.4.0'), 'v106.4 release metadata is written');

console.log('PASS — v106.4 Four-Corner Correction Contour regression suite');
