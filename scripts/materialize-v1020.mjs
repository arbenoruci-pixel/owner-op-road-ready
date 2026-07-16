import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '102.0.0';
const RELEASED_AT = '2026-07-16T15:00:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function appendOnce(content, marker, addition) {
  return content.includes(marker) ? content : `${content.trimEnd()}\n\n${addition.trim()}\n`;
}
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v102 missing ${label}`);
  return content.replace(before, after);
}

// Professional frame selection, narrow-receipt scaling and a separate OCR image.
const enginePath = 'source/src/modules/scan/documentScannerEngine.js';
let engine = read(enginePath);
if (!engine.includes("from './proDocumentVisionV102.js'")) {
  engine = `import { detectBestDocumentQuadV102, enhanceOcrCanvasV102, receiptOutputSizeV102 } from './proDocumentVisionV102.js';\n${engine}`;
}
const detectPattern = /export async function detectDocumentCorners\(source, options = \{\}\) \{[\s\S]*?\n\}\n\nexport async function fileToImage/;
if (!engine.includes('pro-document-frame-v102')) {
  if (!detectPattern.test(engine)) throw new Error('v102 missing document corner detector');
  engine = engine.replace(detectPattern, `export async function detectDocumentCorners(source, options = {}) {
  const { scanner, cv } = await loadDocumentVision(options.onStatus);
  const { canvas } = scaledCanvas(source, options.maxDimension || 1400);
  const pro = detectBestDocumentQuadV102(cv, canvas);
  if (pro) {
    options.onStatus?.('Professional document frame found');
    return {
      topLeft:pro.topLeft,
      topRight:pro.topRight,
      bottomLeft:pro.bottomLeft,
      bottomRight:pro.bottomRight,
      source:'pro-document-frame-v102',
    };
  }
  const mat = cv.imread(canvas);
  let contour = null;
  try {
    contour = scanner.findPaperContour(mat);
    if (!contour) return null;
    const corners = scanner.getCornerPoints(contour, mat);
    return validDetectedCorners(corners, canvas.width, canvas.height);
  } finally {
    try { contour?.delete?.(); } catch {}
    try { mat.delete(); } catch {}
  }
}

export async function fileToImage`);
}
engine = engine.replace(
  `    const scale = Math.min(1.35, 2300 / Math.max(rawWidth, rawHeight));\n    const outputWidth = Math.max(900, Math.round(rawWidth * scale));\n    const outputHeight = Math.max(1100, Math.round(rawHeight * scale));\n    const canvas = scanner.extractPaper(image, outputWidth, outputHeight, actual);`,
  `    const outputV102 = receiptOutputSizeV102(rawWidth, rawHeight);\n    const canvas = scanner.extractPaper(image, outputV102.width, outputV102.height, actual);`
);
engine = engine.replace(
  `  const filter = options.filter || 'auto';\n  if (filter !== 'original') {\n    const filteredContext = canvas.getContext('2d', { willReadFrequently:true });\n    const imageData = filteredContext.getImageData(0, 0, canvas.width, canvas.height);\n    filteredContext.putImageData(autoContrast(imageData, filter), 0, 0);\n  }\n  return canvasToFile(canvas, options.name || \`road-ready-\${filter}.jpg\`, 'image/jpeg', options.quality || .94);`,
  `  const filter = options.filter || 'auto';\n  if (filter === 'ocr') {\n    try {\n      const { cv } = await loadDocumentVision(options.onStatus);\n      enhanceOcrCanvasV102(canvas, cv);\n    } catch {\n      enhanceOcrCanvasV102(canvas, null);\n    }\n    return canvasToFile(canvas, options.name || 'road-ready-pro-text.jpg', 'image/jpeg', options.quality || .97);\n  }\n  if (filter !== 'original') {\n    const filteredContext = canvas.getContext('2d', { willReadFrequently:true });\n    const imageData = filteredContext.getImageData(0, 0, canvas.width, canvas.height);\n    filteredContext.putImageData(autoContrast(imageData, filter), 0, 0);\n  }\n  return canvasToFile(canvas, options.name || \`road-ready-\${filter}.jpg\`, 'image/jpeg', options.quality || .94);`
);
write(enginePath, engine);

const turboPath = 'source/src/modules/scan/TurboDocumentScanner.jsx';
let turbo = read(turboPath);
turbo = turbo.replace('export default function TurboDocumentScanner({ onComplete, onCancel }) {', 'export default function TurboDocumentScanner({ initialFile = null, onComplete, onCancel }) {');
turbo = turbo.replace("  { id:'auto', label:'Auto' },", "  { id:'auto', label:'Smart Clean' },\n  { id:'ocr', label:'Text Pro' },");
turbo = turbo.replace("  if (id === 'bw') return 'bw';", "  if (id === 'ocr') return 'bw';\n  if (id === 'bw') return 'bw';");
turbo = turbo.replace(
  `    startBestScanner();\n    return () => {`,
  `    if (initialFile) chooseImportedFile(initialFile);\n    else startBestScanner();\n    return () => {`
);
const finishPattern = /      const output = await composePageFiles\(allPages, `road-ready-scan-\$\{Date\.now\(\)\}\.jpg`\);[\s\S]*?      \}\);/;
if (!turbo.includes("ocrSource:'pro-text-v102'")) {
  if (!finishPattern.test(turbo)) throw new Error('v102 missing Turbo finish block');
  turbo = turbo.replace(finishPattern, `      const output = await composePageFiles(allPages, \`road-ready-scan-\${Date.now()}.jpg\`);
      const ocrSourceV102 = allPages.length === 1 ? (baseFile || page.file) : output;
      let ocrFileV102 = ocrSourceV102;
      try {
        ocrFileV102 = await renderDocumentFile(ocrSourceV102, {
          filter:'ocr',
          rotation:0,
          name:\`road-ready-pro-text-\${Date.now()}.jpg\`,
          maxDimension:4200,
          quality:.97,
        });
      } catch {}
      onComplete?.(output, {
        source:'road-ready-web-document-scanner',
        pageCount:allPages.length,
        filter,
        perspectiveCorrected:true,
        ocrFile:ocrFileV102,
        ocrSource:'pro-text-v102',
      });`);
}
write(turboPath, turbo);

// Expand smart classification for IFTA mileage and toll statements.
const smartPath = 'source/src/modules/scan/smartScan.js';
let smart = read(smartPath);
smart = smart.replace(
  "  { id:'fuel_receipt', label:'Fuel Receipt', short:'Fuel', target:'fuel', documentType:'fuel_receipt' },",
  "  { id:'fuel_receipt', label:'Fuel Receipt', short:'Fuel', target:'fuel', documentType:'fuel_receipt' },\n  { id:'mileage_statement', label:'ELD / IFTA Mileage Statement', short:'Miles', target:'documents', documentType:'other' },\n  { id:'toll_statement', label:'Toll Statement', short:'Tolls', target:'documents', documentType:'other' },"
);
if (!smart.includes('mileage_statement:[')) {
  smart = smart.replace(
    "  repair_invoice:[",
    "  mileage_statement:[\n    ['ifta mileage',15],['miles by state',14],['jurisdiction miles',12],['taxable miles',10],['vehicle distance',7],['motive',6],['keeptruckin',6],['samsara',5],['geotab',5],\n  ],\n  toll_statement:[\n    ['toll statement',15],['illinois tollway',14],['i-pass',12],['e-zpass',12],['transaction amount',5],['toll plaza',8],['license plate',4],['toll transactions',10],\n  ],\n  repair_invoice:["
  );
}
smart = smart.replace(
  "    repair_invoice:/repair|service|maintenance|tire|oil[-_ ]?change/ ,",
  "    mileage_statement:/motive|keeptruckin|ifta|mileage|miles[-_ ]?by[-_ ]?state/,\n    toll_statement:/tollway|i[-_ ]?pass|e[-_ ]?zpass|toll[-_ ]?statement/,\n    repair_invoice:/repair|service|maintenance|tire|oil[-_ ]?change/ ,"
);
// The base has no space before the comma in this line; support that shape too.
smart = smart.replace(
  "    repair_invoice:/repair|service|maintenance|tire|oil[-_ ]?change/ ,".replace(' /,','/,'),
  "    mileage_statement:/motive|keeptruckin|ifta|mileage|miles[-_ ]?by[-_ ]?state/,\n    toll_statement:/tollway|i[-_ ]?pass|e[-_ ]?zpass|toll[-_ ]?statement/,\n    repair_invoice:/repair|service|maintenance|tire|oil[-_ ]?change/ ,".replace(' /,','/,')
);
write(smartPath, smart);

const capturePath = 'source/src/modules/scan/SmartDocumentCaptureV100.jsx';
let capture = read(capturePath);
capture = capture.replace(
  "  { id:'fuel_receipt', label:'Fuel / Mudflap', detail:'Mudflap PDF, fuel receipt, gallons and IFTA state', icon:'fuel' },",
  "  { id:'fuel_receipt', label:'Fuel / Mudflap', detail:'Mudflap PDF, fuel receipt, gallons and IFTA state', icon:'fuel' },\n  { id:'mileage_statement', label:'ELD / IFTA Miles', detail:'Motive, Samsara, Geotab or mileage statement', icon:'document' },\n  { id:'toll_statement', label:'Toll Statement', detail:'Illinois Tollway, I-PASS, E-ZPass or toll file', icon:'receipt' },"
);
write(capturePath, capture);

// Fix source-PDF merging in invoice and audit packets.
const pdfPath = 'source/src/modules/owneros/ownerOpsPdfV102.js';
let pdf = read(pdfPath);
pdf = pdf.replace(
  "      const source = await pdfDoc.constructor.load(bytes, { ignoreEncryption:true });",
  "      const { PDFDocument } = await loadPdfLibV102();\n      const source = await PDFDocument.load(bytes, { ignoreEncryption:true });"
);
write(pdfPath, pdf);

// Integrate the Owner-Operator OS and live load card into Home.
const homePath = 'source/src/modules/home/HomeScreen.jsx';
let home = read(homePath);
if (!home.includes("from '../owneros/OwnerOperatorOSV102.jsx'")) {
  home = `import OwnerOperatorOSV102 from '../owneros/OwnerOperatorOSV102.jsx';\nimport ActiveLoadLiveV102 from './ActiveLoadLiveV102.jsx';\n${home}`;
}
if (!home.includes('ownerOsSectionsV102')) {
  const marker = "  if (businessSection === 'settlements') {";
  if (!home.includes(marker)) throw new Error('v102 missing Home business branch');
  home = home.replace(marker, `  const ownerOsSectionsV102 = ['overview','documents','billing','ifta','tolls','audit','connections'];
  if (ownerOsSectionsV102.includes(businessSection)) {
    return (
      <OwnerOperatorOSV102
        state={state}
        section={businessSection}
        onBack={() => setBusinessSection('')}
        onScan={() => setScanOpen(true)}
        onOpenLog={() => onOpenDay?.(today)}
      />
    );
  }

${marker}`);
}
home = home.replace(
  "  const modules = moduleCards.filter(module => moduleEnabled(operatorProfile, module.id));",
  `  const ownerOsModuleCardsV102 = [
    { icon:'receipt', title:'Document Vault', detail:'Original Rate Cons, BOLs, PODs and receipts', metric:'Open', tone:'blue', onClick:() => setBusinessSection('documents') },
    { icon:'load', title:'Billing & Factoring', detail:'Readiness, invoice and billing packet', metric:'Invoice', tone:'indigo', onClick:() => setBusinessSection('billing') },
    { icon:'fuel', title:'IFTA Imports', detail:'Motive miles plus Mudflap fuel by state', metric:'Quarter', tone:'amber', onClick:() => setBusinessSection('ifta') },
    { icon:'route', title:'Tolls', detail:'Illinois Tollway, I-PASS and E-ZPass', metric:'Import', tone:'rose', onClick:() => setBusinessSection('tolls') },
    { icon:'shield', title:'Audit Center', detail:'Load, DOT, IFTA and maintenance packets', metric:'Export', tone:'green', onClick:() => setBusinessSection('audit') },
    { icon:'chart', title:'Connections', detail:'ELD, fuel, toll and document imports', metric:'Link', tone:'teal', onClick:() => setBusinessSection('connections') },
  ];
  const modules = [...moduleCards.filter(module => moduleEnabled(operatorProfile, module.id)), ...ownerOsModuleCardsV102];`
);
const cardStart = home.indexOf("        <section className={activeLoad ? 'command-load-card' : 'command-load-card empty'}>");
if (cardStart >= 0 && !home.includes('<ActiveLoadLiveV102')) {
  const markers = [
    '        {logbookEnabled ? (\n          <section className="command-hos-card">',
    '        <section className="command-hos-card">',
  ];
  let nextIndex = -1;
  for (const marker of markers) {
    const found = home.indexOf(marker, cardStart);
    if (found >= 0 && (nextIndex < 0 || found < nextIndex)) nextIndex = found;
  }
  if (nextIndex < 0) throw new Error('v102 missing Home HOS marker after active card');
  const replacement = `        <ActiveLoadLiveV102
          state={state}
          activeLoad={activeLoad}
          businessStore={businessStore}
          onOpenSection={setBusinessSection}
          onArrive={() => onOpenStatus?.()}
          onScan={() => setScanOpen(true)}
        />

`;
  home = home.slice(0, cardStart) + replacement + home.slice(nextIndex);
}
home = home.replace(
  `<button type="button" onClick={() => setBusinessSection('performance')}><Icon name="more" /><span>More</span></button>`,
  `<button type="button" onClick={() => setBusinessSection('overview')}><Icon name="more" /><span>More</span></button>`
);
write(homePath, home);

// Make the new screens part of the global command-center design.
const commandCssPath = 'source/src/command-center.css';
let commandCss = read(commandCssPath);
commandCss = appendOnce(commandCss, '/* v102 Owner-Operator OS */', read('source/src/owner-os-v102.css'));
commandCss = appendOnce(commandCss, '/* v102 Owner-Operator OS extended */', read('source/src/owner-os-v102-b.css'));
commandCss = appendOnce(commandCss, '/* v102 Live Active Load */', read('source/src/active-load-v102.css'));
write(commandCssPath, commandCss);

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
  build:'v102-owner-operator-operating-system',
  releasedAt:RELEASED_AT,
  notes:[
    'Adds a searchable Document Vault that keeps original Rate Cons, BOLs, PODs, fuel receipts, repair invoices and compliance files available for audits.',
    'Adds Billing Readiness, carrier/factoring setup, automatic invoice PDFs, billing packet PDFs, email drafts and invoice status tracking per load.',
    'Imports Motive, KeepTruckin, Samsara, Geotab and generic ELD mileage CSV files, plus Mudflap/fuel-card CSV files, and builds IFTA jurisdiction summaries.',
    'Imports Illinois Tollway, I-PASS, E-ZPass and generic toll CSV statements, links transactions to loads and records toll expenses.',
    'Adds Load, DOT, IFTA, maintenance and complete owner-op audit exports with document manifests and original paperwork.',
    'Replaces the old Active Load card with a live route overview, next stop, progress, document/billing status and Navigate, Arrived, Documents and Billing actions.',
    'Improves receipt framing, perspective output and OCR-specific image enhancement for small, wrinkled and shadowed documents.',
    'Keeps all imports advisory and linked; no document, mileage, fuel or toll import creates or changes OFF, SB, Driving or ON DUTY time.'
  ],
  label:'v102.0 Owner-Operator OS',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const checks = [
  ['source/src/modules/home/HomeScreen.jsx','OwnerOperatorOSV102'],
  ['source/src/modules/home/HomeScreen.jsx','ActiveLoadLiveV102'],
  ['source/src/modules/scan/documentScannerEngine.js','detectBestDocumentQuadV102'],
  ['source/src/modules/scan/documentScannerEngine.js','enhanceOcrCanvasV102'],
  ['source/src/modules/scan/TurboDocumentScanner.jsx',"ocrSource:'pro-text-v102'"],
  ['source/src/modules/scan/smartScan.js','mileage_statement'],
  ['source/src/modules/scan/smartScan.js','toll_statement'],
  ['source/src/command-center.css','owner-os-screen-v102'],
  ['source/src/modules/owneros/OwnerOperatorOSV102.jsx','Document Vault'],
];
for (const [relative, needle] of checks) {
  if (!read(relative).includes(needle)) throw new Error(`v102 verification missing ${needle} in ${relative}`);
}
console.log('v102 Owner-Operator OS materialized');
await import('./verify-owner-operator-os-v102.mjs');
