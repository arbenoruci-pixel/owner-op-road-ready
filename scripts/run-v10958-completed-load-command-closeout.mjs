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
