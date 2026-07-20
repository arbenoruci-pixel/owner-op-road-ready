'use client';

import { getOwnerOpDb } from './dexie.js';

export const APP_STATE_KEY = 'owner-op-road-ready-state-v1';
export const PRE_UPDATE_STATE_KEY = 'owner-op-road-ready-pre-update-snapshot-v1';
export const UPDATE_META_KEY = 'owner-op-road-ready-update-meta-v1';

const EMERGENCY_EXPORT_COPY_KEY = 'owner-op-road-ready-emergency-export-copy-v1';
const LOCAL_DB_READ_TIMEOUT_MS = 6500;
const LOCAL_DB_WRITE_TIMEOUT_MS = 8000;

function timeoutError(label, timeoutMs) {
  const error = new Error(`${label} timed out after ${timeoutMs}ms`);
  error.name = 'LocalStorageTimeoutError';
  return error;
}

function withLocalDbTimeout(promise, label, timeoutMs = LOCAL_DB_READ_TIMEOUT_MS) {
  let timer = null;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(timeoutError(label, timeoutMs)), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function readLocalStorageJson(key) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function emergencySnapshotFallback(reason = 'indexeddb_unavailable') {
  const payload = readLocalStorageJson(EMERGENCY_EXPORT_COPY_KEY);
  const restored = payload?.state || payload?.appState || null;
  if (restored && typeof restored === 'object') {
    return {
      ...restored,
      view: 'logs',
      sheet: null,
      selectMode: false,
      selectedIds: [],
      roadGuardTabRequest: null,
      _storageRecoveryMeta: {
        recoveredAt: new Date().toISOString(),
        reason,
        source: EMERGENCY_EXPORT_COPY_KEY,
        sourceVersion: payload?.appVersion || '',
      },
    };
  }

  return {
    view: 'backup',
    sheet: null,
    selectMode: false,
    selectedIds: [],
    storageRecoveryRequired: true,
    _storageRecoveryMeta: {
      recoveredAt: new Date().toISOString(),
      reason,
      source: 'backup_screen_safe_mode',
    },
  };
}

export async function loadAppSnapshot(key = APP_STATE_KEY) {
  const db = getOwnerOpDb();
  if (!db) return emergencySnapshotFallback('indexeddb_not_supported');

  try {
    const row = await withLocalDbTimeout(
      db.app_snapshots.get(key),
      'Road Ready startup snapshot read',
    );
    return row?.state || null;
  } catch (error) {
    console.warn('[road-ready] IndexedDB startup read failed; using safe recovery.', error);
    return emergencySnapshotFallback(error?.name === 'LocalStorageTimeoutError'
      ? 'indexeddb_startup_timeout'
      : 'indexeddb_startup_error');
  }
}

export async function saveAppSnapshot(key = APP_STATE_KEY, state) {
  if (state?.storageRecoveryRequired === true) {
    console.warn('[road-ready] Skipping snapshot write while storage recovery is required.');
    return null;
  }

  const db = getOwnerOpDb();
  if (!db) return null;
  const now = new Date().toISOString();

  try {
    await withLocalDbTimeout(
      Promise.all([
        db.app_snapshots.put({ key, state, updated_at: now }),
        db.sync_meta.put({ key: 'last_local_write_at', value: now, updated_at: now }),
      ]),
      'Road Ready snapshot write',
      LOCAL_DB_WRITE_TIMEOUT_MS,
    );
    return now;
  } catch (error) {
    console.warn('[road-ready] Snapshot write did not complete.', error);
    return null;
  }
}

export async function clearAppSnapshot(key = APP_STATE_KEY) {
  const db = getOwnerOpDb();
  if (!db) return null;
  try {
    await withLocalDbTimeout(
      db.app_snapshots.delete(key),
      'Road Ready snapshot clear',
      LOCAL_DB_WRITE_TIMEOUT_MS,
    );
  } catch (error) {
    console.warn('[road-ready] Snapshot clear did not complete.', error);
  }
  return null;
}

export async function savePreUpdateSnapshot(state, meta = {}) {
  const db = getOwnerOpDb();
  const now = new Date().toISOString();
  const payload = {
    ...(state || {}),
    _backupMeta: {
      kind: 'pre_update',
      createdAt: now,
      ...meta,
    },
  };

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(PRE_UPDATE_STATE_KEY, JSON.stringify(payload));
      window.localStorage.setItem(UPDATE_META_KEY, JSON.stringify(payload._backupMeta));
    }
  } catch {}

  if (!db) return now;
  try {
    await withLocalDbTimeout(
      Promise.all([
        db.app_snapshots.put({ key: PRE_UPDATE_STATE_KEY, state: payload, updated_at: now }),
        db.sync_meta.put({ key: 'last_pre_update_backup_at', value: now, updated_at: now }),
        db.sync_meta.put({ key: 'last_pre_update_backup_meta', value: payload._backupMeta, updated_at: now }),
      ]),
      'Road Ready pre-update snapshot write',
      LOCAL_DB_WRITE_TIMEOUT_MS,
    );
  } catch (error) {
    console.warn('[road-ready] Pre-update IndexedDB backup did not complete; local copy remains available.', error);
  }
  return now;
}

export async function loadPreUpdateSnapshot() {
  const db = getOwnerOpDb();
  if (db) {
    try {
      const row = await withLocalDbTimeout(
        db.app_snapshots.get(PRE_UPDATE_STATE_KEY),
        'Road Ready pre-update snapshot read',
      );
      if (row?.state) return row.state;
    } catch (error) {
      console.warn('[road-ready] Pre-update IndexedDB read failed; trying local backup.', error);
    }
  }
  return readLocalStorageJson(PRE_UPDATE_STATE_KEY);
}

export async function loadDutyEventRecoveryHistory(day) {
  const db = getOwnerOpDb();
  if (!db || !day) return { revisionRows: [], idMapRows: [] };
  try {
    const [allRevisions, allMaps] = await withLocalDbTimeout(
      Promise.all([
        db.duty_events_local.toArray(),
        db.id_maps.toArray(),
      ]),
      'Road Ready duty recovery history read',
    );
    return {
      revisionRows: (allRevisions || []).filter(row => row?.log_date === day),
      idMapRows: (allMaps || []).filter(row => row?.entity === 'duty_event' || !row?.entity),
    };
  } catch (error) {
    console.warn('[road-ready] Duty recovery history read failed; continuing startup safely.', error);
    return { revisionRows: [], idMapRows: [] };
  }
}
