'use client';

import { createClient } from '@supabase/supabase-js';
import { getOwnerOpDb } from '../local-db/dexie.js';
import { buildMutation, createUuid, normalizeDutyEventForSync, normalizeInspectionForSync, retryDelayMs } from './payload.js';
import { CURRENT_APP_VERSION, versionedServiceWorkerUrl } from '../../source/src/core/update/appUpdate.js';

const SYNC_BATCH_SIZE = 25;
const ONLINE_RETRY_INTERVAL_MS = 60_000;

let syncTimer = null;
let syncInFlight = false;
let serviceWorkerRegistered = false;

function nowIso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function keyForEvent(event) {
  return event?.id || event?.local_id || event?.client_event_id || null;
}

function trackedEventFields(event = {}) {
  return {
    status: event.status || null,
    startMin: event.startMin ?? null,
    endMin: event.endMin ?? null,
    city: event.city || null,
    state: event.state || null,
    note: event.note || null,
    description: event.description || null,
    source: event.source || null,
    lat: event.lat ?? null,
    lng: event.lng ?? null,
    locationSource: event.locationSource || null,
    specialMode: event.specialMode || event.special_mode || null
  };
}

function stableJson(value) {
  return JSON.stringify(value, Object.keys(value).sort());
}

function eventChanged(prev, next) {
  return stableJson(trackedEventFields(prev)) !== stableJson(trackedEventFields(next));
}

function trackedInspectionFields(inspection = {}) {
  return {
    type: inspection.type || null,
    complete: inspection.complete === false ? false : Boolean(inspection.complete),
    checked: Array.isArray(inspection.checked) ? [...inspection.checked].sort() : [],
    completedAt: inspection.completedAt || null,
    source: inspection.source || null,
    sourceEventId: inspection.sourceEventId || null,
    sourceStartMin: inspection.sourceStartMin ?? null,
    sourceEndMin: inspection.sourceEndMin ?? null,
    city: inspection.city || null,
    state: inspection.state || null,
    locationSource: inspection.locationSource || null
  };
}

function inspectionChanged(prev, next) {
  return stableJson(trackedInspectionFields(prev)) !== stableJson(trackedInspectionFields(next));
}

function flattenEventsByDay(eventsByDay = {}) {
  const rows = [];
  for (const [day, events] of Object.entries(eventsByDay || {})) {
    for (const event of events || []) {
      if (!event || event.carriedFromPreviousDay) continue;
      const id = keyForEvent(event);
      if (!id) continue;
      rows.push({ day, id, event });
    }
  }
  return rows;
}

function flattenInspectionByDay(inspectionByDay = {}) {
  return Object.entries(inspectionByDay || {})
    .filter(([day, inspection]) => day && inspection && typeof inspection === 'object')
    .map(([day, inspection]) => ({ day, inspection }));
}

async function getOrCreateEventChainId(sourceId) {
  const db = getOwnerOpDb();
  if (!db) return createUuid();

  const existing = await db.id_maps.get(sourceId);
  if (existing?.mapped_id) return existing.mapped_id;

  const mappedId = createUuid();
  await db.id_maps.put({
    source_id: sourceId,
    mapped_id: mappedId,
    entity: 'duty_event',
    created_at: nowIso()
  });
  return mappedId;
}

async function getOrCreateInspectionClientId(day) {
  const db = getOwnerOpDb();
  if (!db) return createUuid();

  const sourceId = `inspection:${day}`;
  const existing = await db.id_maps.get(sourceId);
  if (existing?.mapped_id) return existing.mapped_id;

  const mappedId = createUuid();
  await db.id_maps.put({
    source_id: sourceId,
    mapped_id: mappedId,
    entity: 'inspection',
    created_at: nowIso()
  });
  return mappedId;
}

async function putLocalDutyRevision({ localId, serverId = null, payload, status = 'queued' }) {
  const db = getOwnerOpDb();
  if (!db) return;
  await db.duty_events_local.put({
    local_id: localId,
    server_id: serverId,
    client_event_id: payload.client_event_id,
    event_chain_id: payload.event_chain_id,
    version: null,
    action: payload.action,
    driver_id: 'pending-server-driver',
    log_date: payload.log_date,
    status: payload.status,
    special_mode: payload.special_mode,
    start_time: payload.start_time || null,
    end_time: payload.end_time || null,
    start_min: payload.start_min,
    end_min: payload.end_min,
    location: {
      city: payload.location_city,
      state: payload.location_state,
      lat: payload.latitude,
      lng: payload.longitude,
      source: payload.location_source
    },
    note: payload.note,
    change_reason: payload.change_reason,
    previous_event_id: null,
    created_at: payload.client_created_at,
    sync_state: status
  });
}

export async function enqueueMutation(mutation) {
  const db = getOwnerOpDb();
  if (!db) return null;

  await db.mutation_queue.put(mutation);
  scheduleSyncSoon();
  await registerBackgroundSync();
  return mutation.client_mutation_id;
}

async function enqueueDutyMutation({ day, event, action, changeReason }) {
  const id = keyForEvent(event);
  if (!id) return null;

  const eventChainId = await getOrCreateEventChainId(id);
  const payload = normalizeDutyEventForSync({
    event,
    day,
    action,
    eventChainId,
    changeReason
  });

  const mutation = buildMutation({
    entity: 'duty_event',
    operation: action,
    entityClientId: payload.client_event_id,
    payload
  });

  await putLocalDutyRevision({ localId: `${id}:${payload.client_event_id}`, payload });
  return enqueueMutation(mutation);
}

export async function queueDutyEventDiffs(previousEventsByDay = {}, nextEventsByDay = {}) {
  const previous = new Map(flattenEventsByDay(previousEventsByDay).map(row => [`${row.day}:${row.id}`, row]));
  const next = new Map(flattenEventsByDay(nextEventsByDay).map(row => [`${row.day}:${row.id}`, row]));

  const work = [];

  for (const [key, row] of next.entries()) {
    const old = previous.get(key);
    if (!old) {
      work.push(enqueueDutyMutation({
        day: row.day,
        event: row.event,
        action: 'create',
        changeReason: row.event.changeReason || row.event.auditReason || 'Driver created duty status from logbook'
      }));
    } else if (eventChanged(old.event, row.event)) {
      work.push(enqueueDutyMutation({
        day: row.day,
        event: row.event,
        action: 'edit',
        changeReason: row.event.changeReason || row.event.auditReason || 'Driver edited duty status from logbook'
      }));
    }
  }

  for (const [key, row] of previous.entries()) {
    if (!next.has(key)) {
      work.push(enqueueDutyMutation({
        day: row.day,
        event: row.event,
        action: 'void',
        changeReason: row.event.voidReason || row.event.changeReason || row.event.auditReason || 'Driver voided duty status from logbook'
      }));
    }
  }

  await Promise.allSettled(work);
}

async function enqueueInspectionMutation({ day, inspection, operation = 'upsert' }) {
  const clientInspectionId = await getOrCreateInspectionClientId(day);
  const payload = normalizeInspectionForSync({
    inspection,
    day,
    clientInspectionId
  });

  const mutation = buildMutation({
    entity: 'inspection',
    operation,
    entityClientId: payload.client_inspection_id,
    payload
  });

  const db = getOwnerOpDb();
  if (db?.inspections_local) {
    try {
      await db.inspections_local.put({
        local_id: clientInspectionId,
        server_id: inspection.server_id || null,
        client_inspection_id: clientInspectionId,
        driver_id: 'pending-server-driver',
        log_date: day,
        type: payload.type,
        status: payload.status,
        completed_at: payload.completed_at,
        source_event_local_id: payload.source_event_local_id,
        checked_items: payload.checked_items,
        created_at: payload.client_created_at,
        updated_at: nowIso(),
        sync_state: 'queued'
      });
    } catch {}
  }

  return enqueueMutation(mutation);
}

export async function queueInspectionDiffs(previousInspectionByDay = {}, nextInspectionByDay = {}) {
  const previous = new Map(flattenInspectionByDay(previousInspectionByDay).map(row => [row.day, row]));
  const next = new Map(flattenInspectionByDay(nextInspectionByDay).map(row => [row.day, row]));
  const work = [];

  for (const [day, row] of next.entries()) {
    const old = previous.get(day);
    if (!old || inspectionChanged(old.inspection, row.inspection)) {
      work.push(enqueueInspectionMutation({ day, inspection: row.inspection }));
    }
  }

  for (const [day, row] of previous.entries()) {
    if (!next.has(day) && String(row.inspection?.source || '').includes('auto_on_duty_pretrip')) {
      work.push(enqueueInspectionMutation({ day, inspection: row.inspection, operation: 'void' }));
    }
  }

  await Promise.allSettled(work);
}

async function getAccessToken() {
  if (typeof window === 'undefined') return null;
  if (typeof window.ownerOpGetAccessToken === 'function') {
    return window.ownerOpGetAccessToken();
  }
  return null;
}

function readyToSync(row) {
  return row.status === 'pending' && (!row.next_retry_at || new Date(row.next_retry_at).getTime() <= Date.now());
}

async function readPendingBatch(db) {
  const rows = await db.mutation_queue
    .where('status')
    .equals('pending')
    .sortBy('created_at');
  return rows.filter(readyToSync).slice(0, SYNC_BATCH_SIZE);
}

async function markBatchSyncing(db, rows) {
  await db.transaction('rw', db.mutation_queue, async () => {
    for (const row of rows) {
      await db.mutation_queue.update(row.client_mutation_id, { status: 'syncing' });
    }
  });
}

async function markResult(db, row, result) {
  if (result.status === 'processed' || result.status === 'duplicate') {
    await db.mutation_queue.update(row.client_mutation_id, {
      status: 'processed',
      processed_at: nowIso(),
      last_error: null
    });
    return;
  }

  const attempts = (row.attempts || 0) + 1;
  await db.mutation_queue.update(row.client_mutation_id, {
    status: 'pending',
    attempts,
    last_error: result.error || 'sync_failed',
    next_retry_at: nowIso(retryDelayMs(attempts))
  });
}

async function restoreBatchToPending(db, rows, error) {
  await db.transaction('rw', db.mutation_queue, async () => {
    for (const row of rows) {
      const attempts = (row.attempts || 0) + 1;
      await db.mutation_queue.update(row.client_mutation_id, {
        status: 'pending',
        attempts,
        last_error: error?.message || 'sync_failed',
        next_retry_at: nowIso(retryDelayMs(attempts))
      });
    }
  });
}

function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Missing Supabase browser environment variables');
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function apiJson(path, token, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body),
    credentials: 'same-origin'
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.ok) throw new Error(json.error || `http_${response.status}`);
  return json;
}

async function syncDocumentUpload(db, row, token) {
  const payload = row.payload || {};
  const blobRow = await db.document_blobs.get(payload.local_blob_id);
  if (!blobRow?.blob) throw new Error('document_blob_missing');

  const uploadInfo = await apiJson('/api/documents/create-upload', token, payload);
  const supabase = createBrowserSupabaseClient();
  const tokenForUpload = uploadInfo.signed_upload?.token;
  if (!tokenForUpload) throw new Error('signed_upload_token_missing');

  const { error: uploadError } = await supabase.storage
    .from(uploadInfo.bucket)
    .uploadToSignedUrl(uploadInfo.storage_path, tokenForUpload, blobRow.blob, {
      contentType: blobRow.mime_type || payload.mime_type || undefined,
      upsert: false
    });

  if (uploadError) throw uploadError;

  const commit = await apiJson('/api/documents/commit-upload', token, {
    ...payload,
    document_id: uploadInfo.document_id,
    storage_path: uploadInfo.storage_path
  });

  await db.documents_local.update(payload.client_document_id, {
    server_id: commit.document?.id || uploadInfo.document_id,
    storage_path: uploadInfo.storage_path,
    sync_state: 'synced'
  });
  await db.document_blobs.delete(payload.local_blob_id);

  return { status: 'processed', result: commit };
}

async function pushDutyEventBatch(batch, token) {
  const response = await fetch('/api/sync/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ mutations: batch }),
    credentials: 'same-origin'
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.ok) throw new Error(json.error || `sync_http_${response.status}`);
  return json.results || [];
}

export async function runSyncNow() {
  const db = getOwnerOpDb();
  if (!db || syncInFlight) return { skipped: true, reason: 'db_unavailable_or_syncing' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { skipped: true, reason: 'offline' };

  const token = await getAccessToken();
  if (!token) return { skipped: true, reason: 'missing_auth_token' };

  const batch = await readPendingBatch(db);
  if (!batch.length) return { ok: true, results: [] };

  syncInFlight = true;
  await markBatchSyncing(db, batch);

  try {
    const documentRows = batch.filter(row => row.entity === 'document' && row.operation === 'upload');
    const pushRows = batch.filter(row => !(row.entity === 'document' && row.operation === 'upload'));
    const allResults = [];

    for (const row of documentRows) {
      try {
        const result = await syncDocumentUpload(db, row, token);
        await markResult(db, row, { status: result.status });
        allResults.push({ client_mutation_id: row.client_mutation_id, ...result });
      } catch (error) {
        await markResult(db, row, { status: 'failed', error: error.message });
        allResults.push({ client_mutation_id: row.client_mutation_id, status: 'failed', error: error.message });
      }
    }

    if (pushRows.length) {
      const pushResults = await pushDutyEventBatch(pushRows, token);
      const resultsById = new Map(pushResults.map(result => [result.client_mutation_id, result]));
      await db.transaction('rw', db.mutation_queue, async () => {
        for (const row of pushRows) {
          await markResult(db, row, resultsById.get(row.client_mutation_id) || { status: 'failed', error: 'missing_server_result' });
        }
      });
      allResults.push(...pushResults);
    }

    await db.sync_meta.put({ key: 'last_push_at', value: nowIso(), updated_at: nowIso() });
    void runPullSyncNow();
    return { ok: true, results: allResults };
  } catch (error) {
    await restoreBatchToPending(db, batch, error);
    return { ok: false, error: error.message };
  } finally {
    syncInFlight = false;
  }
}

async function apiGetJson(path, token) {
  const response = await fetch(path, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'same-origin'
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.ok) throw new Error(json.error || `http_${response.status}`);
  return json;
}

async function upsertPulledRows(db, changes = {}) {
    for (const row of changes.log_days || []) {
      await db.log_days_local.put({
        local_id: row.id,
        server_id: row.id,
        driver_id: row.driver_id,
        log_date: row.log_date,
        timezone: row.timezone,
        certification_status: row.certification_status,
        updated_at: row.updated_at,
        sync_state: 'synced'
      });
    }

    for (const row of changes.duty_events || []) {
      await db.duty_events_local.put({
        local_id: row.id,
        server_id: row.id,
        client_event_id: row.client_event_id,
        event_chain_id: row.event_chain_id,
        version: row.version,
        action: row.action,
        driver_id: row.driver_id,
        log_date: row.log_date,
        status: row.status,
        special_mode: row.special_mode,
        start_time: row.start_time,
        end_time: row.end_time,
        start_min: row.start_min,
        end_min: row.end_min,
        location: {
          city: row.location_city,
          state: row.location_state,
          lat: row.latitude,
          lng: row.longitude,
          source: row.location_source
        },
        note: row.note,
        change_reason: row.change_reason,
        previous_event_id: row.previous_event_id,
        created_at: row.created_at,
        sync_state: 'synced'
      });
    }

    for (const row of changes.documents || []) {
      await db.documents_local.put({
        local_id: row.client_document_id || row.id,
        server_id: row.id,
        client_document_id: row.client_document_id,
        driver_id: row.driver_id,
        type: row.type,
        status: row.status,
        original_file_name: row.original_file_name,
        mime_type: row.mime_type,
        file_size_bytes: row.file_size_bytes,
        storage_path: row.storage_path,
        expires_on: row.expires_on,
        created_at: row.created_at,
        sync_state: 'synced'
      });
    }

    for (const row of changes.document_links || []) {
      await db.document_links_local.put({
        local_id: row.id,
        server_id: row.id,
        document_id: row.document_id,
        driver_id: row.driver_id,
        log_day_id: row.log_day_id,
        duty_event_chain_id: row.duty_event_chain_id,
        relation_type: row.relation_type,
        created_at: row.created_at,
        sync_state: 'synced'
      });
    }

  if (db.inspections_local && Array.isArray(changes.inspections)) {
      for (const row of changes.inspections) {
        await db.inspections_local.put({
          local_id: row.client_inspection_id || row.id,
          server_id: row.id,
          client_inspection_id: row.client_inspection_id,
          driver_id: row.driver_id,
          log_date: row.log_date,
          type: row.type,
          status: row.status,
          completed_at: row.completed_at,
          source_event_local_id: row.source_event_local_id,
          checked_items: row.checked_items,
          created_at: row.created_at,
          updated_at: row.updated_at,
          sync_state: 'synced'
        });
      }
    }
}

export async function runPullSyncNow() {
  const db = getOwnerOpDb();
  if (!db) return { skipped: true, reason: 'db_unavailable' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { skipped: true, reason: 'offline' };

  const token = await getAccessToken();
  if (!token) return { skipped: true, reason: 'missing_auth_token' };

  const meta = await db.sync_meta.get('last_pull_at');
  const since = meta?.value ? `?since=${encodeURIComponent(meta.value)}` : '';
  try {
    const result = await apiGetJson(`/api/sync/pull${since}`, token);
    await upsertPulledRows(db, result.changes || {});
    await db.sync_meta.put({ key: 'last_pull_at', value: result.pulled_at || nowIso(), updated_at: nowIso() });
    return { ok: true, pulled_at: result.pulled_at };
  } catch (error) {
    await db.sync_meta.put({ key: 'last_pull_error', value: error.message, updated_at: nowIso() });
    return { ok: false, error: error.message };
  }
}

export function scheduleSyncSoon(delayMs = 500) {
  if (typeof window === 'undefined') return;
  if (syncTimer) window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    void runSyncNow();
  }, delayMs);
}

export function startSyncEngine() {
  if (typeof window === 'undefined') return;

  window.addEventListener('online', () => scheduleSyncSoon(250));
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSyncSoon(250);
  });
  navigator.serviceWorker?.addEventListener?.('message', (event) => {
    if (event.data?.type === 'OWNER_OP_BACKGROUND_SYNC') scheduleSyncSoon(250);
  });

  window.setInterval(() => {
    if (document.visibilityState === 'visible') scheduleSyncSoon(0);
  }, ONLINE_RETRY_INTERVAL_MS);

  void registerBackgroundSync();
  scheduleSyncSoon(1_000);
  window.setTimeout(() => { void runPullSyncNow(); }, 1_500);
}


export async function registerBackgroundSync() {
  if (typeof window === 'undefined' || serviceWorkerRegistered) return;
  if (!('serviceWorker' in navigator)) return;

  try {
    const configuredPath = process.env.NEXT_PUBLIC_OWNER_OP_SYNC_SW || '/sw.js';
    const swPath = versionedServiceWorkerUrl(CURRENT_APP_VERSION, configuredPath);
    let registration;
    try {
      registration = await navigator.serviceWorker.register(swPath, {
        scope: '/',
        updateViaCache: 'none',
      });
    } catch {
      registration = await navigator.serviceWorker.register(swPath);
    }
    serviceWorkerRegistered = true;
    await registration.update?.().catch(() => {});
    if ('sync' in registration) {
      await registration.sync.register('owner-op-sync');
    }
  } catch {
    // Active-page sync remains the primary fallback, especially on iOS/Safari.
  }
}
