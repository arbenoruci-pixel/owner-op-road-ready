import fs from 'node:fs';

const applyPath = 'scripts/apply-v10965-live-pickup-mission.mjs';
let source = fs.readFileSync(applyPath, 'utf8');

const lines = source.split('\n').map(line => {
  if (line.includes('const eventText =') && line.includes('event.note') && line.includes('event.description')) {
    return "    const eventText = (String(event.note || '') + ' ' + String(event.description || '')).toLowerCase();";
  }
  if (line.includes('id:step.id ||') && line.includes('step_') && line.includes('index + 1')) {
    return "    id:step.id || ('step_' + (index + 1)),";
  }
  return line;
});
source = lines.join('\n');

const automaticLabel = "'automatic route and arrival progression'";
const automaticLabelIndex = source.indexOf(automaticLabel);
if (automaticLabelIndex >= 0) {
  const automaticStart = source.lastIndexOf('guide = replaceRequired(', automaticLabelIndex);
  const automaticEndMarker = source.indexOf('\n);', automaticLabelIndex);
  if (automaticStart < 0 || automaticEndMarker < 0) throw new Error('v109.6.5 automatic progression block boundaries missing');
  const automaticEnd = automaticEndMarker + 3;
  const wrapperPatch = [
    "if (!guide.includes('resolveDriverGuideV103LegacyV10965')) {",
    "  const resolverTokenV10965 = 'export function resolveDriverGuideV103(';",
    "  const resolverIndexV10965 = guide.lastIndexOf(resolverTokenV10965);",
    "  if (resolverIndexV10965 < 0) throw new Error('v109.6.5 missing exported mission resolver');",
    "  guide = guide.slice(0, resolverIndexV10965) + 'function resolveDriverGuideV103LegacyV10965(' + guide.slice(resolverIndexV10965 + resolverTokenV10965.length);",
    "  guide = guide.trimEnd() + [",
    "    '',",
    "    'export function resolveDriverGuideV103(state = {}, guideInput = null) {',",
    "    '  const guideValue = guideInput || getActiveLoadGuideV103(state);',",
    "    '  if (!guideValue) return { guide:null, steps:[], completed:0, total:0, percent:0, currentStep:null, complete:false };',",
    "    '  const sourceSteps = arrayV10965(guideValue.steps);',",
    "    '  const steps = sourceSteps.map(step => {',",
    "    '    const manual = Boolean(guideValue.manualDone?.[step.id]);',",
    "    '    const complete = manual',",
    "    \"      || (step.kind === 'status' ? statusStepComplete(state, guideValue, step)\",",
    "    \"        : step.kind === 'document' ? documentStepComplete(state, guideValue, step)\",",
    "    \"          : step.kind === 'route' ? routeStepCompleteV10965(state, guideValue, step)\",",
    "    '            : false);',",
    "    '    return { ...step, complete, completedAt:guideValue.manualDone?.[step.id] || null };',",
    "    '  });',",
    "    '  const completed = steps.filter(step => step.complete).length;',",
    "    '  const total = steps.length;',",
    "    '  const currentStep = steps.find(step => !step.complete) || null;',",
    "    '  return {',",
    "    '    guide:guideValue,',",
    "    '    steps,',",
    "    '    completed,',",
    "    '    total,',",
    "    '    percent:total ? Math.round((completed / total) * 100) : 0,',",
    "    '    currentStep,',",
    "    '    complete:total > 0 && completed === total,',",
    "    '  };',",
    "    '}',",
    "    '',",
    "  ].join('\\n');",
    "}",
  ].join('\n');
  source = `${source.slice(0, automaticStart)}${wrapperPatch}${source.slice(automaticEnd)}`;
}

const fullMissionLabel = "'Full mission normalized render'";
const fullMissionLabelIndex = source.indexOf(fullMissionLabel);
if (fullMissionLabelIndex >= 0) {
  const fullMissionStart = source.lastIndexOf('guideUi = replaceRequired(', fullMissionLabelIndex);
  const fullMissionEndMarker = source.indexOf('\n);', fullMissionLabelIndex);
  if (fullMissionStart < 0 || fullMissionEndMarker < 0) throw new Error('v109.6.5 Full mission block boundaries missing');
  const fullMissionEnd = fullMissionEndMarker + 3;
  const fullMissionPatch = [
    "if (!guideUi.includes('rawGuide = useMemo(() => getActiveLoadGuideV103')) {",
    "  const exportTokenV10965 = 'export default function DriverLoadGuideV103(';",
    "  const exportIndexV10965 = guideUi.lastIndexOf(exportTokenV10965);",
    "  if (exportIndexV10965 < 0) throw new Error('v109.6.5 missing DriverLoadGuide export');",
    "  const safeExportV10965 = [",
    "    \"export default function DriverLoadGuideV103({ state, mode = 'compact', onOpen, onBack, onOpenScan }) {\",",
    "    '  const rawGuide = useMemo(() => getActiveLoadGuideV103(state), [state]);',",
    "    '  const guide = useMemo(() => normalizeGuideForRenderV10965(rawGuide), [rawGuide]);',",
    "    '  const progress = useMemo(() => resolveDriverGuideV103(state, guide), [state, guide]);',",
    "    '  if (!guide || !guide.steps.length) return null;',",
    "    \"  return mode === 'screen' ? <Full progress={progress} onBack={onBack} onOpenScan={onOpenScan}/> : <Compact progress={progress} onOpen={onOpen} onOpenScan={onOpenScan}/>;\",",
    "    '}',",
    "    '',",
    "  ].join('\\n');",
    "  guideUi = guideUi.slice(0, exportIndexV10965) + safeExportV10965;",
    "}",
  ].join('\n');
  source = `${source.slice(0, fullMissionStart)}${fullMissionPatch}${source.slice(fullMissionEnd)}`;
}

if (!source.includes("replaceAll('routeStepCompleteV108', 'routeStepCompleteV10965')")) {
  const guideWriteAnchor = 'write(GUIDE_PATH, guide);';
  if (!source.includes(guideWriteAnchor)) throw new Error('v109.6.5 guide write anchor missing');
  source = source.replace(guideWriteAnchor, "guide = guide.replaceAll('routeStepCompleteV108', 'routeStepCompleteV10965');\nguide = guide.replaceAll('statusStepCompleteV108', 'statusStepComplete');\nwrite(GUIDE_PATH, guide);");
} else if (!source.includes("replaceAll('statusStepCompleteV108', 'statusStepComplete')")) {
  source = source.replace("guide = guide.replaceAll('routeStepCompleteV108', 'routeStepCompleteV10965');", "guide = guide.replaceAll('routeStepCompleteV108', 'routeStepCompleteV10965');\nguide = guide.replaceAll('statusStepCompleteV108', 'statusStepComplete');");
}

fs.writeFileSync(applyPath, source);

const guidePath = 'source/src/modules/loads/loadGuideV103.js';
let guide = fs.readFileSync(guidePath, 'utf8');

function replaceFunction(startName, nextName, replacement) {
  const pattern = new RegExp(`function ${startName}\\([\\s\\S]*?\\n}\\n\\n(?=function ${nextName}|export function ${nextName})`);
  if (!pattern.test(guide)) throw new Error(`v109.6.5 prepare could not locate ${startName}`);
  guide = guide.replace(pattern, `${replacement}\n\n`);
}

replaceFunction('samePlace', 'eventsForStep', `function samePlace(event = {}, step = {}) {
  const city = text(step.city).toLowerCase();
  const state = text(step.state).toUpperCase();
  if (!city && !state) return true;
  const eventCity = text(event.city).toLowerCase();
  const eventState = text(event.state).toUpperCase();
  const cityOk = !city || eventCity.includes(city) || city.includes(eventCity);
  const stateOk = !state || eventState === state;
  return cityOk && stateOk;
}`);

replaceFunction('eventsForStep', 'statusStepComplete', `function eventsForStep(state = {}, step = {}) {
  const preferredDay = step.day || '';
  const days = unique([preferredDay, localDayKey(), ...Object.keys(state.eventsByDay || {})]);
  return days.flatMap(day => (state.eventsByDay?.[day] || []).map(event => ({ ...event, _day:day })));
}`);

replaceFunction('statusStepComplete', 'documentStepComplete', `function statusStepComplete(state = {}, step = {}) {
  const events = eventsForStep(state, step);
  const reason = text(step.reason).toLowerCase();
  return events.some(event => {
    if (step.status && event.status !== step.status) return false;
    const eventText = (String(event.note || '') + ' ' + String(event.description || '')).toLowerCase();
    if (/pre[- ]?trip|inspection/.test(reason) && !/pre[- ]?trip|inspection/.test(eventText)) return false;
    if (/pickup|loading/.test(reason) && !/pickup|loading/.test(eventText)) return false;
    if (/delivery|unloading/.test(reason) && !/delivery|unloading/.test(eventText)) return false;
    if (step.status !== 'D' && !samePlace(event, step)) return false;
    return true;
  });
}`);

replaceFunction('documentStepComplete', 'resolveDriverGuideV103', `function documentStepComplete(state = {}, guide = {}, step = {}) {
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
}`);

fs.writeFileSync(guidePath, guide);
console.log('PASS — v109.6.5 independent resolver, Full mission and live pickup anchors prepared');
