'use client';

import { getOwnerOpDb } from './dexie.js';

export const APP_STATE_KEY = 'owner-op-road-ready-state-v1';

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
