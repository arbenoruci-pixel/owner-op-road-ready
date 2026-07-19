import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const pass = (condition, label) => {
  assert.ok(condition, label);
  console.log(`PASS ${label}`);
};

const { selectPhotoFirstCandidateV1065 } = await import('../source/src/modules/scan/photoFirstCandidateV1065.js');

const paper = {
  id:'paper',
  source:'paper-segmentation',
  score:.68,
  contour:[
    { x:.17, y:.13 }, { x:.5, y:.12 }, { x:.83, y:.14 },
    { x:.82, y:.87 }, { x:.5, y:.88 }, { x:.18, y:.86 },
  ],
  metrics:{
    clippingRisk:0,
    visibleBoundaryPercentage:.88,
    rectangleConfidence:.7,
    cornerConfidence:.78,
    textContained:.62,
    wordCountProbability:.68,
    pageLayoutProbability:.72,
  },
};
const textTriangle = {
  id:'text-triangle',
  source:'text-density',
  score:.92,
  contour:[
    { x:.27, y:.16 }, { x:.76, y:.18 }, { x:.62, y:.83 }, { x:.39, y:.85 },
  ],
  metrics:{
    clippingRisk:.2,
    visibleBoundaryPercentage:.4,
    rectangleConfidence:.45,
    cornerConfidence:.35,
    textContained:.95,
    wordCountProbability:.95,
    pageLayoutProbability:.9,
  },
};
const fullPhoto = {
  id:'full',
  source:'full-photo-fallback',
  fullPhoto:true,
  score:.99,
  contour:[{ x:.01, y:.01 }, { x:.99, y:.01 }, { x:.99, y:.99 }, { x:.01, y:.99 }],
};

const selected = selectPhotoFirstCandidateV1065([textTriangle, fullPhoto, paper]);
pass(selected?.id === 'paper', 'photo-first analysis selects the outer paper candidate over an internal text polygon');
pass(selected?.contour?.length === 4, 'photo-first selection returns exactly four correction corners');
pass(selected?.photoFirstSelectedV1065 === true, 'photo-first selection is recorded in the candidate trace');
pass(selected?.geometryMode === 'planar', 'still-photo frame uses planar correction before optional dewarp');

const captureSource = read('source/src/modules/scan/SmartDocumentCaptureV106.jsx');
pass(captureSource.includes('PHOTO_FIRST_CAPTURE_V1065 = true'), 'camera defaults to photo-first mode');
pass(captureSource.includes("setStatus('Take one clear photo')"), 'camera asks for one clear photo');
pass(captureSource.includes('photo-first-guide-v1065'), 'camera shows a neutral guide instead of a moving detected polygon');
pass(captureSource.includes('selectPhotoFirstCandidateV1065(found)'), 'full-resolution still analysis selects the frame');
pass(captureSource.includes('maxDimension:2200') && captureSource.includes('gridMax:160'), 'post-capture detection runs at higher resolution');
pass(captureSource.includes('Photo first</button>'), 'capture mode is visible to the driver');
pass(read('public/app-version.json').includes('106.5.0'), 'v106.5 release metadata is written');

console.log('PASS — v106.5 Photo First capture regression suite');
