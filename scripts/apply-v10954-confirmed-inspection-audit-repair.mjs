import fs from 'node:fs';

const VERSION = '109.5.4';
const BUILD = 'v10954-confirmed-inspection-audit-repair';
const APP_PATH = 'source/src/app/App.jsx';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function writeJson(path, transform) {
  const value = JSON.parse(read(path));
  transform(value);
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

let app = read(APP_PATH);

const normalizeMarker = 'function normalizeState(s) {';
if (!app.includes(normalizeMarker)) throw new Error('v109.5.4 normalizeState marker missing');

if (!app.includes('function reconcileConfirmedInspectionAuditState(state = {})')) {
  const helper = `function reconcileConfirmedInspectionAuditState(state = {}) {
  const originalEventsByDay = state.eventsByDay || {};
  let eventsByDay = originalEventsByDay;
  let inspectionByDay = state.inspectionByDay || {};
  let eventsChanged = false;
  let inspectionsChanged = false;

  // First, make every already-completed inspection self-healing by writing the
  // confirmation marker back onto its exact source event. This is a migration
  // of existing audit evidence, not a new inspection decision.
  Object.entries(inspectionByDay).forEach(([day, inspection]) => {
    if (inspection?.complete !== true || !inspection.sourceEventId) return;
    const dayEvents = eventsByDay?.[day] || [];
    let changedDay = false;
    const nextDayEvents = dayEvents.map(event => {
      if (event?.id !== inspection.sourceEventId) return event;
      if (event.inspectionConfirmed === true
        && event.inspectionSourceEventId === inspection.sourceEventId) return event;
      changedDay = true;
      return {
        ...event,
        inspectionConfirmed:true,
        inspectionConfirmedAt:event.inspectionConfirmedAt
          || inspection.confirmedAt
          || inspection.completedAt
          || inspection.updatedAt
          || Date.now(),
        inspectionSourceEventId:inspection.sourceEventId,
      };
    });
    if (!changedDay) return;
    if (!eventsChanged) eventsByDay = { ...eventsByDay };
    eventsByDay[day] = nextDayEvents;
    eventsChanged = true;
  });

  // Then restore a missing compact inspection record only from an explicit
  // driver-confirmation marker on a real ON DUTY Pre-trip event. This covers
  // legacy multi-reason events where PTI lives in reasons[] beside unloading.
  Object.entries(eventsByDay).forEach(([day, dayEvents]) => {
    const confirmedEvent = sorted(dayEvents || []).find(event => (
      event?.inspectionConfirmed === true
      && isPreTripStatus(event?.status, inspectionActivityText(event))
    ));
    if (!confirmedEvent) return;

    const previous = inspectionByDay?.[day] || {};
    const allItemsPresent = PRETRIP_AUTO_ITEMS.every(id => (previous.checked || []).includes(id));
    const linkedToConfirmedEvent = previous.sourceEventId === confirmedEvent.id;
    if (previous.complete === true && allItemsPresent && linkedToConfirmedEvent) return;

    const confirmedAt = Number(
      confirmedEvent.inspectionConfirmedAt
      || previous.confirmedAt
      || previous.completedAt
      || previous.updatedAt
      || Date.now()
    );
    const restored = inspectionFromPreTripEvent(day, confirmedEvent, {
      ...previous,
      checked:PRETRIP_AUTO_ITEMS,
      complete:true,
      driverConfirmed:true,
      confirmedAt,
      restoredFromEventMarker:true,
      auditRepairVersion:VERSION,
    });
    restored.checked = PRETRIP_AUTO_ITEMS;
    restored.complete = true;
    restored.driverConfirmed = true;
    restored.confirmedAt = confirmedAt;
    restored.updatedAt = Number(previous.updatedAt || confirmedAt || restored.updatedAt || Date.now());

    if (!inspectionsChanged) inspectionByDay = { ...inspectionByDay };
    inspectionByDay[day] = restored;
    inspectionsChanged = true;
  });

  if (!eventsChanged && !inspectionsChanged) return state;
  return {
    ...state,
    eventsByDay,
    inspectionByDay,
    confirmedInspectionAuditRepair:{
      version:VERSION,
      repairedAt:Date.now(),
    },
  };
}

`;
  app = app.replace(normalizeMarker, helper + normalizeMarker);
}

const normalizedStart = `function normalizeState(s) {\n`;
const normalizedStartPatched = `function normalizeState(s) {\n  s = reconcileConfirmedInspectionAuditState(s);\n`;
if (!app.includes(normalizedStartPatched)) {
  if (!app.includes(normalizedStart)) throw new Error('v109.5.4 normalizeState opening missing');
  app = app.replace(normalizedStart, normalizedStartPatched);
}

// Every completed inspection created or restored in state is also written to
// the independent per-day snapshot. This makes refresh/import recovery durable.
const persistenceBefore = `    if (previousInspectionByDay) queueInspectionDiffs(previousInspectionByDay, state.inspectionByDay || {}).catch(() => {});`;
const persistenceAfter = `    if (previousInspectionByDay) {
      queueInspectionDiffs(previousInspectionByDay, state.inspectionByDay || {}).catch(() => {});
      Object.entries(state.inspectionByDay || {}).forEach(([day, inspection]) => {
        const previous = previousInspectionByDay?.[day] || {};
        const changed = JSON.stringify(previous) !== JSON.stringify(inspection);
        if (changed && inspection?.complete === true) {
          saveInspectionDaySnapshot(day, inspection).catch(() => {});
        }
      });
    }`;
if (!app.includes(persistenceAfter)) {
  if (!app.includes(persistenceBefore)) throw new Error('v109.5.4 inspection persistence effect target missing');
  app = app.replace(persistenceBefore, persistenceAfter);
}

write(APP_PATH, app);

writeJson('package.json', pkg => {
  pkg.version = VERSION;
  pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
});
if (fs.existsSync('package-lock.json')) {
  writeJson('package-lock.json', lock => {
    lock.version = VERSION;
    if (lock.packages?.['']) {
      lock.packages[''].version = VERSION;
      lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
    }
  });
}

const releasedAt = new Date().toISOString();
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:BUILD,
  releasedAt,
  updatedAt:releasedAt,
  label:'v109.5.4 Confirmed Inspection Audit Repair',
  force:true,
  notes:[
    'Repairs missing inspectionByDay records only when the exact ON DUTY Pre-trip event already has inspectionConfirmed=true.',
    'Supports multi-reason Pre-trip plus Delivery / Unloading events without hardcoded dates.',
    'Backfills the event confirmation marker from any existing completed inspection so the record is self-healing.',
    'Writes every restored completed inspection to its independent per-day durable snapshot.'
  ]
}, null, 2)}\n`);

let sw = read('public/sw.js');
sw = sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`);
sw = sw.replace(/const OWNER_OP_SW_BUILD = '[^']+';/, `const OWNER_OP_SW_BUILD = '${BUILD}';`);
write('public/sw.js', sw);

let update = read('source/src/core/update/appUpdate.js');
update = update.replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`);
update = update.replace(/const FALLBACK_APP_BUILD = '[^']+';/, `const FALLBACK_APP_BUILD = '${BUILD}';`);
write('source/src/core/update/appUpdate.js', update);

const legacyVerifier = 'scripts/verify-v10943-auto-upright.mjs';
let verify = read(legacyVerifier);
verify = verify.replace(/assert\.equal\(release\.version, '[^']+'\);/, `assert.equal(release.version, '${VERSION}');`);
verify = verify.replace(/assert\.equal\(release\.build, '[^']+'\);/, `assert.equal(release.build, '${BUILD}');`);
verify = verify.replace(/assert\.equal\(packageJson\.version, '[^']+'\);/, `assert.equal(packageJson.version, '${VERSION}');`);
write(legacyVerifier, verify);

if (!app.includes('s = reconcileConfirmedInspectionAuditState(s);')) throw new Error('v109.5.4 normalize integration missing');
if (!app.includes('event?.inspectionConfirmed === true')) throw new Error('v109.5.4 explicit confirmation gate missing');
if (!app.includes('inspectionActivityText(event)')) throw new Error('v109.5.4 multi-reason activity source missing');
if (!app.includes('saveInspectionDaySnapshot(day, inspection)')) throw new Error('v109.5.4 durable snapshot write missing');
if (/2026-07-1[5-8]/.test(app.slice(app.indexOf('function reconcileConfirmedInspectionAuditState'), app.indexOf('function normalizeState')))) {
  throw new Error('v109.5.4 refuses date-specific inspection logic');
}

console.log('PASS — v109.5.4 restores only explicitly confirmed inspection audit records');
