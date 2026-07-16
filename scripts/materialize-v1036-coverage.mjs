import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const write = (relative, content) => fs.writeFileSync(path.join(ROOT, relative), content);
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v103.6 coverage missing ${label}`);
  return content.replace(before, after);
}
function replacePattern(content, pattern, replacement, label, marker = '') {
  if (marker && content.includes(marker)) return content;
  if (!pattern.test(content)) throw new Error(`v103.6 coverage missing ${label}`);
  return content.replace(pattern, replacement);
}

const rawPath = 'source/src/core/compliance/rawRodsChecks.js';
let raw = read(rawPath);
raw = replaceOnce(
  raw,
  `import { normalizeLogEvents, sortEvents } from '../timeline/timelineEngine.js';`,
  `import { normalizeLogEvents, sortEvents } from '../timeline/timelineEngine.js';\nimport { extendCurrentStatusTailV1036 } from '../timeline/liveStatusTailV1036.js';`,
  'tail import'
);
raw = replaceOnce(
  raw,
  `  const targetEnd = future ? 0 : (current ? nowMin() : 1440);`,
  `  const targetEnd = future ? 0 : (current ? clampMinute(options.nowMinute ?? nowMin(), 0) : 1440);`,
  'current minute override'
);
raw = replaceOnce(
  raw,
  `  const rawCompleted = events.filter(event => Number(event.endMin || 0) > Number(event.startMin || 0));\n  const issues = [];`,
  `  const rawCompleted = events.filter(event => Number(event.endMin || 0) > Number(event.startMin || 0));\n  const liveTailV1036 = extendCurrentStatusTailV1036(rawCompleted, {\n    isCurrentDay:current,\n    targetEnd,\n    currentStatus:options.currentStatus || options.activeStatus || '',\n    currentEventId:options.currentEventId || options.activeEventId || '',\n  });\n  const coverageBaseV1036 = liveTailV1036.events;\n  // Keep every legacy calculation in this function on the same derived current\n  // tail. This is a local array only; eventsByDay and stored raw rows are not\n  // mutated.\n  rawCompleted.splice(0, rawCompleted.length, ...coverageBaseV1036.map(event => ({ ...event })));\n  const issues = [];`,
  'tail derivation'
);
raw = raw.replaceAll('isRestOnlyCoverageDay(rawCompleted)', 'isRestOnlyCoverageDay(coverageBaseV1036)');
raw = raw.replaceAll('restOnlyCoverageStatus(rawCompleted)', 'restOnlyCoverageStatus(coverageBaseV1036)');
raw = raw.replaceAll('rawCompleted[0], rawCompleted[rawCompleted.length - 1]', 'coverageBaseV1036[0], coverageBaseV1036[coverageBaseV1036.length - 1]');
raw = replaceOnce(
  raw,
  `  const completed = deriveShortOnDutyTransitionCoverage(carryStartCoverageFromPreviousDay(rawCompleted, previousDayEvent));`,
  `  const completed = deriveShortOnDutyTransitionCoverage(carryStartCoverageFromPreviousDay(coverageBaseV1036, previousDayEvent));`,
  'coverage base'
);
write(rawPath, raw);

const dotPath = 'source/src/core/dot/dotOfficerCheckEngine.js';
let dot = read(dotPath);
dot = replaceOnce(
  dot,
  `function cityState(city = '', state = '') {\n  return [safeText(city), safeText(state)].filter(Boolean).join(', ');\n}`,
  `function cityState(city = '', state = '') {\n  return [safeText(city), safeText(state)].filter(Boolean).join(', ');\n}\n\nfunction liveCoverageOptionsV1036(state = {}) {\n  const manualEventId = state.manualDrivingSession?.active ? safeText(state.manualDrivingSession.eventId) : '';\n  const gpsEventId = state.gpsTrip?.status === 'active' ? safeText(state.gpsTrip.eventId) : '';\n  return {\n    currentLocation:state.currentLocation || {},\n    currentStatus:safeText(state.currentStatus).toUpperCase(),\n    currentEventId:manualEventId || gpsEventId || '',\n  };\n}`,
  'DOT options'
);
dot = replacePattern(
  dot,
  /(function buildCoverageIssues\(state, day, rawCoverageResult = null\) \{[\s\S]*?)(\s+const result = rawCoverageResult \|\| rawCoverageIssues\([\s\S]*?\);)/,
  `$1\n  const result = rawCoverageResult || rawCoverageIssues(state.eventsByDay || {}, day, liveCoverageOptionsV1036(state));`,
  'DOT grouped coverage declaration',
  'const result = rawCoverageResult || rawCoverageIssues(state.eventsByDay || {}, day, liveCoverageOptionsV1036(state));'
);
dot = replacePattern(
  dot,
  /(export function buildDotOfficerCheck\(state, day\) \{[\s\S]*?)(\s+const rawCoverageResult = rawCoverageIssues\([\s\S]*?\);)/,
  `$1\n  const rawCoverageResult = rawCoverageIssues(state.eventsByDay || {}, day, liveCoverageOptionsV1036(state));`,
  'DOT main coverage declaration',
  'const rawCoverageResult = rawCoverageIssues(state.eventsByDay || {}, day, liveCoverageOptionsV1036(state));'
);
write(dotPath, dot);

const signPath = 'source/src/modules/logbook/signing.js';
let signing = read(signPath);
signing = replaceOnce(
  signing,
  `function hasRealEvents(events = []) {`,
  `function liveCoverageOptionsV1036(state = {}) {\n  const manualEventId = state.manualDrivingSession?.active ? String(state.manualDrivingSession.eventId || '').trim() : '';\n  const gpsEventId = state.gpsTrip?.status === 'active' ? String(state.gpsTrip.eventId || '').trim() : '';\n  return {\n    currentLocation:state.currentLocation || {},\n    currentStatus:String(state.currentStatus || '').trim().toUpperCase(),\n    currentEventId:manualEventId || gpsEventId || '',\n  };\n}\n\nfunction hasRealEvents(events = []) {`,
  'signing options'
);
signing = replacePattern(
  signing,
  /(export function validateLogForSigning\(state, day\) \{[\s\S]*?)(\s+const rawCoverageResult = rawCoverageIssues\([\s\S]*?\);)/,
  `$1\n  const rawCoverageResult = rawCoverageIssues(state.eventsByDay || {}, day, liveCoverageOptionsV1036(state));`,
  'signing coverage declaration',
  'const rawCoverageResult = rawCoverageIssues(state.eventsByDay || {}, day, liveCoverageOptionsV1036(state));'
);
write(signPath, signing);

const finalRaw = read(rawPath);
const finalDot = read(dotPath);
const finalSigning = read(signPath);
if (!finalRaw.includes('rawCompleted.splice(0, rawCompleted.length, ...coverageBaseV1036')) throw new Error('v103.6 raw coverage local tail sync failed');
if (!finalDot.includes('const result = rawCoverageResult || rawCoverageIssues(state.eventsByDay || {}, day, liveCoverageOptionsV1036(state));')) throw new Error('v103.6 DOT grouped call was not patched');
if (!finalDot.includes('const rawCoverageResult = rawCoverageIssues(state.eventsByDay || {}, day, liveCoverageOptionsV1036(state));')) throw new Error('v103.6 DOT main call was not patched');
if (!finalSigning.includes('const rawCoverageResult = rawCoverageIssues(state.eventsByDay || {}, day, liveCoverageOptionsV1036(state));')) throw new Error('v103.6 signing call was not patched');
console.log('v103.6 live coverage patched');
