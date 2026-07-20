import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rectificationPolicyV1068 } from '../source/src/modules/scan/rectificationPolicyV1068.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pass = (condition, label) => {
  assert.ok(condition, label);
  console.log(`PASS ${label}`);
};

const trapezoid = [
  { x:.18, y:.12 },
  { x:.82, y:.23 },
  { x:.74, y:.9 },
  { x:.08, y:.76 },
];
const falseMesh = rectificationPolicyV1068({
  source:'photo-first-angle-refined-v1067',
  contour:trapezoid,
  geometryMode:'mesh',
  metrics:{ curvatureScore:.78, angleRefinedV1067:true },
}, 'auto');
pass(falseMesh.geometryMode === 'planar', 'four-corner angle-refined page is forced to planar perspective');
pass(falseMesh.useMesh === false, 'four-corner page cannot enter mesh dewarp');

const genericFour = rectificationPolicyV1068({
  source:'paper-segmentation',
  contour:trapezoid,
  geometryMode:'mesh',
  metrics:{ curvatureScore:.7 },
}, 'auto');
pass(genericFour.geometryMode === 'planar', 'any valid four-corner page stays planar');

const insufficientFlatten = rectificationPolicyV1068({
  source:'paper-segmentation',
  contour:trapezoid,
  geometryMode:'mesh',
  metrics:{ curvatureScore:.8 },
}, 'mesh');
pass(insufficientFlatten.useMesh === false, 'Flatten with only four points is rejected safely');

const curved = rectificationPolicyV1068({
  source:'paper-segmentation',
  contour:[
    { x:.1,y:.15 },{ x:.28,y:.11 },{ x:.5,y:.08 },{ x:.72,y:.11 },{ x:.9,y:.16 },
    { x:.88,y:.86 },{ x:.7,y:.9 },{ x:.5,y:.92 },{ x:.3,y:.9 },{ x:.12,y:.85 },
  ],
  geometryMode:'mesh',
  metrics:{ curvatureScore:.31 },
}, 'mesh');
pass(curved.useMesh === true, 'explicit Flatten remains available with enough curved control points');

const capture = fs.readFileSync(path.join(ROOT, 'source/src/modules/scan/SmartDocumentCaptureV106.jsx'), 'utf8');
const adapter = fs.readFileSync(path.join(ROOT, 'source/src/modules/scan/webScannerAdapterV106.js'), 'utf8');
pass(capture.includes('rectificationPolicyV1068:policy'), 'capture applies the rectification policy before processing');
pass(capture.includes('const changed = Boolean(edited && candidateDelta'), 'unchanged automatic contour is not rebuilt as a mesh');
pass(adapter.includes('const useMesh = policy.useMesh'), 'web adapter uses the guarded mesh decision');
pass(adapter.includes("rectificationPolicyV1068(normalized"), 'rectification policy is enforced inside the adapter');
pass(fs.readFileSync(path.join(ROOT, 'public/app-version.json'), 'utf8').includes('106.8.0'), 'v106.8 release metadata is written');

console.log('PASS — v106.8 Safe Planar Rectification regression suite');
