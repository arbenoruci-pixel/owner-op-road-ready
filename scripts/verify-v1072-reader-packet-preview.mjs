import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const pass = (condition, label) => {
  assert.ok(condition, label);
  console.log(`PASS ${label}`);
};

const quality = read('source/src/modules/scan/documentQualityV985.js');
pass(quality.includes('reader-webgl-v1072'), 'legacy document quality imports the lightweight reader engine');
pass(quality.includes('detectPageCornersLightweightV1071(source'), 'legacy quality detection uses lightweight Canvas paper detection');
pass(quality.includes('warpPerspectiveWebGLV1071(image, normalized)'), 'legacy crop uses WebGL perspective correction');
pass(!quality.includes('loadDocumentVision'), 'legacy quality and crop paths cannot initialize OpenCV');

const intelligence = read('source/src/modules/scan/scannerIntelligenceV1030.js');
pass(!intelligence.includes('loadDocumentVision'), 'structured OCR variant builder cannot initialize OpenCV');
const builderStart = intelligence.indexOf('export async function buildOcrVariantsV1030');
const builder = intelligence.slice(builderStart, intelligence.indexOf('\nexport ', builderStart + 20) > 0 ? intelligence.indexOf('\nexport ', builderStart + 20) : intelligence.length);
pass(builder.includes('return fallbackVariants(file, onStatus)'), 'structured OCR builds local variants immediately');
pass(intelligence.includes("id:'normalized', filter:'gray'"), 'normalized OCR source uses a neutral grayscale variant');

const capture = read('source/src/modules/scan/SmartDocumentCaptureV106.jsx');
pass(capture.includes('function distinctDocumentCandidatesV1072('), 'capture UI has physical-document dedupe');
pass(capture.includes('const physicalCandidatesV1072 = distinctDocumentCandidatesV1072(visibleCandidates, selectedCandidate);'), 'scan-all processes distinct physical sheets');
pass(capture.includes('distinctDocumentCandidatesV1072(visibleCandidates, selectedCandidate).length > 1'), 'scan-all button appears only for multiple physical sheets');
pass(capture.includes('function driverPreviewFileV1072('), 'driver preview has a dedicated visible-image selector');
const previewHelper = capture.slice(capture.indexOf('function driverPreviewFileV1072'), capture.indexOf('function candidateBoundsV1072'));
pass(previewHelper.indexOf('enhancedColor') < previewHelper.indexOf('ocrSelected'), 'driver preview prefers enhanced color over the OCR-only variant');
pass(capture.includes('DRIVER_PREVIEW_IMAGE_STYLE_V1072'), 'driver preview uses full-size containment styling');
pass(capture.includes("width:'100%'"), 'cleaned preview fills the available width');
pass(capture.includes("objectFit:'contain'"), 'cleaned preview preserves the full document aspect ratio');

const helperStart = capture.indexOf('function candidateBoundsV1072');
const helperEnd = capture.indexOf('export default function', helperStart);
pass(helperStart >= 0 && helperEnd > helperStart, 'candidate dedupe helper can be regression-tested');
const sandbox = {};
vm.runInNewContext(`${capture.slice(helperStart, helperEnd)}\nglobalThis.__dedupe = distinctDocumentCandidatesV1072;`, sandbox);
const overlapA = { id:'paper', contour:[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.1,y:.9}] };
const overlapB = { id:'text', contour:[{x:.18,y:.17},{x:.84,y:.17},{x:.84,y:.82},{x:.18,y:.82}] };
const separate = { id:'receipt', contour:[{x:.02,y:.02},{x:.28,y:.02},{x:.28,y:.30},{x:.02,y:.30}] };
pass(sandbox.__dedupe([overlapA, overlapB], overlapA).length === 1, 'overlapping signals from one sheet remain one document');
pass(sandbox.__dedupe([overlapA, overlapB, separate], overlapA).length === 2, 'a genuinely separate paper remains available to Scan all');

const adapter = read('source/src/modules/scan/webScannerAdapterV106.js');
pass(adapter.includes('function distinctPhysicalCandidatesV1072('), 'web adapter dedupes physical sheets');
pass(adapter.includes('distinctPhysicalCandidatesV1072(selection.candidates, selection.selected)'), 'gallery scan-all dedupes candidate signals');
pass(adapter.includes('const selected = distinctPhysicalCandidatesV1072((candidates || []).filter(Boolean)'), 'adapter processCandidates enforces dedupe as a safety guard');

const lightweight = read('source/src/modules/scan/lightweightDocumentEngineV1071.js');
pass(lightweight.includes('balanced-enhancement-v1072'), 'local enhancement uses balanced paper whitening');
pass(lightweight.includes('illuminationRatioV1072'), 'enhancement compensates for uneven illumination without clipping the page');

const activeReaderFiles = [quality, intelligence, capture, adapter];
pass(activeReaderFiles.every(source => !source.includes("onStatus(index === 0 ? 'Loading local scan engine…'")), 'active reader and capture paths cannot display the OpenCV loader status');

const chain = read('scripts/run-v106-smart-capture.mjs');
pass(chain.includes("patch-v1072-reader-packet-preview.mjs"), 'release chain installs the v107.2 hotfix');
pass(chain.includes("finalize-v1072-reader-packet-preview.mjs"), 'release chain pins v107.2 metadata');
pass(!chain.includes('diagnose-v1072-scan-flow.mjs'), 'temporary diagnostics are removed from the release chain');

console.log('PASS — v107.2 Reader, Packet Dedupe & Preview regression suite');
