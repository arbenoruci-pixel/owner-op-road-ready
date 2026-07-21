import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_VERSION = '109.2.6';
const RELEASED_AT = '2026-07-21T02:50:00.000Z';

const APP_TARGET = path.join(ROOT, 'source/src/app/App.jsx');
const TIMELINE_TARGET = path.join(ROOT, 'source/src/core/timeline/timelineEngine.js');
const EVENT_LIST_TARGET = path.join(ROOT, 'source/src/modules/logbook/EventList.jsx');
const DAY_LOG_TARGET = path.join(ROOT, 'source/src/modules/logbook/DayLogScreen.jsx');
const DOT_TARGET = path.join(ROOT, 'source/src/core/dot/dotOfficerCheckEngine.js');

function read(target) {
  return fs.readFileSync(target, 'utf8');
}

function write(target, content) {
  fs.writeFileSync(target, content);
}

function replaceOnce(text, oldValue, newValue, label) {
  if (text.includes(newValue)) return text;
  if (!text.includes(oldValue)) throw new Error(`v109.2.6 patch target missing: ${label}`);
  return text.replace(oldValue, newValue);
}

function insertBefore(text, marker, insertion, label) {
  if (text.includes(insertion.trim())) return text;
  const index = text.indexOf(marker);
  if (index < 0) throw new Error(`v109.2.6 insertion target missing: ${label}`);
  return `${text.slice(0, index)}${insertion}${text.slice(index)}`;
}

function writeJson(relativePath, transform) {
  const target = path.join(ROOT, relativePath);
  const value = JSON.parse(read(target));
  transform(value);
  write(target, `${JSON.stringify(value, null, 2)}\n`);
}

function replaceFileText(relativePath, pattern, replacement, label) {
  const target = path.join(ROOT, relativePath);
  const before = read(target);
  const after = before.replace(pattern, replacement);
  if (after === before && !before.includes(replacement)) {
    throw new Error(`v109.2.6 version target missing: ${label}`);
  }
  if (after !== before) write(target, after);
}

function patchApp() {
  let source = read(APP_TARGET);

  source = insertBefore(
    source,
    'function textLooksLikeStatusArtifact',
    `function eventReasonList(event = {}) {\n  const values = Array.isArray(event?.reasons) ? event.reasons : [];\n  const out = [];\n  for (const value of values) {\n    const clean = String(value || '').trim();\n    if (!clean) continue;\n    if (!out.some(existing => existing.toLowerCase() === clean.toLowerCase())) out.push(clean);\n  }\n  return out;\n}\n\nfunction eventActivityText(event = {}) {\n  return [...eventReasonList(event), event?.note || '', event?.description || '']\n    .map(value => String(value || '').trim())\n    .filter(Boolean)\n    .join(' · ');\n}\n\n`,
    'App event reason helpers',
  );

  source = replaceOnce(
    source,
    `  const next = { ...event };\n  const noteStale = statusChanged || textLooksLikeStatusArtifact(next.note, status) || /^new event$/i.test(String(next.note || '').trim());\n  const descStale = statusChanged || textLooksLikeStatusArtifact(next.description, status) || /^new event$/i.test(String(next.description || '').trim());`,
    `  const next = { ...event };\n  const selectedReasons = eventReasonList(next);\n  const hasStructuredOnDutyReasons = status === 'ON' && selectedReasons.length > 0;\n  if (hasStructuredOnDutyReasons) {\n    next.reasons = selectedReasons;\n    next.note = selectedReasons.join(' · ');\n  }\n  const noteStale = !hasStructuredOnDutyReasons && (statusChanged || textLooksLikeStatusArtifact(next.note, status) || /^new event$/i.test(String(next.note || '').trim()));\n  const descStale = statusChanged || textLooksLikeStatusArtifact(next.description, status) || /^new event$/i.test(String(next.description || '').trim());`,
    'App structured reasons survive sanitization',
  );

  source = replaceOnce(
    source,
    `function statusChangeLooksPreTrip(event = {}) {\n  return isPreTripStatus(event?.status, \`${'${event?.note || \'\'} ${event?.description || \'\'}'}\`);\n}`,
    `function statusChangeLooksPreTrip(event = {}) {\n  return isPreTripStatus(event?.status, eventActivityText(event));\n}`,
    'App statusChangeLooksPreTrip reasons',
  );

  source = replaceOnce(
    source,
    `function isConnectedOnDutyLocationSource(event = {}) {\n  return event.status === 'ON' && /pre[- ]?trip|inspection|pickup|loading|drop|hook|delivery|unloading/i.test(\`${'${event.note || \'\'} ${event.description || \'\'}'}\`);\n}`,
    `function isConnectedOnDutyLocationSource(event = {}) {\n  return event.status === 'ON' && /pre[- ]?trip|inspection|pickup|loading|drop|hook|delivery|unloading/i.test(eventActivityText(event));\n}`,
    'App connected ON DUTY reasons',
  );

  source = replaceOnce(
    source,
    `function preTripEventForDay(events = []) {\n  return sorted(events || []).find(event => (\n    isPreTripStatus(event.status, \`${'${event.note || \'\'} ${event.description || \'\'}'}\`)\n  )) || null;\n}`,
    `function preTripEventForDay(events = []) {\n  return sorted(events || []).find(event => (\n    isPreTripStatus(event.status, eventActivityText(event))\n  )) || null;\n}`,
    'App pre-trip event lookup reasons',
  );

  source = replaceOnce(
    source,
    `  return isPreTripStatus(event?.status, \`${'${event?.note || \'\'} ${event?.description || \'\'}'}\`) && !existing.complete;`,
    `  return isPreTripStatus(event?.status, eventActivityText(event)) && !existing.complete;`,
    'App inspection prompt reasons',
  );

  source = replaceOnce(
    source,
    `    const preTripForPrompt = incomingForPrompt.find(e => isPreTripStatus(e?.status, \`${'${e?.note || \'\'} ${e?.description || \'\'}'}\`));`,
    `    const preTripForPrompt = incomingForPrompt.find(e => isPreTripStatus(e?.status, eventActivityText(e)));`,
    'App add event pre-trip prompt reasons',
  );

  source = replaceOnce(
    source,
    `      const preTripAdded = toAdd.find(e => isPreTripStatus(e.status, \`${'${e.note || \'\'} ${e.description || \'\'}'}\`));`,
    `      const preTripAdded = toAdd.find(e => isPreTripStatus(e.status, eventActivityText(e)));`,
    'App added pre-trip lookup reasons',
  );

  const required = [
    'function eventReasonList(event = {})',
    'function eventActivityText(event = {})',
    'hasStructuredOnDutyReasons',
    'next.note = selectedReasons.join',
    'isPreTripStatus(event?.status, eventActivityText(event))',
    'isPreTripStatus(event.status, eventActivityText(event))',
  ];
  for (const marker of required) {
    if (!source.includes(marker)) throw new Error(`v109.2.6 App verification failed: ${marker}`);
  }

  write(APP_TARGET, source);
}

function patchTimeline() {
  let source = read(TIMELINE_TARGET);

  source = insertBefore(
    source,
    'function hasEventSpecificRouteData',
    `function normalizeReasonList(values = []) {\n  const out = [];\n  for (const value of values || []) {\n    const clean = String(value || '').trim();\n    if (!clean) continue;\n    if (!out.some(existing => existing.toLowerCase() === clean.toLowerCase())) out.push(clean);\n  }\n  return out;\n}\n\nfunction eventActivityText(event = {}) {\n  return [...normalizeReasonList(event?.reasons), event?.note || '', event?.description || '']\n    .map(value => String(value || '').trim())\n    .filter(Boolean)\n    .join(' · ');\n}\n\n`,
    'timeline event reason helpers',
  );

  source = replaceOnce(
    source,
    `function cleanEvent(e) {\n  const start = Math.max(0, Math.min(1439, Math.round(Number(e.startMin || 0))));\n  const end = Math.max(start + 1, Math.min(1440, Math.round(Number(e.endMin ?? start + 1))));\n  return {\n    ...e,\n    startMin: start,\n    endMin: end,\n    note: sanitizeLogText(e.note || ''),\n    description: sanitizeLogText(e.description || ''),\n  };\n}`,
    `function cleanEvent(e) {\n  const start = Math.max(0, Math.min(1439, Math.round(Number(e.startMin || 0))));\n  const end = Math.max(start + 1, Math.min(1440, Math.round(Number(e.endMin ?? start + 1))));\n  const reasons = normalizeReasonList(e.reasons);\n  const rawNote = sanitizeLogText(e.note || '');\n  const note = e.status === 'ON' && reasons.length\n    ? combineLogText(reasons.join(' · '), /^on duty$/i.test(rawNote) ? '' : rawNote)\n    : rawNote;\n  return {\n    ...e,\n    startMin: start,\n    endMin: end,\n    reasons,\n    note,\n    description: sanitizeLogText(e.description || ''),\n  };\n}`,
    'timeline canonical note from reasons',
  );

  source = replaceOnce(
    source,
    `function onDutyActivityKey(event = {}) {\n  const text = normalizeTextPart(\`${'${event.note || \'\'} ${event.description || \'\'}'}\`).toLowerCase();`,
    `function onDutyActivityKey(event = {}) {\n  const text = normalizeTextPart(eventActivityText(event)).toLowerCase();`,
    'timeline ON DUTY key reasons',
  );

  source = replaceOnce(
    source,
    `        note: combineText(last.note, ev.note),\n        description: combineText(last.description, ev.description),`,
    `        note: combineText(last.note, ev.note),\n        description: combineText(last.description, ev.description),\n        reasons: normalizeReasonList([...(last.reasons || []), ...(ev.reasons || [])]),`,
    'timeline merged reasons union',
  );

  source = replaceOnce(
    source,
    `      note: sameAsFirst ? (first.note || '') : 'Carry-forward coverage',\n      description: sameAsFirst ? (first.description || '') : 'Review actual status if this is not correct',`,
    `      note: sameAsFirst ? (first.note || '') : 'Carry-forward coverage',\n      description: sameAsFirst ? (first.description || '') : 'Review actual status if this is not correct',\n      reasons: sameAsFirst ? normalizeReasonList(first.reasons) : [],`,
    'timeline start-fill reasons',
  );

  const required = [
    'function normalizeReasonList(values = [])',
    'const reasons = normalizeReasonList(e.reasons)',
    "combineLogText(reasons.join(' · ')",
    'reasons: normalizeReasonList([...(last.reasons || []), ...(ev.reasons || [])])',
    'reasons: sameAsFirst ? normalizeReasonList(first.reasons) : []',
  ];
  for (const marker of required) {
    if (!source.includes(marker)) throw new Error(`v109.2.6 timeline verification failed: ${marker}`);
  }

  write(TIMELINE_TARGET, source);
}

function patchEventList() {
  let source = read(EVENT_LIST_TARGET);

  source = replaceOnce(
    source,
    `import { sanitizeLogText } from '../../shared/utils/logText.js';`,
    `import { sanitizeLogText, combineLogText } from '../../shared/utils/logText.js';`,
    'EventList combineLogText import',
  );

  source = replaceOnce(
    source,
    `        const transitionSummary = sanitizeLogText(event.transitionSummary || '');\n        const cleanNote = sanitizeLogText(event.note || '');\n        const displayNote = transitionSummary && !cleanNote.includes(transitionSummary)\n          ? [cleanNote, transitionSummary].filter(Boolean).join(' · ')\n          : cleanNote;\n        const loadActivity = event.status === 'ON' && /pickup|pick up|loading|delivery|unloading/i.test(\`${'${event.note || \'\'} ${event.description || \'\'}'}\`);`,
    `        const transitionSummary = sanitizeLogText(event.transitionSummary || '');\n        const reasonNote = sanitizeLogText((Array.isArray(event.reasons) ? event.reasons : []).join(' · '));\n        const rawNote = sanitizeLogText(event.note || '');\n        const cleanNote = event.status === 'ON' && reasonNote\n          ? combineLogText(reasonNote, /^on duty$/i.test(rawNote) ? '' : rawNote)\n          : rawNote;\n        const displayNote = transitionSummary && !cleanNote.includes(transitionSummary)\n          ? [cleanNote, transitionSummary].filter(Boolean).join(' · ')\n          : cleanNote;\n        const activityText = \`${'${reasonNote} ${event.note || \'\'} ${event.description || \'\'}'}\`;\n        const loadActivity = event.status === 'ON' && /pickup|pick up|loading|delivery|unloading/i.test(activityText);`,
    'EventList display all structured reasons',
  );

  if (!source.includes('const reasonNote = sanitizeLogText')) throw new Error('v109.2.6 EventList reason display missing');
  write(EVENT_LIST_TARGET, source);
}

function patchDayLog() {
  let source = read(DAY_LOG_TARGET);

  source = replaceOnce(
    source,
    `function isPreTripEvent(event = {}) {\n  return event.status === 'ON' && /pre[- ]?trip|inspection/i.test(\`${'${event.note || \'\'} ${event.description || \'\'}'}\`);\n}`,
    `function isPreTripEvent(event = {}) {\n  const reasons = Array.isArray(event.reasons) ? event.reasons.join(' · ') : '';\n  return event.status === 'ON' && /pre[- ]?trip|inspection/i.test(\`${'${reasons} ${event.note || \'\'} ${event.description || \'\'}'}\`);\n}`,
    'DayLog pre-trip reasons',
  );

  if (!source.includes("const reasons = Array.isArray(event.reasons)")) throw new Error('v109.2.6 DayLog pre-trip reasons missing');
  write(DAY_LOG_TARGET, source);
}

function patchDotCheck() {
  let source = read(DOT_TARGET);

  source = insertBefore(
    source,
    'function cityState',
    `function eventActivityText(event = {}) {\n  const reasons = Array.isArray(event?.reasons) ? event.reasons.join(' · ') : '';\n  return [reasons, event?.note || '', event?.description || ''].filter(Boolean).join(' · ');\n}\n\n`,
    'DOT event activity helper',
  );

  source = replaceOnce(
    source,
    `function isConnectedOnDutyStart(event = {}) {\n  return event.status === 'ON' && /pre[- ]?trip|inspection|pickup|loading|drop|hook|delivery|unloading/i.test(\`${'${event.note || \'\'} ${event.description || \'\'}'}\`);\n}`,
    `function isConnectedOnDutyStart(event = {}) {\n  return event.status === 'ON' && /pre[- ]?trip|inspection|pickup|loading|drop|hook|delivery|unloading/i.test(eventActivityText(event));\n}`,
    'DOT connected ON DUTY reasons',
  );

  source = replaceOnce(
    source,
    `  const text = \`${'${event.note || \'\'} ${event.description || \'\'}'}\`;`,
    `  const text = eventActivityText(event);`,
    'DOT delivery reasons',
  );

  source = replaceOnce(
    source,
    `function hasPreTripText(event = {}) {\n  return event.status === 'ON' && /pre[- ]?trip|inspection/i.test(\`${'${event.note || \'\'} ${event.description || \'\'}'}\`);\n}`,
    `function hasPreTripText(event = {}) {\n  return event.status === 'ON' && /pre[- ]?trip|inspection/i.test(eventActivityText(event));\n}`,
    'DOT pre-trip reasons',
  );

  source = replaceOnce(
    source,
    `function hasStartDutyContextText(event = {}) {\n  return event.status === 'ON' && /pre[- ]?trip|inspection|pickup|loading|drop\s*&\s*hook|hook|delivery|unloading|drop\s*off/i.test(\`${'${event.note || \'\'} ${event.description || \'\'}'}\`);\n}`,
    `function hasStartDutyContextText(event = {}) {\n  return event.status === 'ON' && /pre[- ]?trip|inspection|pickup|loading|drop\s*&\s*hook|hook|delivery|unloading|drop\s*off/i.test(eventActivityText(event));\n}`,
    'DOT start-duty reasons',
  );

  const required = [
    'function eventActivityText(event = {})',
    'function hasPreTripText(event = {})',
    'test(eventActivityText(event))',
  ];
  for (const marker of required) {
    if (!source.includes(marker)) throw new Error(`v109.2.6 DOT verification failed: ${marker}`);
  }

  write(DOT_TARGET, source);
}

function verifyExactRegression() {
  const event = {
    status: 'ON',
    note: 'On Duty',
    description: '',
    reasons: ['Delivery / Unloading', 'Pre-trip inspection'],
  };
  const reasons = [...new Set(event.reasons.map(value => String(value || '').trim()).filter(Boolean))];
  const canonicalNote = reasons.join(' · ');
  const activityText = [canonicalNote, event.note, event.description].filter(Boolean).join(' · ');

  if (canonicalNote !== 'Delivery / Unloading · Pre-trip inspection') {
    throw new Error('v109.2.6 regression: combined log note is incorrect');
  }
  if (!/pre[- ]?trip|inspection/i.test(activityText)) {
    throw new Error('v109.2.6 regression: DOT Check still cannot see Pre-trip');
  }
  if (!/delivery|unloading/i.test(activityText)) {
    throw new Error('v109.2.6 regression: log lost Delivery / Unloading');
  }

  const timeline = read(TIMELINE_TARGET);
  const app = read(APP_TARGET);
  const list = read(EVENT_LIST_TARGET);
  const dayLog = read(DAY_LOG_TARGET);
  const dot = read(DOT_TARGET);

  if (!timeline.includes("combineLogText(reasons.join(' · ')")) throw new Error('v109.2.6 regression: timeline canonical note missing');
  if (!app.includes('hasStructuredOnDutyReasons')) throw new Error('v109.2.6 regression: App structured reason guard missing');
  if (!list.includes('const reasonNote = sanitizeLogText')) throw new Error('v109.2.6 regression: log row reason display missing');
  if (!dayLog.includes('Array.isArray(event.reasons)')) throw new Error('v109.2.6 regression: inspection reason fallback missing');
  if (!dot.includes('hasPreTripText(event = {})')) throw new Error('v109.2.6 regression: DOT pre-trip detector missing');

  console.log('PASS — v109.2.6 Log + Inspection + DOT Check recognize PTI and Unloading from reasons[]');
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
    release.build = 'v109.2.6-event-reasons-source-of-truth';
    release.releasedAt = RELEASED_AT;
    release.updatedAt = RELEASED_AT;
    release.publishedAt = RELEASED_AT;
    release.label = 'v109.2.6 Log and DOT PTI Recognition Fix';
    release.notes = [
      'Uses the stored ON DUTY reasons array as the source of truth for the log row, inspection link, and DOT Check.',
      'Repairs existing ON DUTY events whose editor shows Pre-trip inspection and Delivery / Unloading while the log note still says On Duty.',
      'Preserves both selected activities through timeline normalization and display-only continuity rows.',
      'Does not delete or reset stored logbook data.',
    ];
  });
}

patchApp();
patchTimeline();
patchEventList();
patchDayLog();
patchDotCheck();
verifyExactRegression();
finalizeRelease();
console.log(`Applied v${RELEASE_VERSION}: event reasons are now authoritative across Log, Inspection, and DOT Check.`);
