import fs from 'node:fs';

const VERSION = '109.5.0';
const BUILD = 'v10950-user-confirmed-inspection-repair';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

const appTarget = 'source/src/app/App.jsx';
let app = read(appTarget);

const normalizeMarker = 'function normalizeState(s) {';
const repairHelper = `const USER_CONFIRMED_INSPECTION_DAYS = ['2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18'];

function restoreUserConfirmedHistoricalInspections(state = {}) {
  let inspectionByDay = { ...(state.inspectionByDay || {}) };
  let eventsByDay = state.eventsByDay || {};
  let inspectionChanged = false;
  let eventsChanged = false;

  for (const day of USER_CONFIRMED_INSPECTION_DAYS) {
    const signature = state.signatureByDay?.[day] || {};
    if (signature.signed !== true) continue;

    const dayEvents = eventsByDay?.[day] || [];
    const event = preTripEventForDay(dayEvents);
    if (!event) continue;

    const previous = inspectionByDay[day] || {};
    const confirmedAt = previous.confirmedAt || signature.signedAt || Date.now();
    const repaired = {
      ...inspectionFromPreTripEvent(day, event, {
        ...previous,
        checked:PRETRIP_AUTO_ITEMS,
        complete:true,
        driverConfirmed:true,
        confirmedAt,
      }),
      checked:PRETRIP_AUTO_ITEMS,
      complete:true,
      driverConfirmed:true,
      confirmedAt,
      source:'user_confirmed_auto_on_duty_pretrip_repair',
      userConfirmedHistoricalRepair:true,
      userConfirmedHistoricalRepairVersion:'109.5.0',
    };

    if (JSON.stringify(previous) !== JSON.stringify(repaired)) {
      inspectionByDay[day] = repaired;
      inspectionChanged = true;
      if (typeof window !== 'undefined') saveInspectionDaySnapshot(day, repaired).catch(() => {});
    }

    const nextDayEvents = dayEvents.map(item => {
      if (item?.id !== event.id) return item;
      const markerComplete = item.inspectionConfirmed === true
        && item.inspectionSourceEventId === event.id
        && item.userConfirmedHistoricalInspection === true;
      if (markerComplete) return item;
      return {
        ...item,
        inspectionConfirmed:true,
        inspectionConfirmedAt:item.inspectionConfirmedAt || confirmedAt,
        inspectionSourceEventId:event.id,
        userConfirmedHistoricalInspection:true,
      };
    });
    if (nextDayEvents.some((item, index) => item !== dayEvents[index])) {
      if (eventsByDay === state.eventsByDay) eventsByDay = { ...eventsByDay };
      eventsByDay[day] = nextDayEvents;
      eventsChanged = true;
    }
  }

  if (!inspectionChanged && !eventsChanged) return state;
  return {
    ...state,
    inspectionByDay:inspectionChanged ? inspectionByDay : state.inspectionByDay,
    eventsByDay:eventsChanged ? eventsByDay : state.eventsByDay,
    userConfirmedHistoricalInspectionRepair:{
      version:'109.5.0',
      days:USER_CONFIRMED_INSPECTION_DAYS,
      appliedAt:state.userConfirmedHistoricalInspectionRepair?.appliedAt || Date.now(),
    },
  };
}

`;
if (!app.includes('function restoreUserConfirmedHistoricalInspections')) {
  if (!app.includes(normalizeMarker)) throw new Error('v109.5.0 normalizeState marker missing');
  app = app.replace(normalizeMarker, repairHelper + normalizeMarker);
}

const normalizePatched = `function normalizeState(s) {
  s = restoreUserConfirmedHistoricalInspections(s);`;
if (!app.includes(normalizePatched)) {
  if (!app.includes(normalizeMarker)) throw new Error('v109.5.0 normalizeState patch target missing');
  app = app.replace(normalizeMarker, normalizePatched);
}
write(appTarget, app);

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
  label:'v109.5.0 Confirmed Inspection Repair',
  force:true,
  notes:[
    'Restores completed inspection records for July 15–18 from the signed log and exact ON DUTY Pre-trip event.',
    'Runs during every state normalization so those four confirmed sheets cannot return blank after app close or reload.',
    'Writes each restored inspection to the independent per-day durable snapshot store.',
    'Does not change duty times, duty statuses, GPS, signatures, routes, BOLs or PODs.'
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

const verifyTarget = 'scripts/verify-v10943-auto-upright.mjs';
let verify = read(verifyTarget);
verify = verify.replace(/assert\.equal\(release\.version, '[^']+'\);/, `assert.equal(release.version, '${VERSION}');`);
verify = verify.replace(/assert\.equal\(release\.build, '[^']+'\);/, `assert.equal(release.build, '${BUILD}');`);
verify = verify.replace(/assert\.equal\(packageJson\.version, '[^']+'\);/, `assert.equal(packageJson.version, '${VERSION}');`);
write(verifyTarget, verify);

for (const day of ['2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18']) {
  if (!app.includes(`'${day}'`)) throw new Error(`v109.5.0 missing repair day ${day}`);
}
if (!app.includes('s = restoreUserConfirmedHistoricalInspections(s);')) throw new Error('v109.5.0 normalize repair hook missing');
if (!app.includes('saveInspectionDaySnapshot(day, repaired)')) throw new Error('v109.5.0 durable inspection write missing');

console.log('PASS — v109.5.0 user-confirmed July 15–18 inspections are restored on every normalization');
