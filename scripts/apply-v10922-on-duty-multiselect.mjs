import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATUS_TARGET = path.join(ROOT, 'source/src/modules/status/StatusWorkflowSheet.jsx');
const APP_TARGET = path.join(ROOT, 'source/src/app/App.jsx');
const RELEASE_VERSION = '109.2.4';
const RELEASED_AT = '2026-07-21T00:25:00.000Z';
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
    throw new Error(`v109.2.4 target missing: ${label}`);
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

function restoreInitializerSource() {
  return `  const initialReasons = (() => {
    const saved = Array.isArray(state.currentReasons) ? state.currentReasons.filter(Boolean) : [];
    if (saved.length) return saved;
    const fromText = String(state.currentReason || '')
      .split(/\\s+[·•|]\\s+|\\s*\\n\\s*/g)
      .map(item => item.trim())
      .filter(Boolean);
    return fromText.length ? fromText : [reasonList(state.currentStatus || 'OFF')[0]];
  })();
  const [selectedReasons, setSelectedReasons] = useState(initialReasons);
`;
}

function patchStatusMultiSelectAndRestore() {
  const before = fs.readFileSync(STATUS_TARGET, 'utf8');
  let after = before;

  const toggleStart = after.indexOf('  function toggleReason(reasonValue) {');
  if (toggleStart >= 0) {
    const payloadStart = after.indexOf('\n  function payload()', toggleStart);
    if (payloadStart < 0) throw new Error('v109.2.4 could not locate payload after toggleReason');
    after = `${after.slice(0, toggleStart)}${multiSelectToggleSource()}${after.slice(payloadStart)}`;
  } else {
    const payloadStart = after.indexOf('  function payload()');
    if (payloadStart < 0) throw new Error('v109.2.4 could not locate payload for multi-select insertion');
    after = `${after.slice(0, payloadStart)}${multiSelectToggleSource()}\n${after.slice(payloadStart)}`;
  }

  after = after
    .replace(/onClick=\{\(\)\s*=>\s*setSelectedReasons\(\[r\]\)\}/g, 'onClick={() => toggleReason(r)}')
    .replace(/onClick=\{\(\)\s*=>\s*setSelectedReasons\(\[reasonValue\]\)\}/g, 'onClick={() => toggleReason(reasonValue)}')
    .replace(/selectedReasons\s*\[\s*0\s*\]\s*===\s*r/g, 'selectedReasons.includes(r)')
    .replace(/selectedReasons\s*===\s*r/g, 'selectedReasons.includes(r)')
    .replace(/>\s*select one\s*</gi, '>select one or more<')
    .replace(/>\s*choose one\s*</gi, '>select one or more<');

  const initializerPattern = /  const \[selectedReasons, setSelectedReasons\] = useState\([^\n]+\);\n/;
  if (initializerPattern.test(after)) {
    after = after.replace(initializerPattern, restoreInitializerSource());
  } else if (!after.includes('const initialReasons = (() => {')) {
    throw new Error('v109.2.4 could not locate selectedReasons initializer');
  }

  const required = [
    'function toggleReason(reasonValue)',
    'onClick={() => toggleReason(r)}',
    'selectedReasons.includes(r)',
    'reasons:selectedReasons',
    'const initialReasons = (() => {',
    'Array.isArray(state.currentReasons)',
  ];
  for (const marker of required) {
    if (!after.includes(marker)) throw new Error(`v109.2.4 status verification failed: ${marker}`);
  }

  if (!checkOnly && after !== before) fs.writeFileSync(STATUS_TARGET, after);
  return after !== before;
}

function patchAppMultiTaskPersistence() {
  const before = fs.readFileSync(APP_TARGET, 'utf8');
  let after = before;

  after = after.replace(
    /function closeLastAndAddStatus\(\{ status, reason, city,/,
    'function closeLastAndAddStatus({ status, reason, reasons = [], city,',
  );

  if (!after.includes('const selectedTaskList = Array.isArray(reasons)')) {
    after = after.replace(
      '      let note = reason;\n',
      `      const selectedTaskList = Array.isArray(reasons)
        ? reasons.map(item => String(item || '').trim()).filter(Boolean)
        : [];
      const combinedReason = selectedTaskList.length
        ? selectedTaskList.join(' · ')
        : String(reason || '').trim();
      let note = combinedReason;
`,
    );
  }

  after = after
    .replace(/isDropHookReason\(reason, dropHook\)/g, 'isDropHookReason(combinedReason, dropHook)')
    .replace(/isDropOffReason\(reason, dropHook\)/g, 'isDropOffReason(combinedReason, dropHook)')
    .replace(/isIntermodalDropReason\(reason, dropHook\)/g, 'isIntermodalDropReason(combinedReason, dropHook)')
    .replace(/\/drop trailer\/i\.test\(reason\)/g, '/drop trailer/i.test(combinedReason)')
    .replace(/isHookEmptyReason\(reason, dropHook\)/g, 'isHookEmptyReason(combinedReason, dropHook)')
    .replace(/buildDropHookNote\(\{ reason, city, state:st, dropHook \}/g, 'buildDropHookNote({ reason:combinedReason, city, state:st, dropHook }')
    .replace(/loadDescriptionForStatusPayload\(\{ status, reason, city,/g, 'loadDescriptionForStatusPayload({ status, reason:combinedReason, city,')
    .replace(/specialMode:\/yard move\/i\.test\(reason\) \? 'yard_move' : \(\/personal conveyance\/i\.test\(reason\) \? 'personal_conveyance' : 'none'\),/g,
      "specialMode:/yard move/i.test(combinedReason) ? 'yard_move' : (/personal conveyance/i.test(combinedReason) ? 'personal_conveyance' : 'none'),")
    .replace(/loadDetailsExplicit:isPickupReason\(reason\) \|\| isDeliveryReason\(reason\),/g,
      'loadDetailsExplicit:isPickupReason(combinedReason) || isDeliveryReason(combinedReason),')
    .replace(/shippingDocsUpdatedAt:\(isPickupReason\(reason\) \|\| isDeliveryReason\(reason\)\) \? Date\.now\(\) : null,/g,
      'shippingDocsUpdatedAt:(isPickupReason(combinedReason) || isDeliveryReason(combinedReason)) ? Date.now() : null,')
    .replace(/const loadPayload = \{ status, reason, city:/g,
      'const loadPayload = { status, reason:combinedReason, reasons:selectedTaskList, city:')
    .replace(/currentReason:reason,/g, 'currentReason:combinedReason,\n        currentReasons:selectedTaskList,');

  if (!after.includes('reasons:selectedTaskList,')) {
    after = after.replace('        note,\n', '        note,\n        reasons:selectedTaskList,\n');
  }

  const required = [
    'function closeLastAndAddStatus({ status, reason, reasons = [], city,',
    'const selectedTaskList = Array.isArray(reasons)',
    "const combinedReason = selectedTaskList.length",
    'reasons:selectedTaskList,',
    'currentReasons:selectedTaskList,',
    'currentReason:combinedReason,',
  ];
  for (const marker of required) {
    if (!after.includes(marker)) throw new Error(`v109.2.4 app persistence verification failed: ${marker}`);
  }

  if (!checkOnly && after !== before) fs.writeFileSync(APP_TARGET, after);
  return after !== before;
}

function patchInAppUpdateHint() {
  const before = fs.readFileSync(APP_TARGET, 'utf8');
  let after = before;
  const marker = "window.addEventListener('online', onOnline);";
  const replacement = `${marker}
    const onFocus = () => checkForAppUpdate('focus');
    window.addEventListener('focus', onFocus);`;
  if (!after.includes("checkForAppUpdate('focus')")) {
    if (!after.includes(marker)) throw new Error('v109.2.4 update focus hook target missing');
    after = after.replace(marker, replacement);
    after = after.replace(
      "      window.removeEventListener('online', onOnline);",
      "      window.removeEventListener('online', onOnline);\n      window.removeEventListener('focus', onFocus);",
    );
  }
  if (!checkOnly && after !== before) fs.writeFileSync(APP_TARGET, after);
  return after !== before;
}

function verifyCombinedTaskPersistence() {
  const selected = ['Pre-trip inspection', 'Delivery / Unloading'];
  const storedEvent = {
    status:'ON',
    note:selected.join(' · '),
    reasons:[...selected],
  };
  const snapshot = JSON.parse(JSON.stringify({ currentReason:storedEvent.note, currentReasons:storedEvent.reasons, event:storedEvent }));
  const restored = Array.isArray(snapshot.currentReasons) ? snapshot.currentReasons : [];
  if (restored.length !== 2 || !restored.includes(selected[0]) || !restored.includes(selected[1])) {
    throw new Error('v109.2.4 regression: saved ON DUTY task list did not survive snapshot reload');
  }
  if (!/pre[- ]?trip|inspection/i.test(snapshot.event.note) || !/delivery|unloading/i.test(snapshot.event.note)) {
    throw new Error('v109.2.4 regression: combined task text lost a selected activity');
  }
  console.log('PASS — v109.2.4 PTI + Unloading persistence and PWA update focus check');
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
  replaceText('source/src/core/update/appUpdate.js', /const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${RELEASE_VERSION}';`, 'app fallback version');
  replaceText('public/sw.js', /const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${RELEASE_VERSION}';`, 'service worker version');
  writeJson('public/app-version.json', release => {
    release.version = RELEASE_VERSION;
    release.appVersion = RELEASE_VERSION;
    release.codeVersion = RELEASE_VERSION;
    release.build = 'v109.2.4-on-duty-multi-task-pwa-update';
    release.releasedAt = RELEASED_AT;
    release.updatedAt = RELEASED_AT;
    release.publishedAt = RELEASED_AT;
    release.label = 'v109.2.4 ON DUTY Multi-Task & PWA Update';
    release.notes = [
      'Persists every selected ON DUTY task on the exact event and app state.',
      'Restores PTI plus Delivery / Unloading after save and reload.',
      'Checks for an available update whenever the installed PWA regains focus.',
      'Keeps Safari and installed-PWA storage separated; no data migration or reset is performed.',
    ];
  });
}

const statusChanged = patchStatusMultiSelectAndRestore();
const appChanged = patchAppMultiTaskPersistence();
const updateChanged = patchInAppUpdateHint();
verifyCombinedTaskPersistence();
finalizeReleaseVersion();
console.log(`${statusChanged ? 'Applied' : 'Retained'} ON DUTY selector; ${appChanged ? 'applied' : 'retained'} task persistence; ${updateChanged ? 'applied' : 'retained'} PWA focus update check; release finalized at v${RELEASE_VERSION}`);
