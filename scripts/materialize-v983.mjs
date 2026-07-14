import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '98.3.0';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, search, replacement, label) {
  if (content.includes(replacement)) return content;
  if (search instanceof RegExp) {
    if (!search.test(content)) throw new Error(`v98.3 missing ${label}`);
    return content.replace(search, replacement);
  }
  if (!content.includes(search)) throw new Error(`v98.3 missing ${label}`);
  return content.replace(search, replacement);
}

const scanPath = 'source/src/modules/scan/SmartScanSheet.jsx';
let scan = read(scanPath);
scan = replaceOnce(
  scan,
  "import { analyzeScanFile, documentTypeMeta, SMART_DOCUMENT_TYPES } from './smartScan.js';",
  "import { documentTypeMeta, SMART_DOCUMENT_TYPES } from './smartScan.js';\nimport ProDocumentCapture from './ProDocumentCapture.jsx';\nimport { analyzeDocumentFilePro } from './smartScanPro.js';",
  'Smart Scan imports'
);
scan = replaceOnce(
  scan,
  "  if (method === 'text-file') return 'Text document scan';",
  "  if (method === 'text-file') return 'Text document scan';\n  if (method === 'web-ocr') return 'Enhanced on-device OCR';",
  'web OCR method label'
);
scan = replaceOnce(
  scan,
  '  async function chooseFile(nextFile) {',
  "  async function chooseFile(nextFile, preferredType = 'auto') {",
  'chooseFile hint'
);
scan = replaceOnce(
  scan,
  "      const result = await analyzeScanFile(nextFile, {\n        onProgress:(value, text) => {",
  "      const result = await analyzeDocumentFilePro(nextFile, {\n        preferredType,\n        onProgress:(value, text) => {",
  'enhanced analyzer call'
);
scan = replaceOnce(
  scan,
  /      \{stage === 'capture' && \(\n        <main className="smart-scan-capture">[\s\S]*?        <\/main>\n      \)\}\n\n      \{stage === 'analyzing'/,
  "      {stage === 'capture' && (\n        <ProDocumentCapture\n          onClose={onClose}\n          onReady={(scanFile, preferredType) => chooseFile(scanFile, preferredType)}\n        />\n      )}\n\n      {stage === 'analyzing'",
  'pro camera capture block'
);
scan = scan
  .replace('<div><b>Smart Scan</b><em>Camera · classify · organize</em></div>', '<div><b>Smart Scan</b><em>Camera · crop · read · organize</em></div>')
  .replace('This phone did not expose text OCR to the web app. Classification used file context and requires your confirmation. Native iPhone/Android builds can plug into the same scanner with platform OCR.', 'No reliable text was returned from this page. Choose the document type above and confirm the fields. The native iPhone and Android builds will use the same flow with platform document scanners and OCR.');
write(scanPath, scan);

const layoutPath = fs.existsSync(file('app/layout.jsx')) ? 'app/layout.jsx' : 'app/layout.js';
let layout = read(layoutPath);
if (!layout.includes("import '../source/src/scanner-pro.css';")) {
  layout = replaceOnce(
    layout,
    "import '../source/src/setup-scan.css';",
    "import '../source/src/setup-scan.css';\nimport '../source/src/scanner-pro.css';",
    'scanner CSS import'
  );
}
write(layoutPath, layout);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);

write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v98.3-pro-document-camera',
  releasedAt:'2026-07-14T04:15:00.000Z',
  notes:[
    'Replaces the basic file picker with a live document camera, document-type selection, quality guidance, automatic capture, gallery import, and supported-camera flash control.',
    'Adds automatic page-edge suggestions, four-corner manual crop, perspective correction, rotation, and Original, Color, Clean, and Black-and-White document filters.',
    'Adds a lazy enhanced web OCR fallback for iPhone and other browsers without built-in text detection, plus barcode extraction and document-type hints for stronger classification.',
    'Keeps native iPhone VisionKit and Android ML Kit bridge support ready while preserving logbook, HOS, DOT, route, signature, wallet, load, and business data.'
  ],
  label:'v98.3 Pro Document Camera',
  updatedAt:'2026-07-14T04:15:00.000Z'
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const verifyScan = read(scanPath);
const camera = read('source/src/modules/scan/ProDocumentCapture.jsx');
const pipeline = read('source/src/modules/scan/documentImagePipeline.js');
const analyzer = read('source/src/modules/scan/smartScanPro.js');
if (!verifyScan.includes('ProDocumentCapture') || !verifyScan.includes('analyzeDocumentFilePro')) {
  throw new Error('v98.3 Smart Scan patch verification failed');
}
if (!camera.includes('getUserMedia') || !camera.includes('applyConstraints') || !camera.includes('capture="environment"') || !camera.includes('What are you scanning?')) {
  throw new Error('v98.3 camera verification failed');
}
if (!pipeline.includes('processDocumentImage') || !pipeline.includes('homography') || !pipeline.includes("filter = 'clean'")) {
  throw new Error('v98.3 document pipeline verification failed');
}
if (!analyzer.includes('tesseract.js@5') || !analyzer.includes('BarcodeDetector') || !analyzer.includes('preferredType')) {
  throw new Error('v98.3 OCR verification failed');
}
if (!layout.includes('scanner-pro.css')) {
  throw new Error('v98.3 CSS verification failed');
}
console.log('v98.3 pro document camera materialized');
