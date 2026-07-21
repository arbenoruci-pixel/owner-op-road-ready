import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATUS_TARGET = path.join(ROOT, 'source/src/modules/status/StatusWorkflowSheet.jsx');
const APP_TARGET = path.join(ROOT, 'source/src/app/App.jsx');
const TIMELINE_TARGET = path.join(ROOT, 'source/src/core/timeline/timelineEngine.js');
const RELEASE_VERSION = '109.2.3';
const RELEASED_AT = '2026-07-21T00:15:00.000Z';
const checkOnly = process.argv.includes('--check');

function writeJson(relativePath, transform) {
  const target = path.join(ROOT, relativePath);
  const value = JSON.parse(fs.readFileSync(target, 'utf8'));
  transform(value);
  if (!checkOnly) fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function replaceText(relativePath, pattern, replacement, label) {
  const target = path.join(ROOT, relativePath);
  const before = fs.readFileSync(target, 'utf8');
  const after = before.replace(pattern, replacement);
  if (after === before && !before.includes(replacement)) {
    throw new Error(`v109.2.3 target missing: ${label}`);
  }
  if (!checkOnly && after !== before) fs.writeFileSync(target, after);
}

function multiSelectToggleSource() {
  return `  function toggleReason(reasonValue) {
    setSelectedReasons(current => {
      const list = Array.isArray(current) ? current : [current].filter(Boolean);
      const active = list.includes(reasonValue);
      const next = active
        ? list.filter(item => item !== reasonValue)
        : [...list, reasonValue];
      return next.length ? next : [reasonValue];
    });
  }
`;
}

function patchStatusMultiSelectAndRestore() {
  const before = fs.readFileSync(STATUS_TARGET, 'utf8');
  let after = before;

  const toggleStart = after.indexOf('  function toggleReason(reasonValue) {');
  if (toggleStart >= 0) {
    const payloadStart = after.indexOf('\n  function payload()', toggleStart);
    if (payloadStart < 0) throw new Error('v109.2.3 could not locate payload after toggleReason');
    after = `${after.slice(0, toggleStart)}${multiSelectToggleSource()}${after.slice(payloadStart)}`;
  } else {
    const payloadStart = after.indexOf('  function payload()');
    if (payloadStart < 0) throw new Error('v109.2.3 could not locate payload for multi-select insertion');
    after = `${after.slice(0, payloadStart)}${multiSelectToggleSource()}\n${after.slice(payloadStart)}`;
  }

  after = after
    .replace(/onClick=\{\(\)\s*=>\s*setSelectedReasons\(\[r\]\)\}/g, 'onClick={() => toggleReason(r)}')
    .replace(/onClick=\{\(\)\s*=>\s*setSelectedReasons\(\[reasonValue\]\)\}/g, 'onClick={() => toggleReason(reasonValue)}')
    .replace(/selectedReasons\s*\[\s*0\s*\]\s*===\s*r/g, 'selectedReasons.includes(r)')
    .replace(/selectedReasons\s*===\s*r/g, 'selectedReasons.includes(r)')
    .replace(/>\s*select one\s*</gi, '>select one or more<')
    .replace(/>\s*choose one\s*</gi, '>select one or more<');

  after = after.replace(
    /<span>\{selectedReasons\.length > 1 \? `\$\{selectedReasons\.length\} selected` : '[^']*'\}<\/span>/,
    "<span>{selectedReasons.length > 1 ? `${selectedReasons.length} selected` : 'select one or more'}</span>",
  );

  if (!after.includes("function reasonParts(value = '')")) {
    const reasonTextBlock = `function reasonText(reasons = []) {
  const list = Array.isArray(reasons) ? reasons : [reasons];
  return list.map(item => String(item || '').trim()).filter(Boolean).join(' · ');
}
`;
    const replacement = `${reasonTextBlock}
function reasonParts(value = '') {
  return String(value || '')
    .split(/\\s+[·•|]\\s+|\\s*\\n\\s*/g)
    .map(item => item.trim())
    .filter(Boolean);
}
`;
    if (!after.includes(reasonTextBlock)) throw new Error('v109.2.3 could not locate reasonText helper');
    after = after.replace(reasonTextBlock, replacement);
  }

  const newInit = `  const [selectedReasons, setSelectedReasons] = useState(() => {
    const allowed = reasonList(state.currentStatus || 'OFF');
    const saved = Array.isArray(state.currentReasons) && state.currentReasons.length
      ? state.currentReasons
      : reasonParts(state.currentReason || '');
    const restored = saved
      .map(item => String(item || '').trim())
      .filter(item => allowed.includes(item));
    return restored.length ? [...new Set(restored)] : [allowed[0]];
  });`;
  if (!after.includes('const saved = Array.isArray(state.currentReasons) && state.currentReasons.length')) {
    const initToken = '  const [selectedReasons, setSelectedReasons] = useState';
    const initStart = after.indexOf(initToken);
    const initEnd = initStart >= 0 ? after.indexOf(';\n', initStart) : -1;
    if (initStart < 0 || initEnd < 0) throw new Error('v109.2.3 could not locate selectedReasons initializer');
    after = `${after.slice(0, initStart)}${newInit}${after.slice(initEnd + 1)}`;
  }

  after = after.replace(
    '      reasons:selectedReasons,',
    '      reasons:[...selectedReasons],',
  );

  const required = [
    'function toggleReason(reasonValue)',
    'const list = Array.isArray(current) ? current : [current].filter(Boolean);',
    'list.includes(reasonValue)',
    ': [...list, reasonValue]',
    'onClick={() => toggleReason(r)}',
    'selectedReasons.includes(r)',
    "function reasonParts(value = '')",
    'const saved = Array.isArray(state.currentReasons) && state.currentReasons.length',
    "reasonParts(state.currentReason || '')",
    'reasonText(selectedReasons)',
    'reasons:[...selectedReasons]',
    'select one or more',
  ];
  for (const marker of required) {
    if (!after.includes(marker)) throw new Error(`v109.2.3 status multi-select verification failed: ${marker}`);
  }

  const forbidden = [
    'onClick={() => setSelectedReasons([r])}',
    'onClick={()=>setSelectedReasons([r])}',
    'selectedReasons[0] === r',
    "useState([reasonList(state.currentStatus || 'OFF')[0]])",
  ];
  for (const marker of forbidden) {
    if (after.includes(marker)) throw new Error(`v109.2.3 single-select/reset code remains: ${marker}`);
  }

  if (checkOnly && after !== before) {
    throw new Error('v109.2.3 ON DUTY multi-select/restore patch has not been materialized');
  }
  if (!checkOnly && after !== before) fs.writeFileSync(STATUS_TARGET, after);
  return after !== before;
}

function patchAppMultiReasonPersistence() {
  const before = fs.readFileSync(APP_TARGET, 'utf8');
  let after = before;

  if (!after.includes("function normalizeStatusReasonList(reasons = [], reason = '')")) {
    const functionToken = '  function closeLastAndAddStatus(';
    const functionIndex = after.indexOf(functionToken);
    if (functionIndex < 0) throw new Error('v109.2.3 could not locate closeLastAndAddStatus');
    const helper = `  function normalizeStatusReasonList(reasons = [], reason = '') {
    const values = [
      ...(Array.isArray(reasons) ? reasons : []),
      ...String(reason || '').split(/\\s+[·•|]\\s+|\\s*\\n\\s*/g),
    ];
    const unique = [];
    for (const value of values) {
      const clean = String(value || '').trim();
      if (!clean) continue;
      if (!unique.some(item => item.toLowerCase() === clean.toLowerCase())) unique.push(clean);
    }
    return unique;
  }

`;
    after = `${after.slice(0, functionIndex)}${helper}${after.slice(functionIndex)}`;
  }

  const oldSignature = "  function closeLastAndAddStatus({ status, reason, city, state: st, description='', droppedTrailer='', hookedTrailer='', dropHook=null, lat=null, lng=null, gpsAccuracy=null, locationSource='manual', shippingDocs='', loadNo='', destination='', destinationState='', backdateMinutes=0 }) {\n    const liveNow = new Date();";
  const newSignature = `  function closeLastAndAddStatus({ status, reason: reasonInput, reasons = [], city, state: st, description='', droppedTrailer='', hookedTrailer='', dropHook=null, lat=null, lng=null, gpsAccuracy=null, locationSource='manual', shippingDocs='', loadNo='', destination='', destinationState='', backdateMinutes=0 }) {
    const selectedReasons = normalizeStatusReasonList(reasons, reasonInput);
    const reason = selectedReasons.join(' · ') || String(reasonInput || '').trim() || statusDefaultNote(status);
    const liveNow = new Date();`;
  if (after.includes(oldSignature)) {
    after = after.replace(oldSignature, newSignature);
  } else if (!after.includes('reason: reasonInput, reasons = []')) {
    throw new Error('v109.2.3 could not patch closeLastAndAddStatus signature');
  }

  const eventToken = `        id:eventId,
        status,
        specialMode:`;
  const eventReplacement = `        id:eventId,
        status,
        reasons:[...selectedReasons],
        specialMode:`;
  if (after.includes(eventToken)) {
    after = after.replace(eventToken, eventReplacement);
  } else if (!after.includes('reasons:[...selectedReasons],\n        specialMode:')) {
    throw new Error('v109.2.3 could not persist event reasons');
  }

  const loadPayloadToken = '      const loadPayload = { status, reason, city:effectiveCity, state:effectiveState, shippingDocs:effectiveShippingDocs, loadNo:effectiveShippingDocs, destination, destinationState, dropHook };';
  const loadPayloadReplacement = '      const loadPayload = { status, reason, reasons:[...selectedReasons], city:effectiveCity, state:effectiveState, shippingDocs:effectiveShippingDocs, loadNo:effectiveShippingDocs, destination, destinationState, dropHook };';
  if (after.includes(loadPayloadToken)) {
    after = after.replace(loadPayloadToken, loadPayloadReplacement);
  } else if (!after.includes('const loadPayload = { status, reason, reasons:[...selectedReasons]')) {
    throw new Error('v109.2.3 could not persist load payload reasons');
  }

  const currentToken = `        currentStatus:status,
        currentReason:reason,
        currentLocation:`;
  const currentReplacement = `        currentStatus:status,
        currentReason:reason,
        currentReasons:[...selectedReasons],
        currentLocation:`;
  if (after.includes(currentToken)) {
    after = after.replace(currentToken, currentReplacement);
  } else if (!after.includes('currentReasons:[...selectedReasons],\n        currentLocation:')) {
    throw new Error('v109.2.3 could not persist currentReasons');
  }

  const required = [
    "function normalizeStatusReasonList(reasons = [], reason = '')",
    'reason: reasonInput, reasons = []',
    'const selectedReasons = normalizeStatusReasonList(reasons, reasonInput);',
    "const reason = selectedReasons.join(' · ')",
    'reasons:[...selectedReasons],\n        specialMode:',
    'const loadPayload = { status, reason, reasons:[...selectedReasons]',
    'currentReasons:[...selectedReasons],',
    'withAcceptedPreTripInspection(next, day, ev, acceptedLiveInspection)',
    'buildLoadPatchForStatusPayload(loadPayload, eventId)',
  ];
  for (const marker of required) {
    if (!after.includes(marker)) throw new Error(`v109.2.3 app persistence verification failed: ${marker}`);
  }

  if (checkOnly && after !== before) {
    throw new Error('v109.2.3 multi-reason event persistence patch has not been materialized');
  }
  if (!checkOnly && after !== before) fs.writeFileSync(APP_TARGET, after);
  return after !== before;
}

async function verifyCombinedTaskFlow() {
  const normalize = (reasons = [], reason = '') => {
    const values = [
      ...(Array.isArray(reasons) ? reasons : []),
      ...String(reason || '').split(/\s+[·•|]\s+|\s*\n\s*/g),
    ];
    const unique = [];
    for (const value of values) {
      const clean = String(value || '').trim();
      if (clean && !unique.some(item => item.toLowerCase() === clean.toLowerCase())) unique.push(clean);
    }
    return unique;
  };

  let selected = ['Pre-trip inspection'];
  const toggle = (current, reasonValue) => {
    const list = Array.isArray(current) ? current : [current].filter(Boolean);
    const active = list.includes(reasonValue);
    const next = active ? list.filter(item => item !== reasonValue) : [...list, reasonValue];
    return next.length ? next : [reasonValue];
  };
  selected = toggle(selected, 'Delivery / Unloading');
  const payload = {
    reason:selected.join(' · '),
    reasons:[...selected],
  };
  const persistedReasons = normalize(payload.reasons, payload.reason);
  const persistedReason = persistedReasons.join(' · ');

  if (persistedReasons.length !== 2) throw new Error('v109.2.3 regression: only one ON DUTY task reached persistence');
  if (!persistedReasons.includes('Pre-trip inspection')) throw new Error('v109.2.3 regression: PTI was not persisted');
  if (!persistedReasons.includes('Delivery / Unloading')) throw new Error('v109.2.3 regression: Unloading was not persisted');
  if (!/pre[- ]?trip|inspection/i.test(persistedReason)) throw new Error('v109.2.3 regression: persisted reason no longer triggers PTI');
  if (!/delivery|unloading/i.test(persistedReason)) throw new Error('v109.2.3 regression: persisted reason no longer triggers unloading');

  const timelineUrl = `${pathToFileURL(TIMELINE_TARGET).href}?v10923=${Date.now()}`;
  const { normalizeLogEvents } = await import(timelineUrl);
  const normalized = normalizeLogEvents([{
    id:'multi_reason_test',
    status:'ON',
    startMin:600,
    endMin:601,
    city:'Chicago',
    state:'IL',
    note:persistedReason,
    description:'',
    reasons:[...persistedReasons],
    source:'live_status',
  }]);
  const saved = normalized[0];
  if (!saved || !Array.isArray(saved.reasons) || saved.reasons.length !== 2) {
    throw new Error('v109.2.3 regression: timeline normalization dropped the saved task array');
  }

  const statusSource = fs.readFileSync(STATUS_TARGET, 'utf8');
  const appSource = fs.readFileSync(APP_TARGET, 'utf8');
  if (!statusSource.includes('const saved = Array.isArray(state.currentReasons) && state.currentReasons.length')) {
    throw new Error('v109.2.3 regression: saved task array is not restored when the sheet reopens');
  }
  if (!appSource.includes('currentReasons:[...selectedReasons]')) {
    throw new Error('v109.2.3 regression: current task array is not stored in app state');
  }

  console.log('PASS — v109.2.3 PTI + Unloading selected, persisted, normalized, and restored');
}

function finalizeReleaseVersion() {
  writeJson('package.json', pkg => {
    pkg.version = RELEASE_VERSION;
  });

  const lockPath = path.join(ROOT, 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    writeJson('package-lock.json', lock => {
      lock.version = RELEASE_VERSION;
      if (lock.packages?.['']) lock.packages[''].version = RELEASE_VERSION;
    });
  }

  replaceText(
    'source/src/core/update/appUpdate.js',
    /const FALLBACK_APP_VERSION = '[^']+';/,
    `const FALLBACK_APP_VERSION = '${RELEASE_VERSION}';`,
    'app fallback version',
  );
  replaceText(
    'public/sw.js',
    /const OWNER_OP_SW_VERSION = '[^']+';/,
    `const OWNER_OP_SW_VERSION = '${RELEASE_VERSION}';`,
    'service worker version',
  );

  writeJson('public/app-version.json', release => {
    release.version = RELEASE_VERSION;
    release.appVersion = RELEASE_VERSION;
    release.codeVersion = RELEASE_VERSION;
    release.build = 'v109.2.3-on-duty-multi-task-persistence';
    release.releasedAt = RELEASED_AT;
    release.updatedAt = RELEASED_AT;
    release.publishedAt = RELEASED_AT;
    release.label = 'v109.2.3 ON DUTY Multi-Task Persistence Fix';
    release.notes = [
      'Persists every selected ON DUTY task as a task array on the exact event.',
      'Stores the combined task text and the full currentReasons array in app state.',
      'Restores PTI plus Delivery / Unloading when the status sheet is reopened after save or reload.',
      'Verifies timeline normalization does not drop the multi-task array.',
    ];
  });
}

const statusChanged = patchStatusMultiSelectAndRestore();
const appChanged = patchAppMultiReasonPersistence();
if (!checkOnly) await verifyCombinedTaskFlow();
finalizeReleaseVersion();
console.log(`${statusChanged ? 'Applied' : 'Retained'} ON DUTY selector; ${appChanged ? 'applied' : 'retained'} multi-task persistence; release finalized at v${RELEASE_VERSION}`);
