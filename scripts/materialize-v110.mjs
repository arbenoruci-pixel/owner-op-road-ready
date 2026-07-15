import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '101.0.0';
const RELEASED_AT = '2026-07-15T23:35:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v101.0 missing ${label}`);
  return content.replace(before, after);
}

const guidePath = 'source/src/modules/loads/loadGuideV103.js';
let guide = read(guidePath);
if (!guide.includes("from './loadGuideSafeV110.js'")) {
  guide = `import { normalizeDriverGuideV110 } from './loadGuideSafeV110.js';\n${guide}`;
}
if (!guide.includes('const normalizedGuideV110 = normalizeDriverGuideV110')) {
  guide = replaceOnce(
    guide,
    `export function resolveDriverGuideV103(state = {}, guideInput = null) {\n  const guide = guideInput || getActiveLoadGuideV103(state);\n  if (!guide) return { guide:null, steps:[], completed:0, total:0, percent:0, currentStep:null, complete:false };\n  const steps = (guide.steps || []).map(step => {`,
    `export function resolveDriverGuideV103(state = {}, guideInput = null) {\n  const normalizedGuideV110 = normalizeDriverGuideV110(guideInput || getActiveLoadGuideV103(state));\n  const guide = normalizedGuideV110;\n  if (!guide) return { guide:null, steps:[], completed:0, total:0, percent:0, currentStep:null, complete:false };\n  const steps = guide.steps.map(step => {`,
    'guide resolver normalization'
  );
}
write(guidePath, guide);

const componentPath = 'source/src/modules/loads/DriverLoadGuideV103.jsx';
let component = read(componentPath);
if (!component.includes("from './loadGuideSafeV110.js'")) {
  component = component.replace(
    "import { dispatchLoadGuideActionV103, getActiveLoadGuideV103, resolveDriverGuideV103 } from './loadGuideV103.js';",
    "import { dispatchLoadGuideActionV103, getActiveLoadGuideV103, resolveDriverGuideV103 } from './loadGuideV103.js';\nimport { normalizeDriverGuideV110, safeObjectListV110, safeTextListV110 } from './loadGuideSafeV110.js';"
  );
}
if (!component.includes('componentDidUpdate(prevProps)')) {
  component = component.replace(
    `  componentDidCatch(error) { if (typeof console !== 'undefined') console.error('Driver Mission render recovered', error); }`,
    `  componentDidCatch(error) { if (typeof console !== 'undefined') console.error('Driver Mission render recovered', error); }\n  componentDidUpdate(prevProps) {\n    if (this.state.failed && prevProps.resetKey !== this.props.resetKey) this.setState({ failed:false });\n  }`
  );
}
component = component.replace(
  `  const m = meta(step);\n  return (`,
  `  const m = meta(step);\n  const checklistV110 = safeTextListV110(step.checklist);\n  return (`
);
component = component.replace(
  `{step.checklist?.length ? <div className="driver-guide-chips-v103">{step.checklist.map(item => <i key={item}>{item}</i>)}</div> : null}`,
  `{checklistV110.length ? <div className="driver-guide-chips-v103">{checklistV110.map((item, index) => <i key={String(item) + '_' + index}>{item}</i>)}</div> : null}`
);
if (!component.includes('const stopsV110 = safeObjectListV110(g.stops);')) {
  component = component.replace(
    `function StopPlan({ progress }) {\n  const g = progress.guide;\n  return (`,
    `function StopPlan({ progress }) {\n  const g = progress.guide;\n  const stopsV110 = safeObjectListV110(g.stops);\n  return (`
  );
  component = component.replace('{g.stops.length} stops', '{stopsV110.length} stops');
  component = component.replace('{g.stops.map((stop, index) => {', '{stopsV110.map((stop, index) => {');
  component = component.replace("const deliveryNo = stop.type === 'pickup' ? 0 : g.stops.slice(0, index + 1).filter(item => item.type === 'delivery').length;", "const deliveryNo = stop.type === 'pickup' ? 0 : stopsV110.slice(0, index + 1).filter(item => item.type === 'delivery').length;");
}
if (!component.includes('const allStepsV110 = safeObjectListV110(progress.steps);')) {
  component = component.replace(
    `  const [showDone, setShowDone] = useState(true);\n  const steps = showDone ? progress.steps : progress.steps.filter(step => !step.complete);`,
    `  const [showDone, setShowDone] = useState(true);\n  const allStepsV110 = safeObjectListV110(progress.steps);\n  const steps = showDone ? allStepsV110 : allStepsV110.filter(step => !step.complete);`
  );
}
component = component.replace(
  `{step.checklist?.length ? <small>{step.checklist.join(' · ')}</small> : null}`,
  `{safeTextListV110(step.checklist).length ? <small>{safeTextListV110(step.checklist).join(' · ')}</small> : null}`
);
if (!component.includes('const rawGuideV110 = useMemo')) {
  component = replaceOnce(
    component,
    `export default function DriverLoadGuideV103({ state, mode = 'compact', onOpen, onBack, onOpenScan }) {\n  const guide = useMemo(() => getActiveLoadGuideV103(state), [state]);\n  const progress = useMemo(() => resolveDriverGuideV103(state, guide), [state, guide]);\n  if (!guide) return null;`,
    `export default function DriverLoadGuideV103({ state, mode = 'compact', onOpen, onBack, onOpenScan }) {\n  const rawGuideV110 = useMemo(() => getActiveLoadGuideV103(state), [state]);\n  const guide = useMemo(() => normalizeDriverGuideV110(rawGuideV110), [rawGuideV110]);\n  const progress = useMemo(() => resolveDriverGuideV103(state, guide), [state, guide]);\n  if (!guide) return null;`,
    'component guide normalization'
  );
}
component = component.replace(
  `  return <DriverGuideBoundaryV108>{content}</DriverGuideBoundaryV108>;`,
  `  const resetKeyV110 = [guide.id, guide.updatedAt || 0, progress.currentStep?.id || 'complete', mode].join(':');\n  return <DriverGuideBoundaryV108 resetKey={resetKeyV110}>{content}</DriverGuideBoundaryV108>;`
);
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
  build:'v101-driver-mission-resilience',
  releasedAt:RELEASED_AT,
  notes:[
    'Repairs Driver Mission guides saved by older versions when steps, stops or checklist fields use an invalid shape.',
    'Prevents malformed checklist data from crashing the Home mission card or full Driver Load Guide.',
    'Normalizes the active guide before progress calculation and rendering without changing duty-status events or route evidence.',
    'Resets the local mission error boundary automatically after guide data or the current step changes.',
    'Keeps Driver Mission available even when optional imported Rate Confirmation fields are incomplete.'
  ],
  label:'v101.0 Driver Mission Resilience',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const verifyGuide = read(guidePath);
const verifyComponent = read(componentPath);
if (!verifyGuide.includes('normalizeDriverGuideV110')) throw new Error('v101.0 resolver normalization failed');
if (!verifyComponent.includes('checklistV110') || !verifyComponent.includes('stopsV110') || !verifyComponent.includes('resetKeyV110')) throw new Error('v101.0 resilient renderer failed');
console.log('v101.0 Driver Mission Resilience materialized');
await import('./verify-driver-guide-v110.mjs');
await import('./prepare-v111-app.mjs');
await import('./materialize-v111.mjs');
