import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '100.2.0';
const RELEASED_AT = '2026-07-15T08:30:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v100.2 missing ${label}`);
  return content.replace(before, after);
}

const scanPath = 'source/src/modules/scan/SmartScanSheetV100.jsx';
let scan = read(scanPath);
scan = replaceOnce(
  scan,
  "import { analyzeSmartDocumentV100 } from './smartDocumentReaderV100.js';",
  "import { analyzeSmartDocumentV102 } from './smartDocumentReaderV102.js';",
  'v102 reader import'
);
scan = scan.replace(/analyzeSmartDocumentV100\(/g, 'analyzeSmartDocumentV102(');
scan = replaceOnce(
  scan,
  "  if (/pdf-text-v100/.test(method)) return 'Pro PDF text reader';",
  "  if (/pdfjs-native-text-v102/.test(method)) return 'Native PDF.js text layer';\n  if (/pdfjs-fallback/.test(method)) return 'PDF.js fallback reader';\n  if (/pdf-text-v100/.test(method)) return 'Legacy PDF text reader';",
  'v102 method labels'
);
scan = replaceOnce(
  scan,
  "    pickupDate:dateInputValue(f.pickupDate || f.date),",
  "    orderNo:f.orderNo || f.loadNo || '',\n    legNo:f.legNo || '',\n    mcNumber:f.mcNumber || '',\n    pickupNumber:f.pickupNumber || '',\n    poNumbersText:Array.isArray(f.poNumbers) ? f.poNumbers.join(' · ') : (f.poNumbersText || f.poNumber || ''),\n    routeSummary:f.routeSummary || '',\n    trackingProvider:f.trackingProvider || '',\n    nextStop:f.nextStop || '',\n    stopCount:Number(f.stopCount || 0),\n    pickupDate:dateInputValue(f.pickupDate || f.date),",
  'v102 rate con fields'
);
scan = replaceOnce(
  scan,
  "            <Field label=\"Broker\" wide><input value={fields.broker || ''} onChange={event => updateField('broker', event.target.value)} placeholder=\"Broker or customer\"/></Field>",
  "            <Field label=\"Broker\" wide><input value={fields.broker || ''} onChange={event => updateField('broker', event.target.value)} placeholder=\"Broker or customer\"/></Field>\n            <Field label=\"Leg #\"><input value={fields.legNo || ''} onChange={event => updateField('legNo', event.target.value.toUpperCase())} placeholder=\"Optional\"/></Field>\n            <Field label=\"Pickup #\"><input value={fields.pickupNumber || ''} onChange={event => updateField('pickupNumber', event.target.value.toUpperCase())} placeholder=\"Optional\"/></Field>\n            <Field label=\"Carrier\" wide><input value={fields.carrierName || ''} onChange={event => updateField('carrierName', event.target.value)} placeholder=\"Carrier\"/></Field>\n            <Field label=\"MC #\"><input value={fields.mcNumber || ''} onChange={event => updateField('mcNumber', event.target.value.toUpperCase())} placeholder=\"Optional\"/></Field>\n            <Field label=\"Tracking\"><input value={fields.trackingProvider || ''} onChange={event => updateField('trackingProvider', event.target.value)} placeholder=\"FourKites, MacroPoint…\"/></Field>",
  'v102 rate con identity UI'
);
scan = replaceOnce(
  scan,
  "            <Field label=\"Equipment\"><input value={fields.equipment || ''} onChange={event => updateField('equipment', event.target.value)} placeholder=\"Reefer, dry van…\"/></Field>",
  "            <Field label=\"Equipment\"><input value={fields.equipment || ''} onChange={event => updateField('equipment', event.target.value)} placeholder=\"Reefer, dry van…\"/></Field>\n            <Field label=\"Pieces\"><input inputMode=\"numeric\" value={fields.totalPieces || ''} onChange={event => updateField('totalPieces', event.target.value)} placeholder=\"Optional\"/></Field>\n            <Field label=\"Weight\"><input inputMode=\"numeric\" value={fields.weight || ''} onChange={event => updateField('weight', event.target.value)} placeholder=\"Optional\"/></Field>\n            <Field label=\"PO numbers\" wide><input value={fields.poNumbersText || ''} onChange={event => updateField('poNumbersText', event.target.value)} placeholder=\"Optional\"/></Field>\n            <Field label={`Route / ${fields.stopCount || 0} stops`} wide><textarea value={fields.routeSummary || ''} onChange={event => updateField('routeSummary', event.target.value)} placeholder=\"Pickup and delivery stops\"/></Field>",
  'v102 multi-stop UI'
);
scan = replaceOnce(
  scan,
  "          date:fields.date || localDateKey(), loadNo, broker:String(fields.broker || '').trim(), origin:String(fields.origin || '').trim(), destination:String(fields.destination || '').trim(), gross:number(fields.gross || fields.total), loadedMiles:number(fields.loadedMiles), deadheadMiles:number(fields.deadheadMiles), status:'booked', pickupDate:fields.pickupDate || '', deliveryDate:fields.deliveryDate || '', equipment:fields.equipment || '', source:'smart_scan_v100', documentId:stored.localDocument.local_id,",
  "          date:fields.date || localDateKey(), loadNo, orderNo:String(fields.orderNo || loadNo).trim(), legNo:String(fields.legNo || '').trim(), broker:String(fields.broker || '').trim(), carrierName:String(fields.carrierName || '').trim(), mcNumber:String(fields.mcNumber || '').trim(), origin:String(fields.origin || '').trim(), destination:String(fields.destination || '').trim(), nextStop:String(fields.nextStop || '').trim(), gross:number(fields.gross || fields.total), linehaul:number(fields.linehaul), fuelSurcharge:number(fields.fuelSurcharge), loadedMiles:number(fields.loadedMiles), deadheadMiles:number(fields.deadheadMiles), status:'booked', pickupDate:fields.pickupDate || '', deliveryDate:fields.deliveryDate || '', equipment:fields.equipment || '', pickupNumber:String(fields.pickupNumber || '').trim(), poNumbers:String(fields.poNumbersText || '').trim(), routeSummary:String(fields.routeSummary || '').trim(), stopCount:number(fields.stopCount), pieces:number(fields.totalPieces), weight:number(fields.weight), trackingProvider:String(fields.trackingProvider || '').trim(), source:'smart_scan_v102', documentId:stored.localDocument.local_id,",
  'v102 saved load details'
);
write(scanPath, scan);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v100.2-native-pdfjs-multistop-ratecon',
  releasedAt:RELEASED_AT,
  notes:[
    'Reads digital PDFs with the real PDF.js text layer before attempting OCR.',
    'Keeps the dependency-free PDF reader as an offline fallback.',
    'Adds a trucking-specific multi-page Rate Confirmation parser for order, leg, broker, carrier, MC, pickup number, rate, equipment, pieces, weight and every pickup/delivery stop.',
    'Shows all stops in the Rate Con review screen and stores the route summary with the load.',
    'Uses OCR only for photographed or scanned documents that do not contain native PDF text.',
    'Preserves Pro Document Inbox, Logbook linking, multi-event shift, HOS and DOT data.'
  ],
  label:'v100.2 Native PDF.js & Multi-stop Rate Con',
  updatedAt:RELEASED_AT
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const verifyScan = read(scanPath);
const verifyPdf = read('source/src/modules/scan/pdfTextV102.js');
const verifyReader = read('source/src/modules/scan/smartDocumentReaderV102.js');
const verifyRate = read('source/src/modules/scan/rateConfirmationParserV102.js');
if (!verifyScan.includes('analyzeSmartDocumentV102') || !verifyScan.includes('routeSummary') || !verifyScan.includes('Native PDF.js text layer')) throw new Error('v100.2 scanner integration failed');
if (!verifyPdf.includes('getTextContent') || !verifyPdf.includes('pdfjs-native-text-v102') || !verifyPdf.includes('PDFJS_MODULE_URL')) throw new Error('v100.2 PDF.js reader failed');
if (!verifyReader.includes('readPdfTextV102') || !verifyReader.includes('parseRateConfirmationV102')) throw new Error('v100.2 reader routing failed');
if (!verifyRate.includes('parseRateConfirmationStopsV102') || !verifyRate.includes('deliveryCount')) throw new Error('v100.2 multi-stop parser failed');
console.log('v100.2 native PDF.js and multi-stop Rate Con materialized');
await import('./verify-rate-confirmation-v102.mjs');
await import('./materialize-v103.mjs');
