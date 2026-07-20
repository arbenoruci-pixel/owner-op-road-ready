import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'source/src/modules/status/StatusWorkflowSheet.jsx');
const checkOnly = process.argv.includes('--check');
const original = fs.readFileSync(TARGET, 'utf8');
let text = original;

const RELEASE_VERSION = '109.1.1';
const RELEASED_AT = '2026-07-20T23:05:00.000Z';

function insertBefore(token, content, marker, label) {
  if (text.includes(marker)) return;
  const index = text.indexOf(token);
  if (index < 0) throw new Error(`v109.1 patch target missing: ${label}`);
  text = `${text.slice(0, index)}${content}${text.slice(index)}`;
}

function replaceSection(startToken, endToken, content, marker, label) {
  if (text.includes(marker)) return;
  const start = text.indexOf(startToken);
  const end = start >= 0 ? text.indexOf(endToken, start + startToken.length) : -1;
  if (start < 0 || end < 0) throw new Error(`v109.1 patch target missing: ${label}`);
  text = `${text.slice(0, start)}${content}${text.slice(end)}`;
}

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
    throw new Error(`v109.1 release version target missing: ${label}`);
  }
  if (!checkOnly && after !== before) fs.writeFileSync(target, after);
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
    release.build = 'v109.1.1-storage-persistence';
    release.releasedAt = RELEASED_AT;
    release.updatedAt = RELEASED_AT;
    release.publishedAt = RELEASED_AT;
    release.label = 'v109.1.1 Storage Persistence Fix';
    release.notes = [
      'Persists every app snapshot to IndexedDB and a local browser fallback.',
      'Verifies IndexedDB writes by reading the saved snapshot back before reporting success.',
      'Restores the newest available snapshot after an iPhone or PWA storage interruption.',
      'Forces the installed PWA and service worker to load the corrected storage bundle.',
    ];
  });
}

insertBefore(
  'export default function StatusWorkflowSheet',
  `function currentTrailerLabel(state = {}) {
  const value = String(state.currentTrailer || state.equipment?.trailer || '').trim();
  if (!value || /^(no|none|n\\/?a)\\s*(trailer|equipment)?$/i.test(value)) return '';
  return value;
}\n\n`,
  'function currentTrailerLabel(state = {})',
  'currentTrailerLabel helper',
);

replaceSection(
  '  function payload() {',
  '\n  function save() {',
  `  function payload() {
    const parsedLoc = parseLocationText(locationText, st || '');
    const parsedDest = parseDestinationState(destination);
    const selectedReason = reasonText(selectedReasons) || reasonList(status)[0];
    const currentTrailer = currentTrailerLabel(state);
    const trailerDrop = reasonNeedsDropOff(status, selectedReasons)
      && !dropContainer.trim()
      && !dropChassis.trim()
      && !!currentTrailer;
    const reason = trailerDrop ? 'Drop Trailer' : selectedReason;
    const hookEmpty = reasonNeedsHookEmpty(status, selectedReasons);
    const transitionDocs = (reasonNeedsDropHook(status, selectedReasons) || hookEmpty) ? hookLoadNo.trim().toUpperCase() : shippingDocs.trim();
    return {
      status,
      reason,
      reasons:selectedReasons,
      city: parsedLoc.city,
      state: parsedLoc.state,
      description: notes,
      droppedTrailer: trailerDrop ? currentTrailer : '',
      hookedTrailer: '',
      shippingDocs: transitionDocs,
      loadNo: transitionDocs,
      destination: locationString(parsedDest.city, parsedDest.state) || destination.trim(),
      destinationState: parsedDest.state || '',
      dropHook: {
        mode: trailerDrop ? '' : (reasonNeedsDropOff(status, selectedReasons) ? 'drop_off' : (reasonNeedsDropHook(status, selectedReasons) ? 'drop_hook' : (hookEmpty ? 'hook_empty' : ''))),
        droppedContainer: dropContainer.trim().toUpperCase(),
        droppedChassis: dropChassis.trim().toUpperCase(),
        hookedContainer: hookContainer.trim().toUpperCase(),
        hookedChassis: hookChassis.trim().toUpperCase(),
        hookedSeal: hookSeal.trim().toUpperCase(),
        hookedLoadNo: hookLoadNo.trim().toUpperCase(),
        hookedDestination: hookDestination.trim(),
      },
      backdateMinutes: Number(startAgoMinutes || 0),
      lat: gpsFix?.lat ?? null,
      lng: gpsFix?.lng ?? null,
      gpsAccuracy: gpsFix?.accuracy ?? null,
      locationSource: gpsFix ? 'gps' : 'manual',
    };
  }
 `,
  "const reason = trailerDrop ? 'Drop Trailer' : selectedReason;",
  'payload section',
);

replaceSection(
  '  function save() {',
  '\n  function saveSpecial',
  `  function save() {
    const trailerDrop = dropOffSelected
      && !dropContainer.trim()
      && !dropChassis.trim()
      && !!currentTrailerLabel(state);
    if (dropOffSelected && !trailerDrop && !dropContainer.trim() && !dropChassis.trim()) {
      setGpsStatus('Add the trailer, container, or chassis you dropped off.');
      return;
    }
    if (dropHookSelected && (!hookContainer.trim() || !hookChassis.trim() || !hookDestination.trim())) {
      setGpsStatus('Add new container, new chassis, and going-to location for Drop & Hook.');
      return;
    }
    if (dropHookSelected && !hookLoadNo.trim()) {
      setGpsStatus('Add the new BOL/load #, or choose Hook Empty / Reposition for an empty move.');
      return;
    }
    if (hookEmptySelected && (!hookContainer.trim() && !hookChassis.trim())) {
      setGpsStatus('Add the empty container or chassis you hooked.');
      return;
    }
    if (hookEmptySelected && !hookDestination.trim()) {
      setGpsStatus('Add where the empty/reposition move is going.');
      return;
    }
    const p = payload();
    const leavingDriving = state.currentStatus === 'D' && status !== 'D';
    if (gpsPending && leavingDriving && !manualLocationDirty.current && !gpsFix) {
      setGpsStatus('Getting the stop location. Wait a moment or type City, ST.');
      return;
    }
    if (!p.city || !p.state || p.city === 'GPS' || p.state === 'UNK') {
      setGpsStatus('Add the current City, ST or tap Use GPS before saving.');
      return;
    }
    if (status === 'D') {
      onStartDriving({ city:p.city, state:p.state, lat:p.lat, lng:p.lng, gpsAccuracy:p.gpsAccuracy, locationSource:p.locationSource });
      return;
    }
    onApplyStatus(p);
  }
 `,
  'const trailerDrop = dropOffSelected',
  'save section',
);

text = text.replace(
  'Drop Off saves an ON DUTY drop-only event and clears current intermodal equipment. No new container or chassis required.',
  'Drop Off uses the current trailer when no container or chassis is entered. Intermodal equipment can still be entered below.',
);

const required = [
  'function currentTrailerLabel(state = {})',
  "const reason = trailerDrop ? 'Drop Trailer' : selectedReason;",
  "droppedTrailer: trailerDrop ? currentTrailer : ''",
  "mode: trailerDrop ? ''",
  'const trailerDrop = dropOffSelected',
  'Add the trailer, container, or chassis you dropped off.',
];
for (const marker of required) {
  if (!text.includes(marker)) throw new Error(`v109.1 verification failed: ${marker}`);
}
if (text.includes("if (dropOffSelected && !dropContainer.trim() && !dropChassis.trim())")) {
  throw new Error('v109.1 verification failed: old unconditional intermodal validation remains');
}

if (!checkOnly && text !== original) fs.writeFileSync(TARGET, text);
finalizeReleaseVersion();
console.log(checkOnly
  ? `v${RELEASE_VERSION} trailer Drop Off and storage release verified`
  : (text === original
    ? `v${RELEASE_VERSION} trailer Drop Off already applied; storage release finalized`
    : `v${RELEASE_VERSION} trailer Drop Off applied; storage release finalized`));
