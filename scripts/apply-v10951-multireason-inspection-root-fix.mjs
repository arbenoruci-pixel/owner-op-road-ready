import fs from 'node:fs';

const VERSION = '109.5.1';
const BUILD = 'v10951-multireason-inspection-root-fix';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replaceFunction(source, name, nextName, replacement) {
  const startMarker = `function ${name}`;
  const nextMarker = `\n\nfunction ${nextName}`;
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`v109.5.1 missing function ${name}`);
  const end = source.indexOf(nextMarker, start);
  if (end < 0) throw new Error(`v109.5.1 missing function boundary ${name} -> ${nextName}`);
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

const appTarget = 'source/src/app/App.jsx';
let app = read(appTarget);

// One canonical activity predicate for inspection workflows. Structured reasons are
// authoritative because one ON DUTY event can represent both PTI and unloading.
if (!app.includes('function inspectionActivityText(event = {})')) {
  const marker = 'function preTripEventForDay(events = []) {';
  const index = app.indexOf(marker);
  if (index < 0) throw new Error('v109.5.1 pre-trip insertion marker missing');
  const helper = `function inspectionActivityText(event = {}) {\n  const reasons = Array.isArray(event?.reasons) ? event.reasons : [];\n  return [...reasons, event?.note || '', event?.description || '']\n    .map(value => String(value || '').trim())\n    .filter(Boolean)\n    .join(' · ');\n}\n\n`;
  app = `${app.slice(0, index)}${helper}${app.slice(index)}`;
}

app = replaceFunction(
  app,
  'preTripEventForDay',
  'reconcilePreTripInspectionForDay',
  `function preTripEventForDay(events = []) {\n  return sorted(events || []).find(event => (\n    isPreTripStatus(event?.status, inspectionActivityText(event))\n  )) || null;\n}`,
);

app = replaceFunction(
  app,
  'reconcilePreTripInspectionForDay',
  'reconcilePreTripInspections',
  `function reconcilePreTripInspectionForDay(inspectionByDay = {}, eventsByDay = {}, day) {\n  const event = preTripEventForDay(eventsByDay?.[day] || []);\n  const rawPrevious = inspectionByDay?.[day] || {};\n  const previous = rawPrevious.complete === true && !PRETRIP_AUTO_ITEMS.every(id => (rawPrevious.checked || []).includes(id))\n    ? { ...rawPrevious, checked:PRETRIP_AUTO_ITEMS }\n    : rawPrevious;\n  const baseInspectionByDay = previous === rawPrevious\n    ? inspectionByDay\n    : { ...inspectionByDay, [day]:previous };\n\n  if (event) {\n    const linkedToThisEvent = previous.sourceEventId === event.id\n      || (!!previous.sourceEventChainId && previous.sourceEventChainId === (event.event_chain_id || event.eventChainId));\n\n    // Generic recovery path: saveInspection stores this marker on the exact event.\n    // A compact/older snapshot can lose inspectionByDay while retaining the event.\n    if (event.inspectionConfirmed === true && !previous.complete) {\n      return {\n        ...baseInspectionByDay,\n        [day]: inspectionFromPreTripEvent(day, event, {\n          ...previous,\n          driverConfirmed:true,\n          confirmedAt:event.inspectionConfirmedAt || previous.confirmedAt || Date.now(),\n          restoredFromEventMarker:true,\n        }),\n      };\n    }\n\n    // Keep an accepted automatic sheet synchronized if the event time/location moves.\n    if (isAutoPreTripInspection(previous) && (linkedToThisEvent || !previous.sourceEventId)) {\n      const nextInspection = inspectionFromPreTripEvent(day, event, previous);\n      if (JSON.stringify(previous) === JSON.stringify(nextInspection)) return baseInspectionByDay;\n      return { ...baseInspectionByDay, [day]:nextInspection };\n    }\n    return baseInspectionByDay;\n  }\n\n  // A completed inspection is an audit record. A failed event lookup can never\n  // delete it. Only an incomplete automatic placeholder may be removed.\n  if (isAutoPreTripInspection(previous) && !previous.complete) {\n    const next = { ...baseInspectionByDay };\n    delete next[day];\n    return next;\n  }\n\n  return baseInspectionByDay;\n}`,
);

// Keep the prompt predicate on the same structured source of truth.
app = app.replace(
  /return isPreTripStatus\(event\?\.status,\s*(?:eventActivityText\(event\)|`\$\{event\?\.note \|\| ''\} \$\{event\?\.description \|\| ''\}`)\) && !existing\.complete;/,
  'return isPreTripStatus(event?.status, inspectionActivityText(event)) && !existing.complete;',
);

if (app.includes('USER_CONFIRMED_INSPECTION_DAYS')) {
  throw new Error('v109.5.1 refuses date-specific inspection repair code');
}

write(appTarget, app);

const dayTarget = 'source/src/modules/logbook/DayLogScreen.jsx';
let daySource = read(dayTarget);
daySource = replaceFunction(
  daySource,
  'isPreTripEvent',
  'minuteTimestampForDay',
  `function isPreTripEvent(event = {}) {\n  const reasons = Array.isArray(event?.reasons) ? event.reasons : [];\n  const activityText = [...reasons, event?.note || '', event?.description || '']\n    .map(value => String(value || '').trim())\n    .filter(Boolean)\n    .join(' · ');\n  return event.status === 'ON' && /pre[-\\s]?trip|inspection/i.test(activityText);\n}`,
);
write(dayTarget, daySource);

const pkgPath = 'package.json';
const pkg = JSON.parse(read(pkgPath));
pkg.version = VERSION;
pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
write(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const lockPath = 'package-lock.json';
const lock = JSON.parse(read(lockPath));
lock.version = VERSION;
if (lock.packages?.['']) {
  lock.packages[''].version = VERSION;
  lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
}
write(lockPath, JSON.stringify(lock, null, 2) + '\n');

const releasedAt = new Date().toISOString();
write('public/app-version.json', JSON.stringify({
  version:VERSION,
  build:BUILD,
  releasedAt,
  updatedAt:releasedAt,
  label:'v109.5.1 Multi-Reason Inspection Root Fix',
  force:true,
  notes:[
    'Uses structured ON DUTY reasons when locating the Pre-trip source event.',
    'Preserves completed inspection audit records if an event lookup ever fails.',
    'Restores a lost compact inspection record from its driver-confirmed event marker.',
    'Removes the date-specific July inspection workaround and fixes the general data pattern.'
  ]
}, null, 2) + '\n');

const swPath = 'public/sw.js';
let sw = read(swPath);
sw = sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`);
sw = sw.replace(/const OWNER_OP_SW_BUILD = '[^']+';/, `const OWNER_OP_SW_BUILD = '${BUILD}';`);
write(swPath, sw);

const updatePath = 'source/src/core/update/appUpdate.js';
let update = read(updatePath);
update = update.replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`);
update = update.replace(/const FALLBACK_APP_BUILD = '[^']+';/, `const FALLBACK_APP_BUILD = '${BUILD}';`);
write(updatePath, update);

const legacyVerifier = 'scripts/verify-v10943-auto-upright.mjs';
let verify = read(legacyVerifier);
verify = verify.replace(/assert\.equal\(release\.version, '[^']+'\);/, `assert.equal(release.version, '${VERSION}');`);
verify = verify.replace(/assert\.equal\(release\.build, '[^']+'\);/, `assert.equal(release.build, '${BUILD}');`);
verify = verify.replace(/assert\.equal\(packageJson\.version, '[^']+'\);/, `assert.equal(packageJson.version, '${VERSION}');`);
write(legacyVerifier, verify);

if (!app.includes('isPreTripStatus(event?.status, inspectionActivityText(event))')) throw new Error('v109.5.1 App reason-aware predicate missing');
if (!app.includes('event.inspectionConfirmed === true && !previous.complete')) throw new Error('v109.5.1 generic event-marker recovery missing');
if (!app.includes('isAutoPreTripInspection(previous) && !previous.complete')) throw new Error('v109.5.1 completed-record deletion guard missing');
if (!daySource.includes('const reasons = Array.isArray(event?.reasons)')) throw new Error('v109.5.1 Inspect tab reason-aware predicate missing');

console.log('PASS — v109.5.1 fixes multi-reason inspection reconciliation at the root');
