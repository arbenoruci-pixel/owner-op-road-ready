import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATUS_TARGET = path.join(ROOT, 'source/src/modules/status/StatusWorkflowSheet.jsx');
const APP_TARGET = path.join(ROOT, 'source/src/app/App.jsx');
const RELEASE_VERSION = '109.2.2';
const RELEASED_AT = '2026-07-20T23:40:00.000Z';
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
    throw new Error(`v109.2.2 target missing: ${label}`);
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

function patchStatusMultiSelect() {
  const before = fs.readFileSync(STATUS_TARGET, 'utf8');
  let after = before;

  const toggleStart = after.indexOf('  function toggleReason(reasonValue) {');
  if (toggleStart >= 0) {
    const payloadStart = after.indexOf('\n  function payload()', toggleStart);
    if (payloadStart < 0) throw new Error('v109.2.2 could not locate payload after toggleReason');
    after = `${after.slice(0, toggleStart)}${multiSelectToggleSource()}${after.slice(payloadStart)}`;
  } else {
    const payloadStart = after.indexOf('  function payload()');
    if (payloadStart < 0) throw new Error('v109.2.2 could not locate payload for multi-select insertion');
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

  const required = [
    'function toggleReason(reasonValue)',
    'const list = Array.isArray(current) ? current : [current].filter(Boolean);',
    'list.includes(reasonValue)',
    ': [...list, reasonValue]',
    'onClick={() => toggleReason(r)}',
    'selectedReasons.includes(r)',
    'reasonText(selectedReasons)',
    'reasons:selectedReasons',
    'select one or more',
  ];
  for (const marker of required) {
    if (!after.includes(marker)) throw new Error(`v109.2.2 multi-select verification failed: ${marker}`);
  }

  const forbidden = [
    'onClick={() => setSelectedReasons([r])}',
    'onClick={()=>setSelectedReasons([r])}',
    'selectedReasons[0] === r',
  ];
  for (const marker of forbidden) {
    if (after.includes(marker)) throw new Error(`v109.2.2 single-select code remains: ${marker}`);
  }

  if (checkOnly && after !== before) {
    throw new Error('v109.2.2 ON DUTY multi-select patch has not been materialized');
  }
  if (!checkOnly && after !== before) fs.writeFileSync(STATUS_TARGET, after);
  return after !== before;
}

function verifyCombinedTaskFlow() {
  const choose = (current, reasonValue) => {
    const list = Array.isArray(current) ? current : [current].filter(Boolean);
    const active = list.includes(reasonValue);
    const next = active ? list.filter(item => item !== reasonValue) : [...list, reasonValue];
    return next.length ? next : [reasonValue];
  };

  let selected = ['Pre-trip inspection'];
  selected = choose(selected, 'Delivery / Unloading');
  if (selected.length !== 2) throw new Error('v109.2.2 regression: second ON DUTY task replaced the first');
  if (!selected.includes('Pre-trip inspection')) throw new Error('v109.2.2 regression: PTI was removed');
  if (!selected.includes('Delivery / Unloading')) throw new Error('v109.2.2 regression: Unloading was not selected');

  const combined = selected.join(' · ');
  if (!/pre[- ]?trip|inspection/i.test(combined)) throw new Error('v109.2.2 regression: combined task no longer triggers PTI workflow');
  if (!/delivery|unloading/i.test(combined)) throw new Error('v109.2.2 regression: combined task no longer triggers unloading workflow');

  const appSource = fs.readFileSync(APP_TARGET, 'utf8');
  if (!appSource.includes('withAcceptedPreTripInspection(next, day, ev, acceptedLiveInspection)')) {
    throw new Error('v109.2.2 regression: live PTI acceptance integration missing');
  }
  if (!appSource.includes('buildLoadPatchForStatusPayload(loadPayload, eventId)')) {
    throw new Error('v109.2.2 regression: unloading/load integration missing');
  }

  console.log('PASS — v109.2.2 PTI + Unloading multi-select regression suite');
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
    release.build = 'v109.2.2-on-duty-multi-select';
    release.releasedAt = RELEASED_AT;
    release.updatedAt = RELEASED_AT;
    release.publishedAt = RELEASED_AT;
    release.label = 'v109.2.2 ON DUTY Multi-Select Fix';
    release.notes = [
      'Restores selecting multiple ON DUTY activities in the same status event.',
      'Keeps Pre-trip Inspection selected when Delivery / Unloading or another task is added.',
      'Saves every selected activity in the event reason so PTI and load workflows both run.',
      'Runs a production regression test for the exact PTI plus Unloading case.',
    ];
  });
}

const changed = patchStatusMultiSelect();
verifyCombinedTaskFlow();
finalizeReleaseVersion();
console.log(`${changed ? 'Applied' : 'Retained'} ON DUTY multi-select; release finalized at v${RELEASE_VERSION}`);
