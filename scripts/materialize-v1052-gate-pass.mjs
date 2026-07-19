import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '105.2.0';
const RELEASED_AT = '2026-07-19T07:20:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v105.2 missing ${label}`);
  return content.replace(before, after);
}
function replaceRegex(content, pattern, replacement, marker, label) {
  if (marker && content.includes(marker)) return content;
  if (!pattern.test(content)) throw new Error(`v105.2 missing ${label}`);
  return content.replace(pattern, replacement);
}

// Add Gate Pass / Drop Load as a first-class trucking document.
const catalogPath = 'source/src/modules/scan/truckDocumentCatalogV1040.js';
let catalog = read(catalogPath);
if (!catalog.includes("t('gate_pass'")) {
  catalog = replaceOnce(
    catalog,
    "  t('lumper_receipt','Lumper Receipt'",
    `  t('gate_pass','Gate Pass / Drop Load','Gate Pass','load','documents','other',['load_folder','logbook'],[
    [/\\bgate\\s+pass\\b/i,105],[/\\bdrop\\s+load\\b/i,86],[/dock\\s+assignment/i,52],[/appointment\\s+window/i,24],[/arrival\\s+time/i,24],
    [/assigned\\s+by/i,12],[/trailer\\s*(?:number|no\\.?|#)\\s*:/i,16],[/\\bP\\.?O\\.?\\s*(?:number|no\\.?|#)\\s*:/i,14],[/guard\\s+house|yard\\s+entrance/i,14],
  ],{ required:['date','trailerNo','poNumber'], negativeSignals:[
    [/carrier\\s+rate\\s+confirmation|total\\s+carrier\\s+pay|line\\s*haul/i,85],
    [/bill\\s+of\\s+lading|\\bB\\/?L\\s*(?:NO|NUMBER|#)/i,70],
    [/\\bgallons?\\b|price\\s*(?:per|\\/)\\s*(?:gal|gallon)/i,65],
    [/lumper|base\\s+charge|total\\s+cost/i,55],
  ], fileSignals:[/gate.?pass|drop.?load|dock.?assignment/i], priority:58, minScore:74, description:'Facility gate pass, dock assignment and drop-load arrival evidence.' }),
  t('lumper_receipt','Lumper Receipt'`,
    'Gate Pass catalog entry',
  );
}
write(catalogPath, catalog);

// Layer Gate Pass arbitration and field sanitation after the existing v104.2 templates.
const enginePath = 'source/src/modules/scan/truckDocumentEngineV1040.js';
let engine = read(enginePath);
if (!engine.includes("from './gatePassIntelligenceV1052.js'")) {
  engine = replaceOnce(
    engine,
    "import { arbitrateDocumentTemplatesV1042, sanitizeTemplateFieldsV1042 } from './truckDocumentTemplateIntelligenceV1042.js';",
    "import { arbitrateDocumentTemplatesV1042, sanitizeTemplateFieldsV1042 } from './truckDocumentTemplateIntelligenceV1042.js';\nimport { arbitrateGatePassV1052, sanitizeGatePassFieldsV1052 } from './gatePassIntelligenceV1052.js';",
    'Gate Pass intelligence import',
  );
}
const classifyBefore = `export function classifyTruckDocumentTextV1040(input = {}) {
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
const classifyAfter = `export function classifyTruckDocumentTextV1040(input = {}) {
  const raw = classifyTruckDocumentTextV1040Base(input);
  const bolPod = arbitrateBolPodOsdV1041(raw, {
    text:input.text || '',
    baseTypeId:input.baseTypeId || '',
    preferredType:input.preferredType || 'auto',
    context:input.context || {},
  });
  const templates = arbitrateDocumentTemplatesV1042(bolPod, {
    text:input.text || '',
    fileName:input.fileName || '',
    preferredType:input.preferredType || 'auto',
    context:input.context || {},
  });
  return arbitrateGatePassV1052(templates, {
    text:input.text || '',
    fileName:input.fileName || '',
    preferredType:input.preferredType || 'auto',
    context:input.context || {},
  });
}`;
engine = replaceOnce(engine, classifyBefore, classifyAfter, 'Gate Pass classification wrapper');
engine = replaceOnce(
  engine,
  '  return sanitizeTemplateFieldsV1042(typeId, source, sanitizeBolPodFieldsV1041(typeId, source, mergeMeaningful(fields, common)));',
  '  return sanitizeGatePassFieldsV1052(typeId, source, sanitizeTemplateFieldsV1042(typeId, source, sanitizeBolPodFieldsV1041(typeId, source, mergeMeaningful(fields, common))));',
  'Gate Pass field sanitizer',
);
engine = engine.replace(/intelligenceVersion:'(?:104\.\d+\.\d+|105\.\d+\.\d+)'/g, `intelligenceVersion:'${VERSION}'`);
engine = engine.replace(/method:`truck-document-intelligence-v(?:1040|1042|1052):/g, 'method:`truck-document-intelligence-v1052:');
write(enginePath, engine);

// Gate Pass is load paperwork and can be attached to a Logbook day even before a load match.
const scanPath = 'source/src/modules/scan/SmartScanSheetV105.jsx';
let scan = read(scanPath);
scan = scan.replace(
  "'rate_confirmation','load_tender','bol','pod','delivery_receipt','lumper_receipt'",
  "'rate_confirmation','load_tender','bol','pod','delivery_receipt','gate_pass','lumper_receipt'",
);
scan = scan.replaceAll(
  'setLinkToLogbook(documentLinkableV1040(typeId) && Boolean(loadNo));',
  "setLinkToLogbook(documentLinkableV1040(typeId) && (Boolean(loadNo) || typeId === 'gate_pass'));",
);
scan = scan.replace(
  'setSaved({ record, meta, stored, finalMatch });',
  'setSaved({ record, meta, stored, finalMatch, fields:mergedFields });',
);
if (!scan.includes('ROAD_READY_OPEN_STATUS_ACTIVITY_V1052')) {
  scan = replaceOnce(
    scan,
    "function ConfirmCard({ label, value, detail, tone = '' }) {",
    `const ROAD_READY_OPEN_STATUS_ACTIVITY_V1052 = 'road-ready:open-status-activity-v1052';

function openSuggestedLogActivityV1052(saved = {}, onClose) {
  if (typeof window === 'undefined') return;
  const fields = saved.fields || {};
  const reason = fields.suggestedLogActivity || '';
  if (!reason) return;
  window.dispatchEvent(new CustomEvent(ROAD_READY_OPEN_STATUS_ACTIVITY_V1052, {
    detail:{
      reason,
      preferredDocument:{
        documentId:saved.record?.id || '',
        documentType:saved.record?.type || '',
        trailerNo:fields.trailerNo || '',
        poNumber:fields.poNumber || fields.purchaseOrder || '',
        dockAssignment:fields.dockAssignment || fields.dock || '',
        facilityName:fields.facilityName || fields.location || '',
        documentDate:saved.record?.documentDate || fields.documentDate || fields.date || '',
      },
    },
  }));
  onClose?.();
}

function ConfirmCard({ label, value, detail, tone = '' }) {`,
    'suggested log activity dispatcher',
  );
}
scan = replaceOnce(
  scan,
  "          <ConfirmCard label=\"Storage\" value={saved.stored.cloud?.status === 'synced' ? 'Cloud synced' : 'Safe on this device'} detail={saved.record.fileName}/>",
  "          <ConfirmCard label=\"Storage\" value={saved.stored.cloud?.status === 'synced' ? 'Cloud synced' : 'Safe on this device'} detail={saved.record.fileName}/>\n          {saved.fields?.suggestedLogActivity ? <ConfirmCard label=\"Suggested Logbook activity\" value={saved.fields.suggestedLogActivity} detail=\"Driver confirmation creates the ON DUTY event; the document is already preserved.\"/> : null}",
  'saved suggested Logbook card',
);
scan = replaceOnce(
  scan,
  "        <div><button type=\"button\" onClick={reset}>Scan another</button><button type=\"button\" className=\"primary\" onClick={() => onOpenBusiness?.('documents')}>Open Documents</button></div>",
  "        <div><button type=\"button\" onClick={reset}>Scan another</button>{saved.fields?.suggestedLogActivity ? <button type=\"button\" className=\"primary\" onClick={() => openSuggestedLogActivityV1052(saved, onClose)}>Add {saved.fields.suggestedLogActivity} to Logbook</button> : <button type=\"button\" className=\"primary\" onClick={() => onOpenBusiness?.('documents')}>Open Documents</button>}</div>",
  'saved Logbook action button',
);
write(scanPath, scan);

// Add a clear trailer vocabulary: Drop Load / Trailer and its opposite Hook / Pickup Trailer.
const statusPath = 'source/src/modules/status/StatusWorkflowSheet.jsx';
let status = read(statusPath);
status = status.replace(
  "const onReasons = ['Pre-trip inspection', 'Fuel', 'Pickup / Loading', 'Delivery / Unloading', 'Waiting', 'Drop Trailer', 'Drop Off', 'Drop & Hook', 'Hook Empty / Reposition'];",
  "const onReasons = ['Pre-trip inspection', 'Fuel', 'Pickup / Loading', 'Delivery / Unloading', 'Waiting', 'Drop Load / Trailer', 'Hook / Pickup Trailer', 'Drop Off', 'Drop & Hook', 'Hook Empty / Reposition'];",
);
if (!status.includes('function reasonNeedsDropTrailer(')) {
  status = replaceOnce(
    status,
    "function uniqueSuggestions(values = []) {",
    `function reasonNeedsDropTrailer(status, reasons) {
  return status === 'ON' && reasonHas(reasons, /drop\\s+(?:load\\s*\\/\\s*)?trailer|drop\\s+load/i);
}

function reasonNeedsHookTrailer(status, reasons) {
  return status === 'ON' && reasonHas(reasons, /hook\\s*\\/\\s*pickup\\s+trailer|hook\\s+trailer|pickup\\s+trailer/i);
}

function uniqueSuggestions(values = []) {`,
    'generic trailer reason helpers',
  );
}
status = status.replace(
  'export default function StatusWorkflowSheet({ state, onClose, onApplyStatus, onStartDriving }) {',
  "export default function StatusWorkflowSheet({ state, onClose, onApplyStatus, onStartDriving, preferredReason = '', preferredDocument = null }) {",
);
if (!status.includes('const [dropTrailer, setDropTrailer]')) {
  status = replaceOnce(
    status,
    "  const [hookDestination, setHookDestination] = useState('');",
    `  const [hookDestination, setHookDestination] = useState('');
  const [dropTrailer, setDropTrailer] = useState(String(preferredDocument?.trailerNo || state.equipment?.trailer || state.currentTrailer || '').replace(/^Trailer\\s+/i, '').trim());
  const [hookTrailer, setHookTrailer] = useState(String(preferredDocument?.trailerNo || '').replace(/^Trailer\\s+/i, '').trim());`,
    'generic trailer state',
  );
}
if (!status.includes('source-document-prefill-v1052')) {
  status = replaceOnce(
    status,
    "  function applyFix(fix = {}) {",
    `  useEffect(() => {
    if (!preferredReason) return;
    setStatus('ON');
    setSelectedReasons([preferredReason]);
    const trailerNo = String(preferredDocument?.trailerNo || '').replace(/^Trailer\\s+/i, '').trim();
    if (/drop/i.test(preferredReason) && trailerNo) setDropTrailer(trailerNo);
    if (/hook|pickup/i.test(preferredReason) && trailerNo) setHookTrailer(trailerNo);
    setGpsStatus('Document suggestion loaded. Confirm activity, time and location before saving.');
  }, [preferredReason]); // source-document-prefill-v1052

  function applyFix(fix = {}) {`,
    'document activity prefill',
  );
}
status = replaceOnce(
  status,
  "      droppedTrailer: '',\n      hookedTrailer: '',",
  "      droppedTrailer: dropTrailer.trim().toUpperCase(),\n      hookedTrailer: hookTrailer.trim().toUpperCase(),",
  'trailer payload fields',
);
status = replaceOnce(
  status,
  "  function save() {\n    if (dropOffSelected",
  `  function save() {
    if (dropTrailerSelected && !dropTrailer.trim()) {
      setGpsStatus('Add the trailer number being left at the facility.');
      return;
    }
    if (hookTrailerSelected && !hookTrailer.trim()) {
      setGpsStatus('Add the trailer number you hooked or picked up.');
      return;
    }
    if (dropOffSelected`,
  'generic trailer validation',
);
status = replaceOnce(
  status,
  "  const hookEmptySelected = reasonNeedsHookEmpty(status, selectedReasons);\n  const equipmentDropSelected",
  "  const hookEmptySelected = reasonNeedsHookEmpty(status, selectedReasons);\n  const dropTrailerSelected = reasonNeedsDropTrailer(status, selectedReasons);\n  const hookTrailerSelected = reasonNeedsHookTrailer(status, selectedReasons);\n  const trailerActionSelected = dropTrailerSelected || hookTrailerSelected;\n  const equipmentDropSelected",
  'generic trailer selection state',
);
status = status.replace(
  "  const currentEquipmentText = [state.equipment?.container, state.equipment?.chassis].filter(Boolean).join(' / ') || state.currentTrailer || 'No equipment set';",
  "  const currentEquipmentText = [state.equipment?.trailer || state.currentTrailer, state.equipment?.container, state.equipment?.chassis].filter(Boolean).join(' / ') || 'No equipment set';",
);
if (!status.includes('generic-trailer-action-v1052')) {
  status = replaceOnce(
    status,
    "        {equipmentDropSelected && (",
    `        {trailerActionSelected && (
          <section className="picker-section drop-hook-section generic-trailer-action-v1052">
            <div className="picker-label-row">
              <label>{dropTrailerSelected ? 'Drop load / trailer' : 'Hook / pickup trailer'}</label>
              <span>{dropTrailerSelected ? 'leave trailer at facility' : 'take possession of trailer'}</span>
            </div>
            <div className="drop-hook-current"><small>Current equipment</small><b>{currentEquipmentText}</b></div>
            <div className="driver-load-grid drop-hook-grid">
              {dropTrailerSelected ? <label><span>Trailer being dropped</span><input value={dropTrailer} onChange={(event) => setDropTrailer(event.target.value.toUpperCase())} placeholder="Trailer #" autoComplete="off"/></label> : null}
              {hookTrailerSelected ? <label><span>Trailer being hooked</span><input value={hookTrailer} onChange={(event) => setHookTrailer(event.target.value.toUpperCase())} placeholder="Trailer #" autoComplete="off"/></label> : null}
              <div className="drop-hook-note">{dropTrailerSelected ? 'Drop Load / Trailer records the equipment handoff. It does not mark freight delivered or billing ready.' : 'Hook / Pickup Trailer is the opposite action. Add the BOL/load and going-to fields below when this begins a loaded move.'}</div>
            </div>
          </section>
        )} // generic-trailer-action-v1052

        {equipmentDropSelected && (`,
    'generic trailer action UI',
  );
}
write(statusPath, status);

// Wire document suggestions into the Logbook and make generic trailer actions update current equipment safely.
const appPath = 'source/src/app/App.jsx';
let app = read(appPath);
if (!app.includes('function isHookTrailerReasonV1052(')) {
  app = replaceOnce(
    app,
    "  function isIntermodalDropReason(reason = '', dropHook = {}) {",
    `  function isHookTrailerReasonV1052(reason = '') {
    return /hook\\s*\\/\\s*pickup\\s+trailer|hook\\s+trailer|pickup\\s+trailer/i.test(String(reason || ''));
  }

  function isDropTrailerReasonV1052(reason = '') {
    return /drop\\s+(?:load\\s*\\/\\s*)?trailer|drop\\s+load/i.test(String(reason || ''));
  }

  function isIntermodalDropReason(reason = '', dropHook = {}) {`,
    'generic trailer App helpers',
  );
}
app = replaceOnce(
  app,
  "      const isIntermodalDrop = isIntermodalDropReason(reason, dropHook);\n      if (/drop trailer/i.test(reason) && !isIntermodalDrop) {\n        note = `Drop Trailer · ${droppedTrailer || trailer}`;\n        trailer = 'No trailer';\n      }",
  `      const isIntermodalDrop = isIntermodalDropReason(reason, dropHook);
      const isDropTrailer = isDropTrailerReasonV1052(reason) && !isIntermodalDrop;
      const isHookTrailer = isHookTrailerReasonV1052(reason) && !isIntermodalDrop;
      if (isDropTrailer) {
        const dropped = String(droppedTrailer || trailer || '').replace(/^Trailer\\s+/i, '').trim();
        note = dropped ? `Drop Load / Trailer · Trailer ${dropped}` : 'Drop Load / Trailer';
        trailer = 'No trailer';
      }
      if (isHookTrailer) {
        const hooked = String(hookedTrailer || '').replace(/^Trailer\\s+/i, '').trim();
        note = hooked ? `Hook / Pickup Trailer · Trailer ${hooked}` : 'Hook / Pickup Trailer';
        trailer = hooked || trailer || 'Trailer hooked';
      }`,
  'generic trailer live status behavior',
);
app = replaceOnce(
  app,
  "        source:'live_status',\n      };",
  "        source:'live_status',\n        droppedTrailer:String(droppedTrailer || '').replace(/^Trailer\\s+/i, '').trim(),\n        hookedTrailer:String(hookedTrailer || '').replace(/^Trailer\\s+/i, '').trim(),\n      };",
  'event trailer audit fields',
);
app = replaceOnce(
  app,
  "      const dropHookEquipment = isIntermodalDrop ? buildEquipmentFromDropHook(base.equipment || {}, loadPayload) : null;\n      const loadInfoPatch",
  `      const dropHookEquipment = isIntermodalDrop ? buildEquipmentFromDropHook(base.equipment || {}, loadPayload) : null;
      const genericTrailerEquipment = isDropTrailer
        ? { ...(base.equipment || {}), trailer:'', updatedAt:Date.now(), source:'drop_load_trailer_v1052' }
        : isHookTrailer
          ? { ...(base.equipment || {}), trailer:String(hookedTrailer || '').replace(/^Trailer\\s+/i, '').trim(), updatedAt:Date.now(), source:'hook_pickup_trailer_v1052' }
          : null;
      const loadInfoPatch`,
  'generic trailer equipment state',
);
app = replaceOnce(
  app,
  "        ...(dropHookEquipment ? { equipment:dropHookEquipment } : {}),",
  "        ...((dropHookEquipment || genericTrailerEquipment) ? { equipment:dropHookEquipment || genericTrailerEquipment } : {}),\n        ...((isDropTrailer || isHookTrailer) ? { driver:{ ...(base.driver || {}), trailer:trailer === 'No trailer' ? '' : trailer } } : {}),",
  'generic trailer state commit',
);
if (!app.includes('road-ready:open-status-activity-v1052')) {
  app = replaceRegex(
    app,
    /(  React\.useEffect\(\(\) => \{\n    function onVaultDocumentCommit[\s\S]*?\n  \}, \[\]\);)/,
    `$1

  React.useEffect(() => {
    function onSuggestedDocumentActivityV1052(event) {
      const detail = event?.detail || {};
      if (!detail.reason) return;
      setState(current => ({
        ...current,
        view:'logs',
        sheet:{ type:'status', preferredReason:detail.reason, preferredDocument:detail.preferredDocument || null, source:'document_suggestion_v1052' },
      }));
    }
    window.addEventListener('road-ready:open-status-activity-v1052', onSuggestedDocumentActivityV1052);
    return () => window.removeEventListener('road-ready:open-status-activity-v1052', onSuggestedDocumentActivityV1052);
  }, []);`,
    'road-ready:open-status-activity-v1052',
    'document-to-Logbook activity listener',
  );
}
app = app.replaceAll(
  '<StatusWorkflowSheet state={',
  "<StatusWorkflowSheet preferredReason={state.sheet?.preferredReason || ''} preferredDocument={state.sheet?.preferredDocument || null} state={",
);
write(appPath, app);

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
  build:'v105.2-gate-pass-drop-load',
  releasedAt:RELEASED_AT,
  notes:[
    'Recognizes facility Gate Pass and Drop Load documents from title, dock assignment, appointment window, arrival time, carrier, trailer, shipper, PO, lot and yard-instruction structure.',
    'Extracts Anthony Marano-style Gate Pass fields without treating the PO, lot, dock or phone number as a Load number.',
    'Files Gate Pass originals to the Load folder and Logbook supporting documents, while keeping delivery and billing completion unchanged.',
    'Adds a one-tap, driver-confirmed Drop Load / Trailer Logbook suggestion after saving a matching Gate Pass.',
    'Renames the trailer drop action to Drop Load / Trailer and adds the missing opposite action Hook / Pickup Trailer.',
    'Generic trailer actions update current trailer equipment and create load routing only after the driver confirms the trailer, load/BOL, time and location.'
  ],
  label:'v105.2 Gate Pass & Trailer Workflow',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

for (const [relative, marker] of [
  [catalogPath,"t('gate_pass'"],
  [enginePath,'arbitrateGatePassV1052'],
  ['source/src/modules/scan/gatePassIntelligenceV1052.js','sanitizeGatePassFieldsV1052'],
  [scanPath,'Add {saved.fields.suggestedLogActivity} to Logbook'],
  [statusPath,'Hook / Pickup Trailer'],
  [statusPath,'generic-trailer-action-v1052'],
  [appPath,'isHookTrailerReasonV1052'],
  [appPath,'road-ready:open-status-activity-v1052'],
  ['public/app-version.json','105.2.0'],
]) {
  if (!read(relative).includes(marker)) throw new Error(`v105.2 verification missing ${marker} in ${relative}`);
}

console.log('v105.2 Gate Pass & Trailer Workflow materialized');
await import('./verify-gate-pass-v1052.mjs');
