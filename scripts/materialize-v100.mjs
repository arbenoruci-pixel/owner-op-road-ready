import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '100.0.0';
const RELEASED_AT = '2026-07-14T19:30:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, search, replacement, label) {
  if (content.includes(replacement)) return content;
  if (!content.includes(search)) throw new Error(`v100 missing ${label}`);
  return content.replace(search, replacement);
}
function appendOnce(content, marker, addition) {
  return content.includes(marker) ? content : `${content.trimEnd()}\n\n${addition.trim()}\n`;
}

// v100 owns the final Smart Scan screen after all legacy scanner materializers.
write('source/src/modules/scan/SmartScanSheet.jsx', "export { default } from './SmartScanSheetV100.jsx';\n");

// Export the pure parsers for regression tests and future server/native reuse.
const readerPath = 'source/src/modules/scan/smartDocumentReaderV100.js';
let reader = read(readerPath);
reader = appendOnce(reader, 'export const parseBolFieldsV100', `
export const parseBolFieldsV100 = parseBol;
export const parseRateConfirmationFieldsV100 = parseRateConfirmation;
export const parseFuelReceiptFieldsV100 = parseFuelReceipt;
`);
write(readerPath, reader);

// Listen for saved-document linkage and update the live/offline Logbook state.
const appPath = 'source/src/app/App.jsx';
let app = read(appPath);
app = replaceOnce(
  app,
  "import { applyDayBackupToState } from '../core/backup/dayTransfer.js';",
  "import { applyDayBackupToState } from '../core/backup/dayTransfer.js';\nimport { applySmartDocumentLinkV100, SMART_DOCUMENT_LINK_EVENT } from '../modules/scan/smartDocumentLinkV100.js';",
  'App document link import'
);
app = replaceOnce(
  app,
  `  const updateCheckInFlightRef = useRef(false);

  React.useEffect(() => {`,
  `  const updateCheckInFlightRef = useRef(false);

  React.useEffect(() => {
    function onSmartDocumentLink(event) {
      const payload = event?.detail;
      if (!payload) return;
      setState(current => applySmartDocumentLinkV100(current, payload));
    }
    window.addEventListener(SMART_DOCUMENT_LINK_EVENT, onSmartDocumentLink);
    return () => window.removeEventListener(SMART_DOCUMENT_LINK_EVENT, onSmartDocumentLink);
  }, []);

  React.useEffect(() => {`,
  'App document link listener'
);
write(appPath, app);

// Pro Document Inbox styling.
const stylePath = 'source/src/turbo-scan-flow.css';
let styles = read(stylePath);
styles = appendOnce(styles, '/* v100 Pro Document Inbox */', `
/* v100 Pro Document Inbox */
.scan-preflight-actions.pro-four-v100{
  display:grid!important;
  grid-template-columns:1fr 1fr!important;
  gap:8px!important;
}
.scan-preflight-actions.pro-four-v100>button.primary{grid-column:1/-1!important;}
.scan-preflight-actions.pro-four-v100>button{
  min-height:50px!important;
  border-radius:16px!important;
  font-weight:950!important;
}
.scan-preflight-actions .file-import-v100{
  border:1px solid rgba(147,197,253,.45)!important;
  background:rgba(37,99,235,.14)!important;
  color:#dbeafe!important;
}
.smart-link-card-v100{
  margin:0 0 12px;
  padding:14px;
  border:1px solid #bfdbfe;
  border-radius:22px;
  background:linear-gradient(180deg,#eff6ff 0%,#fff 100%);
  box-shadow:0 8px 24px rgba(37,99,235,.08);
}
.smart-link-card-v100 .smart-scan-section-title>span{display:flex;align-items:center;gap:7px;}
.smart-link-toggle-v100{
  display:grid;
  grid-template-columns:24px minmax(0,1fr);
  gap:10px;
  align-items:start;
  padding:11px;
  border:1px solid #dbeafe;
  border-radius:16px;
  background:#fff;
}
.smart-link-toggle-v100 input{width:20px;height:20px;margin:2px 0 0;accent-color:#2563eb;}
.smart-link-toggle-v100 b,.smart-link-toggle-v100 em{display:block;}
.smart-link-toggle-v100 b{color:#172033;font-size:14px;font-weight:1000;}
.smart-link-toggle-v100 em{margin-top:3px;color:#64748b;font-size:11px;font-style:normal;font-weight:800;}
.smart-link-grid-v100{display:grid;grid-template-columns:minmax(130px,.72fr) minmax(0,1.28fr);gap:9px;margin-top:9px;}
.smart-link-grid-v100>label,.smart-link-grid-v100>div{padding:10px;border:1px solid #dbeafe;border-radius:15px;background:#fff;min-width:0;}
.smart-link-grid-v100 span{display:block;margin-bottom:6px;color:#64748b;font-size:10px;font-weight:1000;letter-spacing:.1em;text-transform:uppercase;}
.smart-link-grid-v100 input{width:100%;min-height:42px;border:1px solid #d9e3ef;border-radius:12px;padding:0 9px;font-size:15px;font-weight:900;box-sizing:border-box;}
.smart-link-grid-v100 p{margin:0;color:#334155;font-size:12px;font-weight:800;line-height:1.35;}
.pro-review-v100 .smart-scan-file-preview{min-height:170px;}
@media(max-width:390px){
  .scan-preflight-actions.pro-four-v100{grid-template-columns:1fr!important;}
  .scan-preflight-actions.pro-four-v100>button.primary{grid-column:auto!important;}
  .smart-link-grid-v100{grid-template-columns:1fr;}
}
`);
write(stylePath, styles);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v100-pro-document-inbox-logbook-linking',
  releasedAt:RELEASED_AT,
  notes:[
    'Adds a Pro Document Inbox with separate camera, Photos, PDF and file-import actions.',
    'Reads digital PDF text without an external dependency, including common Rate Confirmation and Mudflap fuel exports.',
    'Uses document-specific parsers for BOL/POD, Rate Confirmation and fuel receipts instead of one generic OCR field guesser.',
    'Suggests the correct Logbook day by exact load/BOL reference, document date, route origin/destination and existing pickup/delivery/fuel events.',
    'Links verified BOL/POD data to the exact log event, route leg and active load; links Rate Cons to load details and fuel receipts to the matching day/event.',
    'Never creates or changes duty-status time during document import, and signed days are flagged for recertification when shipping-document data changes.',
    'Keeps uncertain fields blank and requires driver review before save.'
  ],
  label:'v100 Pro Document Inbox & Logbook Linking',
  updatedAt:RELEASED_AT
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const verifySheet = read('source/src/modules/scan/SmartScanSheet.jsx');
const verifyV100 = read('source/src/modules/scan/SmartScanSheetV100.jsx');
const verifyCapture = read('source/src/modules/scan/SmartDocumentCaptureV100.jsx');
const verifyLink = read('source/src/modules/scan/smartDocumentLinkV100.js');
const verifyPdf = read('source/src/modules/scan/pdfTextV100.js');
const verifyApp = read(appPath);
if (!verifySheet.includes('SmartScanSheetV100') || !verifyV100.includes('analyzeSmartDocumentV100') || !verifyV100.includes('Link to Logbook')) throw new Error('v100 Smart Scan integration failed');
if (!verifyCapture.includes('Import PDF / File') || !verifyCapture.includes('Choose Photos') || !verifyCapture.includes('Fuel / Mudflap')) throw new Error('v100 import actions failed');
if (!verifyLink.includes('applyShippingDocumentReference') || !verifyLink.includes('Needs Recertification') || !verifyLink.includes('fuelReceiptsByDay')) throw new Error('v100 Logbook linkage failed');
if (!verifyPdf.includes('DecompressionStream') || !verifyPdf.includes('FlateDecode') || !verifyPdf.includes('pdf-text-v100')) throw new Error('v100 PDF reader failed');
if (!verifyApp.includes('SMART_DOCUMENT_LINK_EVENT') || !verifyApp.includes('applySmartDocumentLinkV100')) throw new Error('v100 App listener failed');
console.log('v100 Pro Document Inbox materialized');
await import('./materialize-v101.mjs');
