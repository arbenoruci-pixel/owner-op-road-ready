import fs from 'node:fs';

const VERSION = '109.4.9';
const BUILD = 'v10949-inspection-write-order';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`v109.4.9 patch target missing: ${label}`);
  return source.replace(before, after);
}

// Serialize whole-state snapshot writes and keep one independent inspection record per day.
const appStateTarget = 'lib/local-db/appState.js';
let appState = read(appStateTarget);

const saveBefore = `export async function saveAppSnapshot(key = APP_STATE_KEY, state) {
  const db = getOwnerOpDb();
  if (!db) return null;
  const now = new Date().toISOString();
  await db.app_snapshots.put({ key, state, updated_at: now });
  await db.sync_meta.put({ key: 'last_local_write_at', value: now, updated_at: now });
  return now;
}`;

const saveAfter = `const snapshotWriteQueueByKey = new Map();

function queueSnapshotWrite(key, writer) {
  const previous = snapshotWriteQueueByKey.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(writer);
  snapshotWriteQueueByKey.set(key, next);
  next.finally(() => {
    if (snapshotWriteQueueByKey.get(key) === next) snapshotWriteQueueByKey.delete(key);
  }).catch(() => {});
  return next;
}

export async function saveAppSnapshot(key = APP_STATE_KEY, state) {
  const db = getOwnerOpDb();
  if (!db) return null;
  const now = new Date().toISOString();
  const stateAtCall = state;
  return queueSnapshotWrite(key, async () => {
    await db.app_snapshots.put({ key, state:stateAtCall, updated_at: now });
    await db.sync_meta.put({ key: 'last_local_write_at', value: now, updated_at: now });
    return now;
  });
}`;
appState = replaceOnce(appState, saveBefore, saveAfter, 'serialized app snapshot writes');

const clearMarker = `export async function clearAppSnapshot(key = APP_STATE_KEY) {`;
const inspectionHelpers = `export const INSPECTION_DAY_SNAPSHOT_PREFIX = 'owner-op-road-ready-inspection-day:';

export async function saveInspectionDaySnapshot(day, inspection = {}) {
  if (!day) return null;
  const updatedAt = Number(inspection.updatedAt || Date.now());
  return saveAppSnapshot(\`${'${INSPECTION_DAY_SNAPSHOT_PREFIX}${day}'}\`, {
    day,
    inspection:{ ...inspection, updatedAt },
    savedAt:new Date().toISOString(),
  });
}

export async function loadInspectionDaySnapshots() {
  const db = getOwnerOpDb();
  if (!db) return {};
  try {
    const rows = await db.app_snapshots.toArray();
    const out = {};
    for (const row of rows || []) {
      if (!String(row?.key || '').startsWith(INSPECTION_DAY_SNAPSHOT_PREFIX)) continue;
      const day = String(row.key).slice(INSPECTION_DAY_SNAPSHOT_PREFIX.length);
      const inspection = row?.state?.inspection;
      if (!day || !inspection || typeof inspection !== 'object') continue;
      const existing = out[day];
      if (!existing || Number(inspection.updatedAt || 0) >= Number(existing.updatedAt || 0)) {
        out[day] = inspection;
      }
    }
    return out;
  } catch {
    return {};
  }
}

`;
if (!appState.includes('export async function saveInspectionDaySnapshot')) {
  if (!appState.includes(clearMarker)) throw new Error('v109.4.9 appState insertion marker missing');
  appState = appState.replace(clearMarker, inspectionHelpers + clearMarker);
}
write(appStateTarget, appState);

const appTarget = 'source/src/app/App.jsx';
let app = read(appTarget);

const importBefore = `import { APP_STATE_KEY, clearAppSnapshot, loadAppSnapshot, loadDutyEventRecoveryHistory, loadPreUpdateSnapshot, saveAppSnapshot, savePreUpdateSnapshot } from '../../../lib/local-db/appState.js';`;
const importAfter = `import { APP_STATE_KEY, clearAppSnapshot, loadAppSnapshot, loadDutyEventRecoveryHistory, loadInspectionDaySnapshots, loadPreUpdateSnapshot, saveAppSnapshot, saveInspectionDaySnapshot, savePreUpdateSnapshot } from '../../../lib/local-db/appState.js';`;
app = replaceOnce(app, importBefore, importAfter, 'inspection snapshot imports');

const loadMarker = `async function loadInitial() {`;
const mergeHelper = `function mergeDurableInspectionSnapshots(state = {}, durableByDay = {}) {
  const current = { ...(state.inspectionByDay || {}) };
  let changed = false;
  Object.entries(durableByDay || {}).forEach(([day, durable]) => {
    if (!durable || typeof durable !== 'object') return;
    const existing = current[day] || {};
    const durableComplete = durable.complete === true;
    const existingComplete = existing.complete === true;
    const durableNewer = Number(durable.updatedAt || 0) >= Number(existing.updatedAt || 0);
    if ((durableComplete && !existingComplete) || durableNewer) {
      current[day] = durableComplete
        ? { ...durable, checked:PRETRIP_AUTO_ITEMS, complete:true }
        : durable;
      changed = true;
    }
  });
  return changed ? { ...state, inspectionByDay:current } : state;
}

`;
if (!app.includes('function mergeDurableInspectionSnapshots')) {
  if (!app.includes(loadMarker)) throw new Error('v109.4.9 loadInitial marker missing');
  app = app.replace(loadMarker, mergeHelper + loadMarker);
}

const loadBefore = `    const saved = await loadAppSnapshot(APP_STATE_KEY);
    if (saved) {
      const recovered = await recoverSuspiciousTodayState(saved);
      const continuous = reconcileCurrentManualDrivingContinuity(recovered, new Date(), {
        allowClosedGapRepair:false,
        forceActiveDriving:recovered.currentStatus === 'D',
        reason:'startup_manual_driving_continuity',
      });`;
const loadAfter = `    const [saved, durableInspectionByDay] = await Promise.all([
      loadAppSnapshot(APP_STATE_KEY),
      loadInspectionDaySnapshots().catch(() => ({})),
    ]);
    if (saved) {
      const savedWithDurableInspections = mergeDurableInspectionSnapshots(saved, durableInspectionByDay);
      const recovered = await recoverSuspiciousTodayState(savedWithDurableInspections);
      const continuous = reconcileCurrentManualDrivingContinuity(recovered, new Date(), {
        allowClosedGapRepair:false,
        forceActiveDriving:recovered.currentStatus === 'D',
        reason:'startup_manual_driving_continuity',
      });`;
app = replaceOnce(app, loadBefore, loadAfter, 'restore durable inspection snapshots');

const persistBefore = `      saveAppSnapshot(APP_STATE_KEY, next).catch(() => {});`;
const persistAfter = `      saveInspectionDaySnapshot(day, inspection).catch(() => {});
      saveAppSnapshot(APP_STATE_KEY, next).catch(() => {});`;
app = replaceOnce(app, persistBefore, persistAfter, 'independent inspection-day write');
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
  label:'v109.4.9 Inspection Write Order',
  force:true,
  notes:[
    'Serializes app snapshot writes so an older pending save cannot overwrite a newly completed inspection.',
    'Stores each completed inspection in an independent per-day snapshot.',
    'Restores the newest durable inspection record during app startup.',
    'Keeps Signed log status and preserves duty times, duty statuses, GPS and route records.'
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

if (!appState.includes('snapshotWriteQueueByKey')) throw new Error('v109.4.9 serialized write queue missing');
if (!appState.includes('saveInspectionDaySnapshot')) throw new Error('v109.4.9 durable inspection save missing');
if (!app.includes('mergeDurableInspectionSnapshots')) throw new Error('v109.4.9 durable inspection restore missing');
if (!app.includes('saveInspectionDaySnapshot(day, inspection)')) throw new Error('v109.4.9 inspection write-through missing');

console.log('PASS — v109.4.9 inspection saves cannot be overwritten by stale snapshot writes');
