import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  consensusFieldsV1030,
  criticalFieldCoverageV1030,
  validateDocumentFieldsV1030,
} from '../source/src/modules/scan/smartDocumentReaderV1030.js';
import { chooseBestCaptureCandidateV1030 } from '../source/src/modules/scan/scannerIntelligenceV1030.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const selected = chooseBestCaptureCandidateV1030([
  { canvas:{}, quality:{ score:.52, megapixels:3.2 }, kind:'soft' },
  { canvas:{}, quality:{ score:.78, megapixels:2.8 }, kind:'sharp' },
  { canvas:{}, quality:{ score:.61, megapixels:6.0 }, kind:'large' },
]);
assert.equal(selected.kind, 'sharp');

const rateConsensus = consensusFieldsV1030([
  { id:'base', weight:.91, fields:{ loadNo:'391912', broker:'H&N Logistics', gross:4800, origin:'Rochelle, IL', destination:'Saint Cloud, MN', pickupDate:'07/14/2026', deliveryDate:'07/17/2026' } },
  { id:'normalized', weight:.88, fields:{ loadNo:'391912', broker:'H&N Logistics', gross:4800, origin:'Rochelle, IL', destination:'Saint Cloud, MN', pickupDate:'07/14/2026', deliveryDate:'07/17/2026' } },
  { id:'adaptive', weight:.63, fields:{ loadNo:'3919I2', broker:'H&N Logistics', gross:4300, origin:'Rochelle, IL', destination:'Saint Cloud, MN', pickupDate:'07/14/2026', deliveryDate:'07/17/2026' } },
], 'rate_confirmation');
assert.equal(rateConsensus.fields.loadNo, '391912');
assert.equal(Number(rateConsensus.fields.gross), 4800);
assert.ok(rateConsensus.criticalConfidence > .75);
assert.equal(criticalFieldCoverageV1030('rate_confirmation', rateConsensus.fields), 1);

const fuelValid = validateDocumentFieldsV1030('fuel_receipt', {
  date:'07/15/2026',
  gallons:125.87,
  pricePerGallon:3.469,
  total:436.66,
}, new Date('2026-07-16T12:00:00Z'));
assert.equal(fuelValid.valid, true);
assert.equal(fuelValid.checks.find(check => check.id === 'fuel-math')?.ok, true);

const fuelInvalid = validateDocumentFieldsV1030('fuel_receipt', {
  date:'07/15/2026',
  gallons:125.87,
  pricePerGallon:3.469,
  total:736.66,
}, new Date('2026-07-16T12:00:00Z'));
assert.equal(fuelInvalid.valid, false);

const turbo = read('source/src/modules/scan/TurboDocumentScanner.jsx');
const sheet = read('source/src/modules/scan/SmartScanSheetV100.jsx');
const webOcr = read('source/src/modules/scan/webOcr.js');
const captureCore = read('source/src/modules/scan/scannerIntelligenceV1030.js');
const reader = read('source/src/modules/scan/smartDocumentReaderV1030.js');
assert.match(turbo,/captureBestDocumentFileV1030/);
assert.match(turbo,/pageFiles:allPages/);
assert.match(turbo,/captureDiagnostics/);
assert.match(sheet,/analyzeSmartDocumentV1030/);
assert.match(sheet,/Scanner Intelligence/);
assert.match(webOcr,/tesseract\.js@7\.0\.0/);
assert.match(captureCore,/adaptiveThreshold/);
assert.match(captureCore,/Capturing the sharpest frame/);
assert.match(reader,/consensusFieldsV1030/);
assert.match(reader,/validateDocumentFieldsV1030/);
assert.match(reader,/scanMeta\?\.pageFiles/);
assert.doesNotMatch(reader,/saveDuty|currentStatus|eventsByDay|startMin|endMin/);

console.log('verify-scanner-intelligence-v1030 passed');
