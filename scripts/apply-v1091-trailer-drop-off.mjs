import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'source/src/modules/status/StatusWorkflowSheet.jsx');
const checkOnly = process.argv.includes('--check');
const original = fs.readFileSync(TARGET, 'utf8');
let text = original;

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
console.log(checkOnly
  ? 'v109.1 trailer Drop Off verified'
  : (text === original ? 'v109.1 trailer Drop Off already applied' : 'v109.1 trailer Drop Off applied'));
