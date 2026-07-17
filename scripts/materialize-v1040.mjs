import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '104.0.0';
const RELEASED_AT = '2026-07-17T00:40:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v104.0 missing ${label}`);
  return content.replace(before, after);
}
function replaceRegex(content, pattern, replacement, marker, label) {
  if (marker && content.includes(marker)) return content;
  if (!pattern.test(content)) throw new Error(`v104.0 missing ${label}`);
  return content.replace(pattern, replacement);
}
function appendOnce(content, marker, addition) {
  return content.includes(marker) ? content : `${content.trimEnd()}\n\n${addition.trim()}\n`;
}

const sheetPath = 'source/src/modules/scan/SmartScanSheetV100.jsx';
let sheet = read(sheetPath);
sheet = replaceOnce(
  sheet,
  "import { documentTypeMeta, SMART_DOCUMENT_TYPES } from './smartScan.js';",
  "import { TRUCK_DOCUMENT_TYPES_V1040 as SMART_DOCUMENT_TYPES, backendDocumentTypeV1040, documentLinkableV1040, truckDocumentTypeMetaV1040 as documentTypeMeta } from './truckDocumentCatalogV1040.js';",
  'catalog import'
);
sheet = replaceRegex(
  sheet,
  /import \{ analyzeSmartDocumentV1030 \} from '\.\/smartDocumentReaderV1030\.js';\nimport \{ parseSmartDocumentTextByTypeV104 \} from '\.\/smartDocumentReaderV104\.js';/,
  "import { analyzeTruckDocumentV1040, documentIntelligencePayloadV1040, reanalyzeTruckDocumentTypeV1040 } from './truckDocumentEngineV1040.js';\nimport SmartDocumentRoutingCardV1040 from './SmartDocumentRoutingCardV1040.jsx';\nimport SmartDocumentExtraFieldsV1040 from './SmartDocumentExtraFieldsV1040.jsx';",
  'SmartDocumentRoutingCardV1040',
  'document brain imports'
);
sheet = replaceRegex(
  sheet,
  /function linkableType\(id = ''\) \{\n\s*return \[[^\]]+\]\.includes\(id\);\n\}/,
  "function linkableType(id = '') {\n  return documentLinkableV1040(id);\n}",
  'return documentLinkableV1040(id);',
  'linkable document policy'
);
if (!sheet.includes("if (/truck-document-intelligence-v1040/.test(method))")) {
  sheet = replaceOnce(
    sheet,
    "function methodLabel(method = '') {",
    "function methodLabel(method = '') {\n  if (/truck-document-intelligence-v1040/.test(method)) return 'Truck Document Brain';",
    'document brain method label'
  );
}

sheet = replaceOnce(
  sheet,
  "    notes:'',\n  };",
  `    driverName:f.driverName || '',
    licenseNumber:f.licenseNumber || '',
    unitNumber:f.unitNumber || f.truckNumber || '',
    truckNumber:f.truckNumber || '',
    vin:f.vin || '',
    plate:f.plate || '',
    policyNumber:f.policyNumber || '',
    permitNumber:f.permitNumber || '',
    accountNumber:f.accountNumber || '',
    issuedDate:f.issuedDate ? dateInputValue(f.issuedDate) : '',
    expirationDate:f.expirationDate ? dateInputValue(f.expirationDate) : '',
    effectiveDate:f.effectiveDate ? dateInputValue(f.effectiveDate) : '',
    factorName:f.factorName || '',
    businessName:f.businessName || '',
    mcNumber:f.mcNumber || '',
    dotNumber:f.dotNumber || '',
    email:f.email || '',
    phone:f.phone || '',
    state:f.state || '',
    fuelType:f.fuelType || '',
    quarter:f.quarter || '',
    approvalNo:f.approvalNo || f.receiptNo || '',
    receiptNo:f.receiptNo || '',
    claimNo:f.claimNo || f.caseNumber || '',
    location:f.location || '',
    exceptionText:f.exceptionText || '',
    signaturePresent:f.signaturePresent === true,
    temperature:f.temperature || '',
    hours:f.hours || '',
    labor:f.labor || '',
    parts:f.parts || '',
    serviceDescription:f.serviceDescription || '',
    notes:'',
  };`,
  'extended intelligent fields'
);

sheet = replaceOnce(
  sheet,
  '      const result = await analyzeSmartDocumentV1030(analysisFile, {',
  '      const result = await analyzeTruckDocumentV1040(analysisFile, {',
  'truck document analyzer'
);
sheet = replaceOnce(
  sheet,
  `        preferredType,
        scanMeta,
        onProgress:`,
  `        preferredType,
        scanMeta,
        state,
        profile,
        businessStore:readBusinessStore(),
        onProgress:`,
  'scanner context'
);

const changeTypeReplacement = `  function changeType(id) {
    const parsedResult = reanalyzeTruckDocumentTypeV1040(analysis || {}, id, {
      state,
      profile,
      businessStore:readBusinessStore(),
    });
    const meta = documentTypeMeta(id);
    const parsedFields = initialFields(parsedResult, analysis?.scanMeta || {}, state);
    setAnalysis(parsedResult);
    setSelectedType(id);
    setFields(current => {
      const next = {
        ...parsedFields,
        title:meta.label,
        notes:current.notes || '',
        linkToLogbook:linkableType(id),
        linkDay:current.linkDay || parsedFields.linkDay,
        linkEventId:current.linkEventId || '',
      };
      const suggestion = suggestSmartDocumentLinkV100(state, id, next);
      setLinkSuggestion(suggestion);
      if (!current.linkDay || current.linkDay === linkSuggestion?.day) next.linkDay = suggestion.day || next.linkDay;
      if (!current.linkEventId) next.linkEventId = suggestion.eventId || '';
      return next;
    });
  }

  function scanAgain`;
sheet = replaceRegex(
  sheet,
  /  function changeType\(id\) \{[\s\S]*?\n  \}\n\n  function scanAgain/,
  changeTypeReplacement,
  'reanalyzeTruckDocumentTypeV1040(analysis',
  'manual type re-analysis'
);

sheet = replaceOnce(sheet, '<b>Pro Document Inbox</b><em>Read · verify · link · organize</em>', '<b>Scan Anything</b><em>We know what it is and where it belongs</em>', 'scan header');
sheet = replaceOnce(sheet, '<h1>Reading document</h1>', '<h1>Understanding trucking document</h1>', 'analysis title');

sheet = replaceOnce(
  sheet,
  `</section>

        {linkableType(selectedType) && <section className="smart-link-card-v100">`,
  `</section>

        <SmartDocumentRoutingCardV1040 analysis={{ ...analysis, type:selectedMeta, fields:{ ...(analysis?.fields || {}), ...fields } }}/>

        {linkableType(selectedType) && <section className="smart-link-card-v100">`,
  'routing card placement'
);

sheet = replaceOnce(
  sheet,
  `          <Field label="Notes" wide><textarea value={fields.notes || ''} onChange={event => updateField('notes', event.target.value)} placeholder="Anything important about this document"/></Field>`,
  `          <SmartDocumentExtraFieldsV1040 typeId={selectedType} fields={fields} onChange={updateField}/>
          <Field label="Notes" wide><textarea value={fields.notes || ''} onChange={event => updateField('notes', event.target.value)} placeholder="Anything important about this document"/></Field>`,
  'dynamic document fields'
);

sheet = replaceRegex(
  sheet,
  /(      const title = String\(fields\.title \|\| meta\.label\)\.trim\(\);)/,
  `$1
      const intelligence = documentIntelligencePayloadV1040({
        ...(analysis || {}),
        type:meta,
        fields:{ ...(analysis?.fields || {}), ...fields },
      });
      const cloudIntelligence = {
        version:intelligence.version,
        family:intelligence.family,
        type:intelligence.type,
        fingerprint:intelligence.fingerprint,
        stacks:(intelligence.routing?.stacks || []).map(stack => stack.id),
        primaryStack:intelligence.routing?.primary?.id || 'smart_inbox',
        matchedEntities:intelligence.matchedEntities,
        validation:{
          valid:intelligence.validation?.valid === true,
          criticalFailures:Number(intelligence.validation?.criticalFailures || 0),
          warningFailures:Number(intelligence.validation?.warningFailures || 0),
          missingFields:intelligence.validation?.missingFields || [],
        },
        packet:intelligence.packet?.isMixed ? {
          isMixed:true,
          pageCount:intelligence.packet.pageCount,
          segments:(intelligence.packet.segments || []).map(segment => ({
            pages:segment.pages,
            type:segment.type?.id || 'other',
            stacks:(segment.stacks || []).map(stack => stack.id),
          })),
        } : null,
      };`,
  'const intelligence = documentIntelligencePayloadV1040',
  'intelligence save payload'
);
sheet = replaceOnce(sheet, '        type:meta.documentType,', '        type:backendDocumentTypeV1040(meta.id),', 'backend type compatibility');
sheet = replaceOnce(
  sheet,
  `        metadata:{ loadNo, relationType:meta.id === 'bol' ? 'bol' : meta.id === 'pod' ? 'pod' : 'supporting_document', notes:String(fields.notes || '').trim(), linkDay:fields.linkDay || '', linkEventId:fields.linkEventId || '' },
        extracted:{ ...fields, type:meta.id },
        classification:{ selectedType:meta.id, detectedType:analysis?.detectedType?.id || analysis?.type?.id || 'other', confidence:analysis?.confidence || 0, method:analysis?.method || 'manual-review-v100' },`,
  `        metadata:{
          loadNo,
          relationType:meta.id === 'bol' ? 'bol' : meta.id === 'pod' ? 'pod' : 'supporting_document',
          notes:String(fields.notes || '').trim(),
          linkDay:fields.linkDay || '',
          linkEventId:fields.linkEventId || '',
          family:meta.family,
          stacks:cloudIntelligence.stacks,
          fingerprint:intelligence.fingerprint,
          intelligence:cloudIntelligence,
        },
        extracted:{ ...fields, type:meta.id, intelligence },
        classification:{
          selectedType:meta.id,
          detectedType:analysis?.detectedType?.id || analysis?.type?.id || 'other',
          confidence:analysis?.confidence || 0,
          method:analysis?.method || 'truck-document-intelligence-v1040',
          family:meta.family,
          routing:intelligence.routing,
          validation:intelligence.validation,
          fingerprint:intelligence.fingerprint,
          packet:intelligence.packet,
        },`,
  'rich local and cloud metadata'
);

sheet = replaceRegex(
  sheet,
  /      nextStore = addBusinessRecord\(nextStore, 'documents', \{[\s\S]*?\}\);/,
  `      nextStore = addBusinessRecord(nextStore, 'documents', {
        date:fields.date || localDateKey(),
        type:meta.id,
        family:meta.family,
        label:meta.label,
        title,
        loadNo,
        amount:total,
        localDocumentId:stored.localDocument.local_id,
        clientDocumentId:stored.localDocument.client_document_id,
        fileName:stored.localDocument.original_file_name,
        syncState:stored.cloud.status,
        confidence:analysis?.confidence || 0,
        linkDay:fields.linkDay || '',
        stacks:cloudIntelligence.stacks,
        primaryStack:cloudIntelligence.primaryStack,
        routing:intelligence.routing,
        matchedEntities:intelligence.matchedEntities,
        validation:intelligence.validation,
        actions:intelligence.actions,
        packet:intelligence.packet,
        fingerprint:intelligence.fingerprint,
        fieldConfidence:intelligence.fieldConfidence,
        source:'truck_document_intelligence_v1040',
      });`,
  "source:'truck_document_intelligence_v1040'",
  'document vault index'
);
sheet = replaceRegex(
  sheet,
  /      const result = \{ type:meta,[^\n]+\};/,
  `      const result = { type:meta, fields:{ ...fields, loadNo }, localDocument:stored.localDocument, cloud:stored.cloud, store:nextStore, analysis:{ ...analysis, type:meta, fields:{ ...(analysis?.fields || {}), ...fields }, routing:intelligence.routing }, intelligence, linkSuggestion };`,
  'routing:intelligence.routing }, intelligence',
  'saved intelligence result'
);

sheet = replaceOnce(
  sheet,
  `<div className="smart-scan-saved-card"><span>Reader</span><b>{methodLabel(savedResult.analysis?.method)}</b><em>{Math.round(Number(savedResult.analysis?.confidence || 0) * 100)}% · driver reviewed</em></div><div className="smart-scan-saved-actions">`,
  `<div className="smart-scan-saved-card"><span>Reader</span><b>{methodLabel(savedResult.analysis?.method)}</b><em>{Math.round(Number(savedResult.analysis?.confidence || 0) * 100)}% · driver reviewed</em></div>{savedResult.intelligence?.routing ? <div className="smart-scan-saved-route-v1040"><span>Filed to</span><b>{savedResult.intelligence.routing.primary?.label || 'Smart Inbox'}</b><em>{(savedResult.intelligence.routing.stacks || []).map(stack => stack.short || stack.label).join(' · ')}</em></div> : null}<div className="smart-scan-saved-actions">`,
  'saved route summary'
);
sheet = replaceRegex(
  sheet,
  /<div className="smart-scan-saved-actions">[\s\S]*?<\/div><\/main>/,
  `<div className="smart-scan-saved-actions"><button type="button" onClick={scanAgain}>Import another</button><button type="button" className="primary" onClick={() => onOpenBusiness?.('documents')}>Open Document Vault</button></div></main>`,
  'Open Document Vault',
  'saved document vault action'
);
write(sheetPath, sheet);

const storagePath = 'source/src/modules/scan/scanStorage.js';
let storage = read(storagePath);
storage = replaceOnce(
  storage,
  `      relation_type:metadata.relationType || null,
      client_created_at:localDocument.created_at,`,
  `      relation_type:metadata.relationType || null,
      intelligence:metadata.intelligence || null,
      client_created_at:localDocument.created_at,`,
  'cloud intelligence request'
);
storage = replaceOnce(
  storage,
  `    extracted,
    classification,
    created_at:createdAt,`,
  `    extracted,
    classification,
    family:metadata.family || classification.family || null,
    stacks:Array.isArray(metadata.stacks) ? metadata.stacks : [],
    fingerprint:metadata.fingerprint || classification.fingerprint || null,
    intelligence:metadata.intelligence || extracted.intelligence || null,
    created_at:createdAt,`,
  'local intelligence index'
);
write(storagePath, storage);

const apiPath = 'app/api/documents/commit-upload/route.js';
let api = read(apiPath);
if (!api.includes('ROAD_READY_INTELLIGENCE_V1040')) {
  api = replaceOnce(
    api,
    `function cleanType(type) {
  return DOCUMENT_TYPES.has(type) ? type : 'other';
}`,
    `function cleanType(type) {
  return DOCUMENT_TYPES.has(type) ? type : 'other';
}

function compactIntelligence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const stacks = Array.isArray(value.stacks) ? value.stacks.map(item => String(item || '').slice(0, 48)).slice(0, 16) : [];
  return {
    version:String(value.version || '104.0.0').slice(0, 24),
    family:String(value.family || 'other').slice(0, 48),
    type:String(value.type || 'other').slice(0, 64),
    fingerprint:String(value.fingerprint || '').slice(0, 96),
    stacks,
    primaryStack:String(value.primaryStack || 'smart_inbox').slice(0, 48),
    matchedEntities:value.matchedEntities && typeof value.matchedEntities === 'object' ? value.matchedEntities : null,
    validation:value.validation && typeof value.validation === 'object' ? value.validation : null,
    packet:value.packet && typeof value.packet === 'object' ? value.packet : null,
  };
}

function storedDocumentNotes(note, intelligence) {
  const userNote = String(note || '').trim();
  const compact = compactIntelligence(intelligence);
  if (!compact) return userNote || null;
  const payload = JSON.stringify(compact).slice(0, 24000);
  return [userNote, '[[ROAD_READY_INTELLIGENCE_V1040]]' + payload].filter(Boolean).join('\n\n');
}`,
    'server intelligence envelope'
  );
}
api = replaceOnce(api, '      notes: body.notes || null,', '      notes: storedDocumentNotes(body.notes, body.intelligence),', 'cloud intelligence notes');
write(apiPath, api);

const cssPath = 'source/src/turbo-scan-flow.css';
write(cssPath, appendOnce(read(cssPath), '/* v104.0 Truck Document Intelligence */', read('source/src/truck-document-intelligence-v1040.css')));

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
  build:'v104-truck-document-intelligence',
  releasedAt:RELEASED_AT,
  notes:[
    'Turns Smart Scan into Scan Anything with a trucking-specific document brain covering load paperwork, POD/BOL variants, fuel and IFTA, maintenance, driver compliance, truck and trailer compliance, broker setup, factoring, tax and claims.',
    'Classifies more than 50 trucking document types using OCR evidence, filename evidence, active-load context, driver identity, truck identity and deterministic validation.',
    'Builds a filing graph for Load Folder, Billing Ready, Factoring Packet, Logbook Supporting Docs, IFTA, Expenses, Maintenance, Driver Wallet, Truck Wallet, Broker Profile, Tax, Claims and Smart Inbox.',
    'Detects mixed multi-page packets and assigns page groups to separate document types and filing stacks while preserving the original packet.',
    'Keeps field-level confidence, OCR evidence, validation results, matched entities, duplicate fingerprints and recommended actions with every locally stored document.',
    'Syncs a compact intelligence envelope with the cloud document without requiring a database schema migration.',
    'Never changes duty status, certified logs, signatures, invoices or payments automatically; Logbook and business actions stay reviewable suggestions.'
  ],
  label:'v104.0 Truck Document Intelligence',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

for (const [relative, marker] of [
  [sheetPath,'SmartDocumentRoutingCardV1040'],
  [sheetPath,'analyzeTruckDocumentV1040'],
  [sheetPath,'Open Document Vault'],
  [storagePath,'intelligence:metadata.intelligence'],
  [apiPath,'ROAD_READY_INTELLIGENCE_V1040'],
  [cssPath,'document-brain-v1040'],
  ['source/src/modules/scan/truckDocumentCatalogV1040.js','notice_of_assignment'],
  ['source/src/modules/scan/truckDocumentEngineV1040.js','classifyPacketPagesV1040'],
]) {
  if (!read(relative).includes(marker)) throw new Error(`v104.0 verification missing ${marker} in ${relative}`);
}
console.log('v104.0 Truck Document Intelligence materialized');
await import('./verify-truck-document-intelligence-v1040.mjs');
