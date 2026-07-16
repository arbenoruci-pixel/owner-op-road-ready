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
  `  const rawCompleted = events.filter(event => Number(event.endMin || 0) > Number(event.startMin || 0));\n  const liveTailV1036 = extendCurrentStatusTailV1036(rawCompleted, {\n    isCurrentDay:current,\n    targetEnd,\n    currentStatus:options.currentStatus || options.activeStatus || '',\n    currentEventId:options.currentEventId || options.activeEventId || '',\n  });\n  const coverageBaseV1036 = liveTailV1036.events;\n  const issues = [];`,
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
dot = replaceOnce(
  dot,
  `  const result = rawCoverageResult || rawCoverageIssues(state.eventsByDay || {}, day, { currentLocation: state.currentLocation || {} });`,
  `  const result = rawCoverageResult || rawCoverageIssues(state.eventsByDay || {}, day, liveCoverageOptionsV1036(state));`,
  'DOT grouped coverage'
);
dot = replaceOnce(
  dot,
  `  const rawCoverageResult = rawCoverageIssues(state.eventsByDay || {}, day, { currentLocation: state.currentLocation || {} });`,
  `  const rawCoverageResult = rawCoverageIssues(state.eventsByDay || {}, day, liveCoverageOptionsV1036(state));`,
  'DOT coverage'
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
signing = replaceOnce(
  signing,
  `  const rawCoverageResult = rawCoverageIssues(state.eventsByDay || {}, day, { currentLocation: state.currentLocation || {} });`,
  `  const rawCoverageResult = rawCoverageIssues(state.eventsByDay || {}, day, liveCoverageOptionsV1036(state));`,
  'signing coverage'
);
write(signPath, signing);

if (!read(rawPath).includes('coverageBaseV1036')) throw new Error('v103.6 raw coverage patch failed');
if (!read(dotPath).includes('liveCoverageOptionsV1036')) throw new Error('v103.6 DOT patch failed');
if (!read(signPath).includes('liveCoverageOptionsV1036')) throw new Error('v103.6 signing patch failed');
console.log('v103.6 live coverage patched');
