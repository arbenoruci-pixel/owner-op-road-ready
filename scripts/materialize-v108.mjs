import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '100.8.0';
const RELEASED_AT = '2026-07-15T22:10:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v100.8 missing ${label}`);
  return content.replace(before, after);
}
function replacePattern(content, pattern, replacement, label, marker = '') {
  if (marker && content.includes(marker)) return content;
  if (!pattern.test(content)) throw new Error(`v100.8 missing ${label}`);
  return content.replace(pattern, replacement);
}

const appPath = 'source/src/app/App.jsx';
let app = read(appPath);
if (!app.includes("from '../modules/loads/loadGuideActionV108.js'")) {
  const anchor = "import { applyLoadGuideActionV103, applySmartDocumentLinkV103, LOAD_GUIDE_ACTION_EVENT_V103, SMART_DOCUMENT_LINK_EVENT } from '../modules/loads/loadGuideV103.js';";
  app = replaceOnce(
    app,
    anchor,
    `${anchor}\nimport { applyLoadGuideActionV108 } from '../modules/loads/loadGuideActionV108.js';`,
    'App safe guide action import'
  );
}
app = app.replace(/applyLoadGuideActionV103\(current, detail\)/g, 'applyLoadGuideActionV108(current, detail)');
write(appPath, app);

const guidePath = 'source/src/modules/loads/loadGuideV103.js';
let guide = read(guidePath);
if (!guide.includes('function routeStepCompleteV108')) {
  const marker = 'export function resolveDriverGuideV103';
  if (!guide.includes(marker)) throw new Error('v100.8 missing guide resolver marker');
  const helpers = `function guideAllEventsV108(state = {}) {
  return Object.entries(state.eventsByDay || {}).flatMap(([day, events]) => (
    (Array.isArray(events) ? events : []).map(event => ({ ...event, _day:day }))
  ));
}

function guideEventReferencesV108(event = {}) {
  return unique([
    event.shippingDocs,
    event.loadNo,
    event.bol,
    event.po,
    event.pickedUpLoadNo,
    event.deliveredLoadNo,
    ...(Array.isArray(event.transitionLoadNos) ? event.transitionLoadNos : []),
  ].map(ref).filter(Boolean));
}

function guideReferenceMatchesV108(event = {}, guide = {}) {
  const eventRefs = guideEventReferencesV108(event);
  if (!eventRefs.length) return true;
  const guideRefs = guideReferenceValues(guide);
  return !guideRefs.length || eventRefs.some(value => guideRefs.includes(value));
}

function guideDayV108(value = '') {
  return dayKey(value) || text(value);
}

function routeStepCompleteV108(state = {}, guide = {}, step = {}) {
  const stepDay = guideDayV108(step.day || '');
  const today = localDayKey();
  if (stepDay && today && stepDay < today) return true;
  if (samePlace(state.currentLocation || {}, step)) return true;

  const events = guideAllEventsV108(state);
  if (events.some(event => {
    if (stepDay && event._day < stepDay) return false;
    if (event.status === 'D') return false;
    if (!samePlace(event, step)) return false;
    return guideReferenceMatchesV108(event, guide);
  })) return true;

  const stopSequence = Number(step.stopSequence || 0);
  if (!stopSequence) return false;
  return Object.values(state.routeLegsByDay || {}).flatMap(rows => Array.isArray(rows) ? rows : []).some(leg => (
    leg?.loadGroupId === guide.id
    && Number(leg?.stopSequence || 0) === stopSequence
    && /^(?:delivered|completed|closed)$/i.test(text(leg?.status))
  ));
}

function statusStepCompleteV108(state = {}, guide = {}, step = {}) {
  if (statusStepComplete(state, guide, step)) return true;
  const reason = text(step.reason).toLowerCase();
  if (!/pickup|loading|delivery|unloading/.test(reason)) return false;
  return guideAllEventsV108(state).some(event => {
    if (step.day && event._day !== guideDayV108(step.day)) return false;
    if (event.status !== 'ON') return false;
    if (!samePlace(event, step)) return false;
    return guideReferenceMatchesV108(event, guide);
  });
}

function currentDriverStepV108(steps = []) {
  const incomplete = (steps || []).filter(step => !step.complete);
  if (!incomplete.length) return null;
  const today = localDayKey();
  return incomplete.find(step => guideDayV108(step.day) === today)
    || incomplete.find(step => guideDayV108(step.day) > today)
    || incomplete.find(step => !guideDayV108(step.day))
    || incomplete[0];
}

`;
  guide = guide.replace(marker, `${helpers}${marker}`);
}
guide = replacePattern(
  guide,
  /const complete = manual \|\| \(step\.kind === 'status' \? statusStepComplete\(state, guide, step\) : step\.kind === 'document' \? documentStepComplete\(state, guide, step\) : false\);/,
  "const complete = manual || (step.kind === 'status' ? statusStepCompleteV108(state, guide, step) : step.kind === 'document' ? documentStepComplete(state, guide, step) : step.kind === 'route' ? routeStepCompleteV108(state, guide, step) : false);",
  'guide completion policy',
  'routeStepCompleteV108(state, guide, step)'
);
guide = replaceOnce(
  guide,
  '  const currentStep = steps.find(step => !step.complete) || null;',
  '  const currentStep = currentDriverStepV108(steps);',
  'current step date/location priority'
);
write(guidePath, guide);

const componentPath = 'source/src/modules/loads/DriverLoadGuideV103.jsx';
let component = read(componentPath);
if (!component.includes('class DriverGuideBoundaryV108')) {
  component = component.replace(
    "import { dispatchLoadGuideActionV103, getActiveLoadGuideV103, resolveDriverGuideV103 } from './loadGuideV103.js';",
    "import { dispatchLoadGuideActionV103, getActiveLoadGuideV103, resolveDriverGuideV103 } from './loadGuideV103.js';\n\nclass DriverGuideBoundaryV108 extends React.Component {\n  constructor(props) { super(props); this.state = { failed:false }; }\n  static getDerivedStateFromError() { return { failed:true }; }\n  componentDidCatch(error) { if (typeof console !== 'undefined') console.error('Driver Mission render recovered', error); }\n  render() {\n    if (this.state.failed) return <section className=\"driver-guide-card-v103\"><div className=\"driver-guide-head-v103\"><div><em>Driver mission</em><b>Guide temporarily paused</b></div><button type=\"button\" onClick={() => this.setState({ failed:false })}>Retry</button></div></section>;\n    return this.props.children;\n  }\n}"
  );
}
component = component.replace(
  'onClick={() => runStep(guide, step, onOpenScan)}',
  'onClick={(event) => { event.preventDefault(); event.stopPropagation(); runStep(guide, step, onOpenScan); }}'
);
component = component.replace(
  "onClick={() => dispatchLoadGuideActionV103({ action:'toggle_done', guideId:guide.id, stepId:step.id, step })}",
  "onClick={(event) => { event.preventDefault(); event.stopPropagation(); dispatchLoadGuideActionV103({ action:'toggle_done', guideId:guide.id, stepId:step.id, step }); }}"
);
if (!component.includes('<DriverGuideBoundaryV108>')) {
  component = replacePattern(
    component,
    /  return mode === 'screen' \? <Full progress=\{progress\} onBack=\{onBack\} onOpenScan=\{onOpenScan\}\/> : <Compact progress=\{progress\} onOpen=\{onOpen\} onOpenScan=\{onOpenScan\}\/>;/,
    "  const content = mode === 'screen' ? <Full progress={progress} onBack={onBack} onOpenScan={onOpenScan}/> : <Compact progress={progress} onOpen={onOpen} onOpenScan={onOpenScan}/>;\n  return <DriverGuideBoundaryV108>{content}</DriverGuideBoundaryV108>;",
    'Driver guide render boundary',
    '<DriverGuideBoundaryV108>'
  );
}
write(componentPath, component);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v100.8-driver-mission-safe-actions',
  releasedAt:RELEASED_AT,
  notes:[
    'Fixes the Driver Mission Done button opening a page error by applying checklist updates through a crash-safe state transition.',
    'Guarantees checklist taps never change duty-status events, signatures, inspections, the active log day, current status or navigation view.',
    'Keeps the driver on Home or inside the open mission guide after marking a step complete.',
    'Automatically retires old navigation steps when the date, current location, log events or delivered route evidence show the driver already advanced.',
    'Prioritizes today and future mission steps so the Home card no longer gets stuck on an old Navigate to pickup instruction.',
    'Adds a local Driver Mission error boundary so a guide rendering problem cannot take down the whole app.'
  ],
  label:'v100.8 Driver Mission Safe Actions',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const verifyApp = read(appPath);
const verifyGuide = read(guidePath);
const verifyComponent = read(componentPath);
if (!verifyApp.includes('applyLoadGuideActionV108(current, detail)')) throw new Error('v100.8 safe App action integration failed');
if (!verifyGuide.includes('routeStepCompleteV108') || !verifyGuide.includes('currentDriverStepV108')) throw new Error('v100.8 guide progress integration failed');
if (!verifyComponent.includes('DriverGuideBoundaryV108') || !verifyComponent.includes('event.stopPropagation()')) throw new Error('v100.8 guide UI safety integration failed');
console.log('v100.8 Driver Mission Safe Actions materialized');
await import('./verify-driver-guide-v108.mjs');
