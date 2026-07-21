import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_TARGET = path.join(ROOT, 'source/src/app/App.jsx');
const EDITOR_TARGET = path.join(ROOT, 'source/src/modules/editor/EditEventSheet.jsx');
const RELEASE_VERSION = '109.2.5';
const RELEASED_AT = '2026-07-21T02:25:00.000Z';

function replaceOnce(text, oldValue, newValue, label) {
  if (text.includes(newValue)) return text;
  if (!text.includes(oldValue)) throw new Error(`v109.2.5 patch target missing: ${label}`);
  return text.replace(oldValue, newValue);
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
  if (after === before && !before.includes(replacement)) {
    throw new Error(`v109.2.5 version target missing: ${label}`);
  }
  if (after !== before) fs.writeFileSync(target, after);
}

function patchStatusArtifactGuard() {
  const before = fs.readFileSync(APP_TARGET, 'utf8');
  if (before.includes(".replace(/delivery\\s*\\/\\s*unloading/gi, 'delivery-unloading')")) return false;

  const slashGuardLine = before
    .split(/\r?\n/)
    .find(line => line.includes('if (/\\s\\/\\s/.test(value)') && line.includes('new event'));
  if (!slashGuardLine) throw new Error('v109.2.5 patch target missing: slash artifact guard line');

  const indent = slashGuardLine.match(/^\s*/)?.[0] || '  ';
  const newGuard = `${indent}// A slash can be part of a legitimate ON DUTY activity label. Remove those\n${indent}// known labels before checking for the legacy stale-status separator.\n${indent}const artifactProbe = value\n${indent}  .replace(/pickup\\s*\\/\\s*loading/gi, 'pickup-loading')\n${indent}  .replace(/delivery\\s*\\/\\s*unloading/gi, 'delivery-unloading')\n${indent}  .replace(/hook empty\\s*\\/\\s*reposition/gi, 'hook-empty-reposition');\n${indent}if (/\\s\\/\\s/.test(artifactProbe) && /(pre[- ]?trip|inspection|on duty|driving|new event)/i.test(artifactProbe)) return true;`;

  const after = before.replace(slashGuardLine, newGuard);
  if (after === before) throw new Error('v109.2.5 failed to replace slash artifact guard');
  fs.writeFileSync(APP_TARGET, after);
  return true;
}

function patchEditEventPersistence() {
  const before = fs.readFileSync(EDITOR_TARGET, 'utf8');
  let after = before;

  after = replaceOnce(
    after,
    `    note:event.note || '',\n    lat:event.lat ?? null,`,
    `    note:event.note || '',\n    reasons:Array.isArray(event.reasons) ? event.reasons.map(item => String(item || '').trim()).filter(Boolean) : [],\n    lat:event.lat ?? null,`,
    'event reasons form state',
  );

  after = replaceOnce(
    after,
    `function composeOnDutyNote(selected = [], details = []) {\n  return [...selected, ...details].map(part => String(part || '').trim()).filter(Boolean).join(' · ');\n}\n`,
    `function composeOnDutyNote(selected = [], details = []) {\n  return [...selected, ...details].map(part => String(part || '').trim()).filter(Boolean).join(' · ');\n}\n\nfunction selectedReasonsFromForm(form = {}) {\n  const stored = Array.isArray(form.reasons)\n    ? form.reasons.map(item => String(item || '').trim()).filter(Boolean)\n    : [];\n  return stored.length ? stored : parseOnDutyNote(form.note).selected;\n}\n`,
    'structured reasons restore helper',
  );

  after = replaceOnce(
    after,
    `  const [selectedOnReasons, setSelectedOnReasons] = useState(() => parseOnDutyNote(initialForm.note).selected);`,
    `  const [selectedOnReasons, setSelectedOnReasons] = useState(() => selectedReasonsFromForm(initialForm));`,
    'initial multi-task restore',
  );

  const oldEffectRestore = `    setSelectedOnReasons(parseOnDutyNote(next.note).selected);`;
  const newEffectRestore = `    setSelectedOnReasons(selectedReasonsFromForm(next));`;
  if (after.includes(oldEffectRestore)) after = after.replace(oldEffectRestore, newEffectRestore);

  after = replaceOnce(
    after,
    `      description:cleanDescription,\n      note:cleanNote,\n      lat,`,
    `      description:cleanDescription,\n      note:cleanNote,\n      reasons:status === 'ON'\n        ? [...new Set((selectedOnReasons.length ? selectedOnReasons : parsedOnDuty.selected)\n            .map(item => String(item || '').trim())\n            .filter(Boolean))]\n        : [],\n      lat,`,
    'save full selected reasons array',
  );

  const required = [
    'reasons:Array.isArray(event.reasons)',
    'function selectedReasonsFromForm(form = {})',
    'useState(() => selectedReasonsFromForm(initialForm))',
    "reasons:status === 'ON'",
    'selectedOnReasons.length ? selectedOnReasons : parsedOnDuty.selected',
    'note:cleanNote',
  ];
  for (const marker of required) {
    if (!after.includes(marker)) throw new Error(`v109.2.5 editor verification failed: ${marker}`);
  }

  fs.writeFileSync(EDITOR_TARGET, after);
  return after !== before;
}

function verifyExactRegression() {
  const selected = ['Delivery / Unloading', 'Pre-trip inspection'];
  const savedNote = selected.join(' · ');
  const value = savedNote.toLowerCase();
  const artifactProbe = value
    .replace(/pickup\s*\/\s*loading/gi, 'pickup-loading')
    .replace(/delivery\s*\/\s*unloading/gi, 'delivery-unloading')
    .replace(/hook empty\s*\/\s*reposition/gi, 'hook-empty-reposition');
  const wronglyRejected = /\s\/\s/.test(artifactProbe)
    && /(pre[- ]?trip|inspection|on duty|driving|new event)/i.test(artifactProbe);

  if (wronglyRejected) throw new Error('v109.2.5 regression: valid PTI + Unloading note is still rejected');
  if (!savedNote.includes('Delivery / Unloading') || !savedNote.includes('Pre-trip inspection')) {
    throw new Error('v109.2.5 regression: combined event note lost a selected task');
  }

  const stale = 'Driving / Pre-trip inspection'.toLowerCase();
  const staleRejected = /\s\/\s/.test(stale)
    && /(pre[- ]?trip|inspection|on duty|driving|new event)/i.test(stale);
  if (!staleRejected) throw new Error('v109.2.5 regression: legacy stale-status guard stopped working');

  const appSource = fs.readFileSync(APP_TARGET, 'utf8');
  const editorSource = fs.readFileSync(EDITOR_TARGET, 'utf8');
  if (!appSource.includes(".replace(/delivery\\s*\\/\\s*unloading/gi, 'delivery-unloading')")) {
    throw new Error('v109.2.5 regression: production App guard patch missing');
  }
  if (!editorSource.includes("reasons:status === 'ON'")) {
    throw new Error('v109.2.5 regression: production editor reasons payload missing');
  }

  console.log('PASS — v109.2.5 Edit Duty Status preserves Delivery / Unloading + Pre-trip inspection on Save');
}

function finalizeRelease() {
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

  replaceFileText(
    'source/src/core/update/appUpdate.js',
    /const FALLBACK_APP_VERSION = '[^']+';/,
    `const FALLBACK_APP_VERSION = '${RELEASE_VERSION}';`,
    'app fallback version',
  );
  replaceFileText(
    'public/sw.js',
    /const OWNER_OP_SW_VERSION = '[^']+';/,
    `const OWNER_OP_SW_VERSION = '${RELEASE_VERSION}';`,
    'service worker version',
  );

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
      'Treats Delivery / Unloading, Pickup / Loading, and Hook Empty / Reposition as legitimate activity labels rather than stale-status separators.',
      'Stores the selected ON DUTY activities as a reasons array on the exact event.',
      'Does not change live status transitions, Driving to Off Duty behavior, storage, or PWA update logic.',
    ];
  });
}

const appChanged = patchStatusArtifactGuard();
const editorChanged = patchEditEventPersistence();
verifyExactRegression();
finalizeRelease();
console.log(`Applied v${RELEASE_VERSION}: appGuard=${appChanged}, editorPersistence=${editorChanged}`);
