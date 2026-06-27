'use client';

import Dexie from 'dexie';

export const OWNER_OP_DB_NAME = 'owner-op-road-ready-offline-v1';

function canUseIndexedDB() {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

function createDb() {
  if (!canUseIndexedDB()) return null;

  const db = new Dexie(OWNER_OP_DB_NAME);

  db.version(1).stores({
    app_snapshots: '&key, updated_at',
    drivers_local: '&id, server_id, user_id, updated_at, sync_state',
    log_days_local: '&local_id, server_id, driver_id, log_date, updated_at, sync_state',
    duty_events_local: '&local_id, server_id, client_event_id, event_chain_id, [driver_id+log_date], version, action, sync_state',
    documents_local: '&local_id, server_id, client_document_id, driver_id, type, status, expires_on, sync_state',
    document_blobs: '&local_blob_id, client_document_id, created_at',
    document_links_local: '&local_id, server_id, document_id, driver_id, log_day_id, duty_event_chain_id, sync_state',
    mutation_queue: '&client_mutation_id, status, entity, operation, created_at, next_retry_at, attempts',
    id_maps: '&source_id, server_id, entity, created_at',
    sync_meta: '&key, value, updated_at'
  });

  db.version(2).stores({
    inspections_local: '&local_id, server_id, client_inspection_id, driver_id, log_date, status, updated_at, sync_state'
  });

  return db;
}

let dbInstance = null;

export function getOwnerOpDb() {
  if (!dbInstance) dbInstance = createDb();
  return dbInstance;
}

export function indexedDbAvailable() {
  return Boolean(getOwnerOpDb());
}
