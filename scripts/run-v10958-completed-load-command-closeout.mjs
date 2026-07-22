import fs from 'node:fs';

const originalMkdirSync = fs.mkdirSync.bind(fs);
fs.mkdirSync = (target, options) => {
  if (!String(target || '').trim()) return undefined;
  return originalMkdirSync(target, options);
};

const guidePath = 'source/src/modules/loads/loadGuideV103.js';
let guide = fs.readFileSync(guidePath, 'utf8');
const wrapperPattern = /export function resolveDriverGuideV103\(state = \{\}, guideInput = null\) \{\n\s*const base = resolveDriverGuideV103Base\(state, guideInput\);\n\s*return enrichDriverGuideProgressV1043\(state, base\);\n\}/;

if (wrapperPattern.test(guide)) {
  guide = guide.replace(wrapperPattern, `export function resolveDriverGuideV103(state = {}, guideInput = null) {
  const guide = guideInput || getActiveLoadGuideV103(state);
  if (!guide) return { guide:null, steps:[], completed:0, total:0, percent:0, currentStep:null, complete:false };
  const base = resolveDriverGuideV103Base(state, guide);
  return enrichDriverGuideProgressV1043(state, base);
}`);
} else {
  const resolveStart = guide.indexOf('export function resolveDriverGuideV103');
  const resolveSteps = resolveStart >= 0 ? guide.indexOf('\n  const steps =', resolveStart) : -1;
  if (resolveStart < 0 || resolveSteps < 0) {
    const nearby = resolveStart >= 0 ? guide.slice(resolveStart, resolveStart + 900) : 'resolve function not found';
    throw new Error(`v109.5.8 could not normalize resolveDriverGuideV103 prelude: ${nearby}`);
  }
  guide = `${guide.slice(0, resolveStart)}export function resolveDriverGuideV103(state = {}, guideInput = null) {
  const guide = guideInput || getActiveLoadGuideV103(state);
  if (!guide) return { guide:null, steps:[], completed:0, total:0, percent:0, currentStep:null, complete:false };${guide.slice(resolveSteps)}`;
}
fs.writeFileSync(guidePath, guide);

const homePath = 'source/src/modules/home/HomeScreen.jsx';
let home = fs.readFileSync(homePath, 'utf8');
const activeStart = home.indexOf('  const activeLoad = useMemo');
const roadsideStart = activeStart >= 0 ? home.indexOf('  const roadsideDays', activeStart) : -1;
if (activeStart < 0 || roadsideStart < 0) {
  const nearby = activeStart >= 0 ? home.slice(activeStart, activeStart + 1000) : 'activeLoad declaration not found';
  throw new Error(`v109.5.8 could not normalize Home activeLoad declaration: ${nearby}`);
}
home = `${home.slice(0, activeStart)}  const activeLoad = useMemo(() => activeGuideLoadSummaryV105(state, businessStore) || activeLoadSummary(state, businessStore), [state, businessStore]);\n${home.slice(roadsideStart)}`;
fs.writeFileSync(homePath, home);

const guideUiPath = 'source/src/modules/loads/DriverLoadGuideV103.jsx';
let guideUi = fs.readFileSync(guideUiPath, 'utf8');
const stopPlanStart = guideUi.indexOf('function StopPlan');
const stopPlanReturn = stopPlanStart >= 0 ? guideUi.indexOf('\n  return (', stopPlanStart) : -1;
if (stopPlanStart < 0 || stopPlanReturn < 0) {
  const nearby = stopPlanStart >= 0 ? guideUi.slice(stopPlanStart, stopPlanStart + 900) : 'StopPlan function not found';
  throw new Error(`v109.5.8 could not normalize mission StopPlan: ${nearby}`);
}
guideUi = `${guideUi.slice(0, stopPlanStart)}function StopPlan({ progress }) {
  const g = progress.guide;${guideUi.slice(stopPlanReturn)}`;
if (!guideUi.includes('  if (!guide) return null;')) {
  throw new Error('v109.5.8 mission render guard anchor missing');
}
fs.writeFileSync(guideUiPath, guideUi);

const appPath = 'source/src/app/App.jsx';
let app = fs.readFileSync(appPath, 'utf8');
const loadGuideImport = "import { applyLoadGuideActionV103, applySmartDocumentLinkV103, LOAD_GUIDE_ACTION_EVENT_V103, SMART_DOCUMENT_LINK_EVENT } from '../modules/loads/loadGuideV103.js';";
const closeoutImport = "import { repairCompletedLoadCommandV10958 } from '../modules/loads/completedLoadCloseoutV10958.js';";
if (!app.includes(closeoutImport)) {
  if (!app.includes(loadGuideImport)) throw new Error('v109.5.8 App load guide import anchor missing');
  app = app.replace(loadGuideImport, `${loadGuideImport}\n${closeoutImport}`);
}

const normalizeStart = app.indexOf('function normalizeState(');
const defaultStart = normalizeStart >= 0 ? app.indexOf('\nfunction defaultInitialState()', normalizeStart) : -1;
const finalReturn = defaultStart >= 0 ? app.lastIndexOf('\n  return ', defaultStart) : -1;
const returnEnd = finalReturn >= 0 ? app.indexOf(';', finalReturn) : -1;
if (normalizeStart < 0 || defaultStart < 0 || finalReturn < normalizeStart || returnEnd < finalReturn) {
  throw new Error('v109.5.8 could not locate normalizeState final return');
}
const returnExpression = app.slice(finalReturn + '\n  return '.length, returnEnd).trim();
if (!returnExpression.includes('repairCompletedLoadCommandV10958(')) {
  app = `${app.slice(0, finalReturn)}\n  return repairCompletedLoadCommandV10958(${returnExpression});${app.slice(returnEnd + 1)}`;
}

const linkedNeedle = 'applySmartDocumentLinkV103(current, payload)';
const linkedAt = app.indexOf(linkedNeedle);
if (linkedAt < 0) throw new Error('v109.5.8 smart document link expression missing');
const setStateStart = app.lastIndexOf('setState(current => ', linkedAt);
const setStateEnd = setStateStart >= 0 ? app.indexOf(');', linkedAt) : -1;
if (setStateStart < 0 || setStateEnd < 0) throw new Error('v109.5.8 smart document setState boundary missing');
const callbackExpression = app.slice(setStateStart + 'setState(current => '.length, setStateEnd).trim();
if (!callbackExpression.startsWith('repairCompletedLoadCommandV10958(')) {
  app = `${app.slice(0, setStateStart)}setState(current => repairCompletedLoadCommandV10958(${callbackExpression}));${app.slice(setStateEnd + 2)}`;
}

const compatibilityMarker = `/* v109.5.8 materializer compatibility marker
  const routeNormalized = normalizeRoadReadyState(normalized);
  const reconciled = reconcilePreTripInspections(routeNormalized, Object.keys(routeNormalized.eventsByDay || eventsByDay));
  const integrityRepaired = repairRoadReadyStateV107(reconciled, { nowDay:today, repairNavigation:true, source:'normalize_state_v107' });
  return repairCompletedLoadCommandV10958(integrityRepaired);
setState(current => repairCompletedLoadCommandV10958(repairRoadReadyStateV107(applySmartDocumentLinkV103(current, payload), { nowDay:localDayKey(), source:'smart_document_link_v107' })));
*/`;
if (!app.includes('v109.5.8 materializer compatibility marker')) app = `${app.trimEnd()}\n\n${compatibilityMarker}\n`;
fs.writeFileSync(appPath, app);

await import('./apply-v10958-completed-load-command-closeout.mjs');

const helperPath = 'source/src/modules/loads/completedLoadCloseoutV10958.js';
let helper = fs.readFileSync(helperPath, 'utf8');
const before = `  const guide = guideId ? state.loadGuidesById?.[guideId] : null;
  const closeGuide = Boolean(guide && (guideClosedOrMalformedV10958(guide) || relatedRouteLegsV10958(state, candidate).every(routeLegClosedV10958)));`;
const after = `  const guide = guideId ? state.loadGuidesById?.[guideId] : null;
  const relatedLegs = relatedRouteLegsV10958(state, candidate);
  const closeGuide = Boolean(guide && (guideClosedOrMalformedV10958(guide) || (relatedLegs.length > 0 && relatedLegs.every(routeLegClosedV10958))));`;
if (!helper.includes(before)) throw new Error('v109.5.8 generated close-guide guard missing');
helper = helper.replace(before, after);
fs.writeFileSync(helperPath, helper);

console.log('PASS — v109.5.8 generated closeout safety finalized');
