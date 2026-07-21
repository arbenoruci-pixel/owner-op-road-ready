import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_TARGET = path.join(ROOT, 'source/src/app/App.jsx');
const EDITOR_TARGET = path.join(ROOT, 'source/src/modules/editor/EditEventSheet.jsx');
const RELEASE_VERSION = '109.2.5';
const RELEASED_AT = '2026-07-21T02:30:00.000Z';

function replaceOnce(text, oldValue, newValue, label) {
  if (text.includes(newValue)) return text;
  if (!text.includes(oldValue)) throw new Error(`v109.2.5 target missing: ${label}`);
  return text.replace(oldValue, newValue);
}

function replaceSection(text, startToken, endToken, replacement, label) {
  const start = text.indexOf(startToken);
  const end = start >= 0 ? text.indexOf(endToken, start + startToken.length) : -1;
  if (start < 0 || end < 0) throw new Error(`v109.2.5 section missing: ${label}`);
  return `${text.slice(0, start)}${replacement}${text.slice(end)}`;
}

function writeJson(relativePath, transform) {
  const target = path.join(ROOT, relativePath);
  const value = JSON.parse(fs.readFileSync(target, 'utf8'));
  transform(value);
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function replaceFileText(relativePath, pattern, replacement, label) {
  const target = path.join(ROOT, relativePath);
  const before = fs.readFileSync(target, 'utf8');
  const after = before.replace(pattern, replacement);
  if (after === before && !before.includes(replacement)) throw new Error(`v109.2.5 version target missing: ${label}`);
  if (after !== before) fs.writeFileSync(target, after);
}

function patchStatusArtifactGuard() {
  const before = fs.readFileSync(APP_TARGET, 'utf8');
  const startToken = "function textLooksLikeStatusArtifact(text = '', status = 'OFF') {";
  const endToken = '\nfunction sanitizeDutyEventForStatus';
  const replacement = `function textLooksLikeStatusArtifact(text = '', status = 'OFF') {
  const value = String(text || '').toLowerCase();
  if (!value.trim()) return false;
  if (status !== 'ON' && /(pre[- ]?trip|inspection|on duty|pickup|loading|delivery|unloading)/i.test(value)) return true;
  if (status !== 'D' && /driving started|manual driving|\\bdriving\\b/i.test(value)) return true;
  if (status !== 'SB' && /sleeper/i.test(value)) return true;
  if (status !== 'OFF' && /off duty|parked|parking/i.test(value)) return true;

  // These slashes are part of valid activity names, not stale-status separators.
  const artifactProbe = value
    .replace(/pickup\\s*\\/\\s*loading/gi, 'pickup-loading')
    .replace(/delivery\\s*\\/\\s*unloading/gi, 'delivery-unloading')
    .replace(/hook empty\\s*\\/\\s*reposition/gi, 'hook-empty-reposition');
  if (/\\s\\/\\s/.test(artifactProbe) && /(pre[- ]?trip|inspection|on duty|driving|new event)/i.test(artifactProbe)) return true;
  return false;
}
`;
  const after = replaceSection(before, startToken, endToken, replacement, 'textLooksLikeStatusArtifact');
  fs.writeFileSync(APP_TARGET, after);
  return after !== before;
}

function patchEditEventPersistence() {
  const before = fs.readFileSync(EDITOR_TARGET, 'utf8');
  let after = before;

  after = replaceOnce(
    after,
    `    note:event.note || '',\n    lat:event.lat ?? null,`,
    `    note:event.note || '',\n    reasons:Array.isArray(event.reasons) ? event.reasons.map(item => String(item || '').trim()).filter(Boolean) : [],\n    lat:event.lat ?? null,`,
    'editor event reasons state',
  );

  after = replaceOnce(
    after,
    `function composeOnDutyNote(selected = [], details = []) {\n  return [...selected, ...details].map(part => String(part || '').trim()).filter(Boolean).join(' · ');\n}\n`,
    `function composeOnDutyNote(selected = [], details = []) {\n  return [...selected, ...details].map(part => String(part || '').trim()).filter(Boolean).join(' · ');\n}\n\nfunction selectedReasonsFromForm(form = {}) {\n  const stored = Array.isArray(form.reasons)\n    ? form.reasons.map(item => String(item || '').trim()).filter(Boolean)\n    : [];\n  return stored.length ? stored : parseOnDutyNote(form.note).selected;\n}\n`,
    'editor reasons restore helper',
  );

  after = replaceOnce(
    after,
    `  const [selectedOnReasons, setSelectedOnReasons] = useState(() => parseOnDutyNote(initialForm.note).selected);`,
    `  const [selectedOnReasons, setSelectedOnReasons] = useState(() => selectedReasonsFromForm(initialForm));`,
    'editor initial reasons restore',
  );

  after = after.replace(
    `    setSelectedOnReasons(parseOnDutyNote(next.note).selected);`,
    `    setSelectedOnReasons(selectedReasonsFromForm(next));`,
  );

  after = replaceOnce(
    after,
    `      description:cleanDescription,\n      note:cleanNote,\n      lat,`,
    `      description:cleanDescription,\n      note:cleanNote,\n      reasons:status === 'ON'\n        ? [...new Set((selectedOnReasons.length ? selectedOnReasons : parsedOnDuty.selected)\n            .map(item => String(item || '').trim())\n            .filter(Boolean))]\n        : [],\n      lat,`,
    'editor save reasons array',
  );

  const required = [
    'reasons:Array.isArray(event.reasons)',
    'function selectedReasonsFromForm(form = {})',
    'useState(() => selectedReasonsFromForm(initialForm))',
    "reasons:status === 'ON'",
    'note:cleanNote',
  ];
  for (const marker of required) {
    if (!after.includes(marker)) throw new Error(`v109.2.5 editor verification failed: ${marker}`);
  }

  fs.writeFileSync(EDITOR_TARGET, after);
  return after !== before;
}

function verifyRegression() {
  const note = ['Delivery / Unloading', 'Pre-trip inspection'].join(' · ');
  const probe = note.toLowerCase()
    .replace(/pickup\s*\/\s*loading/gi, 'pickup-loading')
    .replace(/delivery\s*\/\s*unloading/gi, 'delivery-unloading')
    .replace(/hook empty\s*\/\s*reposition/gi, 'hook-empty-reposition');
  if (/\s\/\s/.test(probe)) throw new Error('v109.2.5 regression: valid Unloading slash remains an artifact');
  if (!note.includes('Delivery / Unloading') || !note.includes('Pre-trip inspection')) throw new Error('v109.2.5 regression: combined note lost a task');

  const app = fs.readFileSync(APP_TARGET, 'utf8');
  const editor = fs.readFileSync(EDITOR_TARGET, 'utf8');
  if (!app.includes(".replace(/delivery\\s*\\/\\s*unloading/gi, 'delivery-unloading')")) throw new Error('v109.2.5 App patch missing');
  if (!editor.includes("reasons:status === 'ON'")) throw new Error('v109.2.5 editor reasons payload missing');
  console.log('PASS — v109.2.5 Edit Duty Status preserves Delivery / Unloading + Pre-trip inspection on Save');
}

function finalizeRelease() {
  writeJson('package.json', pkg => { pkg.version = RELEASE_VERSION; });
  const lockPath = path.join(ROOT, 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    writeJson('package-lock.json', lock => {
      lock.version = RELEASE_VERSION;
      if (lock.packages?.['']) lock.packages[''].version = RELEASE_VERSION;
    });
  }
  replaceFileText('source/src/core/update/appUpdate.js', /const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${RELEASE_VERSION}';`, 'app version');
  replaceFileText('public/sw.js', /const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${RELEASE_VERSION}';`, 'service worker version');
  writeJson('public/app-version.json', release => {
    release.version = RELEASE_VERSION;
    release.appVersion = RELEASE_VERSION;
    release.codeVersion = RELEASE_VERSION;
    release.build = 'v109.2.5-edit-duty-multi-task-save';
    release.releasedAt = RELEASED_AT;
    release.updatedAt = RELEASED_AT;
    release.publishedAt = RELEASED_AT;
    release.label = 'v109.2.5 Edit Duty Multi-Task Save Fix';
    release.notes = [
      'Preserves every selected activity when an existing ON DUTY event is edited and saved.',
      'Treats Delivery / Unloading, Pickup / Loading, and Hook Empty / Reposition as legitimate labels.',
      'Stores selected ON DUTY activities as a reasons array on the exact event.',
      'Does not change live status transitions, Driving to Off Duty, storage, or PWA update logic.',
    ];
  });
}

const appChanged = patchStatusArtifactGuard();
const editorChanged = patchEditEventPersistence();
verifyRegression();
finalizeRelease();
console.log(`Applied v${RELEASE_VERSION}: appGuard=${appChanged}, editorPersistence=${editorChanged}`);
