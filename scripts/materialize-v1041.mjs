import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '104.1.0';
const RELEASED_AT = '2026-07-17T04:10:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v104.1 missing ${label}`);
  return content.replace(before, after);
}

const enginePath = 'source/src/modules/scan/truckDocumentEngineV1040.js';
let engine = read(enginePath);
if (!engine.includes("from './podBolIntelligenceV1041.js'")) {
  engine = replaceOnce(
    engine,
    "} from './truckDocumentCatalogV1040.js';",
    "} from './truckDocumentCatalogV1040.js';\nimport { arbitrateBolPodOsdV1041, sanitizeBolPodFieldsV1041 } from './podBolIntelligenceV1041.js';",
    'POD/BOL intelligence import',
  );
}
engine = replaceOnce(
  engine,
  'export function classifyTruckDocumentTextV1040({',
  'function classifyTruckDocumentTextV1040Base({',
  'base classifier rename',
);
if (!engine.includes('export function classifyTruckDocumentTextV1040(input = {})')) {
  engine = replaceOnce(
    engine,
    '\nfunction pageSections(text = \'\') {',
    `\nexport function classifyTruckDocumentTextV1040(input = {}) {
  const raw = classifyTruckDocumentTextV1040Base(input);
  return arbitrateBolPodOsdV1041(raw, {
    text:input.text || '',
    baseTypeId:input.baseTypeId || '',
    preferredType:input.preferredType || 'auto',
    context:input.context || {},
  });
}

function pageSections(text = '') {`,
    'POD/BOL classifier arbitration wrapper',
  );
}
engine = replaceOnce(
  engine,
  '  return mergeMeaningful(fields, common);',
  '  return sanitizeBolPodFieldsV1041(typeId, source, mergeMeaningful(fields, common));',
  'POD/BOL field sanitizer',
);
write(enginePath, engine);

const catalogPath = 'source/src/modules/scan/truckDocumentCatalogV1040.js';
let catalog = read(catalogPath);
catalog = catalog.replace("t('pod','Proof of Delivery','POD'", "t('pod','POD / Signed BOL','POD'");
const oldOsd = `  t('osd_report','OS&D / Exception Report','OS&D','claims','documents','other',['load_folder','claims','billing','factoring','logbook'],[
    [/\\bOS&D\\b/i,85],[/overage|shortage|damage/i,34],[/exception\\s+report/i,45],[/freight\\s+claim/i,25],
  ],{ required:['loadNo','exceptionText'], fileSignals:[/os.?d|exception|damage/i], priority:42 }),`;
const newOsd = `  t('osd_report','OS&D / Exception Report','OS&D','claims','documents','other',['load_folder','claims','billing','factoring','logbook'],[
    [/\\bOS\\s*&\\s*D\\s+(?:REPORT|FORM|CLAIM)\\b/i,95],[/exception\\s+report/i,68],[/freight\\s+claim/i,48],
    [/(?:damage|shortage|overage)\\s+(?:description|details|qty|quantity|amount)/i,44],[/amount\\s+claimed/i,38],[/\\bOS\\s*&\\s*D\\b/i,10],
  ],{ required:['loadNo','exceptionText'], fileSignals:[/os.?d|exception|damage/i], negativeSignals:[
    [/\\bB\\s*\\/\\s*L\\s*(?:NO|NUMBER|#)/i,70],[/PRODUCT\\s+CODE[\\s\\S]{0,220}(?:QTY|QUANTITY)\\s+SHIPPED/i,70],
    [/to\\s+report\\s+any\\s+OS\\s*&?\\s*D/i,90],[/OS\\s*&?\\s*D\\s+claims?\\s+department/i,70],
  ], priority:18 }),`;
catalog = replaceOnce(catalog, oldOsd, newOsd, 'OS&D disclaimer evidence gate');
write(catalogPath, catalog);

const sheetPath = 'source/src/modules/scan/SmartScanSheetV100.jsx';
let sheet = read(sheetPath);
sheet = sheet.replace(
  "import SmartDocumentExtraFieldsV1040 from './SmartDocumentExtraFieldsV1040.jsx';",
  "import SmartDocumentExtraFieldsV1041 from './SmartDocumentExtraFieldsV1041.jsx';",
);
sheet = sheet.replace(/<SmartDocumentExtraFieldsV1040\b/g, '<SmartDocumentExtraFieldsV1041');
if (!sheet.includes('salesOrder:f.salesOrder')) {
  sheet = replaceOnce(
    sheet,
    "    serviceDescription:f.serviceDescription || '',\n    notes:'',",
    `    serviceDescription:f.serviceDescription || '',
    salesOrder:f.salesOrder || '',
    deliveryNumber:f.deliveryNumber || '',
    routeCarNo:f.routeCarNo || '',
    dropNumber:f.dropNumber || '',
    foNumber:f.foNumber || '',
    sealNumbers:f.sealNumbers || '',
    shipper:f.shipper || '',
    consignee:f.consignee || '',
    totalUnits:f.totalUnits || '',
    totalTare:f.totalTare || '',
    netWeight:f.netWeight || '',
    grossWeight:f.grossWeight || f.weight || '',
    deliverySignedDate:f.deliverySignedDate ? dateInputValue(f.deliverySignedDate) : '',
    signatureLikely:f.signatureLikely === true,
    notes:'',`,
    'signed BOL detail fields',
  );
}
write(sheetPath, sheet);

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
  build:'v104.1-pod-bol-structural-reader',
  releasedAt:RELEASED_AT,
  notes:[
    'Stops printed OS&D driver instructions inside a Bill of Lading from being classified as an OS&D claim report.',
    'Recognizes a signed customer-copy BOL as POD / Signed BOL while keeping receiver signature confirmation reviewable.',
    'Reads exact B/L number, sales order, delivery number, PO, route/car, FO, seals, shipper, consignee, units, tare, net weight, gross weight, temperature and signed-delivery date.',
    'Rejects OCR word fragments such as efor as operational load numbers because load identifiers must contain valid digits and label evidence.',
    'Prevents total weight from being inserted as a dollar amount and removes printed OS&D disclaimer text from damage fields.',
    'Removes duplicated claim and amount controls from the document review form.'
  ],
  label:'v104.1 POD / Signed BOL Structural Reader',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

for (const [relative, marker] of [
  [enginePath,'arbitrateBolPodOsdV1041'],
  [enginePath,'sanitizeBolPodFieldsV1041'],
  [catalogPath,'OS\\s*&\\s*D\\s+(?:REPORT|FORM|CLAIM)'],
  [sheetPath,'SmartDocumentExtraFieldsV1041'],
  [sheetPath,'deliverySignedDate:f.deliverySignedDate'],
  ['source/src/modules/scan/podBolIntelligenceV1041.js','onlyOsdDisclaimer'],
  ['source/src/modules/scan/SmartDocumentExtraFieldsV1041.jsx','Signature area detected'],
]) {
  if (!read(relative).includes(marker)) throw new Error(`v104.1 verification missing ${marker} in ${relative}`);
}
console.log('v104.1 POD / Signed BOL structural reader materialized');
await import('./verify-pod-bol-v1041.mjs');
await import('./materialize-v1042.mjs');
