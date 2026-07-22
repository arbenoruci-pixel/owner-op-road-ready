import fs from 'node:fs';

const path = 'source/src/modules/scan/SmartScanSheetV105.jsx';
let source = fs.readFileSync(path, 'utf8');

const before = `import {
  analyzeTruckDocumentV1040,
  documentIntelligencePayloadV1040,
  reanalyzeTruckDocumentTypeV1040,
} from './truckDocumentEngineV1040.js';`;

const after = `import {
  analyzeTruckDocumentIsolatedV10959 as analyzeTruckDocumentV1040,
  documentIntelligencePayloadIsolatedV10959 as documentIntelligencePayloadV1040,
  reanalyzeTruckDocumentTypeIsolatedV10959 as reanalyzeTruckDocumentTypeV1040,
} from './engines/isolatedDocumentRouterV10959.js';`;

if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('v109.6.1 production SmartScanSheetV105 engine import missing');
  source = source.replace(before, after);
}

fs.writeFileSync(path, source);
console.log('PASS — v109.6.1 production Road Ready OS scanner now uses the isolated document-engine router');
