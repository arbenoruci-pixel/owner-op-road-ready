import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacy = [
  'source/src/modules/scan/TurboDocumentScanner.jsx',
  'source/src/modules/scan/SmartDocumentCaptureV106.jsx',
  'source/src/modules/scan/webScannerAdapterV106.js',
  'source/src/modules/scan/scannerAdapterV106.js',
  'source/src/modules/scan/captureGeometryV106.js',
  'source/src/modules/scan/correctionContourV1064.js',
  'source/src/modules/scan/photoFirstCandidateV1065.js',
  'source/src/modules/scan/refinePaperCornersV1067.js',
  'source/src/modules/scan/rectificationPolicyV1068.js',
  'source/src/modules/scan/planarRectificationV1068.js',
  'source/src/modules/scan/homographyWarpV1069.js',
  'source/src/modules/scan/localDocumentVisionV1070.js',
  'source/src/modules/scan/lightweightDocumentEngineV1071.js',
  'source/src/modules/scan/webglDocumentEngineV1071.js',
  'source/src/modules/scan/documentRestoreV1074.js',
  'source/src/modules/scan/scanbotRtuV1076.js',
];
for (const relative of legacy) fs.rmSync(path.join(ROOT, relative), { force:true, recursive:true });
console.log('PASS — legacy scanner runtimes removed');
