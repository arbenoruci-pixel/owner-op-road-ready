import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '109.4.4';
const BUILD = 'v10944-load-guide-closeout';
const RELEASED_AT = new Date().toISOString();
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
const write = (relative, content) => {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
};

function replaceRequired(source, pattern, replacement, label) {
  if (typeof pattern === 'string') {
    if (source.includes(replacement)) return source;
    if (!source.includes(pattern)) throw new Error(`v109.4.4 missing ${label}`);
    return source.replace(pattern, replacement);
  }
  if (pattern.test(source)) return source.replace(pattern, replacement);
  if (source.includes(replacement)) return source;
  throw new Error(`v109.4.4 missing ${label}`);
}

write(
  'source/src/modules/scan/v3/DocumentOrientationV10943.js',
  read('scripts/v1093-scanner/DocumentOrientationV10943.js.txt'),
);

const enginePath = 'source/src/modules/scan/v3/ScannerEngineV3.js';
let engine = read(enginePath);
engine = replaceRequired(
  engine,
  "import { autoFixDocumentV1093 } from './AutoQualityBotV1093.js';",
  "import { autoFixDocumentV1093 } from './AutoQualityBotV1093.js';\nimport { autoOrientDocumentV10943 } from './DocumentOrientationV10943.js';",
  'orientation import',
);
engine = replaceRequired(
  engine,
  '    const corrected = warpPerspectiveV10934(',
  '    let corrected = warpPerspectiveV10934(',
  'mutable corrected page',
);
engine = replaceRequired(
  engine,
  `    finalSource = null;
    await Promise.resolve();`,
  `    options.onStatus?.('Straightening page orientation and text lines…');
    const straightened = autoOrientDocumentV10943(corrected, {
      pageFormat:corrected.pageFormat,
      pageFormatLabel:corrected.pageFormatLabel,
    });
    corrected = straightened.image;
    finalSource = null;
    await Promise.resolve();`,
  'automatic orientation pass',
);
engine = replaceRequired(
  engine,
  `            interpolation:corrected.interpolation,`,
  `            interpolation:corrected.interpolation,
            autoRotationDegrees:straightened.rotationDegrees,
            autoDeskewDegrees:straightened.deskewDegrees,
            orientationConfidence:straightened.confidence,
            orientationReason:straightened.reason,
            horizontalTextScore:straightened.horizontalScore,
            verticalTextScore:straightened.verticalScore,`,
  'orientation perspective metadata',
);
engine = replaceRequired(
  engine,
  `          rotation:session.rotation,`,
  `          rotation:(Number(session.rotation || 0) + Number(straightened.rotationDegrees || 0)) % 360,
          manualRotation:Number(session.rotation || 0),
          autoRotation:Number(straightened.rotationDegrees || 0),
          autoDeskew:Number(straightened.deskewDegrees || 0),`,
  'capture orientation metadata',
);
write(enginePath, engine);

// A completed Driver Load Guide must leave Active Load immediately. Also repair
// legacy checklist entries that were serialized as character-index objects.
const guidePath = 'source/src/modules/loads/loadGuideV103.js';
let guide = read(guidePath);
guide = replaceRequired(
  guide,
  `function unique(values = []) {
  return [...new Set(values.map(value => text(value)).filter(Boolean))];
}`,
  `function unique(values = []) {
  return [...new Set(values.map(value => text(value)).filter(Boolean))];
}

function checklistItemText(value = '') {
  if (typeof value === 'string' || typeof value === 'number') return text(value);
  if (!value || typeof value !== 'object') return '';
  if (typeof value.text === 'string') return text(value.text);
  if (typeof value.label === 'string') return text(value.label);
  const characters = Object.keys(value)
    .filter(key => /^\\d+$/.test(key))
    .sort((a, b) => Number(a) - Number(b))
    .map(key => String(value[key] ?? ''))
    .join('');
  return text(characters);
}

function normalizeChecklist(values = []) {
  return unique((Array.isArray(values) ? values : []).map(checklistItemText));
}`,
  'legacy checklist normalization',
);
guide = replaceRequired(
  guide,
  '    checklist:Array.isArray(options.checklist) ? options.checklist : [],',
  '    checklist:normalizeChecklist(options.checklist),',
  'guide checklist normalization',
);
guide = replaceRequired(
  guide,
  `    status:previous?.status === 'completed' ? 'active' : (previous?.status || 'active'),`,
  `    status:previous?.status || 'active',
    excludedFromActiveLoad:previous?.status === 'completed' || !!previous?.excludedFromActiveLoad,
    completedAt:previous?.completedAt || null,`,
  'completed Rate Con preservation',
);
guide = replaceRequired(
  guide,
  `  const routeLegsByDay = mergePlannedRouteLegs(state.routeLegsByDay || {}, mergedGuide, eventId);`,
  `  const routeLegsByDay = mergedGuide.status === 'active' && !mergedGuide.excludedFromActiveLoad
    ? mergePlannedRouteLegs(state.routeLegsByDay || {}, mergedGuide, eventId)
    : markAllGuideRoutesComplete(state.routeLegsByDay || {}, mergedGuide.id);`,
  'completed Rate Con route preservation',
);
guide = replaceRequired(
  guide,
  '    activeLoadGuideId:mergedGuide.id,',
  `    activeLoadGuideId:mergedGuide.status === 'active' && !mergedGuide.excludedFromActiveLoad
      ? mergedGuide.id
      : (state.activeLoadGuideId === mergedGuide.id ? '' : state.activeLoadGuideId),`,
  'Rate Con active pointer guard',
);
guide = replaceRequired(
  guide,
  `  const nextGuide = { ...guide, documents, updatedAt:Date.now() };
  return {
    ...state,
    loadGuidesById:{ ...(state.loadGuidesById || {}), [guide.id]:nextGuide },
    activeLoadGuideId:guide.id,
  };`,
  `  const closesGuide = typeId === 'pod';
  const now = Date.now();
  const nextGuide = {
    ...guide,
    documents,
    manualDone:closesGuide ? { ...(guide.manualDone || {}), final_pod:guide.manualDone?.final_pod || now } : (guide.manualDone || {}),
    status:closesGuide ? 'completed' : guide.status,
    completedAt:closesGuide ? (guide.completedAt || now) : (guide.completedAt || null),
    excludedFromActiveLoad:closesGuide ? true : !!guide.excludedFromActiveLoad,
    lastAction:closesGuide ? { action:'complete_guide', stepId:'final_pod', at:now } : guide.lastAction,
    updatedAt:now,
  };
  return {
    ...state,
    routeLegsByDay:closesGuide ? markAllGuideRoutesComplete(state.routeLegsByDay || {}, guide.id) : (state.routeLegsByDay || {}),
    loadGuidesById:{ ...(state.loadGuidesById || {}), [guide.id]:nextGuide },
    activeLoadGuideId:closesGuide || nextGuide.status !== 'active' || nextGuide.excludedFromActiveLoad
      ? (state.activeLoadGuideId === guide.id ? '' : state.activeLoadGuideId)
      : guide.id,
  };`,
  'POD closes guide and clears pointer',
);
guide = replaceRequired(
  guide,
  `function markRouteStopComplete(routeLegsByDay = {}, guideId = '', stopSequence = 0, done = true) {`,
  `function markAllGuideRoutesComplete(routeLegsByDay = {}, guideId = '') {
  const now = Date.now();
  const next = {};
  Object.entries(routeLegsByDay || {}).forEach(([day, legs]) => {
    next[day] = (Array.isArray(legs) ? legs : []).map(leg => {
      if (leg?.loadGroupId !== guideId) return leg;
      return {
        ...leg,
        status:'delivered',
        stopStatus:'done',
        guideCompleted:true,
        guideCompletedAt:leg.guideCompletedAt || now,
        excludedFromActiveLoad:true,
        updatedAt:now,
      };
    });
  });
  return next;
}

function markRouteStopComplete(routeLegsByDay = {}, guideId = '', stopSequence = 0, done = true) {`,
  'complete all guide routes helper',
);
guide = replaceRequired(
  guide,
  `  const status = action === 'complete_guide' ? 'completed' : action === 'reopen_guide' ? 'active' : guide.status;
  const nextGuide = {
    ...guide,
    manualDone,
    completedStopIds,
    status,
    lastAction:{ action, stepId, at:Date.now() },
    updatedAt:Date.now(),
  };
  return {
    ...state,
    routeLegsByDay,
    loadGuidesById:{ ...(state.loadGuidesById || {}), [guideId]:nextGuide },
    activeLoadGuideId:status === 'completed' ? state.activeLoadGuideId : guideId,
    lastLoadGuideUpdate:{ guideId, action, stepId, at:Date.now() },
  };`,
  `  const now = Date.now();
  const status = action === 'complete_guide' ? 'completed' : action === 'reopen_guide' ? 'active' : guide.status;
  if (action === 'complete_guide') routeLegsByDay = markAllGuideRoutesComplete(routeLegsByDay, guideId);
  const nextGuide = {
    ...guide,
    manualDone,
    completedStopIds,
    status,
    excludedFromActiveLoad:status === 'completed' ? true : action === 'reopen_guide' ? false : !!guide.excludedFromActiveLoad,
    completedAt:status === 'completed' ? (guide.completedAt || now) : action === 'reopen_guide' ? null : (guide.completedAt || null),
    lastAction:{ action, stepId, at:now },
    updatedAt:now,
  };
  return {
    ...state,
    routeLegsByDay,
    loadGuidesById:{ ...(state.loadGuidesById || {}), [guideId]:nextGuide },
    activeLoadGuideId:status === 'completed'
      ? (state.activeLoadGuideId === guideId ? '' : state.activeLoadGuideId)
      : guideId,
    lastLoadGuideUpdate:{ guideId, action, stepId, at:now },
  };`,
  'guide completion lifecycle',
);
guide = replaceRequired(
  guide,
  `export function getActiveLoadGuideV103(state = {}) {
  const exact = state.loadGuidesById?.[state.activeLoadGuideId];
  if (exact && exact.status !== 'dismissed') return exact;
  return Object.values(state.loadGuidesById || {})
    .filter(guide => guide && guide.status !== 'dismissed')
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0] || null;
}`,
  `export function getActiveLoadGuideV103(state = {}) {
  const isOpen = candidate => {
    if (!candidate || candidate.status !== 'active' || candidate.excludedFromActiveLoad) return false;
    return !resolveDriverGuideV103(state, candidate).complete;
  };
  const exact = state.loadGuidesById?.[state.activeLoadGuideId];
  if (isOpen(exact)) return exact;
  return Object.values(state.loadGuidesById || {})
    .filter(isOpen)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0] || null;
}`,
  'active guide selector',
);
guide = replaceRequired(
  guide,
  `    return { ...step, complete, completedAt:guide.manualDone?.[step.id] || null };`,
  `    return { ...step, checklist:normalizeChecklist(step.checklist), complete, completedAt:guide.manualDone?.[step.id] || null };`,
  'resolved checklist normalization',
);
write(guidePath, guide);

const guideUiPath = 'source/src/modules/loads/DriverLoadGuideV103.jsx';
let guideUi = read(guideUiPath);
guideUi = replaceRequired(
  guideUi,
  '<section className="driver-guide-hero-v103"><span>ACTIVE LOAD</span>',
  `<section className="driver-guide-hero-v103"><span>{progress.complete || g.status === 'completed' ? 'COMPLETED LOAD' : 'ACTIVE LOAD'}</span>`,
  'completed guide hero label',
);
write(guideUiPath, guideUi);

const homePath = 'source/src/modules/home/HomeScreen.jsx';
let home = read(homePath);
home = replaceRequired(
  home,
  `  const routeLegs = flattenRouteLegs(state).filter(leg => String(leg.status || '').toLowerCase() !== 'cancelled');`,
  `  const routeLegs = flattenRouteLegs(state).filter(leg => !['cancelled', 'dismissed', 'superseded', 'archived'].includes(String(leg.status || '').toLowerCase()));`,
  'closed route exclusion',
);
home = replaceRequired(
  home,
  `    const pending = ordered.filter(leg => String(leg.status || '').toLowerCase() !== 'delivered');`,
  `    const pending = ordered.filter(leg => {
      const status = String(leg.status || '').toLowerCase();
      return !['delivered', 'completed'].includes(status)
        && String(leg.stopStatus || '').toLowerCase() !== 'done'
        && leg.guideCompleted !== true
        && leg.excludedFromActiveLoad !== true;
    });`,
  'active route pending selector',
);
write(homePath, home);

for (const [target, pattern, replacement] of [
  [
    'source/src/modules/scan/v3/scannerTypesV3.js',
    /export const ROAD_READY_SCANNER_V3_VERSION = '[^']+';/,
    `export const ROAD_READY_SCANNER_V3_VERSION = '${VERSION}';`,
  ],
  [
    'source/src/modules/scan/scannerContractsV106.js',
    /export const ROAD_READY_SCANNER_VERSION_V106 = '[^']+';/,
    `export const ROAD_READY_SCANNER_VERSION_V106 = '${VERSION}';`,
  ],
]) {
  write(target, replaceRequired(read(target), pattern, replacement, target));
}

const scanSheetPath = 'source/src/modules/scan/SmartScanSheetV105.jsx';
write(
  scanSheetPath,
  replaceRequired(
    read(scanSheetPath),
    /scannerVersion:analysis\?\.scanMeta\?\.scannerVersion \|\| '[^']+'/, 
    `scannerVersion:analysis?.scanMeta?.scannerVersion || '${VERSION}'`,
    'scan persistence version',
  ),
);

const scannerUiPath = 'source/src/modules/scan/v3/RoadReadyScannerV3.jsx';
let scannerUi = read(scannerUiPath);
scannerUi = replaceRequired(
  scannerUi,
  /Road Ready Scanner 0\.5\.[0-9]+/,
  'Road Ready Scanner 0.5.3',
  'scanner label',
);
scannerUi = replaceRequired(
  scannerUi,
  /· App 109\.[0-9]+\.[0-9]+/,
  `· App ${VERSION}`,
  'app label',
);
write(scannerUiPath, scannerUi);

const reviewPath = 'source/src/modules/scan/v3/ReviewScreenV3.jsx';
write(
  reviewPath,
  replaceRequired(
    read(reviewPath),
    /Auto upright · build 109\.[0-9]+\.[0-9]+|Neutral safe · build 109\.[0-9]+\.[0-9]+/,
    `Auto upright · build ${VERSION}`,
    'review marker',
  ),
);

const updatePath = 'source/src/core/update/appUpdate.js';
let update = read(updatePath);
update = replaceRequired(
  update,
  /const FALLBACK_APP_VERSION = '[^']+';/,
  `const FALLBACK_APP_VERSION = '${VERSION}';`,
  'fallback app version',
);
update = replaceRequired(
  update,
  /const FALLBACK_APP_BUILD = '[^']+';/,
  `const FALLBACK_APP_BUILD = '${BUILD}';`,
  'fallback app build',
);
write(updatePath, update);

const bannerPath = 'source/src/modules/update/UpdateBanner.jsx';
write(
  bannerPath,
  replaceRequired(
    read(bannerPath),
    /data-owner-op-update-banner="[^"]+"/,
    `data-owner-op-update-banner="${VERSION}"`,
    'update banner marker',
  ),
);

const bootPath = 'public/update.html';
let boot = read(bootPath);
boot = replaceRequired(
  boot,
  /const version = params\.get\('version'\) \|\| '[^']+';/,
  `const version = params.get('version') || '${VERSION}';`,
  'update page version',
);
boot = replaceRequired(
  boot,
  /const build = params\.get\('build'\) \|\| '[^']+';/,
  `const build = params.get('build') || '${BUILD}';`,
  'update page build',
);
write(bootPath, boot);

const swPath = 'public/sw.js';
let sw = read(swPath);
sw = replaceRequired(
  sw,
  /const OWNER_OP_SW_VERSION = '[^']+';/,
  `const OWNER_OP_SW_VERSION = '${VERSION}';`,
  'service worker version',
);
sw = replaceRequired(
  sw,
  /const OWNER_OP_SW_BUILD = '[^']+';/,
  `const OWNER_OP_SW_BUILD = '${BUILD}';`,
  'service worker build',
);
write(swPath, sw);

const packageJson = JSON.parse(read('package.json'));
packageJson.version = VERSION;
packageJson.engines = { ...(packageJson.engines || {}), node:'24.x' };
write('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);

const packageLock = JSON.parse(read('package-lock.json'));
packageLock.version = VERSION;
if (packageLock.packages?.['']) {
  packageLock.packages[''].version = VERSION;
  packageLock.packages[''].engines = {
    ...(packageLock.packages[''].engines || {}),
    node:'24.x',
  };
}
write('package-lock.json', `${JSON.stringify(packageLock, null, 2)}\n`);

write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:BUILD,
  releasedAt:RELEASED_AT,
  updatedAt:RELEASED_AT,
  label:'v109.4.4 Load Guide Closeout',
  force:true,
  notes:[
    'Removes a Driver Load Guide from Active Load as soon as every step is complete or the final POD closes the load.',
    'Clears stale active-guide pointers and closes the guide route legs without changing duty-status events, times or GPS locations.',
    'Prevents a later Rate Confirmation, BOL or POD link from silently reopening a completed guide.',
    'Repairs legacy checklist character objects at render time so Collect signed POD and other instructions display as normal text.',
    'Excludes superseded, archived, dismissed and completed guide routes from the Home active-load selector.',
    'Keeps Scanner 0.5.3 auto-upright, bounded deskew, neutral-safe rendering and Content Fidelity Lock unchanged.',
  ],
}, null, 2)}\n`);

const manifest = JSON.parse(read('public/scanner-engine.json'));
Object.assign(manifest, {
  version:VERSION,
  name:'Road Ready Scanner 0.5.3',
  autoOrientation:'source-text-axis-v10943',
  autoDeskew:true,
  maxDeskewDegrees:4,
  standardPageUprightPrior:true,
  ocrRewrite:false,
  generativeReconstruction:false,
  qualityBot:'road-ready-auto-quality-bot-v10942',
  qualityProfile:'neutral-safe-layered-render-v10942',
  updateBootstrap:BUILD,
  visibleBuildMarker:VERSION,
});
write('public/scanner-engine.json', `${JSON.stringify(manifest, null, 2)}\n`);

// The existing build runs this verifier immediately after this materializer.
// Update its release expectations and add lifecycle regressions in the same
// single production commit, avoiding a second Vercel deployment.
const verifyPath = 'scripts/verify-v10943-auto-upright.mjs';
let verify = read(verifyPath);
verify = replaceRequired(verify, /Auto upright · build 109\.[0-9]+\.[0-9]+/, `Auto upright · build ${VERSION}`, 'verify review marker');
verify = replaceRequired(verify, /assert\.equal\(release\.version, '[^']+'\);/, `assert.equal(release.version, '${VERSION}');`, 'verify release version');
verify = replaceRequired(verify, /assert\.equal\(release\.build, '[^']+'\);/, `assert.equal(release.build, '${BUILD}');`, 'verify release build');
verify = replaceRequired(verify, /assert\.equal\(manifest\.version, '[^']+'\);/, `assert.equal(manifest.version, '${VERSION}');`, 'verify manifest version');
verify = replaceRequired(verify, /assert\.equal\(packageJson\.version, '[^']+'\);/, `assert.equal(packageJson.version, '${VERSION}');`, 'verify package version');
verify = replaceRequired(
  verify,
  `const packageJson = JSON.parse(read('package.json'));
assert.equal(packageJson.version, '${VERSION}');`,
  `const packageJson = JSON.parse(read('package.json'));
assert.equal(packageJson.version, '${VERSION}');

const guideModule = await import(moduleUrl('source/src/modules/loads/loadGuideV103.js'));
const guideFixture = guideModule.buildDriverLoadGuideV103({
  loadNo:'98306',
  orderNo:'98306',
  origin:'Lakeville, MN',
  destination:'Mount Sterling, IL',
  pickupDate:'2026-07-17',
  deliveryDate:'2026-07-18',
  stops:[
    { id:'pickup_1', type:'pickup', city:'Lakeville', state:'MN', date:'2026-07-17' },
    { id:'delivery_1', type:'delivery', city:'Mount Sterling', state:'IL', date:'2026-07-18' },
  ],
});
const activeState = {
  activeLoadGuideId:guideFixture.id,
  loadGuidesById:{ [guideFixture.id]:guideFixture },
  routeLegsByDay:{},
  eventsByDay:{},
  documentsByDay:{},
};
assert.equal(guideModule.getActiveLoadGuideV103(activeState)?.id, guideFixture.id, 'an unfinished active guide must remain visible');
const completedGuide = {
  ...guideFixture,
  manualDone:Object.fromEntries(guideFixture.steps.map(step => [step.id, 1])),
};
assert.equal(
  guideModule.getActiveLoadGuideV103({ ...activeState, loadGuidesById:{ [guideFixture.id]:completedGuide } }),
  null,
  'a 100% complete guide must not fall back into Active Load',
);
const characterObject = Object.fromEntries([...('Collect signed POD')].map((character, index) => [String(index), character]));
const legacyGuide = {
  ...guideFixture,
  steps:guideFixture.steps.map(step => step.id === 'delivery_docs_1' ? { ...step, checklist:[characterObject] } : step),
};
const resolvedLegacy = guideModule.resolveDriverGuideV103(activeState, legacyGuide);
assert.deepEqual(
  resolvedLegacy.steps.find(step => step.id === 'delivery_docs_1')?.checklist,
  ['Collect signed POD'],
  'legacy checklist objects must render as normal text',
);
const closedState = guideModule.applyLoadGuideActionV103(activeState, {
  action:'complete_guide',
  guideId:guideFixture.id,
  stepId:'final_pod',
});
assert.equal(closedState.activeLoadGuideId, '', 'closing the guide must clear its active pointer');
assert.equal(closedState.loadGuidesById[guideFixture.id].status, 'completed');
assert.equal(closedState.loadGuidesById[guideFixture.id].excludedFromActiveLoad, true);`,
  'load guide runtime regressions',
);
verify = replaceRequired(
  verify,
  `console.log('PASS — v109.4.3 auto upright and deskew scanner regression suite');`,
  `console.log('PASS — v109.4.4 completed load guides leave Active Load and legacy checklist text is repaired');
console.log('PASS — v109.4.4 load guide closeout regression suite');`,
  'verify completion output',
);
write(verifyPath, verify);

console.log('PASS — v109.4.4 load guide closeout and checklist repair applied');
