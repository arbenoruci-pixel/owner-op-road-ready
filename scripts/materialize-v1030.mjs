import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '103.0.0';
const RELEASED_AT = '2026-07-16T03:30:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v103 missing ${label}`);
  return content.replace(before, after);
}

// Select the sharpest of a short camera burst plus the high-resolution still.
const turboPath = 'source/src/modules/scan/TurboDocumentScanner.jsx';
let turbo = read(turboPath);
if (!turbo.includes("from './scannerIntelligenceV1030.js'")) {
  turbo = `import { captureBestDocumentFileV1030 } from './scannerIntelligenceV1030.js';\n${turbo}`;
}
turbo = replaceOnce(
  turbo,
  "  const [capturing, setCapturing] = useState(false);",
  "  const [capturing, setCapturing] = useState(false);\n  const [captureDiagnostics, setCaptureDiagnostics] = useState(null);",
  'capture diagnostics state'
);
const flashCaptureBefore = `      const needsFlash = flashMode === 'on' || (flashMode === 'auto' && Boolean(quality.autoFlashNeeded));
      if (needsFlash && torchSupported && trackRef.current && !torchRef.current) {
        const changed = await setTrackTorch(trackRef.current, true);
        if (changed) {
          torchRef.current = true;
          await new Promise(resolve => setTimeout(resolve, 220));
        }
      }
      const file = await captureVideoFile(
        videoRef.current,
        trackRef.current,
        \`road-ready-capture-\${Date.now()}.jpg\`,
        { flashMode, lowLight:needsFlash }
      );`;
const flashCaptureAfter = `      const needsFlash = flashMode === 'on' || (flashMode === 'auto' && Boolean(quality.autoFlashNeeded));
      if (needsFlash && torchSupported && trackRef.current && !torchRef.current) {
        const changed = await setTrackTorch(trackRef.current, true);
        if (changed) {
          torchRef.current = true;
          await new Promise(resolve => setTimeout(resolve, 220));
        }
      }
      const captureV1030 = await captureBestDocumentFileV1030(
        videoRef.current,
        trackRef.current,
        \`road-ready-capture-\${Date.now()}.jpg\`,
        { onStatus:setVisionStatus, flashMode, lowLight:needsFlash }
      );
      const file = captureV1030.file;
      setCaptureDiagnostics(captureV1030.diagnostics);`;
turbo = replaceOnce(turbo, flashCaptureBefore, flashCaptureAfter, 'flash-aware best-frame capture');
turbo = replaceOnce(
  turbo,
  "        ocrSource:'pro-text-v102',",
  "        ocrSource:'scanner-intelligence-v1030',\n        pageFiles:allPages,\n        captureDiagnostics,",
  'page-by-page OCR metadata'
);
write(turboPath, turbo);

// Keep the latest V104 document-type arbitration as the base reader beneath V103.
const readerPath = 'source/src/modules/scan/smartDocumentReaderV1030.js';
let reader = read(readerPath);
reader = replaceOnce(
  reader,
  "import { analyzeSmartDocumentV102 } from './smartDocumentReaderV102.js';",
  "import { analyzeSmartDocumentV104 } from './smartDocumentReaderV104.js';",
  'V104 base reader import'
);
reader = reader.replace(/analyzeSmartDocumentV102\(/g, 'analyzeSmartDocumentV104(');
write(readerPath, reader);

// Route all scans through page-by-page multi-pass OCR consensus while preserving
// the manual type-change parser from V104.
const sheetPath = 'source/src/modules/scan/SmartScanSheetV100.jsx';
let sheet = read(sheetPath);
sheet = replaceOnce(
  sheet,
  "import { analyzeSmartDocumentV104, parseSmartDocumentTextByTypeV104 } from './smartDocumentReaderV104.js';",
  "import { analyzeSmartDocumentV1030 } from './smartDocumentReaderV1030.js';\nimport { parseSmartDocumentTextByTypeV104 } from './smartDocumentReaderV104.js';",
  'V103 reader import'
);
sheet = sheet.replace(/analyzeSmartDocumentV104\(/g, 'analyzeSmartDocumentV1030(');
if (!sheet.includes("return 'Scanner Intelligence';")) {
  sheet = replaceOnce(
    sheet,
    "function methodLabel(method = '') {",
    "function methodLabel(method = '') {\n  if (/scanner-intelligence-v1030/.test(method)) return 'Scanner Intelligence';",
    'V103 method label'
  );
}
write(sheetPath, sheet);

// Make the preflight screen explain the actual capture/verification behavior.
const capturePath = 'source/src/modules/scan/SmartDocumentCaptureV100.jsx';
let capture = read(capturePath);
capture = capture.replace('<p>Document-aware reader</p>', '<p>Scanner Intelligence</p>');
capture = capture.replace(
  '<em>Road Ready reads each document with its own rules, then suggests the correct load and Logbook day.</em>',
  '<em>Road Ready selects the sharpest frame, fixes the page, reads each page separately and verifies critical fields before import.</em>'
);
write(capturePath, capture);

// Tesseract v7 keeps the on-device OCR engine current while preserving the existing cached worker design.
const webOcrPath = 'source/src/modules/scan/webOcr.js';
let webOcr = read(webOcrPath);
webOcr = webOcr.replace('tesseract.js@6.0.1', 'tesseract.js@7.0.0');
write(webOcrPath, webOcr);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) {
  lock.packages[''].version = VERSION;
  lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
}
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v103-scanner-intelligence-core',
  releasedAt:RELEASED_AT,
  notes:[
    'Captures a short burst plus the highest-resolution camera still, scores sharpness, contrast, exposure, glare and resolution, and keeps the best source frame.',
    'Straightens the document with the existing professional frame detector, then builds shadow-normalized, CLAHE-sharpened, adaptive black-and-white and clean-color OCR variants.',
    'Reads multi-page camera scans page by page instead of shrinking every page into one long OCR image.',
    'Runs multi-pass on-device OCR only when needed, compares the passes and keeps field-level evidence and confidence for every imported value.',
    'Validates load numbers, dates, trucking ranges, carrier-rate math and fuel gallons × price before marking a scan as verified.',
    'Keeps native PDF text and V104 document-type arbitration as the first choices and upgrades the browser OCR worker to Tesseract.js 7.',
    'Does not create or change Logbook duty status, event times, signatures, route completion or billing records without the existing review and save flow.'
  ],
  label:'v103.0 Scanner Intelligence',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const checks = [
  ['source/src/modules/scan/TurboDocumentScanner.jsx','captureBestDocumentFileV1030'],
  ['source/src/modules/scan/TurboDocumentScanner.jsx','pageFiles:allPages'],
  ['source/src/modules/scan/SmartScanSheetV100.jsx','analyzeSmartDocumentV1030'],
  ['source/src/modules/scan/SmartScanSheetV100.jsx','parseSmartDocumentTextByTypeV104'],
  ['source/src/modules/scan/smartDocumentReaderV1030.js','analyzeSmartDocumentV104'],
  ['source/src/modules/scan/smartDocumentReaderV1030.js','consensusFieldsV1030'],
  ['source/src/modules/scan/scannerIntelligenceV1030.js','adaptiveThreshold'],
  ['source/src/modules/scan/webOcr.js','tesseract.js@7.0.0'],
];
for (const [relative, needle] of checks) {
  if (!read(relative).includes(needle)) throw new Error(`v103 verification missing ${needle} in ${relative}`);
}
console.log('v103 Scanner Intelligence materialized');
await import('./verify-scanner-intelligence-v1030.mjs');
