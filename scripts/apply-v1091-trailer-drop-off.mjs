import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'source/src/modules/status/StatusWorkflowSheet.jsx');
const checkOnly = process.argv.includes('--check');
const original = fs.readFileSync(TARGET, 'utf8');
let text = original;

function applyPatch(label, marker, pattern, replacement) {
  if (text.includes(marker)) return;
  const before = text;
  text = text.replace(pattern, replacement);
  if (text === before || !text.includes(marker)) {
    throw new Error(`v109.1 patch target missing: ${label}`);
  }
}

applyPatch(
  'currentTrailerLabel helper',
  'function currentTrailerLabel(state = {})',
  /\nexport default function StatusWorkflowSheet/,
  `\nfunction currentTrailerLabel(state = {}) {
  const value = String(state.currentTrailer || state.equipment?.trailer || '').trim();
  if (!value || /^(no|none|n\\/?a)\\s*(trailer|equipment)?$/i.test(value)) return '';
  return value;
}\n\nexport default function StatusWorkflowSheet`,
);

applyPatch(
  'payload trailer drop decision',
  "const reason = trailerDrop ? 'Drop Trailer' : selectedReason;",
  /(\s*)const reason = reasonText\(selectedReasons\) \|\| reasonList\(status\)\[0\];\s*\n\s*const hookEmpty = reasonNeedsHookEmpty\(status, selectedReasons\);/,
  (_, indent) => `${indent}const selectedReason = reasonText(selectedReasons) || reasonList(status)[0];
${indent}const currentTrailer = currentTrailerLabel(state);
${indent}const trailerDrop = reasonNeedsDropOff(status, selectedReasons)
${indent}  && !dropContainer.trim()
${indent}  && !dropChassis.trim()
${indent}  && !!currentTrailer;
${indent}const reason = trailerDrop ? 'Drop Trailer' : selectedReason;
${indent}const hookEmpty = reasonNeedsHookEmpty(status, selectedReasons);`,
);

applyPatch(
  'payload droppedTrailer',
  "droppedTrailer: trailerDrop ? currentTrailer : ''",
  /droppedTrailer:\s*'',\s*\n(\s*)hookedTrailer:\s*'',/,
  (_, indent) => `droppedTrailer: trailerDrop ? currentTrailer : '',\n${indent}hookedTrailer: '',`,
);

applyPatch(
  'payload trailer drop mode',
  "mode: trailerDrop ? ''",
  /^(\s*)mode:\s*reasonNeedsDropOff\(status, selectedReasons\).*$/m,
  (_, indent) => `${indent}mode: trailerDrop ? '' : (reasonNeedsDropOff(status, selectedReasons) ? 'drop_off' : (reasonNeedsDropHook(status, selectedReasons) ? 'drop_hook' : (hookEmpty ? 'hook_empty' : ''))),`,
);

applyPatch(
  'save trailer drop validation',
  'const trailerDrop = dropOffSelected',
  /(\s*)function save\(\) \{\s*\n\s*if \(dropOffSelected && !dropContainer\.trim\(\) && !dropChassis\.trim\(\)\) \{\s*\n\s*setGpsStatus\('Add the container or chassis you dropped off\.'\);\s*\n\s*return;\s*\n\s*\}/,
  (_, indent) => `${indent}function save() {
${indent}  const trailerDrop = dropOffSelected
${indent}    && !dropContainer.trim()
${indent}    && !dropChassis.trim()
${indent}    && !!currentTrailerLabel(state);
${indent}  if (dropOffSelected && !trailerDrop && !dropContainer.trim() && !dropChassis.trim()) {
${indent}    setGpsStatus('Add the trailer, container, or chassis you dropped off.');
${indent}    return;
${indent}  }`,
);

applyPatch(
  'trailer drop UI state',
  'const trailerDropSelected = dropOffSelected',
  /(\s*)const equipmentDropSelected = dropHookSelected \|\| dropOffSelected \|\| hookEmptySelected;\s*\n\s*const currentEquipmentText = \[state\.equipment\?\.container, state\.equipment\?\.chassis\]\.filter\(Boolean\)\.join\(' \/ '\) \|\| state\.currentTrailer \|\| 'No equipment set';/,
  (_, indent) => `${indent}const equipmentDropSelected = dropHookSelected || dropOffSelected || hookEmptySelected;
${indent}const currentTrailer = currentTrailerLabel(state);
${indent}const hasIntermodalDropEquipment = Boolean(dropContainer.trim() || dropChassis.trim());
${indent}const trailerDropSelected = dropOffSelected && !hasIntermodalDropEquipment && !!currentTrailer;
${indent}const currentEquipmentText = [state.equipment?.container, state.equipment?.chassis].filter(Boolean).join(' / ') || currentTrailer || 'No equipment set';`,
);

applyPatch(
  'trailer drop heading',
  "trailerDropSelected ? 'Drop off trailer'",
  /<label>\{dropOffSelected \? 'Drop off equipment' : 'Drop & hook equipment'\}<\/label>\s*\n\s*<span>\{dropOffSelected \? 'drop only' : \(hookEmptySelected \? 'empty \/ reposition' : 'required for next load'\)\}<\/span>/,
  `<label>{trailerDropSelected ? 'Drop off trailer' : (dropOffSelected ? 'Drop off equipment' : 'Drop & hook equipment')}</label>
              <span>{trailerDropSelected ? 'trailer only' : (dropOffSelected ? 'drop only' : (hookEmptySelected ? 'empty / reposition' : 'required for next load'))}</span>`,
);

applyPatch(
  'hide intermodal inputs for trailer drop',
  '{!trailerDropSelected && (',
  /(\s*)<label>\s*\n\s*<span>Drop container<\/span>\s*\n\s*<input value=\{dropContainer\}[^\n]*\n\s*<\/label>\s*\n\s*<label>\s*\n\s*<span>Drop chassis<\/span>\s*\n\s*<input value=\{dropChassis\}[^\n]*\n\s*<\/label>/,
  (_, indent) => `${indent}{!trailerDropSelected && (
${indent}  <>
${indent}    <label>
${indent}      <span>Drop container</span>
${indent}      <input value={dropContainer} onChange={(e) => setDropContainer(e.target.value.toUpperCase())} placeholder="Old container #" autoComplete="off" />
${indent}    </label>
${indent}    <label>
${indent}      <span>Drop chassis</span>
${indent}      <input value={dropChassis} onChange={(e) => setDropChassis(e.target.value.toUpperCase())} placeholder="Old chassis #" autoComplete="off" />
${indent}    </label>
${indent}  </>
${indent})}`,
);

applyPatch(
  'trailer drop explanation',
  'No container or chassis needed.',
  /(\s*)\{hookEmptySelected && \(\s*\n\s*<div className="drop-hook-note hook-empty-note">/,
  (_, indent) => `${indent}{trailerDropSelected && (
${indent}  <div className="drop-hook-note trailer-drop-note">
${indent}    Drop Off will save ON DUTY Drop Trailer and clear trailer {currentTrailer}. No container or chassis needed.
${indent}  </div>
${indent})}
${indent}{hookEmptySelected && (
${indent}  <div className="drop-hook-note hook-empty-note">`,
);

applyPatch(
  'intermodal-only drop note',
  '{dropOffSelected && !trailerDropSelected && (',
  /\{dropOffSelected && \(\s*\n(\s*)<div className="drop-hook-note drop-off-note">/,
  (_, indent) => `{dropOffSelected && !trailerDropSelected && (\n${indent}<div className="drop-hook-note drop-off-note">`,
);

const required = [
  'function currentTrailerLabel(state = {})',
  "const reason = trailerDrop ? 'Drop Trailer' : selectedReason;",
  "droppedTrailer: trailerDrop ? currentTrailer : ''",
  "mode: trailerDrop ? ''",
  'const trailerDropSelected = dropOffSelected',
  "trailerDropSelected ? 'Drop off trailer'",
  'No container or chassis needed.',
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
