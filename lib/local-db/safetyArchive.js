'use client';

import { getOwnerOpDb, OWNER_OP_DB_NAME } from './dexie.js';

const SAFETY_KIND = 'owner_op_road_ready_device_safety_archive';
const SAFETY_SCHEMA = 1;
const LOCAL_PREFIXES = ['owner-op-', 'road-ready'];

function dayKeysFromState(state = {}) {
  return [...new Set([
    ...Object.keys(state.eventsByDay || {}),
    ...Object.keys(state.signatureByDay || {}),
    ...Object.keys(state.inspectionByDay || {}),
    ...Object.keys(state.routeLegsByDay || {}),
    ...Object.keys(state.documentsByDay || {}),
    ...Object.keys(state.fuelReceiptsByDay || {}),
    ...Object.keys(state.certifyStatus || {}),
    ...Object.keys(state.manualMilesByDay || {}),
  ])].filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day)).sort();
}

function countRows(map = {}) {
  return Object.values(map || {}).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
}

function countSigned(map = {}) {
  return Object.values(map || {}).filter(row => row?.signed || row?.signatureRef || row?.signatureDataUrl).length;
}

function countInspections(map = {}) {
  return Object.values(map || {}).filter(row => row?.complete || row?.status === 'complete').length;
}

function countWallet(wallet = {}) {
  return Object.values(wallet?.documents || {}).filter(row => row?.present || row?.attachmentDataUrl || row?.clientDocumentId).length;
}

function localStorageRows() {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  const rows = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    const lower = key.toLowerCase();
    if (!LOCAL_PREFIXES.some(prefix => lower.startsWith(prefix))) continue;
    rows.push({ key, value: window.localStorage.getItem(key) });
  }
  return rows;
}

function sizeOfBinary(value) {
  if (value instanceof Blob) return value.size;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  return 0;
}

async function sha256(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function serializeValue(value) {
  if (value instanceof Blob) {
    const bytes = new Uint8Array(await value.arrayBuffer());
    return {
      __roadReadyBinary: 'Blob',
      mimeType: value.type || 'application/octet-stream',
      size: bytes.length,
      sha256: await sha256(bytes),
      base64: bytesToBase64(bytes),
    };
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const bytes = value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return {
      __roadReadyBinary: 'ArrayBuffer',
      size: bytes.length,
      sha256: await sha256(bytes),
      base64: bytesToBase64(bytes),
    };
  }
  if (Array.isArray(value)) {
    const out = [];
    for (const row of value) out.push(await serializeValue(row));
    return out;
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, row] of Object.entries(value)) out[key] = await serializeValue(row);
    return out;
  }
  return value;
}

async function tableInventory(db) {
  const rows = {};
  for (const table of db.tables) {
    const list = await table.toArray();
    let binaryBytes = 0;
    for (const row of list) {
      for (const value of Object.values(row || {})) binaryBytes += sizeOfBinary(value);
    }
    rows[table.name] = { count: list.length, binaryBytes };
  }
  return rows;
}

export async function buildDeviceSafetyInventory(state = {}, businessStore = {}) {
  const db = getOwnerOpDb();
  const days = dayKeysFromState(state);
  const tables = db ? await tableInventory(db) : {};
  const business = businessStore || {};
  return {
    generatedAt: new Date().toISOString(),
    databaseName: OWNER_OP_DB_NAME,
    firstDay: days[0] || null,
    lastDay: days.at(-1) || null,
    logDays: days.length,
    eventDays: days.filter(day => (state.eventsByDay?.[day] || []).length > 0).length,
    events: countRows(state.eventsByDay),
    signedLogs: countSigned(state.signatureByDay),
    inspections: countInspections(state.inspectionByDay),
    routeLegs: countRows(state.routeLegsByDay),
    walletDocuments: countWallet(state.dotWallet),
    logDocuments: countRows(state.documentsByDay),
    fuelReceipts: countRows(state.fuelReceiptsByDay),
    businessLoads: Array.isArray(business.loads) ? business.loads.length : 0,
    businessDocuments: Array.isArray(business.documents) ? business.documents.length : 0,
    localStorageEntries: localStorageRows().length,
    dexieTables: tables,
    dexieRows: Object.values(tables).reduce((sum, row) => sum + row.count, 0),
    documentBlobRows: tables.document_blobs?.count || 0,
    documentBlobBytes: tables.document_blobs?.binaryBytes || 0,
    snapshotRows: tables.app_snapshots?.count || 0,
  };
}

export async function buildDeviceSafetyArchive({ state = {}, businessStore = {}, appVersion = '' } = {}) {
  const db = getOwnerOpDb();
  if (!db) throw new Error('IndexedDB is not available on this device.');
  const inventory = await buildDeviceSafetyInventory(state, businessStore);
  const dexie = {};
  for (const table of db.tables) {
    const rows = await table.toArray();
    dexie[table.name] = await serializeValue(rows);
  }
  const payload = {
    state: await serializeValue(state),
    businessStore: await serializeValue(businessStore || {}),
    dexie,
    localStorage: localStorageRows(),
  };
  const payloadJson = JSON.stringify(payload);
  const payloadBytes = new TextEncoder().encode(payloadJson);
  const payloadSha256 = await sha256(payloadBytes);
  const archive = {
    kind: SAFETY_KIND,
    schemaVersion: SAFETY_SCHEMA,
    app: 'Owner-Op Road Ready',
    appVersion: String(appVersion || ''),
    createdAt: new Date().toISOString(),
    source: 'installed_pwa_device_safety_export',
    immutableIntent: true,
    inventory,
    payloadSha256,
    payload,
  };
  const verification = await verifyDeviceSafetyArchive(archive);
  if (!verification.ok) throw new Error(`Safety archive verification failed: ${verification.reason}`);
  return { archive, verification };
}

export async function verifyDeviceSafetyArchive(archive) {
  if (!archive || archive.kind !== SAFETY_KIND || archive.schemaVersion !== SAFETY_SCHEMA) {
    return { ok: false, reason: 'wrong archive kind or schema' };
  }
  if (!archive.payload || !archive.payloadSha256) return { ok: false, reason: 'missing payload or checksum' };
  const actual = await sha256(new TextEncoder().encode(JSON.stringify(archive.payload)));
  if (actual !== archive.payloadSha256) return { ok: false, reason: 'checksum mismatch' };
  const appRows = archive.payload.dexie?.app_snapshots;
  if (!Array.isArray(appRows) || appRows.length < 1) return { ok: false, reason: 'no IndexedDB app snapshot captured' };
  return { ok: true, sha256: actual, bytes: new TextEncoder().encode(JSON.stringify(archive)).length };
}

export function safetyArchiveFilename(date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '-');
  return `road-ready-device-safety-${stamp}.roadready.json`;
}

export async function shareOrDownloadSafetyArchive(archive, filename) {
  const json = JSON.stringify(archive);
  const file = new File([json], filename, { type: 'application/json' });
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const supported = typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] });
    if (supported) {
      try {
        await navigator.share({
          title: 'Road Ready — Device Safety Backup',
          text: 'Verified full local PWA backup. Keep this file unchanged.',
          files: [file],
        });
        return { mode: 'shared', bytes: file.size };
      } catch (error) {
        if (error?.name === 'AbortError') return { mode: 'cancelled', bytes: file.size };
      }
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { mode: 'downloaded', bytes: file.size };
}
