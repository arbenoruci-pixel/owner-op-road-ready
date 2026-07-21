import fs from 'node:fs';

const guideTarget = 'source/src/modules/loads/loadGuideV103.js';
let guideSource = fs.readFileSync(guideTarget, 'utf8');
const start = guideSource.indexOf("  const characters = Object.keys(value)");
const end = guideSource.indexOf("  return text(characters);", start);
if (start < 0 || end < 0) throw new Error('v109.4.4 checklist fallback patch target missing');
const replacement = [
  "  const characters = Object.values(value)",
  "    .filter(item => typeof item === 'string' || typeof item === 'number')",
  "    .map(item => String(item))",
  "    .join('');",
].join('\n');
guideSource = guideSource.slice(0, start) + replacement + '\n' + guideSource.slice(end);

const resolveBefore = "    return { ...step, checklist:normalizeChecklist(step.checklist), complete, completedAt:guide.manualDone?.[step.id] || null };";
const resolveAfter = [
  "    const checklist = (Array.isArray(step.checklist) ? step.checklist : []).map(item => {",
  "      if (typeof item === 'string' || typeof item === 'number') return String(item).trim();",
  "      if (!item || typeof item !== 'object') return '';",
  "      if (typeof item.text === 'string') return item.text.trim();",
  "      if (typeof item.label === 'string') return item.label.trim();",
  "      return Object.values(item).filter(value => typeof value === 'string' || typeof value === 'number').map(value => String(value)).join('').trim();",
  "    }).filter(Boolean);",
  "    return { ...step, checklist, complete, completedAt:guide.manualDone?.[step.id] || null };",
].join('\n');
if (!guideSource.includes(resolveBefore)) throw new Error('v109.4.4 resolve checklist patch target missing');
guideSource = guideSource.replace(resolveBefore, resolveAfter);
fs.writeFileSync(guideTarget, guideSource);

const uiTarget = 'source/src/modules/loads/DriverLoadGuideV103.jsx';
let uiSource = fs.readFileSync(uiTarget, 'utf8');
const whenMarker = '\nfunction when(step = {}) {';
if (!uiSource.includes('function checklistText(value')) {
  const helper = [
    '',
    "function checklistText(value = '') {",
    "  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();",
    "  if (!value || typeof value !== 'object') return '';",
    "  if (typeof value.text === 'string') return value.text.trim();",
    "  if (typeof value.label === 'string') return value.label.trim();",
    "  return Object.values(value).filter(item => typeof item === 'string' || typeof item === 'number').map(item => String(item)).join('').trim();",
    '}',
    '',
    'function normalizeChecklistUi(values = []) {',
    '  return (Array.isArray(values) ? values : []).map(checklistText).filter(Boolean);',
    '}',
    '',
  ].join('\n');
  if (!uiSource.includes(whenMarker)) throw new Error('v109.4.4 UI checklist helper target missing');
  uiSource = uiSource.replace(whenMarker, helper + 'function when(step = {}) {');
}
if (!uiSource.includes('step.checklist')) throw new Error('v109.4.4 UI checklist references missing');
uiSource = uiSource.split('step.checklist').join('normalizeChecklistUi(step.checklist)');
fs.writeFileSync(uiTarget, uiSource);

const verifyTarget = 'scripts/verify-v10943-auto-upright.mjs';
let verifySource = fs.readFileSync(verifyTarget, 'utf8');
const verifyStart = verifySource.indexOf("const characterObject = Object.fromEntries");
const verifyEnd = verifySource.indexOf("const closedState =", verifyStart);
if (verifyStart < 0 || verifyEnd < 0) throw new Error('v109.4.4 checklist verifier target missing');
const verifyReplacement = [
  "const guideUiSource = read('source/src/modules/loads/DriverLoadGuideV103.jsx');",
  "assert.ok(guideUiSource.includes('function checklistText(value'), 'guide UI must normalize legacy checklist values');",
  "assert.ok(guideUiSource.includes('normalizeChecklistUi(step.checklist)'), 'guide checklist references must use normalized text');",
  '',
].join('\n');
verifySource = verifySource.slice(0, verifyStart) + verifyReplacement + verifySource.slice(verifyEnd);
fs.writeFileSync(verifyTarget, verifySource);
console.log('PASS — v109.4.4 checklist objects are normalized before every guide render');
