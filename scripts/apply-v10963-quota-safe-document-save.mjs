import fs from 'node:fs';

const VERSION = '109.6.3';
const BUILD = 'v10963-quota-safe-document-save';
const SHEET_PATH = 'source/src/modules/scan/SmartScanSheetV105.jsx';
const BUSINESS_PATH = 'source/src/modules/business/businessStore.js';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, value) {
  fs.writeFileSync(path, value);
}

function writeJson(path, transform) {
  const value = JSON.parse(read(path));
  transform(value);
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

write('source/src/modules/scan/quotaSafeScanStorageV10963.js', String.raw`'use client';

import { getOwnerOpDb } from '../../../../lib/local-db/dexie.js';

const RECENT_DUPLICATE_WINDOW_MS_V10963 = 8 * 60 * 60 * 1000;
const MIN_PURGE_BYTES_V10963 = 6 * 1024 * 1024;

function uuidV10963(prefix = 'scan') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return prefix + '_' + crypto.randomUUID();
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

function nowIsoV10963() {
  return new Date().toISOString();
}

function safeFileNameV10963(value = 'document') {
  return String(value || 'document')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'document';
}

export function isQuotaErrorV10963(error) {
  const value = [error?.name, error?.message, error?.code].filter(Boolean).join(' ').toLowerCase();
  return /quota|storage[^a-z0-9]*(?:full|exceed)|disk[^a-z0-9]*full|22\b/.test(value);
}

function compactValueV10963(value, depth = 0, key = '') {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 2000);
  if (depth >= 3) return undefined;
  if (Array.isArray(value)) {
    return value.slice(0, key === 'stops' ? 40 : 24)
      .map(item => compactValueV10963(item, depth + 1, key))
      .filter(item => item !== undefined);
  }
  if (typeof value !== 'object') return undefined;
  const blocked = /^(?:raw|rawText|text|ocrText|sourceText|analysisText|intelligence|packet|routing|validation|actions|fieldConfidence|matchedEntities|pages|images|assets)$/i;
  const output = {};
  for (const [childKey, childValue] of Object.entries(value).slice(0, 80)) {
    if (blocked.test(childKey)) continue;
    const compacted = compactValueV10963(childValue, depth + 1, childKey);
    if (compacted !== undefined) output[childKey] = compacted;
  }
  return output;
}

function compactLocalDocumentV10963(document = {}) {
  return {
    ...document,
    extracted:compactValueV10963(document.extracted || {}, 0, 'extracted') || {},
    classification:compactValueV10963(document.classification || {}, 0, 'classification') || {},
    storage_compacted:true,
  };
}

async function requestPersistentStorageV10963() {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

async function accessTokenV10963() {
  if (typeof window === 'undefined' || typeof window.ownerOpGetAccessToken !== 'function') return null;
  try {
    return await window.ownerOpGetAccessToken();
  } catch {
    return null;
  }
}

function authHeadersV10963(token, extra = {}) {
  return token ? { ...extra, Authorization:'Bearer ' + token } : extra;
}

async function uploadToCloudV10963({ file, localDocument, metadata }) {
  if (typeof window === 'undefined' || !navigator.onLine) return { status:'offline' };
  const token = await accessTokenV10963();
  if (!token) return { status:'signed_out' };

  const createResponse = await fetch('/api/documents/create-upload', {
    method:'POST',
    headers:authHeadersV10963(token, { 'Content-Type':'application/json' }),
    body:JSON.stringify({
      client_document_id:localDocument.client_document_id,
      document_id:localDocument.local_id,
      file_name:localDocument.original_file_name,
      original_file_name:localDocument.original_file_name,
      mime_type:localDocument.mime_type,
      log_date:metadata.logDate || null,
      event_chain_id:metadata.eventChainId || null,
    }),
  });
  if (!createResponse.ok) throw new Error('create_upload_' + createResponse.status);
  const createBody = await createResponse.json();
  const signed = createBody.signed_upload || createBody.signedUpload || {};
  const signedUrl = signed.signedUrl || signed.signed_url || signed.url;
  const storagePath = createBody.storage_path || createBody.storagePath;
  if (!signedUrl || !storagePath) throw new Error('signed_upload_missing');

  const uploadResponse = await fetch(signedUrl, {
    method:'PUT',
    headers:{ 'Content-Type':file.type || 'application/octet-stream', 'x-upsert':'false' },
    body:file,
  });
  if (!uploadResponse.ok) throw new Error('upload_' + uploadResponse.status);

  const commitResponse = await fetch('/api/documents/commit-upload', {
    method:'POST',
    headers:authHeadersV10963(token, { 'Content-Type':'application/json' }),
    body:JSON.stringify({
      client_document_id:localDocument.client_document_id,
      document_id:localDocument.local_id,
      storage_path:storagePath,
      type:localDocument.type,
      original_file_name:localDocument.original_file_name,
      mime_type:localDocument.mime_type,
      file_size_bytes:localDocument.file_size_bytes,
      title:metadata.title || localDocument.title || null,
      notes:metadata.notes || null,
      log_date:metadata.logDate || null,
      event_chain_id:metadata.eventChainId || null,
      load_id:metadata.serverLoadId || null,
      relation_type:metadata.relationType || null,
      intelligence:metadata.intelligence || null,
      client_created_at:localDocument.created_at,
    }),
  });
  if (!commitResponse.ok) throw new Error('commit_upload_' + commitResponse.status);
  return { status:'synced', body:await commitResponse.json(), storagePath };
}

function duplicateSignatureV10963({ fileName = '', fileSize = 0, type = '', loadNo = '' } = {}) {
  return [safeFileNameV10963(fileName).toLowerCase(), Number(fileSize || 0), String(type || ''), String(loadNo || '').trim().toUpperCase()].join('|');
}

export { duplicateSignatureV10963 };

async function recentDuplicateV10963(db, signature) {
  if (!db) return null;
  const rows = await db.documents_local.toArray();
  const cutoff = Date.now() - RECENT_DUPLICATE_WINDOW_MS_V10963;
  return rows
    .filter(row => {
      const created = Date.parse(row.created_at || row.updated_at || '') || 0;
      if (created < cutoff) return false;
      return duplicateSignatureV10963({
        fileName:row.original_file_name,
        fileSize:row.file_size_bytes,
        type:row.type,
        loadNo:row.load_no,
      }) === signature;
    })
    .sort((a, b) => (Date.parse(b.updated_at || b.created_at || '') || 0) - (Date.parse(a.updated_at || a.created_at || '') || 0))[0] || null;
}

async function blobForDocumentV10963(db, clientDocumentId = '') {
  if (!db || !clientDocumentId) return null;
  return db.document_blobs.where('client_document_id').equals(clientDocumentId).first();
}

async function purgeSyncedBlobsV10963(db, requestedBytes = 0, excludeClientDocumentId = '') {
  if (!db) return { deleted:0, freedBytes:0 };
  const synced = await db.documents_local.where('sync_state').equals('synced').toArray();
  const syncedIds = new Set(synced.map(row => row.client_document_id).filter(Boolean));
  const rows = await db.document_blobs.orderBy('created_at').toArray();
  const target = Math.max(MIN_PURGE_BYTES_V10963, Math.ceil(Number(requestedBytes || 0) * 1.5));
  let freedBytes = 0;
  let deleted = 0;
  for (const row of rows) {
    if (!row?.local_blob_id || row.client_document_id === excludeClientDocumentId || !syncedIds.has(row.client_document_id)) continue;
    await db.document_blobs.delete(row.local_blob_id);
    freedBytes += Number(row.blob?.size || 0);
    deleted += 1;
    if (freedBytes >= target) break;
  }
  return { deleted, freedBytes };
}

async function persistLocalV10963(db, localDocument, localBlobId, file) {
  await db.transaction('rw', db.documents_local, db.document_blobs, async () => {
    await db.documents_local.put(localDocument);
    await db.document_blobs.put({
      local_blob_id:localBlobId,
      client_document_id:localDocument.client_document_id,
      blob:file,
      created_at:localDocument.created_at,
    });
  });
}

async function persistMetadataV10963(db, document) {
  if (!db) return false;
  try {
    await db.documents_local.put(document);
    return true;
  } catch (error) {
    if (!isQuotaErrorV10963(error)) throw error;
    await db.documents_local.put(compactLocalDocumentV10963(document));
    return true;
  }
}

export async function saveScannedDocumentQuotaSafeV10963({ file, type = 'other', title = '', metadata = {}, extracted = {}, classification = {} }) {
  if (!file) throw new Error('file_required');
  const db = getOwnerOpDb();
  const originalFileName = safeFileNameV10963(file.name || 'document.bin');
  const signature = duplicateSignatureV10963({ fileName:originalFileName, fileSize:file.size, type, loadNo:metadata.loadNo });

  if (db) {
    const existing = await recentDuplicateV10963(db, signature);
    if (existing) {
      const reused = {
        ...existing,
        title:title || existing.title || originalFileName,
        load_no:metadata.loadNo || existing.load_no || null,
        relation_type:metadata.relationType || existing.relation_type || null,
        extracted,
        classification,
        updated_at:nowIsoV10963(),
      };
      try {
        await persistMetadataV10963(db, reused);
      } catch {
        // The existing original is already safe. Continue so the Vault/board index can be rebuilt.
      }
      const existingBlob = await blobForDocumentV10963(db, existing.client_document_id);
      return {
        localDocument:reused,
        localBlobId:existingBlob?.local_blob_id || null,
        cloud:{ status:existing.sync_state === 'synced' ? 'synced' : 'local_only', reused:true, storagePath:existing.storage_path || null },
        storage:{ reused:true, recoveredFromQuota:false, localBlob:Boolean(existingBlob) },
      };
    }
  }

  const localId = uuidV10963('document');
  const clientDocumentId = uuidV10963('client_document');
  const localBlobId = uuidV10963('blob');
  const createdAt = nowIsoV10963();
  let localDocument = {
    local_id:localId,
    server_id:null,
    client_document_id:clientDocumentId,
    driver_id:'local-owner-op',
    type,
    status:'active',
    title:title || originalFileName,
    original_file_name:originalFileName,
    mime_type:file.type || 'application/octet-stream',
    file_size_bytes:Number(file.size || 0),
    expires_on:metadata.expiresOn || null,
    load_no:metadata.loadNo || null,
    relation_type:metadata.relationType || null,
    extracted,
    classification,
    created_at:createdAt,
    updated_at:createdAt,
    sync_state:'local_only',
  };

  await requestPersistentStorageV10963();
  let localBlobStored = false;
  let localMetadataStored = false;
  let recoveredFromQuota = false;
  let purged = { deleted:0, freedBytes:0 };

  if (db) {
    try {
      await persistLocalV10963(db, localDocument, localBlobId, file);
      localBlobStored = true;
      localMetadataStored = true;
    } catch (error) {
      if (!isQuotaErrorV10963(error)) throw error;
      recoveredFromQuota = true;
      purged = await purgeSyncedBlobsV10963(db, file.size, clientDocumentId);
      try {
        await persistLocalV10963(db, localDocument, localBlobId, file);
        localBlobStored = true;
        localMetadataStored = true;
      } catch (retryError) {
        if (!isQuotaErrorV10963(retryError)) throw retryError;
        try {
          localMetadataStored = await persistMetadataV10963(db, compactLocalDocumentV10963(localDocument));
        } catch {
          localMetadataStored = false;
        }
      }
    }
  }

  let cloud = { status:'local_only' };
  try {
    cloud = await uploadToCloudV10963({ file, localDocument, metadata });
  } catch (error) {
    cloud = { status:'local_only', error:String(error?.message || error) };
  }

  if (cloud.status === 'synced') {
    localDocument = {
      ...localDocument,
      sync_state:'synced',
      server_id:cloud.body?.document?.id || null,
      storage_path:cloud.storagePath || null,
      local_blob_state:localBlobStored ? 'available' : 'cloud_only',
      updated_at:nowIsoV10963(),
    };
    if (db) {
      try {
        await persistMetadataV10963(db, localDocument);
        localMetadataStored = true;
      } catch {
        // Cloud is authoritative when the phone cannot fit even compact metadata.
      }
    }
  } else if (!localBlobStored) {
    const storageError = new Error('phone_storage_full_original_not_saved');
    storageError.name = 'QuotaExceededError';
    throw storageError;
  }

  return {
    localDocument,
    localBlobId:localBlobStored ? localBlobId : null,
    cloud,
    storage:{
      reused:false,
      recoveredFromQuota,
      localBlob:localBlobStored,
      localMetadata:localMetadataStored,
      cloudOnly:cloud.status === 'synced' && !localBlobStored,
      purgedSyncedBlobs:purged.deleted,
      purgedBytes:purged.freedBytes,
    },
  };
}
`);

let sheet = read(SHEET_PATH);
const oldStorageImport = "import { saveScannedDocument } from './scanStorage.js';";
const quotaStorageImport = "import { saveScannedDocumentQuotaSafeV10963 as saveScannedDocument } from './quotaSafeScanStorageV10963.js';";
if (!sheet.includes(quotaStorageImport)) {
  if (!sheet.includes(oldStorageImport)) throw new Error('v109.6.3 production scanner storage import missing');
  sheet = sheet.replace(oldStorageImport, quotaStorageImport);
}
write(SHEET_PATH, sheet);

let business = read(BUSINESS_PATH);
if (!business.includes('compactBusinessStoreForQuotaV10963')) {
  const anchor = `export function writeBusinessStore(value = {}) {
  const next = normalizeBusinessStore({ ...value, updatedAt: Date.now() });
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(BUSINESS_STORE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(BUSINESS_STORE_EVENT, { detail: next }));
  }
  return next;
}`;
  const replacement = `function isBusinessQuotaErrorV10963(error) {
  const value = [error?.name, error?.message, error?.code].filter(Boolean).join(' ').toLowerCase();
  return /quota|storage[^a-z0-9]*(?:full|exceed)|disk[^a-z0-9]*full|22\\b/.test(value);
}

function compactExtractedV10963(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const keep = new Set([
    'loadNo','orderNo','legNo','bolNo','poNumber','pickupNumber','broker','carrierName','mcNumber','dotNumber',
    'origin','destination','pickupDate','deliveryDate','date','documentDate','total','gross','linehaul','equipment',
    'trackingProvider','commodity','weight','totalPieces','pieces','routeSummary','stopCount','deliveryCount','stops',
  ]);
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (!keep.has(key)) continue;
    if (typeof item === 'string') out[key] = item.slice(0, 1200);
    else if (typeof item === 'number' || typeof item === 'boolean') out[key] = item;
    else if (key === 'stops' && Array.isArray(item)) {
      out.stops = item.slice(0, 40).map(stop => ({
        id:String(stop?.id || ''), type:String(stop?.type || ''), sequence:Number(stop?.sequence || 0),
        deliverySequence:Number(stop?.deliverySequence || 0), company:String(stop?.company || '').slice(0, 180),
        city:String(stop?.city || '').slice(0, 100), state:String(stop?.state || '').slice(0, 2),
        cityState:String(stop?.cityState || '').slice(0, 160), address:String(stop?.address || '').slice(0, 260),
        date:String(stop?.date || '').slice(0, 20), time:String(stop?.time || '').slice(0, 20),
        appointment:String(stop?.appointment || '').slice(0, 160), poNumber:String(stop?.poNumber || '').slice(0, 80),
      }));
    }
  }
  return out;
}

function compactDocumentV10963(record = {}) {
  const classification = record.classification && typeof record.classification === 'object' ? {
    selectedType:record.classification.selectedType || '',
    detectedType:record.classification.detectedType || '',
    confidence:Number(record.classification.confidence || 0),
    method:String(record.classification.method || '').slice(0, 180),
    family:record.classification.family || '',
  } : undefined;
  return {
    ...record,
    extracted:compactExtractedV10963(record.extracted || {}),
    classification,
    auditTrail:Array.isArray(record.auditTrail) ? record.auditTrail.slice(-20) : [],
    references:Array.isArray(record.references) ? record.references.slice(0, 60) : [],
    routing:undefined,
    validation:undefined,
    packet:undefined,
    intelligence:undefined,
    fieldConfidence:undefined,
    actions:undefined,
    matchedEntities:undefined,
    storageCompacted:true,
  };
}

export function compactBusinessStoreForQuotaV10963(value = {}) {
  const normalized = normalizeBusinessStore(value);
  return {
    ...normalized,
    loads:normalized.loads.map(record => ({ ...record, routing:undefined, validation:undefined, packet:undefined, intelligence:undefined })),
    documents:normalized.documents.map(compactDocumentV10963),
  };
}

function minimalBusinessStoreV10963(value = {}) {
  const compact = compactBusinessStoreForQuotaV10963(value);
  return {
    ...compact,
    documents:compact.documents.map(record => ({
      id:record.id, localDocumentId:record.localDocumentId, clientDocumentId:record.clientDocumentId,
      serverDocumentId:record.serverDocumentId, fileName:record.fileName, mimeType:record.mimeType,
      type:record.type, family:record.family, subtype:record.subtype, label:record.label, title:record.title,
      documentDate:record.documentDate, date:record.date, canonicalLoadNo:record.canonicalLoadNo, loadNo:record.loadNo,
      canonicalLoadId:record.canonicalLoadId, broker:record.broker, stopId:record.stopId,
      stopSequence:record.stopSequence, stopCompany:record.stopCompany, stopLocation:record.stopLocation,
      references:Array.isArray(record.references) ? record.references.slice(0, 30) : [],
      status:record.status, reviewStatus:record.reviewStatus, folder:record.folder, linkDay:record.linkDay,
      linkToLogbook:record.linkToLogbook, syncState:record.syncState, originalPreserved:record.originalPreserved,
      createdAt:record.createdAt, updatedAt:record.updatedAt, storageCompacted:true,
    })),
  };
}

export function writeBusinessStore(value = {}) {
  const next = normalizeBusinessStore({ ...value, updatedAt: Date.now() });
  if (typeof window === 'undefined' || !window.localStorage) return next;

  let stored = next;
  try {
    window.localStorage.setItem(BUSINESS_STORE_KEY, JSON.stringify(next));
  } catch (error) {
    if (!isBusinessQuotaErrorV10963(error)) throw error;
    stored = compactBusinessStoreForQuotaV10963(next);
    try {
      window.localStorage.setItem(BUSINESS_STORE_KEY, JSON.stringify(stored));
    } catch (compactError) {
      if (!isBusinessQuotaErrorV10963(compactError)) throw compactError;
      stored = minimalBusinessStoreV10963(next);
      try {
        window.localStorage.removeItem(BUSINESS_STORE_KEY);
        window.localStorage.setItem(BUSINESS_STORE_KEY, JSON.stringify(stored));
      } catch {
        window.__OWNER_OP_BUSINESS_STORE_VOLATILE_V10963__ = stored;
      }
    }
  }
  window.dispatchEvent(new CustomEvent(BUSINESS_STORE_EVENT, { detail: stored }));
  return stored;
}`;
  if (!business.includes(anchor)) throw new Error('v109.6.3 business-store write anchor missing');
  business = business.replace(anchor, replacement);
}
write(BUSINESS_PATH, business);

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
  label:'v109.6.3 Quota-safe Document Save',
  force:true,
  notes:[
    'Recovers from iPhone storage quota errors while saving scanned documents.',
    'Reclaims only local blobs that are already cloud-synced, then retries the current original without deleting Logbook or load data.',
    'Falls back to a cloud-preserved original when the phone cannot hold another local copy.',
    'Reuses a matching recent document after a partial save so tapping Save again does not create a duplicate.',
    'Compacts oversized Vault index metadata in localStorage while preserving document, load, broker, stop and date records.',
    'Keeps Rate Confirmation Engine 1.1, board activation, POD, BOL, Fuel, HOS, signatures and inspections unchanged.'
  ],
}, null, 2)}\n`);

let sw = read('public/sw.js');
sw = sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`);
sw = sw.replace(/const OWNER_OP_SW_BUILD = '[^']+';/, `const OWNER_OP_SW_BUILD = '${BUILD}';`);
write('public/sw.js', sw);

let update = read('source/src/core/update/appUpdate.js');
update = update.replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`);
update = update.replace(/const FALLBACK_APP_BUILD = '[^']+';/, `const FALLBACK_APP_BUILD = '${BUILD}';`);
write('source/src/core/update/appUpdate.js', update);

console.log('PASS — v109.6.3 quota-safe document save recovery applied');
