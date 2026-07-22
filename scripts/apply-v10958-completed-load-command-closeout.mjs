import fs from 'node:fs';

const VERSION = '109.5.8';
const BUILD = 'v10958-completed-load-command-closeout';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.mkdirSync(path.split('/').slice(0, -1).join('/'), { recursive:true });
  fs.writeFileSync(path, content);
}

function replaceRequired(source, pattern, replacement, label) {
  if (typeof pattern === 'string') {
    if (source.includes(replacement)) return source;
    if (!source.includes(pattern)) throw new Error(`v109.5.8 missing ${label}`);
    return source.replace(pattern, replacement);
  }
  if (pattern.test(source)) return source.replace(pattern, replacement);
  if (source.includes(replacement)) return source;
  throw new Error(`v109.5.8 missing ${label}`);
}

function writeJson(path, transform) {
  const value = JSON.parse(read(path));
  transform(value);
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

write('source/src/modules/loads/completedLoadCloseoutV10958.js', `function text(value = '') {
  return String(value || '').trim();
}

function ref(value = '') {
  return text(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function unique(values = []) {
  return [...new Set(values.map(ref).filter(Boolean))];
}

export function terminalLoadStatusV10958(value = '') {
  return /^(?:delivered|completed|complete|closed|cancelled|canceled|superseded|archived|dismissed|paid)$/i.test(text(value));
}

export function terminalLoadRecordV10958(value = {}) {
  if (!value || typeof value !== 'object') return false;
  const progress = Number(value.progress ?? value.percent ?? value.progressPercent ?? 0);
  const total = Number(value.stopCount ?? value.deliveryCount ?? value.totalStops ?? value.total ?? 0);
  const completed = Number(value.completedStops ?? value.completedDeliveries ?? value.doneStops ?? 0);
  return terminalLoadStatusV10958(value.status || value.loadStatus || value.state)
    || value.complete === true
    || value.completed === true
    || value.isComplete === true
    || value.isFinished === true
    || value.excludedFromActiveLoad === true
    || Boolean(value.completedAt || value.closedAt || value.finishedAt || value.deliveredAt)
    || progress >= 100
    || (total > 0 && completed >= total);
}

export function guideHasMissionStepsV10958(guide = {}) {
  return Array.isArray(guide?.steps) && guide.steps.filter(Boolean).length > 0;
}

export function guideClosedOrMalformedV10958(guide = {}) {
  if (!guide || typeof guide !== 'object') return false;
  return terminalLoadRecordV10958(guide) || !guideHasMissionStepsV10958(guide);
}

export function routeLegClosedV10958(leg = {}) {
  return terminalLoadStatusV10958(leg?.status)
    || /^(?:done|complete|completed|delivered|closed)$/i.test(text(leg?.stopStatus))
    || leg?.guideCompleted === true
    || leg?.excludedFromActiveLoad === true;
}

function objectReferences(value = {}) {
  return unique([
    value.id,
    value.guideId,
    value.loadGroupId,
    value.loadNo,
    value.shippingDocs,
    value.orderNo,
    value.legNo,
    value.bol,
    value.po,
    value.pickupNumber,
    ...(Array.isArray(value.poNumbers) ? value.poNumbers : []),
  ]);
}

function intersects(a = [], b = []) {
  return a.some(value => b.includes(value));
}

export function activeLoadReferencesV10958(state = {}, candidate = {}) {
  const guideId = text(state.activeLoadGuideId || state.loadInfo?.guideId || candidate?.guideId);
  const guide = guideId ? state.loadGuidesById?.[guideId] : null;
  return unique([
    ...objectReferences(candidate),
    ...objectReferences(state.loadInfo || {}),
    ...objectReferences(state.activeLoad || {}),
    ...objectReferences(state.activeLoadSummary || {}),
    ...objectReferences(guide || {}),
    guideId,
  ]);
}

export function relatedRouteLegsV10958(state = {}, candidate = {}) {
  const refs = activeLoadReferencesV10958(state, candidate);
  if (!refs.length) return [];
  return Object.values(state.routeLegsByDay || {})
    .flatMap(legs => Array.isArray(legs) ? legs : [])
    .filter(Boolean)
    .filter(leg => intersects(objectReferences(leg), refs));
}

function matchingBusinessLoad(businessStore = {}, refs = []) {
  return (businessStore.loads || []).find(record => intersects(objectReferences(record), refs)) || null;
}

export function shouldSuppressActiveLoadCommandV10958(state = {}, businessStore = {}, candidate = {}) {
  const info = candidate && typeof candidate === 'object' ? candidate : (state.loadInfo || {});
  const guideId = text(info.guideId || state.activeLoadGuideId || state.loadInfo?.guideId);
  const guide = guideId ? state.loadGuidesById?.[guideId] : null;
  const refs = activeLoadReferencesV10958(state, info);
  const legs = relatedRouteLegsV10958(state, info);
  const business = matchingBusinessLoad(businessStore, refs);
  const allRelatedLegsClosed = legs.length > 0 && legs.every(routeLegClosedV10958);
  const declaredStops = Number(info.stopCount ?? info.deliveryCount ?? info.totalStops ?? guide?.deliveryCount ?? guide?.stopCount ?? 0);
  const malformedMission = Boolean(guide && !guideHasMissionStepsV10958(guide));
  const emptyGeneratedMission = Boolean(
    refs.length
    && declaredStops === 0
    && legs.length === 0
    && (!guide || malformedMission)
    && /rate_confirmation|driver_load_guide|load_guide|mission/i.test(text(info.source || guide?.source)),
  );

  return terminalLoadRecordV10958(info)
    || terminalLoadRecordV10958(state.loadInfo || {})
    || terminalLoadRecordV10958(state.activeLoad || {})
    || terminalLoadRecordV10958(state.activeLoadSummary || {})
    || guideClosedOrMalformedV10958(guide)
    || allRelatedLegsClosed
    || terminalLoadRecordV10958(business || {})
    || emptyGeneratedMission;
}

function aliasMatches(refs = [], value = {}) {
  if (!value || typeof value !== 'object') return false;
  const own = objectReferences(value);
  return !own.length || intersects(own, refs);
}

export function repairCompletedLoadCommandV10958(state = {}) {
  if (!state || typeof state !== 'object') return state;
  const candidate = state.activeLoadSummary || state.activeLoad || state.loadInfo || {};
  if (!shouldSuppressActiveLoadCommandV10958(state, {}, candidate)) return state;

  const refs = activeLoadReferencesV10958(state, candidate);
  const guideId = text(state.activeLoadGuideId || state.loadInfo?.guideId || candidate?.guideId);
  const guide = guideId ? state.loadGuidesById?.[guideId] : null;
  const closeGuide = Boolean(guide && (guideClosedOrMalformedV10958(guide) || relatedRouteLegsV10958(state, candidate).every(routeLegClosedV10958)));
  const now = Date.now();
  const loadGuidesById = guide && closeGuide ? {
    ...(state.loadGuidesById || {}),
    [guideId]:{
      ...guide,
      status:'completed',
      excludedFromActiveLoad:true,
      completedAt:guide.completedAt || now,
      updatedAt:now,
      lastAction:guide.lastAction || { action:'repair_completed_load_v10958', at:now },
    },
  } : (state.loadGuidesById || {});

  const clearLoadInfo = aliasMatches(refs, state.loadInfo || {}) || text(state.loadInfo?.guideId) === guideId;
  const missionView = /(?:driver|load)[_-]?(?:guide|mission)|mission/i.test(text(state.view));
  const missionSheet = /(?:driver|load)[_-]?(?:guide|mission)|mission/i.test(text(state.sheet?.type));

  return {
    ...state,
    loadGuidesById,
    activeLoadGuideId:guideId && text(state.activeLoadGuideId) === guideId ? '' : (state.activeLoadGuideId || ''),
    loadInfo:clearLoadInfo ? {} : (state.loadInfo || {}),
    activeLoad:aliasMatches(refs, state.activeLoad || {}) ? null : (state.activeLoad || null),
    activeLoadSummary:aliasMatches(refs, state.activeLoadSummary || {}) ? null : (state.activeLoadSummary || null),
    activeMission:aliasMatches(refs, state.activeMission || {}) ? null : (state.activeMission || null),
    currentLoad:aliasMatches(refs, state.currentLoad || {}) ? null : (state.currentLoad || null),
    view:missionView ? 'home' : state.view,
    sheet:missionSheet ? null : state.sheet,
    completedLoadCloseoutV10958:{ refs, guideId, at:now },
  };
}
`);

const guidePath = 'source/src/modules/loads/loadGuideV103.js';
let guide = read(guidePath);
if (!guide.includes("from './completedLoadCloseoutV10958.js'")) {
  guide = `import { guideClosedOrMalformedV10958, guideHasMissionStepsV10958, repairCompletedLoadCommandV10958 } from './completedLoadCloseoutV10958.js';\n${guide}`;
}
guide = replaceRequired(
  guide,
  `    if (!candidate || candidate.status !== 'active' || candidate.excludedFromActiveLoad) return false;
    return !resolveDriverGuideV103(state, candidate).complete;`,
  `    if (!candidate || candidate.status !== 'active' || candidate.excludedFromActiveLoad) return false;
    if (!guideHasMissionStepsV10958(candidate) || guideClosedOrMalformedV10958(candidate)) return false;
    return !resolveDriverGuideV103(state, candidate).complete;`,
  'zero-step active guide guard',
);
guide = replaceRequired(
  guide,
  `  const guide = guideInput || getActiveLoadGuideV103(state);
  if (!guide) return { guide:null, steps:[], completed:0, total:0, percent:0, currentStep:null, complete:false };`,
  `  const guide = guideInput || getActiveLoadGuideV103(state);
  if (!guide || guideClosedOrMalformedV10958(guide)) return { guide:null, steps:[], completed:0, total:0, percent:0, currentStep:null, complete:false };`,
  'resolved mission malformed guard',
);
guide = replaceRequired(
  guide,
  `  if (typeId === 'bol' || typeId === 'pod') return attachGuideDocument(linked, payload);`,
  `  if (typeId === 'bol' || typeId === 'pod') {
    const attached = attachGuideDocument(linked, payload);
    return typeId === 'pod' ? repairCompletedLoadCommandV10958(attached) : attached;
  }`,
  'POD closeout repair',
);
guide = replaceRequired(
  guide,
  `  return {
    ...state,
    routeLegsByDay,
    loadGuidesById:{ ...(state.loadGuidesById || {}), [guideId]:nextGuide },
    activeLoadGuideId:status === 'completed'
      ? (state.activeLoadGuideId === guideId ? '' : state.activeLoadGuideId)
      : guideId,
    lastLoadGuideUpdate:{ guideId, action, stepId, at:now },
  };`,
  `  const nextState = {
    ...state,
    routeLegsByDay,
    loadGuidesById:{ ...(state.loadGuidesById || {}), [guideId]:nextGuide },
    activeLoadGuideId:status === 'completed'
      ? (state.activeLoadGuideId === guideId ? '' : state.activeLoadGuideId)
      : guideId,
    lastLoadGuideUpdate:{ guideId, action, stepId, at:now },
  };
  return status === 'completed' ? repairCompletedLoadCommandV10958(nextState) : nextState;`,
  'complete-guide alias cleanup',
);
write(guidePath, guide);

const summaryPath = 'source/src/modules/loads/activeLoadSummaryV105.js';
let summary = read(summaryPath);
if (!summary.includes("from './completedLoadCloseoutV10958.js'")) {
  summary = `import { guideClosedOrMalformedV10958, shouldSuppressActiveLoadCommandV10958 } from './completedLoadCloseoutV10958.js';\n${summary}`;
}
summary = replaceRequired(
  summary,
  `  if (!guide || terminalStatus(guide.status)) return null;`,
  `  if (!guide || terminalStatus(guide.status) || guideClosedOrMalformedV10958(guide)) return null;`,
  'active guide summary malformed guard',
);
summary = replaceRequired(
  summary,
  `  const nextDelivery = deliveries.find((stop, index) => {`,
  `  if (shouldSuppressActiveLoadCommandV10958(state, businessStore, guide)) return null;

  const nextDelivery = deliveries.find((stop, index) => {`,
  'active guide completed-route suppression',
);
write(summaryPath, summary);

const homePath = 'source/src/modules/home/HomeScreen.jsx';
let home = read(homePath);
home = replaceRequired(
  home,
  `import DriverLoadGuideV103 from '../loads/DriverLoadGuideV103.jsx';`,
  `import DriverLoadGuideV103 from '../loads/DriverLoadGuideV103.jsx';
import { getActiveLoadGuideV103 } from '../loads/loadGuideV103.js';
import { shouldSuppressActiveLoadCommandV10958 } from '../loads/completedLoadCloseoutV10958.js';`,
  'Home closeout imports',
);
home = replaceRequired(
  home,
  `  if (guideOpen) {
    return <DriverLoadGuideV103 state={state} mode="screen" onBack={() => setGuideOpen(false)} onOpenScan={() => { setGuideOpen(false); setBusinessSection('loads'); }} />;
  }`,
  `  if (guideOpen && getActiveLoadGuideV103(state)) {
    return <DriverLoadGuideV103 state={state} mode="screen" onBack={() => setGuideOpen(false)} onOpenScan={() => { setGuideOpen(false); setBusinessSection('loads'); }} />;
  }`,
  'Full mission safe-open guard',
);
home = replaceRequired(
  home,
  `  const activeLoad = useMemo(() => activeGuideLoadSummaryV105(state, businessStore) || activeLoadSummary(state, businessStore), [state, businessStore]);`,
  `  const activeLoad = useMemo(() => {
    const candidate = activeGuideLoadSummaryV105(state, businessStore) || activeLoadSummary(state, businessStore);
    return shouldSuppressActiveLoadCommandV10958(state, businessStore, candidate || state.loadInfo || {}) ? null : candidate;
  }, [state, businessStore]);`,
  'Home completed load suppression',
);
write(homePath, home);

const guideUiPath = 'source/src/modules/loads/DriverLoadGuideV103.jsx';
let guideUi = read(guideUiPath);
guideUi = replaceRequired(
  guideUi,
  `function StopPlan({ progress }) {
  const g = progress.guide;
  return (`,
  `function StopPlan({ progress }) {
  const g = progress.guide;
  const stops = Array.isArray(g?.stops) ? g.stops : [];
  return (`,
  'mission stop array guard',
);
guideUi = guideUi.replace(/g\.stops\.length/g, 'stops.length').replace(/g\.stops\.map/g, 'stops.map').replace(/g\.stops\.slice/g, 'stops.slice');
guideUi = replaceRequired(
  guideUi,
  `  if (!guide) return null;`,
  `  if (!guide || !Array.isArray(guide.steps) || guide.steps.length === 0) return null;`,
  'mission render guard',
);
write(guideUiPath, guideUi);

const appPath = 'source/src/app/App.jsx';
let app = read(appPath);
if (!app.includes("from '../modules/loads/completedLoadCloseoutV10958.js'")) {
  const importAnchor = "import { applyLoadGuideActionV103, applySmartDocumentLinkV103, LOAD_GUIDE_ACTION_EVENT_V103, SMART_DOCUMENT_LINK_EVENT } from '../modules/loads/loadGuideV103.js';";
  app = replaceRequired(
    app,
    importAnchor,
    `${importAnchor}\nimport { repairCompletedLoadCommandV10958 } from '../modules/loads/completedLoadCloseoutV10958.js';`,
    'App completed-load repair import',
  );
}
app = replaceRequired(
  app,
  `  const routeNormalized = normalizeRoadReadyState(normalized);
  const reconciled = reconcilePreTripInspections(routeNormalized, Object.keys(routeNormalized.eventsByDay || eventsByDay));
  return repairRoadReadyStateV107(reconciled, { nowDay:today, repairNavigation:true, source:'normalize_state_v107' });`,
  `  const routeNormalized = normalizeRoadReadyState(normalized);
  const reconciled = reconcilePreTripInspections(routeNormalized, Object.keys(routeNormalized.eventsByDay || eventsByDay));
  const integrityRepaired = repairRoadReadyStateV107(reconciled, { nowDay:today, repairNavigation:true, source:'normalize_state_v107' });
  return repairCompletedLoadCommandV10958(integrityRepaired);`,
  'startup completed-load repair',
);
app = replaceRequired(
  app,
  `setState(current => repairRoadReadyStateV107(applySmartDocumentLinkV103(current, payload), { nowDay:localDayKey(), source:'smart_document_link_v107' }));`,
  `setState(current => repairCompletedLoadCommandV10958(repairRoadReadyStateV107(applySmartDocumentLinkV103(current, payload), { nowDay:localDayKey(), source:'smart_document_link_v107' })));`,
  'document-link completed-load repair',
);
write(appPath, app);

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
  label:'v109.5.8 Completed Load Closeout',
  force:true,
  notes:[
    'Removes completed loads and malformed zero-step missions from Active Load Command immediately.',
    'Prevents Full mission from opening a blank or frozen screen when a stale guide has zero steps or missing stops.',
    'Stops delivered route legs, completed guides and completed business loads from reviving stale loadInfo on Home.',
    'Clears only active-load pointers and mission navigation while preserving historical loads, route legs, documents, billing and Logbook records.',
    'Repairs the persisted completed-load state during startup and after final POD or Load complete actions.'
  ]
}, null, 2)}\n`);

let sw = read('public/sw.js');
sw = sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`);
sw = sw.replace(/const OWNER_OP_SW_BUILD = '[^']+';/, `const OWNER_OP_SW_BUILD = '${BUILD}';`);
write('public/sw.js', sw);

let update = read('source/src/core/update/appUpdate.js');
update = update.replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`);
update = update.replace(/const FALLBACK_APP_BUILD = '[^']+';/, `const FALLBACK_APP_BUILD = '${BUILD}';`);
write('source/src/core/update/appUpdate.js', update);

console.log('PASS — v109.5.8 completed load command closeout applied');
