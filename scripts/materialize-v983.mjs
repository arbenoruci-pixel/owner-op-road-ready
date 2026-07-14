import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '98.3.0';
const RELEASED_AT = '2026-07-14T04:45:00.000Z';
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
  "import { documentTypeMeta, SMART_DOCUMENT_TYPES } from './smartScan.js';\nimport SmartDocumentCapture from './SmartDocumentCapture.jsx';\nimport { analyzeDocumentFilePro } from './smartScanPro.js';",
  'Smart Scan imports'
);
scan = replaceOnce(
  scan,
  "  if (method === 'text-file') return 'Text document scan';",
  "  if (method === 'text-file') return 'Text document scan';\n  if (method === 'web-ocr') return 'Enhanced document OCR';",
  'web OCR method label'
);
scan = replaceOnce(
  scan,
  '  async function chooseFile(nextFile) {',
  "  async function chooseFile(nextFile, preferredType = 'auto', scanMeta = {}) {",
  'chooseFile scanner metadata'
);
scan = replaceOnce(
  scan,
  "      const result = await analyzeScanFile(nextFile, {\n        onProgress:(value, text) => {",
  "      const result = await analyzeDocumentFilePro(nextFile, {\n        preferredType,\n        onProgress:(value, text) => {",
  'enhanced analyzer call'
);
scan = replaceOnce(
  scan,
  '      setAnalysis(result);',
  '      setAnalysis({ ...result, scanMeta });',
  'scanner metadata result'
);
scan = replaceOnce(
  scan,
  "        weight:result.fields.weight || '',\n        notes:'',",
  "        weight:result.fields.weight || '',\n        bolNo:result.fields.bolNo || '',\n        poNumber:result.fields.poNumber || '',\n        trailerNo:result.fields.trailerNo || '',\n        carrierName:result.fields.carrierName || '',\n        totalPieces:result.fields.totalPieces || '',\n        commodity:result.fields.commodity || '',\n        checkIn:result.fields.checkIn || '',\n        appointmentTime:result.fields.appointmentTime || '',\n        checkOut:result.fields.checkOut || '',\n        receiver:result.fields.receiver || '',\n        pageCount:Number(scanMeta?.pageCount || 1),\n        notes:'',",
  'trucking scan fields'
);
scan = replaceOnce(
  scan,
  "  const confidence = Math.round((analysis?.confidence || 0) * 100);\n\n  return (",
  "  const confidence = Math.round((analysis?.confidence || 0) * 100);\n\n  if (stage === 'capture') {\n    return (\n      <SmartDocumentCapture\n        onClose={onClose}\n        onReady={(scanFile, preferredType, scanMeta) => chooseFile(scanFile, preferredType, scanMeta)}\n      />\n    );\n  }\n\n  return (",
  'Turbo scanner early return'
);
scan = replaceOnce(
  scan,
  "                {['bol','pod'].includes(selectedType) ? <>\n                  <Field label=\"Destination\" wide><input value={fields.destination || ''} onChange={event => updateField('destination', event.target.value)} placeholder=\"City, ST\" /></Field>\n                  <Field label=\"Seal\"><input value={fields.seal || ''} onChange={event => updateField('seal', event.target.value.toUpperCase())} placeholder=\"Optional\" /></Field>\n                  <Field label=\"Weight\"><input inputMode=\"numeric\" value={fields.weight || ''} onChange={event => updateField('weight', event.target.value)} placeholder=\"Optional\" /></Field>\n                </> : null}",
  "                {['bol','pod'].includes(selectedType) ? <>\n                  <Field label=\"Ship from\" wide><input value={fields.origin || ''} onChange={event => updateField('origin', event.target.value)} placeholder=\"City, ST\" /></Field>\n                  <Field label=\"Ship to\" wide><input value={fields.destination || ''} onChange={event => updateField('destination', event.target.value)} placeholder=\"City, ST\" /></Field>\n                  <Field label=\"Customer PO\"><input value={fields.poNumber || ''} onChange={event => updateField('poNumber', event.target.value.toUpperCase())} placeholder=\"Optional\" /></Field>\n                  <Field label=\"Trailer #\"><input value={fields.trailerNo || ''} onChange={event => updateField('trailerNo', event.target.value.toUpperCase())} placeholder=\"Optional\" /></Field>\n                  <Field label=\"Seal\"><input value={fields.seal || ''} onChange={event => updateField('seal', event.target.value.toUpperCase())} placeholder=\"Optional\" /></Field>\n                  <Field label=\"Weight\"><input inputMode=\"decimal\" value={fields.weight || ''} onChange={event => updateField('weight', event.target.value)} placeholder=\"Optional\" /></Field>\n                  <Field label=\"Pieces\"><input inputMode=\"numeric\" value={fields.totalPieces || ''} onChange={event => updateField('totalPieces', event.target.value)} placeholder=\"Optional\" /></Field>\n                  <Field label=\"Carrier\"><input value={fields.carrierName || ''} onChange={event => updateField('carrierName', event.target.value)} placeholder=\"Optional\" /></Field>\n                  <Field label=\"Check in\"><input value={fields.checkIn || ''} onChange={event => updateField('checkIn', event.target.value)} placeholder=\"Optional\" /></Field>\n                  <Field label=\"Appointment\"><input value={fields.appointmentTime || ''} onChange={event => updateField('appointmentTime', event.target.value)} placeholder=\"Optional\" /></Field>\n                  <Field label=\"Check out\"><input value={fields.checkOut || ''} onChange={event => updateField('checkOut', event.target.value)} placeholder=\"Optional\" /></Field>\n                  <Field label=\"Commodity\" wide><input value={fields.commodity || ''} onChange={event => updateField('commodity', event.target.value)} placeholder=\"Optional\" /></Field>\n                </> : null}",
  'BOL and POD review fields'
);
scan = scan
  .replace('<div><b>Smart Scan</b><em>Camera · classify · organize</em></div>', '<div><b>Smart Scan</b><em>Crop · enhance · OCR · organize</em></div>')
  .replace('This phone did not expose text OCR to the web app. Classification used file context and requires your confirmation. Native iPhone/Android builds can plug into the same scanner with platform OCR.', 'No reliable text was returned from this page. Try B/W, move closer, use more even light, or select the document type and confirm the fields.');
write(scanPath, scan);

const turboPath = 'source/src/modules/scan/TurboDocumentScanner.jsx';
let turbo = read(turboPath);
turbo = replaceOnce(
  turbo,
  '  const lastCornersRef = useRef(null);',
  '  const lastCornersRef = useRef(null);\n  const stableFramesRef = useRef(0);',
  'scanner stability ref'
);
turbo = replaceOnce(
  turbo,
  '  const [liveCorners, setLiveCorners] = useState(defaultDocumentCorners());',
  '  const [liveCorners, setLiveCorners] = useState(defaultDocumentCorners());\n  const [frameDetected, setFrameDetected] = useState(false);',
  'scanner detected-frame state'
);
turbo = replaceOnce(
  turbo,
  '  const frameFound = autoFrame && documentPolygonArea(liveCorners) > .12;',
  '  const frameFound = autoFrame && frameDetected && documentPolygonArea(liveCorners) > .12;',
  'scanner frame-found guard'
);
turbo = replaceOnce(
  turbo,
  "    setLiveCorners(defaultDocumentCorners());\n    lastCornersRef.current = null;",
  "    setLiveCorners(defaultDocumentCorners());\n    setFrameDetected(false);\n    stableFramesRef.current = 0;\n    lastCornersRef.current = null;",
  'scanner detection reset'
);
turbo = replaceOnce(
  turbo,
  "        if (autoFrame) {\n          const detected = await detectDocumentCorners(canvas, { maxDimension:540 });\n          if (detected && mountedRef.current) {\n            const previous = lastCornersRef.current;\n            lastCornersRef.current = detected;\n            setLiveCorners(previous && cornerDelta(previous, detected) < .08 ? detected : detected);\n          }\n        }",
  "        if (autoFrame) {\n          const detected = await detectDocumentCorners(canvas, { maxDimension:540 });\n          if (detected && mountedRef.current) {\n            const previous = lastCornersRef.current;\n            const stable = Boolean(previous) && cornerDelta(previous, detected) < .016 && nextQuality.good;\n            stableFramesRef.current = stable ? stableFramesRef.current + 1 : 0;\n            lastCornersRef.current = detected;\n            setLiveCorners(detected);\n            setFrameDetected(true);\n            if (stableFramesRef.current >= 4 && !capturing) {\n              stableFramesRef.current = 0;\n              void capturePage(detected);\n            }\n          } else if (mountedRef.current) {\n            stableFramesRef.current = 0;\n            setFrameDetected(false);\n          }\n        }",
  'scanner live edge and auto-capture logic'
);
turbo = replaceOnce(
  turbo,
  '  }, [stage, cameraState, flashMode, torchSupported, autoFrame]);',
  '  }, [stage, cameraState, flashMode, torchSupported, autoFrame, capturing]);',
  'scanner live-loop dependencies'
);
turbo = replaceOnce(
  turbo,
  '  async function capturePage() {',
  '  async function capturePage(cornersOverride = null) {',
  'scanner capture corner override'
);
turbo = replaceOnce(
  turbo,
  '      setCropCorners(frameFound ? liveCorners : defaultDocumentCorners());',
  "      const suggestedCorners = cornersOverride?.topLeft ? cornersOverride : (frameFound ? liveCorners : null);\n      setCropCorners(suggestedCorners || defaultDocumentCorners());",
  'scanner capture suggested corners'
);
write(turboPath, turbo);

const layoutPath = fs.existsSync(file('app/layout.jsx')) ? 'app/layout.jsx' : 'app/layout.js';
let layout = read(layoutPath);
if (!layout.includes("import '../source/src/turbo-scan.css';")) {
  layout = replaceOnce(
    layout,
    "import '../source/src/setup-scan.css';",
    "import '../source/src/setup-scan.css';\nimport '../source/src/turbo-scan.css';\nimport '../source/src/turbo-scan-flow.css';",
    'Turbo scanner CSS imports'
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
  build:'v98.3-turbo-document-scanner',
  releasedAt:RELEASED_AT,
  notes:[
    'Replaces the weak photo picker with a Turbo-style live document camera, document-type preflight, automatic edge detection, stability capture, quality guidance, gallery import, and supported-camera flash control.',
    'Adds four-corner crop, perspective correction, multi-page scanning, rotation, and Auto, Color, Gray, Black-and-White, and Original filters before OCR.',
    'Adds enhanced browser OCR with a high-contrast retry, barcode reading, document hints, and trucking-specific extraction for BOL number, PO, trailer, route, weight, pieces, check-in, appointment, and check-out.',
    'Keeps the native iPhone VisionKit and Android ML Kit bridge ready while preserving logbook, HOS, DOT, route, signature, wallet, load, and business data.'
  ],
  label:'v98.3 Turbo Document Scanner',
  updatedAt:RELEASED_AT
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const verifyScan = read(scanPath);
const verifyTurbo = read(turboPath);
const analyzer = read('source/src/modules/scan/smartScanPro.js');
const extraction = read('source/src/modules/scan/smartScanExtractionPro.js');
if (!verifyScan.includes('SmartDocumentCapture') || !verifyScan.includes('analyzeDocumentFilePro') || !verifyScan.includes('Customer PO')) {
  throw new Error('v98.3 Smart Scan integration verification failed');
}
if (!verifyTurbo.includes('stableFramesRef') || !verifyTurbo.includes('perspectiveCropFile') || !verifyTurbo.includes("filter:'bw'") && !verifyTurbo.includes("id:'bw'")) {
  throw new Error('v98.3 Turbo scanner verification failed');
}
if (!analyzer.includes('recognizeDocumentText') || !analyzer.includes('high-contrast OCR') || !analyzer.includes('BarcodeDetector')) {
  throw new Error('v98.3 OCR verification failed');
}
if (!extraction.includes('bill\\s+of\\s+lading') || !extraction.includes('appointmentTime') || !extraction.includes('trailerNo')) {
  throw new Error('v98.3 trucking extraction verification failed');
}
if (!layout.includes('turbo-scan.css') || !layout.includes('turbo-scan-flow.css')) {
  throw new Error('v98.3 scanner CSS verification failed');
}
console.log('v98.3 Turbo document scanner materialized');
