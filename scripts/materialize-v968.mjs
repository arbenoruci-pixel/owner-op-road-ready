import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '96.8.0';

function file(relative) { return path.join(ROOT, relative); }
function read(relative) { return fs.readFileSync(file(relative), 'utf8'); }
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v96.8 patch failed: ${label}`);
  return content.replace(before, after);
}

const editorPath = 'source/src/modules/editor/EditEventSheet.jsx';
let editor = read(editorPath);

editor = replaceOnce(
  editor,
  `function sameValue(a, b) {\n  return String(a ?? '') === String(b ?? '');\n}\n`,
  `function sameValue(a, b) {\n  return String(a ?? '') === String(b ?? '');\n}\n\nconst ON_DUTY_REASON_OPTIONS = [\n  'Pre-trip inspection',\n  'Fuel',\n  'Pickup / Loading',\n  'Delivery / Unloading',\n  'Waiting',\n  'Drop Off',\n  'Drop & Hook',\n  'Hook Empty / Reposition',\n];\n\nfunction normalizedReasonKey(value = '') {\n  return String(value || '').trim().toLowerCase();\n}\n\nfunction parseOnDutyNote(value = '') {\n  const parts = String(value || '').split(/\\s*[·•|]\\s*/g).map(part => part.trim()).filter(Boolean);\n  const optionByKey = new Map(ON_DUTY_REASON_OPTIONS.map(option => [normalizedReasonKey(option), option]));\n  const selected = [];\n  const details = [];\n  for (const part of parts) {\n    const exact = optionByKey.get(normalizedReasonKey(part));\n    if (exact) {\n      if (!selected.includes(exact)) selected.push(exact);\n      continue;\n    }\n    if (/^pre[- ]?trip(?: inspection)?$/i.test(part)) {\n      if (!selected.includes('Pre-trip inspection')) selected.push('Pre-trip inspection');\n      continue;\n    }\n    details.push(part);\n  }\n  return { selected, details };\n}\n\nfunction composeOnDutyNote(selected = [], details = []) {\n  return [...selected, ...details].map(part => String(part || '').trim()).filter(Boolean).join(' · ');\n}\n`,
  'reason helpers'
);

editor = replaceOnce(
  editor,
  `  const [destination, setDestination] = useState(initialForm.destination);\n  const gpsRequestId = useRef(0);`,
  `  const [destination, setDestination] = useState(initialForm.destination);\n  const [selectedOnReasons, setSelectedOnReasons] = useState(() => parseOnDutyNote(initialForm.note).selected);\n  const gpsRequestId = useRef(0);`,
  'reason state'
);

editor = replaceOnce(
  editor,
  `    setDestination(next.destination);\n    gpsRequestId.current += 1;`,
  `    setDestination(next.destination);\n    setSelectedOnReasons(parseOnDutyNote(next.note).selected);\n    gpsRequestId.current += 1;`,
  'reason reset'
);

editor = replaceOnce(
  editor,
  `  function changeStatus(nextStatus) {\n    const previousStatus = status;`,
  `  function toggleOnDutyReason(reason) {\n    const parsed = parseOnDutyNote(note);\n    const nextSelected = selectedOnReasons.includes(reason)\n      ? selectedOnReasons.filter(item => item !== reason)\n      : [...selectedOnReasons, reason];\n    setSelectedOnReasons(nextSelected);\n    setNote(composeOnDutyNote(nextSelected, parsed.details));\n  }\n\n  function changeStatus(nextStatus) {\n    const previousStatus = status;`,
  'reason toggle'
);

editor = replaceOnce(
  editor,
  `    setStatus(nextStatus);\n    if (previousStatus !== nextStatus || textLooksLikeStatusArtifact(note, nextStatus) || /^new event$/i.test(String(note || '').trim())) {\n      setNote(statusLabel(nextStatus));\n    }`,
  `    setStatus(nextStatus);\n    if (nextStatus !== 'ON') setSelectedOnReasons([]);\n    if (previousStatus !== nextStatus || textLooksLikeStatusArtifact(note, nextStatus) || /^new event$/i.test(String(note || '').trim())) {\n      if (nextStatus === 'ON') {\n        setSelectedOnReasons([]);\n        setNote('');\n      } else {\n        setNote(statusLabel(nextStatus));\n      }\n    }`,
  'status reason reset'
);

editor = replaceOnce(
  editor,
  `  function save() {\n    const cleanNote = textLooksLikeStatusArtifact(note, status) || /^new event$/i.test(String(note || '').trim()) ? statusLabel(status) : note;`,
  `  function save() {\n    const parsedOnDuty = parseOnDutyNote(note);\n    const onDutyNote = status === 'ON'\n      ? composeOnDutyNote(selectedOnReasons.length ? selectedOnReasons : parsedOnDuty.selected, parsedOnDuty.details)\n      : note;\n    const cleanNote = textLooksLikeStatusArtifact(onDutyNote, status) || /^new event$/i.test(String(onDutyNote || '').trim()) ? statusLabel(status) : onDutyNote;`,
  'save reason composition'
);

editor = replaceOnce(
  editor,
  `        {activityKind && (`,
  `        {status === 'ON' && (\n          <section className="form-section editor-on-duty-reasons">\n            <div className="form-label-row">\n              <div className="form-label">ON DUTY activity</div>\n              <span>select one or more</span>\n            </div>\n            <div className="reason-pills driver-reason-grid multi-reason-grid">\n              {ON_DUTY_REASON_OPTIONS.map(reason => (\n                <button\n                  key={reason}\n                  type="button"\n                  className={selectedOnReasons.includes(reason) ? 'picked' : ''}\n                  onClick={() => toggleOnDutyReason(reason)}\n                >\n                  {selectedOnReasons.includes(reason) ? '✓ ' : ''}{reason}\n                </button>\n              ))}\n            </div>\n            {selectedOnReasons.includes('Pre-trip inspection') && (\n              <div className="drop-hook-note">\n                Saving will offer to complete and link the inspection sheet to this exact ON DUTY event.\n              </div>\n            )}\n          </section>\n        )}\n\n        {activityKind && (`,
  'reason picker UI'
);

write(editorPath, editor);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);

write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v96.8-on-duty-inspection-picker',
  releasedAt:'2026-07-12T19:10:00.000Z',
  notes:[
    'Adds a clear multi-select ON DUTY activity picker inside Edit Duty Status.',
    'Lets Drop & Hook, Pre-trip inspection, Fuel, Pickup, Delivery, Waiting, Drop Off, and Hook Empty be combined on one exact event.',
    'Preserves existing equipment/detail text while adding or removing activity reasons.',
    'Selecting Pre-trip inspection triggers the existing inspection confirmation and links the completed sheet to the exact event without changing time or location.'
  ],
  label:'v96.8 ON DUTY Inspection Picker',
  updatedAt:'2026-07-12T19:10:00.000Z'
}, null, 2)}\n`);

write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

if (!editor.includes('ON DUTY activity') || !editor.includes('Pre-trip inspection') || !editor.includes('composeOnDutyNote')) {
  throw new Error('v96.8 verification failed');
}

console.log('v96.8 ON DUTY inspection picker materialized');
