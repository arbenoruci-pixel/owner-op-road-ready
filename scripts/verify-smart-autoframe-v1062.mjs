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
const geometry = await import('../source/src/modules/scan/captureGeometryV106.js');
const web = await import('../source/src/modules/scan/webScannerAdapterV106.js');

const fullFrameText = geometry.createDocumentCandidateV106({
  source:'text-density',
  contour:[
    { x:.001, y:.001 }, { x:.5, y:.001 }, { x:.999, y:.001 }, { x:.999, y:.5 },
    { x:.999, y:.999 }, { x:.5, y:.999 }, { x:.001, y:.999 }, { x:.001, y:.5 },
  ],
  metrics:{
    documentArea:.996,
    visibleBoundaryPercentage:.72,
    textContained:.86,
    textCutOff:0,
    rectangleConfidence:.7,
    edgeStrength:.62,
    cornerConfidence:.62,
    backgroundSeparation:.56,
    interiorBrightnessConsistency:.58,
    wordCountProbability:.9,
    pageLayoutProbability:.84,
    clippingRisk:.9,
  },
});
pass(web.isPlausibleDocumentCandidateV106(fullFrameText, 'text-density') === false, 'full-frame carpet texture cannot qualify as a text document region');
pass(web.resolveTextCandidateV106(fullFrameText, []) === null, 'rejected full-frame text region cannot become the selected document');

const paper = geometry.createDocumentCandidateV106({
  source:'paper-segmentation',
  contour:[
    { x:.19, y:.16 }, { x:.5, y:.15 }, { x:.81, y:.17 }, { x:.82, y:.5 },
    { x:.8, y:.86 }, { x:.5, y:.87 }, { x:.18, y:.85 }, { x:.17, y:.5 },
  ],
  score:.65,
  metrics:{
    documentArea:.36,
    visibleBoundaryPercentage:.96,
    textContained:.54,
    rectangleConfidence:.72,
    edgeStrength:.68,
    cornerConfidence:.82,
    backgroundSeparation:.7,
    interiorBrightnessConsistency:.72,
    wordCountProbability:.58,
    pageLayoutProbability:.62,
    clippingRisk:0,
  },
});
const textInsidePaper = geometry.createDocumentCandidateV106({
  source:'text-density',
  contour:[
    { x:.25, y:.24 }, { x:.5, y:.23 }, { x:.74, y:.25 }, { x:.74, y:.5 },
    { x:.73, y:.78 }, { x:.5, y:.79 }, { x:.24, y:.77 }, { x:.24, y:.5 },
  ],
  score:.77,
  metrics:{
    documentArea:.27,
    visibleBoundaryPercentage:.72,
    textContained:.86,
    rectangleConfidence:.7,
    edgeStrength:.62,
    cornerConfidence:.62,
    backgroundSeparation:.56,
    interiorBrightnessConsistency:.58,
    wordCountProbability:.9,
    pageLayoutProbability:.84,
    clippingRisk:0,
  },
});
const fused = web.resolveTextCandidateV106(textInsidePaper, [paper]);
pass(fused?.source === 'paper-text-fusion', 'text evidence strengthens a paper boundary instead of replacing it');
pass(fused?.bounds.left <= .2 && fused?.bounds.right >= .8, 'fused candidate keeps the outer paper edge');
pass(fused?.score > paper.score, 'text-confirmed paper receives a controlled score boost');

const standaloneText = web.resolveTextCandidateV106(textInsidePaper, []);
pass(standaloneText?.score <= .56, 'standalone text boxes are confidence-capped when no paper edge supports them');
const selection = contracts.candidateSelectionV106([paper, standaloneText]);
pass(selection.selected?.source === 'paper-segmentation', 'paper boundary wins over an unsupported text box');

const cleanScore = geometry.scoreDocumentCandidateV106({
  documentArea:.34,
  visibleBoundaryPercentage:.92,
  textContained:.72,
  textCutOff:0,
  rectangleConfidence:.76,
  edgeStrength:.72,
  cornerConfidence:.8,
  backgroundSeparation:.72,
  expectedAspect:1,
  interiorBrightnessConsistency:.7,
  wordCountProbability:.72,
  pageLayoutProbability:.72,
  clippingRisk:0,
});
const backgroundScore = geometry.scoreDocumentCandidateV106({
  documentArea:.97,
  visibleBoundaryPercentage:.72,
  textContained:.86,
  textCutOff:0,
  rectangleConfidence:.7,
  edgeStrength:.72,
  cornerConfidence:.62,
  backgroundSeparation:.56,
  expectedAspect:1,
  interiorBrightnessConsistency:.58,
  wordCountProbability:.9,
  pageLayoutProbability:.84,
  clippingRisk:.9,
});
pass(cleanScore > backgroundScore + .2, 'clipping and overfill penalties keep textured background below a real page');

const webSource = read('source/src/modules/scan/webScannerAdapterV106.js');
const geometrySource = read('source/src/modules/scan/captureGeometryV106.js');
pass(webSource.includes('paper-text-fusion-v1062'), 'web scanner contains paper and text candidate fusion');
pass(webSource.includes("isPlausibleDocumentCandidateV106(textCandidate, 'text-density')"), 'text regions pass a plausibility gate before selection');
pass(geometrySource.includes('smart-autoframe-score-v1062'), 'candidate scoring penalizes clipped full-frame regions');
pass(contracts.ROAD_READY_SCANNER_VERSION_V106 === '106.2.0', 'scanner version is pinned to v106.2');
pass(read('public/app-version.json').includes('106.2.0'), 'v106.2 release metadata is written');

console.log('PASS — v106.2 Smart Autoframe regression suite');
