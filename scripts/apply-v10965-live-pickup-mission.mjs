import fs from 'node:fs';

const VERSION = '109.6.5';
const BUILD = 'v10965-live-pickup-mission';
const GUIDE_PATH = 'source/src/modules/loads/loadGuideV103.js';
const GUIDE_UI_PATH = 'source/src/modules/loads/DriverLoadGuideV103.jsx';
const APP_PATH = 'source/src/app/App.jsx';
const SCAN_PATH = 'source/src/modules/scan/SmartScanSheetV105.jsx';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, value) { fs.writeFileSync(path, value); }
function writeJson(path, transform) {
  const value = JSON.parse(read(path));
  transform(value);
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}
function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`v109.6.5 missing ${label}`);
  return source.replace(before, after);
}

write('source/src/modules/loads/livePickupMissionV10965.js', String.raw`import { applySmartDocumentLinkV103 } from './loadGuideV103.js';

export const LIVE_PICKUP_MISSION_VERSION_V10965 = '109.6.5';

function textV10965(value = '') {
  return String(value || '').trim();
}

function refV10965(value = '') {
  return textV10965(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function load97155FieldsV10965() {
  const common = { poNumber:'57918682ORS', commodity:'TIRES AND WIPER BLADES' };
  return {
    type:'rate_confirmation',
    title:'Rate Confirmation',
    loadNo:'97155',
    orderNo:'97155',
    broker:'Red Lightning Logistics, LLC',
    carrierName:'NARTA EXPRESS LLC',
    mcNumber:'871792',
    dotNumber:'2513324',
    equipment:'Power Only',
    trackingProvider:'FourKites',
    pickupNumber:'7HR',
    poNumber:'57918682ORS',
    poNumbers:['57918682ORS'],
    total:2700,
    gross:2700,
    totalPieces:1314,
    weight:31558,
    origin:'Elgin, IL',
    destination:'Elgin, IL',
    pickupDate:'2026-07-22',
    deliveryDate:'2026-07-23',
    stopCount:5,
    deliveryCount:4,
    linkToLogbook:false,
    stops:[
      { id:'pickup_1', type:'pickup', sequence:0, company:'Discount Tire Elgin', street:'2451 Bath Rd', address:'2451 Bath Rd, Elgin, IL 60124', city:'Elgin', state:'IL', zip:'60124', cityState:'Elgin, IL', date:'2026-07-22', time:'13:55', appointment:'Jul 22 · 1:55 PM Appt', pickupNumber:'7HR', pieces:1314, weight:31558, ...common },
      { id:'delivery_1', type:'delivery', sequence:1, deliverySequence:1, company:'DT 1468 Woodhaven', street:'22160 Allen Rd', address:'22160 Allen Rd, Woodhaven, MI 48183', city:'Woodhaven', state:'MI', zip:'48183', cityState:'Woodhaven, MI', date:'2026-07-23', time:'07:00', appointment:'Jul 23 · 7:00 AM FCFS', pieces:519, weight:13332, ...common },
      { id:'delivery_2', type:'delivery', sequence:2, deliverySequence:2, company:'DT 1412 Dearborn', street:'25125 Ford Rd', address:'25125 Ford Rd, Dearborn, MI 48128', city:'Dearborn', state:'MI', zip:'48128', cityState:'Dearborn, MI', date:'2026-07-23', time:'09:58', appointment:'Jul 23 · 9:58 AM FCFS', pieces:528, weight:11744, ...common },
      { id:'delivery_3', type:'delivery', sequence:3, deliverySequence:3, company:'DT 1135 Canton', street:'41550 Ford Rd', address:'41550 Ford Rd, Canton, MI 48187', city:'Canton', state:'MI', zip:'48187', cityState:'Canton, MI', date:'2026-07-23', time:'12:29', appointment:'Jul 23 · 12:29 PM FCFS', pieces:267, weight:6482, ...common },
      { id:'delivery_4', type:'delivery', sequence:4, deliverySequence:4, company:'Discount Tire Elgin — Empty Return', street:'2451 Bath Rd', address:'2451 Bath Rd, Elgin, IL 60124', city:'Elgin', state:'IL', zip:'60124', cityState:'Elgin, IL', date:'2026-07-23', time:'18:11', appointment:'Jul 23 · 6:11 PM Appt', pieces:0, weight:0, ...common },
    ],
  };
}

function currentGuideV10965(state = {}) {
  const id = textV10965(state.activeLoadGuideId || state.loadInfo?.guideId);
  if (id && state.loadGuidesById?.[id]) return state.loadGuidesById[id];
  return Object.values(state.loadGuidesById || {}).find(guide => refV10965(guide?.loadNo || guide?.orderNo) === '97155') || null;
}

function needs97155RepairV10965(guide = {}, state = {}) {
  const activeRef = refV10965(guide?.loadNo || guide?.orderNo || state.loadInfo?.loadNo || state.loadInfo?.shippingDocs);
  if (activeRef !== '97155') return false;
  const stops = Array.isArray(guide?.stops) ? guide.stops : [];
  const deliveries = stops.filter(stop => stop?.type === 'delivery');
  const routeText = [guide?.origin, guide?.destination, state.loadInfo?.pickupCity, state.loadInfo?.deliveryCity].map(textV10965).join(' ');
  return deliveries.length < 4
    || stops.length < 5
    || /dhl\s*yard|location\s+after\s+pickup|unless\s+otherwise\s+instructed/i.test(routeText);
}

export function repairKnownRateConMissionV10965(state = {}) {
  if (!state || typeof state !== 'object') return state;
  const guide = currentGuideV10965(state);
  const activeRef = refV10965(guide?.loadNo || guide?.orderNo || state.loadInfo?.loadNo || state.loadInfo?.shippingDocs);
  if (activeRef !== '97155' || !needs97155RepairV10965(guide || {}, state)) return state;

  const fields = {
    ...load97155FieldsV10965(),
    linkDay:'2026-07-22',
    documentDate:'2026-07-22',
    date:'2026-07-22',
  };
  const repaired = applySmartDocumentLinkV103(state, {
    type:{ id:'rate_confirmation', label:'Rate Confirmation' },
    typeId:'rate_confirmation',
    fields,
    localDocument:{ local_id:guide?.sourceDocumentId || state.loadInfo?.rateConfirmationDocumentId || '' },
    analysis:{
      type:{ id:'rate_confirmation', label:'Rate Confirmation' },
      fields,
      text:'FourKites tracking. Driver unload assistance at each stop. Empty trailer returns to the original pickup location.',
    },
    source:'known_ratecon_97155_repair_v10965',
  });
  return {
    ...repaired,
    livePickupMissionRepairV10965:{ loadNo:'97155', at:Date.now(), reason:'restored_four_delivery_round_trip' },
  };
}
`);

let guide = read(GUIDE_PATH);
if (!guide.includes('function activityTextV10965')) {
  const anchor = `function samePlace(event = {}, step = {}) {`;
  const addition = String.raw`function arrayV10965(value = []) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function activityTextV10965(event = {}) {
  const reasons = arrayV10965(event.reasons);
  return [
    ...reasons,
    event.reason,
    event.note,
    event.description,
    event.operation,
    event.action,
    event.trailerAction,
    event.activity,
  ].map(text).filter(Boolean).join(' ').toLowerCase();
}

function eventReferencesV10965(event = {}) {
  return unique([
    event.loadNo,
    event.shippingDocs,
    event.orderNo,
    event.bol,
    event.bolNo,
    event.po,
    event.poNumber,
    event.pickedUpLoadNo,
    event.deliveredLoadNo,
  ].map(ref));
}

function guideReferencesV10965(guide = {}) {
  const poNumbers = Array.isArray(guide.poNumbers)
    ? guide.poNumbers
    : text(guide.poNumbers).split(/[·,|]/);
  return unique([
    guide.loadNo,
    guide.orderNo,
    guide.legNo,
    guide.pickupNumber,
    ...poNumbers,
  ].map(ref));
}

function eventMatchesGuideV10965(event = {}, guide = {}) {
  const eventRefs = eventReferencesV10965(event);
  const guideRefs = guideReferencesV10965(guide);
  if (!eventRefs.length) return true;
  return eventRefs.some(value => guideRefs.includes(value));
}

function pickupActivityV10965(event = {}) {
  return /pickup|pick\s*up|loading|hook(?:ed)?|drop\s*&?\s*hook|pickup\s+trailer|dhl\s*yard/.test(activityTextV10965(event));
}

function deliveryActivityV10965(event = {}) {
  return /delivery|unloading|delivered|drop\s*off/.test(activityTextV10965(event));
}

function pickupPresenceCompleteV10965(state = {}, guide = {}, step = {}) {
  return eventsForStep(state, step).some(event => (
    event?.status === 'ON'
    && pickupActivityV10965(event)
    && eventMatchesGuideV10965(event, guide)
    && samePlace(event, step)
  ));
}

function routeStepCompleteV10965(state = {}, guide = {}, step = {}) {
  if (step?.id === 'route_pickup') return pickupPresenceCompleteV10965(state, guide, step);
  if (/^route_delivery_/.test(text(step?.id))) {
    return eventsForStep(state, step).some(event => (
      event?.status === 'ON'
      && deliveryActivityV10965(event)
      && eventMatchesGuideV10965(event, guide)
      && samePlace(event, step)
    ));
  }
  return false;
}

`;
  if (!guide.includes(anchor)) throw new Error('v109.6.5 load guide samePlace anchor missing');
  guide = guide.replace(anchor, `${addition}${anchor}`);
}

guide = replaceRequired(
  guide,
  `function samePlace(event = {}, step = {}) {
  const city = text(step.city).toLowerCase();
  const state = text(step.state).toUpperCase();
  if (!city && !state) return true;
  const eventCity = text(event.city).toLowerCase();
  const eventState = text(event.state).toUpperCase();
  const cityOk = !city || eventCity.includes(city) || city.includes(eventCity);
  const stateOk = !state || eventState === state;
  return cityOk && stateOk;
}`,
  `function samePlace(event = {}, step = {}) {
  const city = text(step.city).toLowerCase();
  const state = text(step.state).toUpperCase();
  if (!city && !state) return true;
  const eventCity = text(event.city || event.location?.city || event.currentLocation?.city).toLowerCase();
  const eventState = text(event.state || event.location?.state || event.currentLocation?.state).toUpperCase();
  const cityOk = !city || (!!eventCity && (eventCity.includes(city) || city.includes(eventCity)));
  const stateOk = !state || (!!eventState && eventState === state);
  return cityOk && stateOk;
}`,
  'safe mission location match',
);

guide = replaceRequired(
  guide,
  `function eventsForStep(state = {}, step = {}) {
  const preferredDay = step.day || '';
  const days = unique([preferredDay, localDayKey(), ...Object.keys(state.eventsByDay || {})]);
  return days.flatMap(day => (state.eventsByDay?.[day] || []).map(event => ({ ...event, _day:day })));
}`,
  `function eventsForStep(state = {}, step = {}) {
  const preferredDay = step.day || '';
  const days = unique([preferredDay, localDayKey(), ...Object.keys(state.eventsByDay || {})]);
  return days.flatMap(day => arrayV10965(state.eventsByDay?.[day]).map(event => ({ ...event, _day:day })));
}`,
  'safe mission event collection',
);

guide = replaceRequired(
  guide,
  `function statusStepComplete(state = {}, step = {}) {
  const events = eventsForStep(state, step);
  const reason = text(step.reason).toLowerCase();
  return events.some(event => {
    if (step.status && event.status !== step.status) return false;
    const eventText = \\`${'${event.note || \'\'} ${event.description || \'\'}'}\\`.toLowerCase();
    if (/pre[- ]?trip|inspection/.test(reason) && !/pre[- ]?trip|inspection/.test(eventText)) return false;
    if (/pickup|loading/.test(reason) && !/pickup|loading/.test(eventText)) return false;
    if (/delivery|unloading/.test(reason) && !/delivery|unloading/.test(eventText)) return false;
    if (step.status !== 'D' && !samePlace(event, step)) return false;
    return true;
  });
}`,
  `function statusStepComplete(state = {}, guide = {}, step = {}) {
  const events = eventsForStep(state, step);
  const reason = text(step.reason).toLowerCase();
  return events.some(event => {
    if (step.status && event.status !== step.status) return false;
    if (!eventMatchesGuideV10965(event, guide)) return false;
    const eventText = activityTextV10965(event);
    if (/pre[- ]?trip|inspection/.test(reason) && !/pre[- ]?trip|inspection/.test(eventText)) return false;
    if (/pickup|loading/.test(reason) && !/pickup|pick\\s*up|loading|hook(?:ed)?|drop\\s*&?\\s*hook|pickup\\s+trailer/.test(eventText)) return false;
    if (/delivery|unloading/.test(reason) && !/delivery|unloading|delivered|drop\\s*off/.test(eventText)) return false;
    if (step.status !== 'D' && !samePlace(event, step)) return false;
    return true;
  });
}`,
  'Hook Pickup Trailer mission recognition',
);

guide = replaceRequired(
  guide,
  `function documentStepComplete(state = {}, guide = {}, step = {}) {
  const expected = step.documentType;
  if (!expected) return false;
  if (expected === 'bol' && guide.documents?.bolDocumentId) return true;
  if (expected === 'pod' && guide.documents?.podDocumentId) return true;
  const guideRefs = guideReferenceValues(guide);
  return Object.values(state.documentsByDay || {}).flatMap(list => Array.isArray(list) ? list : []).some(document => {
    if (document?.type !== expected) return false;
    const docRef = ref(document.loadNo || '');
    return !guideRefs.length || (docRef && guideRefs.includes(docRef));
  });
}`,
  `function documentStepComplete(state = {}, guide = {}, step = {}) {
  const expected = text(step.documentType);
  if (!expected) return false;
  if (expected === 'bol' && (guide.documents?.bolDocumentId || guide.documents?.pickupBolDocumentId)) return true;
  if (expected === 'pod' && guide.documents?.podDocumentId) return true;
  const aliases = expected === 'bol' ? new Set(['bol','bill_of_lading']) : new Set([expected]);
  const guideRefs = guideReferencesV10965(guide);
  const last = state.lastDocumentLink || {};
  const lastRef = ref(last.loadNo || last.canonicalLoadNo || '');
  if (aliases.has(text(last.type)) && lastRef && guideRefs.includes(lastRef)) return true;
  return Object.values(state.documentsByDay || {}).flatMap(list => arrayV10965(list)).some(document => {
    if (!aliases.has(text(document?.type))) return false;
    const docRef = ref(document.canonicalLoadNo || document.loadNo || document.bolNo || '');
    return Boolean(docRef && guideRefs.includes(docRef));
  });
}`,
  'active guide BOL and POD recognition',
);

guide = replaceRequired(
  guide,
  `    const complete = manual || (step.kind === 'status' ? statusStepComplete(state, step) : step.kind === 'document' ? documentStepComplete(state, guide, step) : false);`,
  `    const complete = manual
      || (step.kind === 'status' ? statusStepComplete(state, guide, step)
        : step.kind === 'document' ? documentStepComplete(state, guide, step)
          : step.kind === 'route' ? routeStepCompleteV10965(state, guide, step)
            : false);`,
  'automatic route and arrival progression',
);

// Match a newly scanned BOL/POD by selected canonical load even if OCR references are sparse.
guide = replaceRequired(
  guide,
  `function payloadReferenceValues(payload = {}) {
  const fields = payload.fields || {};
  return unique([fields.loadNo, fields.orderNo, fields.legNo, fields.bolNo, fields.poNumber, fields.pickupNumber].map(ref));
}`,
  `function payloadReferenceValues(payload = {}) {
  const fields = payload.fields || {};
  const record = payload.record || payload.document || {};
  return unique([
    fields.loadNo, fields.canonicalLoadNo, fields.orderNo, fields.legNo, fields.bolNo, fields.poNumber, fields.pickupNumber,
    record.loadNo, record.canonicalLoadNo, record.bolNo, record.poNumber,
  ].map(ref));
}`,
  'document canonical load references',
);

write(GUIDE_PATH, guide);

let guideUi = read(GUIDE_UI_PATH);
if (!guideUi.includes('function normalizeGuideForRenderV10965')) {
  const anchor = `function money(value = 0) {`;
  const helper = `function normalizeGuideForRenderV10965(guide = null) {
  if (!guide || typeof guide !== 'object') return null;
  const stops = Array.isArray(guide.stops) ? guide.stops.filter(Boolean) : [];
  const steps = Array.isArray(guide.steps) ? guide.steps.filter(Boolean).map((step, index) => ({
    ...step,
    id:step.id || \\`step_\\${index + 1}\\`,
    checklist:Array.isArray(step.checklist) ? step.checklist.filter(Boolean) : (step.checklist ? [String(step.checklist)] : []),
  })) : [];
  return {
    ...guide,
    stops,
    steps,
    requirements:guide.requirements && typeof guide.requirements === 'object' ? guide.requirements : {},
    documents:guide.documents && typeof guide.documents === 'object' ? guide.documents : {},
  };
}

`;
  if (!guideUi.includes(anchor)) throw new Error('v109.6.5 DriverLoadGuide money anchor missing');
  guideUi = guideUi.replace(anchor, `${helper}${anchor}`);
}
guideUi = replaceRequired(
  guideUi,
  `export default function DriverLoadGuideV103({ state, mode = 'compact', onOpen, onBack, onOpenScan }) {
  const guide = useMemo(() => getActiveLoadGuideV103(state), [state]);
  const progress = useMemo(() => resolveDriverGuideV103(state, guide), [state, guide]);
  if (!guide || !Array.isArray(guide.steps) || guide.steps.length === 0) return null;
  return mode === 'screen' ? <Full progress={progress} onBack={onBack} onOpenScan={onOpenScan}/> : <Compact progress={progress} onOpen={onOpen} onOpenScan={onOpenScan}/>;
}`,
  `export default function DriverLoadGuideV103({ state, mode = 'compact', onOpen, onBack, onOpenScan }) {
  const rawGuide = useMemo(() => getActiveLoadGuideV103(state), [state]);
  const guide = useMemo(() => normalizeGuideForRenderV10965(rawGuide), [rawGuide]);
  const progress = useMemo(() => resolveDriverGuideV103(state, guide), [state, guide]);
  if (!guide || !guide.steps.length) return null;
  return mode === 'screen' ? <Full progress={progress} onBack={onBack} onOpenScan={onOpenScan}/> : <Compact progress={progress} onOpen={onOpen} onOpenScan={onOpenScan}/>;
}`,
  'Full mission normalized render',
);
write(GUIDE_UI_PATH, guideUi);

let app = read(APP_PATH);
const repairImport = "import { repairKnownRateConMissionV10965 } from '../modules/loads/livePickupMissionV10965.js';";
if (!app.includes(repairImport)) {
  const anchor = "import { repairCompletedLoadCommandV10958 } from '../modules/loads/completedLoadCloseoutV10958.js';";
  if (!app.includes(anchor)) throw new Error('v109.6.5 App completed-load import anchor missing');
  app = app.replace(anchor, `${anchor}\n${repairImport}`);
}
const normalizeStart = app.indexOf('function normalizeState(');
const defaultStart = normalizeStart >= 0 ? app.indexOf('\nfunction defaultInitialState()', normalizeStart) : -1;
const finalReturn = defaultStart >= 0 ? app.lastIndexOf('\n  return ', defaultStart) : -1;
const returnEnd = finalReturn >= 0 ? app.indexOf(';', finalReturn) : -1;
if (normalizeStart < 0 || defaultStart < 0 || finalReturn < normalizeStart || returnEnd < finalReturn) throw new Error('v109.6.5 normalizeState return missing');
const expression = app.slice(finalReturn + '\n  return '.length, returnEnd).trim();
if (!expression.startsWith('repairKnownRateConMissionV10965(')) {
  app = `${app.slice(0, finalReturn)}\n  return repairKnownRateConMissionV10965(${expression});${app.slice(returnEnd + 1)}`;
}
app = app.replace(/repairCompletedLoadCommandV10958\((repairRoadReadyStateV107\(applySmartDocumentLinkV103\(current, payload\)[\s\S]*?\))\)/g, 'repairKnownRateConMissionV10965(repairCompletedLoadCommandV10958($1))');
app = app.replace(/applyVaultDocumentCommitV105\(current, payload\)/g, 'repairKnownRateConMissionV10965(applyVaultDocumentCommitV105(current, payload))');
write(APP_PATH, app);

let scan = read(SCAN_PATH);
if (!scan.includes('activeGuideDocFieldsV10965')) {
  const marker = `        if (activeRateConFieldsV10964) {
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
  const replacement = `        if (activeRateConFieldsV10964) {
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
        if (meta.id === 'bol' || meta.id === 'pod') {
          const activeGuideDocFieldsV10965 = {
            ...storageFieldsV10964,
            type:meta.id,
            canonicalLoadNo:selectedLoadNo || storageFieldsV10964.canonicalLoadNo || storageFieldsV10964.loadNo || '',
            loadNo:selectedLoadNo || storageFieldsV10964.loadNo || storageFieldsV10964.canonicalLoadNo || '',
            documentDate,
            date:documentDate,
            linkDay:linkToLogbook ? (linkDay || documentDate) : documentDate,
            linkToLogbook,
          };
          try {
            dispatchSmartDocumentLinkV100({
              type:meta,
              typeId:meta.id,
              fields:activeGuideDocFieldsV10965,
              localDocument:stored.localDocument,
              analysis:compactRateConAnalysisV10964(analysisForSaveV10964, activeGuideDocFieldsV10965),
              record,
              source:'road_ready_os_v105_guide_document_v10965',
            });
          } catch {}
        }
      }, 30);`;
  if (!scan.includes(marker)) throw new Error('v109.6.5 save completion dispatch anchor missing');
  scan = scan.replace(marker, replacement);
}
write(SCAN_PATH, scan);

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
  label:'v109.6.5 Live Pickup Mission',
  force:true,
  notes:[
    'Recognizes ON DUTY Hook / Pickup Trailer activity from reasons, notes and descriptions and advances Navigate to pickup plus Log arrival at pickup.',
    'Links a newly scanned BOL or POD directly to the selected active load and clears Pickup BOL missing when the document belongs to that guide.',
    'Makes Full mission render safely when older guide steps contain malformed stop or checklist values.',
    'Restores the complete Load 97155 round trip: Elgin pickup, Woodhaven, Dearborn, Canton and empty return to Elgin.',
    'Keeps duty times, HOS, signatures and inspection records unchanged.'
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

console.log('PASS — v109.6.5 live pickup mission, BOL linking and Full mission stability applied');
