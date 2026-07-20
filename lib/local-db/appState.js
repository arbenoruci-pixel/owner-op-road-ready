'use client';

import { getOwnerOpDb } from './dexie.js';

export const APP_STATE_KEY = 'owner-op-road-ready-state-v1';
export const PRE_UPDATE_STATE_KEY = 'owner-op-road-ready-pre-update-snapshot-v1';
export const UPDATE_META_KEY = 'owner-op-road-ready-update-meta-v1';

const EMERGENCY_EXPORT_COPY_KEY = 'owner-op-road-ready-emergency-export-copy-v1';
const LOCAL_FALLBACK_PREFIX = 'owner-op-road-ready-local-fallback-v1';
const LOCAL_DB_READ_TIMEOUT_MS = 6500;
const LOCAL_DB_WRITE_TIMEOUT_MS = 8000;
const LOCAL_DB_WRITE_COOLDOWN_MS = 30000;

const snapshotWriteQueues = new Map();
let indexedDbWriteCooldownUntil = 0;

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

function fallbackStorageKey(key = APP_STATE_KEY) {
  return `${LOCAL_FALLBACK_PREFIX}:${key}`;
}

function normalizedPersistentState(state) {
  if (!state || typeof state !== 'object') return state;
  const next = { ...state };
  if (next.storageRecoveryRequired === true) next.storageRecoveryRequired = false;
  return next;
}

function compactFallbackReplacer(key, value) {
  if (typeof value === 'string' && value.startsWith('data:') && value.length > 250000) {
    return '';
  }
  if (typeof value === 'string' && value.length > 1500000) {
    return value.slice(0, 1500000);
  }
  return value;
}

function writeLocalFallbackSnapshot(key, state, updatedAt) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const storageKey = fallbackStorageKey(key);
    const payload = {
      key,
      state: normalizedPersistentState(state),
      updated_at: updatedAt,
      source: 'localStorage_fallback_v1',
    };
    const previous = window.localStorage.getItem(storageKey);

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
      return true;
    } catch (fullError) {
      try {
        const compact = JSON.stringify(payload, compactFallbackReplacer);
        window.localStorage.removeItem(storageKey);
        window.localStorage.setItem(storageKey, compact);
        console.warn('[road-ready] Saved a compact local fallback because the full snapshot exceeded browser storage.', fullError);
        return true;
      } catch (compactError) {
        try {
          if (previous != null) window.localStorage.setItem(storageKey, previous);
        } catch {}
        console.warn('[road-ready] Local fallback snapshot could not be saved.', compactError);
        return false;
      }
    }
  } catch (error) {
    console.warn('[road-ready] Local fallback snapshot could not be saved.', error);
    return false;
  }
}

function readLocalFallbackSnapshot(key = APP_STATE_KEY) {
  const payload = readLocalStorageJson(fallbackStorageKey(key));
  if (!payload || typeof payload !== 'object') return null;
  if (payload.state && typeof payload.state === 'object') return payload;
  return {
    key,
    state: payload,
    updated_at: payload.updated_at || payload.updatedAt || '',
    source: 'legacy_localStorage_fallback',
  };
}

function timestampValue(value) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? time : 0;
}

function recoveredState(state, reason, source) {
  return {
    ...(state || {}),
    storageRecoveryRequired: false,
    _storageRecoveryMeta: {
      ...(state?._storageRecoveryMeta || {}),
      recoveredAt: new Date().toISOString(),
      reason,
      source,
    },
  };
}

function emergencySnapshotFallback(reason = 'indexeddb_unavailable') {
  const payload = readLocalStorageJson(EMERGENCY_EXPORT_COPY_KEY);
  const restored = payload?.state || payload?.appState || null;
  if (restored && typeof restored === 'object') {
    return {
      ...recoveredState(restored, reason, EMERGENCY_EXPORT_COPY_KEY),
      view: 'logs',
      sheet: null,
      selectMode: false,
      selectedIds: [],
      roadGuardTabRequest: null,
      _storageRecoveryMeta: {
        ...(restored?._storageRecoveryMeta || {}),
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

function enqueueSnapshotWrite(key, task) {
  const previous = snapshotWriteQueues.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  snapshotWriteQueues.set(key, current);
  current.finally(() => {
    if (snapshotWriteQueues.get(key) === current) snapshotWriteQueues.delete(key);
  }).catch(() => {});
  return current;
}

async function persistAndVerifyIndexedDbSnapshot(db, key, state, updatedAt) {
  await withLocalDbTimeout(
    Promise.all([
      db.app_snapshots.put({ key, state, updated_at: updatedAt }),
      db.sync_meta.put({ key: 'last_local_write_at', value: updatedAt, updated_at: updatedAt }),
    ]),
    'Road Ready snapshot write',
    LOCAL_DB_WRITE_TIMEOUT_MS,
  );

  const verified = await withLocalDbTimeout(
    db.app_snapshots.get(key),
    'Road Ready snapshot verification',
    LOCAL_DB_READ_TIMEOUT_MS,
  );
  if (!verified?.state || verified.updated_at !== updatedAt) {
    throw new Error('Road Ready snapshot verification failed');
  }
}

export async function loadAppSnapshot(key = APP_STATE_KEY) {
  const fallback = readLocalFallbackSnapshot(key);
  const db = getOwnerOpDb();

  if (!db) {
    if (fallback?.state) return recoveredState(fallback.state, 'indexeddb_not_supported', fallback.source || 'localStorage_fallback_v1');
    return emergencySnapshotFallback('indexeddb_not_supported');
  }

  try {
    const row = await withLocalDbTimeout(
      db.app_snapshots.get(key),
      'Road Ready startup snapshot read',
    );

    if (fallback?.state && (!row?.state || timestampValue(fallback.updated_at) > timestampValue(row.updated_at))) {
      return recoveredState(fallback.state, 'local_fallback_newer_than_indexeddb', fallback.source || 'localStorage_fallback_v1');
    }
    if (row?.state) return row.state;
    if (fallback?.state) return recoveredState(fallback.state, 'indexeddb_snapshot_missing', fallback.source || 'localStorage_fallback_v1');
    return null;
  } catch (error) {
    console.warn('[road-ready] IndexedDB startup read failed; using safe recovery.', error);
    if (fallback?.state) {
      return recoveredState(
        fallback.state,
        error?.name === 'LocalStorageTimeoutError' ? 'indexeddb_startup_timeout' : 'indexeddb_startup_error',
        fallback.source || 'localStorage_fallback_v1',
      );
    }
    return emergencySnapshotFallback(error?.name === 'LocalStorageTimeoutError'
      ? 'indexeddb_startup_timeout'
      : 'indexeddb_startup_error');
  }
}

export async function saveAppSnapshot(key = APP_STATE_KEY, state) {
  if (!state || typeof state !== 'object') throw new Error('Road Ready snapshot is missing');

  const now = new Date().toISOString();
  const stateForSave = normalizedPersistentState(state);
  const fallbackSaved = writeLocalFallbackSnapshot(key, stateForSave, now);

  return enqueueSnapshotWrite(key, async () => {
    if (state?.storageRecoveryRequired === true) {
      if (fallbackSaved) return now;
      throw new Error('Road Ready recovery snapshot could not be saved');
    }

    const db = getOwnerOpDb();
    if (!db || Date.now() < indexedDbWriteCooldownUntil) {
      if (fallbackSaved) return now;
      throw new Error('Road Ready browser storage is unavailable');
    }

    try {
      await persistAndVerifyIndexedDbSnapshot(db, key, stateForSave, now);
      indexedDbWriteCooldownUntil = 0;
      return now;
    } catch (error) {
      indexedDbWriteCooldownUntil = Date.now() + LOCAL_DB_WRITE_COOLDOWN_MS;
      console.warn('[road-ready] IndexedDB save failed; the verified local fallback remains active.', error);
      if (fallbackSaved) return now;
      throw error;
    }
  });
}

export async function clearAppSnapshot(key = APP_STATE_KEY) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(fallbackStorageKey(key));
    }
  } catch {}

  const db = getOwnerOpDb();
  if (!db) return null;
  try {
    await enqueueSnapshotWrite(key, () => withLocalDbTimeout(
      db.app_snapshots.delete(key),
      'Road Ready snapshot clear',
      LOCAL_DB_WRITE_TIMEOUT_MS,
    ));
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
