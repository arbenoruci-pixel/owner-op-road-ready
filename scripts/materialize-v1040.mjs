import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '104.0.0';
const RELEASED_AT = '2026-07-17T02:30:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceRequired(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v1040 missing ${label}`);
  return content.replace(before, after);
}
function appendOnce(content, marker, addition) {
  return content.includes(marker) ? content : `${content.trimEnd()}\n\n${addition.trim()}\n`;
}
function prependOnce(content, marker, addition) {
  return content.includes(marker) ? content : `${addition.trim()}\n${content}`;
}

const smartScanPath = 'source/src/modules/scan/smartScan.js';
let smartScan = read(smartScanPath);
if (!smartScan.includes('/* v1040 extended trucking taxonomy */')) {
  const marker = "  { id:'other', label:'Other Document', short:'Other', target:'documents', documentType:'other' },";
  if (!smartScan.includes(marker)) throw new Error('v1040 missing SMART_DOCUMENT_TYPES other marker');
  const additions = `  /* v1040 extended trucking taxonomy */
  { id:'load_tender', label:'Load Tender', short:'Tender', target:'loads', documentType:'other' },
  { id:'detention_approval', label:'Detention Approval', short:'Detention', target:'expenses', documentType:'other' },
  { id:'layover_approval', label:'Layover Approval', short:'Layover', target:'expenses', documentType:'other' },
  { id:'tonu', label:'Truck Ordered Not Used', short:'TONU', target:'expenses', documentType:'other' },
  { id:'osd_report', label:'OS&D / Damage Report', short:'OS&D', target:'documents', documentType:'other' },
  { id:'reefer_temperature', label:'Reefer Temperature Record', short:'Temp', target:'documents', documentType:'other' },
  { id:'load_invoice', label:'Load Invoice', short:'Invoice', target:'documents', documentType:'other' },
  { id:'fuel_card_statement', label:'Fuel Card Statement', short:'Fuel Card', target:'fuel', documentType:'fuel_receipt' },
  { id:'washout_receipt', label:'Trailer Washout Receipt', short:'Washout', target:'expenses', documentType:'other' },
  { id:'trip_permit', label:'Trip / Fuel Permit', short:'Trip Permit', target:'documents', documentType:'other' },
  { id:'tire_receipt', label:'Tire Receipt', short:'Tires', target:'maintenance', documentType:'other' },
  { id:'preventive_maintenance', label:'Preventive Maintenance Record', short:'PM', target:'maintenance', documentType:'other' },
  { id:'driver_license', label:'Commercial Driver License', short:'CDL', target:'documents', documentType:'driver_license' },
  { id:'medical_card', label:'Medical Examiner Certificate', short:'Medical', target:'documents', documentType:'medical_card' },
  { id:'twic_card', label:'TWIC Card', short:'TWIC', target:'documents', documentType:'other' },
  { id:'mvr', label:'Motor Vehicle Record', short:'MVR', target:'documents', documentType:'other' },
  { id:'drug_alcohol', label:'Drug & Alcohol Compliance', short:'D&A', target:'documents', documentType:'other' },
  { id:'training_certificate', label:'Training Certificate', short:'Training', target:'documents', documentType:'other' },
  { id:'irp_cab_card', label:'IRP Cab Card', short:'IRP', target:'documents', documentType:'registration' },
  { id:'ifta_license', label:'IFTA License', short:'IFTA', target:'documents', documentType:'other' },
  { id:'title', label:'Vehicle Title', short:'Title', target:'documents', documentType:'other' },
  { id:'lease_agreement', label:'Truck / Trailer Lease Agreement', short:'Lease', target:'documents', documentType:'other' },
  { id:'broker_packet', label:'Broker Setup Packet', short:'Broker', target:'documents', documentType:'other' },
  { id:'carrier_agreement', label:'Broker-Carrier Agreement', short:'Agreement', target:'documents', documentType:'other' },
  { id:'w9', label:'W-9', short:'W-9', target:'documents', documentType:'other' },
  { id:'notice_of_assignment', label:'Notice of Assignment', short:'NOA', target:'documents', documentType:'other' },
  { id:'factoring_agreement', label:'Factoring Agreement', short:'Factoring', target:'documents', documentType:'other' },
  { id:'ach_form', label:'ACH / Direct Deposit Form', short:'ACH', target:'documents', documentType:'other' },
  { id:'claim_notice', label:'Freight Claim Notice', short:'Claim', target:'documents', documentType:'other' },
  { id:'accident_report', label:'Accident / Incident Report', short:'Incident', target:'documents', documentType:'other' },
  { id:'logbook_supporting', label:'Logbook Supporting Document', short:'Log Doc', target:'documents', documentType:'other' },`;
  smartScan = smartScan.replace(marker, `${additions}\n${marker}`);
}
write(smartScanPath, smartScan);

const sheetPath = 'source/src/modules/scan/SmartScanSheetV100.jsx';
let sheet = read(sheetPath);
sheet = prependOnce(
  sheet,
  "from './smartDocumentEngineV1040.js'",
  "import SmartDocumentPlanCardV1040 from './SmartDocumentPlanCardV1040.jsx';\nimport { buildSmartDocumentPlanV1040, smartDocumentCloudNoteV1040 } from './smartDocumentEngineV1040.js';"
);

if (!sheet.includes('const smartPlan = buildSmartDocumentPlanV1040(result')) {
  const analyzerPattern = /(const result = await analyzeSmartDocumentV1030\(analysisFile, \{[\s\S]*?\n      \}\);)(\n      const nextType = result\.type\?\.id \|\| 'other';)/;
  if (!analyzerPattern.test(sheet)) throw new Error('v1040 missing V1030 analyzer integration point');
  sheet = sheet.replace(analyzerPattern, `$1
      const smartPlan = buildSmartDocumentPlanV1040(result, { state, profile, fileName:nextFile?.name || '', scanMeta });
      result.smartPlan = smartPlan;
      if (smartPlan?.exactType?.autoCorrected && SMART_DOCUMENT_TYPES.some(type => type.id === smartPlan.exactType.id)) {
        result.type = documentTypeMeta(smartPlan.exactType.id);
        result.detectedType = result.type;
        result.typeDecision = {
          ...(result.typeDecision || {}),
          id:smartPlan.exactType.id,
          type:result.type,
          reason:'Truck Document Intelligence found stronger document-specific evidence.',
          autoCorrected:true,
          engineVersion:smartPlan.version,
        };
      }$2`);
}

if (!sheet.includes("smart-document-engine-v1040/.test(method)")) {
  sheet = sheet.replace(
    "function methodLabel(method = '') {",
    "function methodLabel(method = '') {\n  if (/smart-document-engine-v1040/.test(method)) return 'Truck Document Intelligence';"
  );
}

sheet = sheet.replace(
  "return ['bol','pod','rate_confirmation','fuel_receipt'].includes(id);",
  "return ['bol','pod','rate_confirmation','fuel_receipt','scale_ticket','lumper_receipt','toll_parking_receipt','repair_invoice','washout_receipt','reefer_temperature','detention_approval','layover_approval','osd_report','logbook_supporting'].includes(id);"
);

if (!sheet.includes('manualSmartPlan = buildSmartDocumentPlanV1040')) {
  sheet = sheet.replace(
    "    const parsedResult = { ...(analysis || {}), type:meta, detectedType:meta, fields:parsed };",
    "    const parsedResult = { ...(analysis || {}), type:meta, detectedType:meta, fields:parsed };\n    const manualSmartPlan = buildSmartDocumentPlanV1040(parsedResult, { state, profile, fileName:file?.name || '', scanMeta:analysis?.scanMeta || {} });\n    parsedResult.smartPlan = manualSmartPlan;"
  );
  sheet = sheet.replace(
    "       fields:parsed,\n       confidence:nextConfidence,",
    "       fields:parsed,\n       smartPlan:manualSmartPlan,\n       confidence:nextConfidence,"
  );
}

if (!sheet.includes('const smartPlan = buildSmartDocumentPlanV1040({ ...analysis')) {
  sheet = replaceRequired(
    sheet,
    "      const title = String(fields.title || meta.label).trim();\n      const stored = await saveScannedDocument({",
    "      const title = String(fields.title || meta.label).trim();\n      const smartPlan = buildSmartDocumentPlanV1040({ ...analysis, type:meta, fields:{ ...(analysis?.fields || {}), ...fields, loadNo } }, { state, profile, fileName:file?.name || '', scanMeta:analysis?.scanMeta || {} });\n      const stored = await saveScannedDocument({",
    'save-time smart plan'
  );
}

sheet = sheet.replace(
  "notes:String(fields.notes || '').trim()",
  "notes:smartDocumentCloudNoteV1040(fields.notes, smartPlan)"
);
sheet = sheet.replace(
  "extracted:{ ...fields, type:meta.id },",
  "extracted:{ ...fields, type:meta.id, smartPlan },"
);
sheet = sheet.replace(
  "classification:{ selectedType:meta.id, detectedType:analysis?.detectedType?.id || analysis?.type?.id || 'other', confidence:analysis?.confidence || 0, method:analysis?.method || 'manual-review-v100' },",
  "classification:{ selectedType:meta.id, detectedType:analysis?.detectedType?.id || analysis?.type?.id || 'other', exactType:smartPlan?.exactType?.id || meta.id, confidence:analysis?.confidence || 0, method:`smart-document-engine-v1040:${analysis?.method || 'manual-review'}`, engineVersion:smartPlan?.version || '104.0.0' },"
);

if (!sheet.includes('smartStacks:smartPlan?.routing?.stacks')) {
  const documentsPattern = /(nextStore = addBusinessRecord\(nextStore, 'documents', \{[\s\S]*?)source:'smart_scan_v100'([\s\S]*?\}\);)/;
  if (!documentsPattern.test(sheet)) throw new Error('v1040 missing documents business record');
  sheet = sheet.replace(documentsPattern, `$1source:'smart_scan_v1040', exactType:smartPlan?.exactType?.id || meta.id, exactTypeLabel:smartPlan?.exactType?.label || meta.label, smartStacks:smartPlan?.routing?.stacks || [], smartActions:smartPlan?.routing?.actions || [], smartFingerprint:smartPlan?.fingerprint || '', smartSearchKeys:smartPlan?.searchKeys || [], packet:smartPlan?.packet || null$2`);
}

sheet = sheet.replace(
  "const result = { type:meta, fields:{ ...fields, loadNo }, localDocument:stored.localDocument, cloud:stored.cloud, store:nextStore, analysis, linkSuggestion };",
  "const result = { type:meta, fields:{ ...fields, loadNo }, localDocument:stored.localDocument, cloud:stored.cloud, store:nextStore, analysis:{ ...analysis, smartPlan }, smartPlan, linkSuggestion };"
);

if (!sheet.includes('<SmartDocumentPlanCardV1040 plan={analysis.smartPlan} />')) {
  sheet = replaceRequired(
    sheet,
    "        </section>\n\n        <section className=\"smart-scan-type-card\">",
    "        </section>\n\n        <SmartDocumentPlanCardV1040 plan={analysis.smartPlan} />\n\n        <section className=\"smart-scan-type-card\">",
    'Smart File Plan card'
  );
}
write(sheetPath, sheet);

const stylePath = 'source/src/turbo-scan-flow.css';
write(stylePath, appendOnce(read(stylePath), '/* v104.0 Smart Truck Document Intelligence */', read('source/src/smart-document-engine-v1040.css')));

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
pkg.scripts = { ...(pkg.scripts || {}), 'verify-smart-document-engine-v1040':'node scripts/verify-smart-document-engine-v1040.mjs' };
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
  build:'v104-smart-truck-document-intelligence',
  releasedAt:RELEASED_AT,
  notes:[
    'Adds Scan Anything routing for load paperwork, billing, factoring, fuel/IFTA, maintenance, driver, truck, broker, tax, compliance and claim stacks.',
    'Recognizes more than forty trucking document variants including POD, BOL, Rate Con, accessorial approvals, repair paperwork, permits, driver credentials and broker/factoring forms.',
    'Splits mixed multi-page packets into logical documents and keeps page ranges, exact type confidence and evidence-aware review requirements.',
    'Matches documents to the active load using load/BOL/PO, broker, pickup and delivery evidence before allowing automatic filing.',
    'Stores one original document with multiple smart stack links, search keys, routing actions, fingerprint and packet metadata.',
    'Keeps uncertain fields in review, validates POD signatures and fuel math, and never edits Logbook duty status automatically.'
  ],
  label:'v104.0 Smart Truck Document Intelligence',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

for (const [relative, marker] of [
  ['source/src/modules/scan/smartDocumentEngineV1040.js','buildSmartDocumentPlanV1040'],
  ['source/src/modules/scan/SmartDocumentPlanCardV1040.jsx','SMART FILE PLAN'],
  [smartScanPath,'v1040 extended trucking taxonomy'],
  [sheetPath,'SmartDocumentPlanCardV1040'],
  [sheetPath,'smartDocumentCloudNoteV1040'],
  [stylePath,'smart-plan-v1040'],
]) {
  if (!read(relative).includes(marker)) throw new Error(`v1040 missing ${marker} in ${relative}`);
}

console.log('v104.0 Smart Truck Document Intelligence materialized');
await import('./verify-smart-document-engine-v1040.mjs');
