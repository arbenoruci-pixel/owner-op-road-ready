import fs from 'node:fs';

const VERSION = '109.6.4';
const BUILD = 'v10964-save-completion-stability';
const SHEET_PATH = 'source/src/modules/scan/SmartScanSheetV105.jsx';
const BUSINESS_PATH = 'source/src/modules/business/businessStore.js';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, value) {
  fs.writeFileSync(path, value);
}

function writeJson(path, transform) {
  const value = JSON.parse(read(path));
  transform(value);
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`v109.6.4 missing ${label}`);
  return source.replace(before, after);
}

write('source/src/modules/scan/rateConSaveStabilityV10964.js', String.raw`export const RATE_CON_SAVE_STABILITY_VERSION_V10964 = '109.6.4';

function textV10964(value = '') {
  return String(value || '').trim();
}

function compactScalarV10964(value, max = 1200) {
  if (typeof value === 'string') return value.slice(0, max);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return undefined;
}

function compactStopV10964(stop = {}, index = 0) {
  return {
    id:textV10964(stop.id || `stop_${index + 1}`).slice(0, 120),
    type:textV10964(stop.type).slice(0, 24),
    sequence:Number(stop.sequence ?? index),
    deliverySequence:Number(stop.deliverySequence || stop.stopSequence || 0),
    company:textV10964(stop.company || stop.facility || stop.name).slice(0, 180),
    street:textV10964(stop.street).slice(0, 180),
    city:textV10964(stop.city).slice(0, 100),
    state:textV10964(stop.state).toUpperCase().slice(0, 2),
    zip:textV10964(stop.zip).slice(0, 12),
    cityState:textV10964(stop.cityState).slice(0, 160),
    address:textV10964(stop.address).slice(0, 280),
    date:textV10964(stop.date || stop.pickupDate || stop.deliveryDate).slice(0, 20),
    time:textV10964(stop.time).slice(0, 20),
    appointment:textV10964(stop.appointment).slice(0, 180),
    pickupNumber:textV10964(stop.pickupNumber).slice(0, 100),
    poNumber:textV10964(stop.poNumber || stop.po).slice(0, 100),
    pieces:Number(stop.pieces || 0),
    weight:Number(stop.weight || 0),
    commodity:textV10964(stop.commodity).slice(0, 180),
    phone:textV10964(stop.phone).slice(0, 40),
  };
}

export function extractRateConLoadNoFromFileV10964(fileName = '') {
  const name = textV10964(fileName);
  const patterns = [
    /carrier\s*confirmation\s*[-_ ]*#?\s*(\d{4,12}(?:-\d{1,4})?)/i,
    /carrierconfirmation\s*[-_ ]*#?\s*(\d{4,12}(?:-\d{1,4})?)/i,
    /(?:rate|load)\s*[-_ ]*con(?:firmation)?\s*[-_ ]*#?\s*(\d{4,12}(?:-\d{1,4})?)/i,
    /(?:load|confirmation)\s*[-_ ]*(?:no|number|#)?\s*[-_ ]*#?\s*(\d{4,12}(?:-\d{1,4})?)/i,
  ];
  for (const pattern of patterns) {
    const value = name.match(pattern)?.[1] || '';
    if (value) return value.toUpperCase();
  }
  return '';
}

export function chooseRateConLoadNoV10964({ typeId = '', preferredLoadNo = '', extractedLoadNo = '', match = {} } = {}) {
  const preferred = textV10964(preferredLoadNo).toUpperCase();
  const extracted = textV10964(extractedLoadNo).toUpperCase();
  const matched = textV10964(match.loadNo).toUpperCase();
  if (preferred) return preferred;
  if (typeId !== 'rate_confirmation') return matched || extracted;
  if (extracted) return extracted;
  const completedWeakMatch = String(match.status || '').toLowerCase() === 'completed' && match.strongReference !== true;
  return completedWeakMatch ? '' : matched;
}

export function compactRateConSaveFieldsV10964(fields = {}) {
  const allowed = new Set([
    'type','title','loadNo','canonicalLoadNo','orderNo','legNo','bolNo','poNumber','pickupNumber',
    'broker','brokerContactName','dispatcherName','brokerPhone','dispatchPhone','brokerEmail','dispatchEmail','billingEmail',
    'carrierName','mcNumber','dotNumber','equipment','trackingProvider','origin','destination','pickupDate','deliveryDate',
    'date','documentDate','total','gross','grossPay','linehaul','fuelSurcharge','routeSummary','stopCount','deliveryCount',
    'commodity','weight','totalPieces','pieces','unitNumber','truckNumber','linkDay','linkToLogbook','stopSequence',
  ]);
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (!allowed.has(key)) continue;
    const scalar = compactScalarV10964(value, key === 'routeSummary' ? 2400 : 1200);
    if (scalar !== undefined) out[key] = scalar;
  }
  if (Array.isArray(fields.stops)) out.stops = fields.stops.slice(0, 40).map(compactStopV10964);
  if (Array.isArray(fields.poNumbers)) out.poNumbers = fields.poNumbers.slice(0, 40).map(value => textV10964(value).slice(0, 100)).filter(Boolean);
  if (fields.driverRequirements && typeof fields.driverRequirements === 'object') {
    out.driverRequirements = Object.fromEntries(Object.entries(fields.driverRequirements).slice(0, 40).map(([key, value]) => [key, compactScalarV10964(value, 240)]).filter(([, value]) => value !== undefined));
  }
  return out;
}

export function compactRateConAnalysisV10964(analysis = {}, fields = {}) {
  return {
    type:analysis?.type || null,
    detectedType:analysis?.detectedType || analysis?.type || null,
    confidence:Number(analysis?.confidence || 0),
    method:textV10964(analysis?.method).slice(0, 180),
    fields:compactRateConSaveFieldsV10964(fields),
    text:textV10964(analysis?.text || analysis?.rawText || '').slice(0, 12000),
    needsReview:Boolean(analysis?.needsReview),
  };
}

export function compactIntelligenceV10964(intelligence = {}) {
  return {
    version:textV10964(intelligence?.version).slice(0, 40),
    family:intelligence?.family || null,
    type:intelligence?.type || null,
    fingerprint:textV10964(intelligence?.fingerprint).slice(0, 180),
    validation:intelligence?.validation && typeof intelligence.validation === 'object' ? {
      needsReview:Boolean(intelligence.validation.needsReview),
      status:textV10964(intelligence.validation.status).slice(0, 80),
    } : null,
  };
}

export function savedViewModelV10964({ record = {}, meta = {}, stored = {} } = {}) {
  return {
    record:{
      id:record.id || '',
      canonicalLoadNo:record.canonicalLoadNo || '',
      stopSequence:Number(record.stopSequence || 0),
      stopCompany:record.stopCompany || '',
      stopLocation:record.stopLocation || '',
      broker:record.broker || '',
      documentDate:record.documentDate || '',
      linkToLogbook:Boolean(record.linkToLogbook),
      linkDay:record.linkDay || '',
      fileName:record.fileName || '',
    },
    meta:{ id:meta.id || '', label:meta.label || 'Document' },
    stored:{
      cloud:{ status:stored?.cloud?.status || 'local_only' },
      storage:stored?.storage ? {
        reused:Boolean(stored.storage.reused),
        localBlob:Boolean(stored.storage.localBlob),
        cloudOnly:Boolean(stored.storage.cloudOnly),
      } : null,
    },
  };
}
`);

let sheet = read(SHEET_PATH);
const helperImport = "import { chooseRateConLoadNoV10964, compactIntelligenceV10964, compactRateConAnalysisV10964, compactRateConSaveFieldsV10964, extractRateConLoadNoFromFileV10964, savedViewModelV10964 } from './rateConSaveStabilityV10964.js';";
if (!sheet.includes(helperImport)) {
  const anchor = "import { saveScannedDocumentQuotaSafeV10963 as saveScannedDocument } from './quotaSafeScanStorageV10963.js';";
  if (!sheet.includes(anchor)) throw new Error('v109.6.4 quota-safe storage import anchor missing');
  sheet = sheet.replace(anchor, `${anchor}\n${helperImport}`);
}

sheet = replaceRequired(
  sheet,
  `        preferredType,
        scanMeta,`,
  `        preferredType,
        fileName:nextFile.name || scanMeta?.originalFileName || scanMeta?.fileName || '',
        scanMeta,`,
  'reader original filename propagation',
);

sheet = replaceRequired(
  sheet,
  `      applyResult({ ...result, scanMeta });`,
  `      const rateConFileNameV10964 = nextFile.name || scanMeta?.originalFileName || scanMeta?.fileName || '';
      const inferredLoadNoV10964 = result?.type?.id === 'rate_confirmation' && !primaryLoadReference(result)
        ? extractRateConLoadNoFromFileV10964(rateConFileNameV10964)
        : '';
      const resultWithIdentityV10964 = inferredLoadNoV10964
        ? { ...result, fields:{ ...(result.fields || {}), loadNo:inferredLoadNoV10964, orderNo:result.fields?.orderNo || inferredLoadNoV10964 } }
        : result;
      applyResult({ ...resultWithIdentityV10964, scanMeta:{ ...(scanMeta || {}), originalFileName:rateConFileNameV10964 } });`,
  'Rate Con filename load identity',
);

sheet = replaceRequired(
  sheet,
  `    const loadNo = preferredLoadNo
      || nextMatch.loadNo
      || rateConNewLoad
      || '';`,
  `    const loadNo = chooseRateConLoadNoV10964({
      typeId,
      preferredLoadNo,
      extractedLoadNo:rateConNewLoad,
      match:nextMatch,
    });`,
  'Rate Con completed-load match guard',
);

sheet = replaceRequired(
  sheet,
  `      const intelligence = documentIntelligencePayloadV1040({
        ...(analysis || {}),
        type:meta,
        fields:mergedFields,
      });`,
  `      const storageFieldsV10964 = compactRateConSaveFieldsV10964(mergedFields);
      const analysisForSaveV10964 = compactRateConAnalysisV10964(analysis || {}, storageFieldsV10964);
      const intelligence = documentIntelligencePayloadV1040({
        ...analysisForSaveV10964,
        type:meta,
        fields:storageFieldsV10964,
      });
      const compactIntelligencePayloadV10964 = compactIntelligenceV10964(intelligence);`,
  'compact save analysis',
);

sheet = sheet.replace(
  `          intelligence:{
            version:intelligence.version,
            family:intelligence.family,
            type:intelligence.type,
            fingerprint:intelligence.fingerprint,
            matchedEntities:intelligence.matchedEntities,
            validation:intelligence.validation,
            packet:intelligence.packet,
          },`,
  `          intelligence:compactIntelligencePayloadV10964,`,
);

sheet = replaceRequired(
  sheet,
  `        extracted:{ ...mergedFields, intelligence },
        classification:{
          selectedType:meta.id,
          detectedType:analysis?.detectedType?.id || analysis?.type?.id || 'other',
          confidence:analysis?.confidence || 0,
          method:analysis?.method || 'truck-document-intelligence-v1042',
          family:meta.family,
          routing:intelligence.routing,
          validation:intelligence.validation,
          fingerprint:intelligence.fingerprint,
          packet:intelligence.packet,
        },`,
  `        extracted:{ ...storageFieldsV10964, intelligence:compactIntelligencePayloadV10964 },
        classification:{
          selectedType:meta.id,
          detectedType:analysis?.detectedType?.id || analysis?.type?.id || 'other',
          confidence:analysis?.confidence || 0,
          method:analysis?.method || 'truck-document-intelligence-v1042',
          family:meta.family,
          fingerprint:intelligence.fingerprint,
        },`,
  'compact local save payload',
);

sheet = sheet.replace('        fields:mergedFields,\n        analysis,', '        fields:storageFieldsV10964,\n        analysis:analysisForSaveV10964,');
sheet = sheet.replace('      nextStore = addOperationalRecord(nextStore, record, meta, mergedFields);', '      nextStore = addOperationalRecord(nextStore, record, meta, storageFieldsV10964);');

const completionPattern = /      writeBusinessStore\(nextStore\);[\s\S]*?      setStage\('saved'\);/;
const completionBlock = `      writeBusinessStore(nextStore);
      const savedViewV10964 = savedViewModelV10964({ record, meta, stored });
      setSaved(savedViewV10964);
      setStage('saved');
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
      setFile(null);
      setAnalysis(null);
      setMatch(null);

      const activeRateConFieldsV10964 = meta.id === 'rate_confirmation' ? {
        ...storageFieldsV10964,
        type:'rate_confirmation',
        loadNo:selectedLoadNo || storageFieldsV10964.loadNo || storageFieldsV10964.orderNo || '',
        orderNo:storageFieldsV10964.orderNo || selectedLoadNo || storageFieldsV10964.loadNo || '',
        documentDate,
        date:documentDate,
        linkDay:linkToLogbook ? (linkDay || documentDate) : documentDate,
        linkToLogbook,
      } : null;
      const activeRateConAnalysisV10964 = activeRateConFieldsV10964
        ? compactRateConAnalysisV10964(analysisForSaveV10964, activeRateConFieldsV10964)
        : null;

      setTimeout(() => {
        try { dispatchVaultDocumentCommitV105({ record }); } catch {}
        if (activeRateConFieldsV10964) {
          try {
            dispatchSmartDocumentLinkV100({
              type:meta,
              typeId:'rate_confirmation',
              fields:activeRateConFieldsV10964,
              localDocument:stored.localDocument,
              analysis:activeRateConAnalysisV10964,
              record,
              source:'road_ready_os_v105_ratecon_board_v10964',
            });
          } catch {}
        }
      }, 30);`;
if (!sheet.includes('activeRateConFieldsV10964')) {
  if (!completionPattern.test(sheet)) throw new Error('v109.6.4 save completion block missing');
  sheet = sheet.replace(completionPattern, completionBlock);
}
write(SHEET_PATH, sheet);

let business = read(BUSINESS_PATH);
if (!business.includes('__OWNER_OP_BUSINESS_STORE_VOLATILE_V10963__')) throw new Error('v109.6.4 expected quota-safe business store');

business = replaceRequired(
  business,
  `export function readBusinessStore() {
  if (typeof window === 'undefined' || !window.localStorage) return emptyBusinessStore();
  try {
    const raw = window.localStorage.getItem(BUSINESS_STORE_KEY);`,
  `export function readBusinessStore() {
  if (typeof window === 'undefined' || !window.localStorage) return emptyBusinessStore();
  try {
    const volatile = window.__OWNER_OP_BUSINESS_STORE_VOLATILE_V10963__;
    if (volatile) return normalizeBusinessStore(volatile);
    const raw = window.localStorage.getItem(BUSINESS_STORE_KEY);`,
  'volatile business store readback',
);

business = replaceRequired(
  business,
  `  window.dispatchEvent(new CustomEvent(BUSINESS_STORE_EVENT, { detail: stored }));
  return stored;`,
  `  setTimeout(() => {
    try { window.dispatchEvent(new CustomEvent(BUSINESS_STORE_EVENT, { detail:null })); } catch {}
  }, 0);
  return stored;`,
  'deferred lightweight business store event',
);
write(BUSINESS_PATH, business);

writeJson('package.json', pkg => {
  pkg.version = VERSION;
  pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
});
if (fs.existsSync('package-lock.json')) {
  writeJson('package-lock.json', lock => {
    lock.version = VERSION;
    if (lock.packages?.['']) {
      lock.packages[''].version = VERSION;
      lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
    }
  });
}

const releasedAt = new Date().toISOString();
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:BUILD,
  releasedAt,
  updatedAt:releasedAt,
  label:'v109.6.4 Save Completion Stability',
  force:true,
  notes:[
    'Prevents the iPhone web view from exhausting memory immediately after Save document.',
    'Stores compact document intelligence, releases the imported file and reader analysis after a successful save, and defers Home/mission activation until the saved screen is visible.',
    'Uses the Rate Confirmation filename as a load-number source when OCR misses the labeled Load number.',
    'Prevents a new Rate Confirmation from attaching to a completed load through a weak PO or broker-only match.',
    'Keeps the original document safe through the quota-safe local/cloud storage path.',
    'Leaves Rate Confirmation classification, POD, BOL, Fuel, HOS, signatures and inspections unchanged.'
  ],
}, null, 2)}\n`);

let sw = read('public/sw.js');
sw = sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`);
sw = sw.replace(/const OWNER_OP_SW_BUILD = '[^']+';/, `const OWNER_OP_SW_BUILD = '${BUILD}';`);
write('public/sw.js', sw);

let update = read('source/src/core/update/appUpdate.js');
update = update.replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`);
update = update.replace(/const FALLBACK_APP_BUILD = '[^']+';/, `const FALLBACK_APP_BUILD = '${BUILD}';`);
write('source/src/core/update/appUpdate.js', update);

console.log('PASS — v109.6.4 save completion and Rate Con load identity stability applied');
