'use client';

import { getOwnerOpDb } from './dexie.js';

export const APP_STATE_KEY = 'owner-op-road-ready-state-v1';
export const PRE_UPDATE_STATE_KEY = 'owner-op-road-ready-pre-update-snapshot-v1';
export const UPDATE_META_KEY = 'owner-op-road-ready-update-meta-v1';

export async function loadAppSnapshot(key = APP_STATE_KEY) {
  const db = getOwnerOpDb();
  if (!db) return null;
  const row = await db.app_snapshots.get(key);
  return row?.state || null;
}

export async function saveAppSnapshot(key = APP_STATE_KEY, state) {
  const db = getOwnerOpDb();
  if (!db) return null;
  const now = new Date().toISOString();
  await db.app_snapshots.put({ key, state, updated_at: now });
  await db.sync_meta.put({ key: 'last_local_write_at', value: now, updated_at: now });
  return now;
}

export async function clearAppSnapshot(key = APP_STATE_KEY) {
  const db = getOwnerOpDb();
  if (!db) return null;
  await db.app_snapshots.delete(key);
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
  await db.app_snapshots.put({ key: PRE_UPDATE_STATE_KEY, state: payload, updated_at: now });
  await db.sync_meta.put({ key: 'last_pre_update_backup_at', value: now, updated_at: now });
  await db.sync_meta.put({ key: 'last_pre_update_backup_meta', value: payload._backupMeta, updated_at: now });
  return now;
}

export async function loadPreUpdateSnapshot() {
  const db = getOwnerOpDb();
  if (db) {
    const row = await db.app_snapshots.get(PRE_UPDATE_STATE_KEY);
    if (row?.state) return row.state;
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(PRE_UPDATE_STATE_KEY);
      return raw ? JSON.parse(raw) : null;
    }
  } catch {}
  return null;
}
