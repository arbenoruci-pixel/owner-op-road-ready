import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '104.2.0';
const RELEASED_AT = '2026-07-17T16:30:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) { const target=file(relative); fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,content); }
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v104.2 missing ${label}`);
  return content.replace(before, after);
}

const enginePath='source/src/modules/scan/truckDocumentEngineV1040.js';
let engine=read(enginePath);
if(!engine.includes("from './truckDocumentTemplateIntelligenceV1042.js'")){
  engine=replaceOnce(engine,
    "import { arbitrateBolPodOsdV1041, sanitizeBolPodFieldsV1041 } from './podBolIntelligenceV1041.js';",
    "import { arbitrateBolPodOsdV1041, sanitizeBolPodFieldsV1041 } from './podBolIntelligenceV1041.js';\nimport { arbitrateDocumentTemplatesV1042, sanitizeTemplateFieldsV1042 } from './truckDocumentTemplateIntelligenceV1042.js';",
    'template intelligence import');
}
const wrapperBefore=`export function classifyTruckDocumentTextV1040(input = {}) {
  const raw = classifyTruckDocumentTextV1040Base(input);
  return arbitrateBolPodOsdV1041(raw, {
    text:input.text || '',
    baseTypeId:input.baseTypeId || '',
    preferredType:input.preferredType || 'auto',
    context:input.context || {},
  });
}`;
const wrapperAfter=`export function classifyTruckDocumentTextV1040(input = {}) {
  const raw = classifyTruckDocumentTextV1040Base(input);
  const bolPod = arbitrateBolPodOsdV1041(raw, {
    text:input.text || '',
    baseTypeId:input.baseTypeId || '',
    preferredType:input.preferredType || 'auto',
    context:input.context || {},
  });
  return arbitrateDocumentTemplatesV1042(bolPod, {
    text:input.text || '',
    fileName:input.fileName || '',
    preferredType:input.preferredType || 'auto',
    context:input.context || {},
  });
}`;
engine=replaceOnce(engine,wrapperBefore,wrapperAfter,'template arbitration wrapper');
engine=replaceOnce(engine,
  '  return sanitizeBolPodFieldsV1041(typeId, source, mergeMeaningful(fields, common));',
  '  return sanitizeTemplateFieldsV1042(typeId, source, sanitizeBolPodFieldsV1041(typeId, source, mergeMeaningful(fields, common)));',
  'template field sanitizer');
if(!engine.includes('templateProfile:classification.templateProfileV1042')){
  engine=replaceOnce(engine,
    '      lowEvidence:classification.lowEvidence,',
    `      lowEvidence:classification.lowEvidence,
      templateProfile:classification.templateProfileV1042 || null,
      templateArbitration:classification.templateArbitrationV1042 || null,`,
    'template classification metadata');
}
engine=engine.replace("intelligenceVersion:'104.0.0'","intelligenceVersion:'104.2.0'");
engine=engine.replace("method:`truck-document-intelligence-v1040:","method:`truck-document-intelligence-v1042:");
engine=engine.replace("    version:'104.0.0',","    version:'104.2.0',");
write(enginePath,engine);

const sheetPath='source/src/modules/scan/SmartScanSheetV100.jsx';
let sheet=read(sheetPath);
sheet=sheet.replace("import SmartDocumentExtraFieldsV1041 from './SmartDocumentExtraFieldsV1041.jsx';","import SmartDocumentExtraFieldsV1042 from './SmartDocumentExtraFieldsV1042.jsx';");
sheet=sheet.replace(/<SmartDocumentExtraFieldsV1041\b/g,'<SmartDocumentExtraFieldsV1042');
sheet=sheet.replace("if (/truck-document-intelligence-v1040/.test(method)) return 'Truck Document Brain';","if (/truck-document-intelligence-v10(?:40|42)/.test(method)) return 'Truck Document Brain';");
if(!sheet.includes('workDate:f.workDate')){
  sheet=replaceOnce(sheet,
    "    signatureLikely:f.signatureLikely === true,\n    notes:'',",
    `    signatureLikely:f.signatureLikely === true,
    workDate:f.workDate ? dateInputValue(f.workDate) : '',
    billCode:f.billCode || '',
    purchaseOrder:f.purchaseOrder || f.poNumber || '',
    dock:f.dock || '',
    door:f.door || '',
    initialPallets:f.initialPallets || '',
    finishedPallets:f.finishedPallets || '',
    caseCount:f.caseCount || '',
    baseCharge:f.baseCharge || '',
    additionalCharges:f.additionalCharges || '',
    convenienceFee:f.convenienceFee || '',
    purchaserName:f.purchaserName || '',
    iftaEligible:f.iftaEligible !== false,
    iftaMissingFields:f.iftaMissingFields || [],
    notes:'',`,
    'template-specific review fields');
}
write(sheetPath,sheet);

const pkg=JSON.parse(read('package.json')); pkg.version=VERSION; pkg.engines={...(pkg.engines||{}),node:'24.x'}; write('package.json',`${JSON.stringify(pkg,null,2)}\n`);
const lock=JSON.parse(read('package-lock.json')); lock.version=VERSION; if(lock.packages?.['']){lock.packages[''].version=VERSION;lock.packages[''].engines={...(lock.packages[''].engines||{}),node:'24.x'};} write('package-lock.json',`${JSON.stringify(lock,null,2)}\n`);
write('public/app-version.json',`${JSON.stringify({version:VERSION,build:'v104.2-researched-template-intelligence',releasedAt:RELEASED_AT,notes:[
  'Adds a researched template layer above generic OCR so warehouse receipts, rate confirmations, fuel receipts, repair invoices and scale tickets are identified by complete document structure.',
  'Recognizes Capstone Logistics and CapstonePay unloading receipts using receipt number, work date, location, bill code, dock, door, PO, pallets, cases, base charge, add-on charges and total cost.',
  'Recognizes Relay Payments, Comchek, Comdata, EFS and generic lumper/unloading receipts and prevents them from being filed as rate confirmations.',
  'Recognizes carrier rate confirmations by title plus broker, carrier, load number, pickup, delivery, equipment, carrier-pay and payment/invoice terms while applying receipt, BOL, fuel and repair negative evidence.',
  'Recognizes retail and digital fuel receipts from major truck-stop and fuel-card formats and records the IFTA-required date, seller, jurisdiction, gallons, fuel type, price or total, unit and purchaser fields.',
  'Keeps DEF and reefer fuel outside IFTA taxable-gallon readiness while preserving them as expenses.',
  'Adds specialized Capstone/lumper review fields and regression fixtures for Capstone, Relay, rate confirmations, Pilot fuel, Mudflap, repair invoices, BOL and signed POD.'
],label:'v104.2 Researched Truck Document Templates',updatedAt:RELEASED_AT},null,2)}\n`);
write('public/sw.js',read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/,`const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js',read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/,`const FALLBACK_APP_VERSION = '${VERSION}';`));

for(const [relative,marker] of [
  [enginePath,'arbitrateDocumentTemplatesV1042'],[enginePath,'sanitizeTemplateFieldsV1042'],[sheetPath,'SmartDocumentExtraFieldsV1042'],
  ['source/src/modules/scan/truckDocumentTemplateIntelligenceV1042.js','capstone-lumper-receipt'],
  ['source/src/modules/scan/SmartDocumentExtraFieldsV1042.jsx','Initial pallets'],
]) if(!read(relative).includes(marker)) throw new Error(`v104.2 verification missing ${marker} in ${relative}`);

console.log('v104.2 researched document template intelligence materialized');
await import('./verify-document-template-intelligence-v1042.mjs');
await import('./prepare-v1043.mjs');
await import('./materialize-v1043.mjs');
