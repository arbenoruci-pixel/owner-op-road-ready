'use client';
import Dexie from 'dexie';
import {getOwnerOpDb} from '../../../../lib/local-db/dexie.js';
import {BUSINESS_STORE_KEY, BUSINESS_STORE_EVENT} from '../business/businessStore.js';
import {vaultBlobV102} from './documentVaultV102.js';
import {clone, digest, documentIdentity, loadNumber, mergeRecords, validateTransfer, existingTransferDocument, assertRestoreOriginal} from './transferCoreV110412.js';

export async function readTransferOriginal(record) {
  const clientId = record.client_document_id || record.clientDocumentId;
  let blob = clientId ? await vaultBlobV102({...record, client_document_id:clientId}) : null;
  if (blob?.size) return blob;
  // Only the existing authenticated original endpoint may retrieve a cloud file.
  if (clientId && (record.storage_path || record.sync_state === 'synced' || record.local_blob_state === 'cloud_only')) {
    const token = await window.ownerOpGetAccessToken?.();
    if (!token) throw new Error('Sign in to retrieve the cloud original.');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch('/api/documents/read-original', {method:'POST', cache:'no-store', signal:controller.signal,
        headers:{Authorization:`Bearer ${token}`, 'Content-Type':'application/json'}, body:JSON.stringify({client_document_id:clientId})});
      if (!response.ok) throw new Error('Cloud original could not be retrieved.');
      blob = await response.blob();
    } finally { clearTimeout(timer); }
  }
  if (!blob && typeof record.dataUrl === 'string' && /^data:(application\/pdf|image\/(png|jpeg|webp));base64,/.test(record.dataUrl)) blob = await (await fetch(record.dataUrl)).blob();
  return blob;
}
function unlinked(record) {
  const row = clone(record);
  for (const key of ['linkedEventId','linkEventId','eventId','duty_event_chain_id','log_day_id','archiveLink','archiveEventDay','archiveEventDays','server_id','server_document_id','serverDocumentId','storage_path','storagePath','signedUrl','signed_url','url','fileUrl','downloadUrl','previewUrl','dataUrl']) delete row[key];
  row.linkToLogbook = false;
  for (const field of ['metadata','extracted']) if (row[field]) {
    row[field] = {...row[field]};
    for (const key of ['linkEventId','linkedEventId','eventId','dutyEventId','linkDay','logDate']) delete row[field][key];
  }
  return row;
}
export async function importTransfer(payload, options = {}) {
  // Revalidate on Apply. A preview is never permission to trust altered bytes.
  const checked = await validateTransfer(payload);
  const db = options.db || getOwnerOpDb(), storage = options.storage || window.localStorage;
  if (!db) throw new Error('Device storage is unavailable.');
  const run = async () => {
    if (!options.storage && window.__OWNER_OP_BUSINESS_STORE_VOLATILE_V10963__) throw new Error('Device storage is full. Free space before importing.');
    const previous = storage.getItem(BUSINESS_STORE_KEY);
    let current;
    try { current = previous ? JSON.parse(previous) : {}; } catch { throw new Error('Existing business records could not be read. Import stopped.'); }
    if (!current || typeof current !== 'object' || Array.isArray(current)) throw new Error('Existing business records could not be read.');
    const {next, summary} = mergeRecords(current, checked.records);
    if (next.documents !== undefined && !Array.isArray(next.documents)) throw new Error('Existing document records could not be read.');
    next.documents ||= [];
    const result = {...summary, addedDocuments:0, keptDocuments:0, restoredOriginals:0};
    let written = null;
    try {
      await db.transaction('rw', db.documents_local, db.document_blobs, async () => {
        const rows = await db.documents_local.toArray();
        for (const item of checked.decoded) {
          const raw = item.record, identity = documentIdentity(raw);
          const localId = raw.local_id || raw.localDocumentId || `transfer-${identity}`;
          const clientId = raw.client_document_id || raw.clientDocumentId || identity;
          const existing = existingTransferDocument(rows, localId, clientId);
          if (existing) {
            const original = await db.document_blobs.where('client_document_id').equals(clientId).first();
            if (original?.blob?.size) {
              const hash = await Dexie.waitFor(original.blob.arrayBuffer().then(digest));
              if (hash !== item.original.sha256) throw new Error('A saved document has different original bytes. Existing files were kept.');
              result.keptDocuments++;
            } else {
              assertRestoreOriginal(existing, item.original);
              const restored = {local_blob_id:original?.local_blob_id || `transfer-blob-${clientId}`, client_document_id:clientId, blob:item.blob, created_at:new Date().toISOString()};
              if (original) await db.document_blobs.put(restored); else await db.document_blobs.add(restored);
              result.restoredOriginals++;
            }
            continue; // A later local organization/type/date always wins.
          }
          const row = {...unlinked(raw), local_id:localId, client_document_id:clientId, driver_id:'local-owner-op',
            load_no:loadNumber(raw), type:raw.document_type || raw.type || 'other',
            original_file_name:raw.original_file_name || raw.fileName || 'document', mime_type:item.original.type,
            file_size_bytes:item.original.size, sha256:item.original.sha256, sync_state:'local_only', local_blob_state:'local',
            documentTransfer:{importedAt:new Date().toISOString(), sourceIdentity:identity, sourceScope:checked.scope},
            updated_at:new Date().toISOString()};
          await db.documents_local.add(row);
          await db.document_blobs.add({local_blob_id:`transfer-blob-${clientId}`, client_document_id:clientId, blob:item.blob, created_at:new Date().toISOString()});
          if (!next.documents.some(doc => documentIdentity(doc) === clientId || doc.localDocumentId === localId)) next.documents.push({
            id:localId, localDocumentId:localId, clientDocumentId:clientId, loadNo:row.load_no, canonicalLoadNo:row.load_no,
            type:row.type, title:row.title, fileName:row.original_file_name, mimeType:row.mime_type,
            sha256:row.sha256, fileSizeBytes:row.file_size_bytes,
            documentDate:row.document_date || row.documentDate, status:row.status, reviewStatus:row.reviewStatus,
            stopSequence:row.stopSequence || row.stop_sequence, originalPreserved:true, syncState:'local_only', linkToLogbook:false,
            createdAt:Date.now(), updatedAt:Date.now()
          });
          rows.push(row); result.addedDocuments++;
        }
        if (storage.getItem(BUSINESS_STORE_KEY) !== previous) throw new Error('Records changed while importing. Try again.');
        // A strict write makes quota failures abort the IndexedDB transaction.
        // Do not call the legacy writer, whose quota fallback can discard fields.
        written = JSON.stringify({...next, updatedAt:Date.now()});
        storage.setItem(BUSINESS_STORE_KEY, written);
      });
    } catch (error) {
      if (written !== null && storage.getItem(BUSINESS_STORE_KEY) === written) {
        if (previous === null) storage.removeItem(BUSINESS_STORE_KEY); else storage.setItem(BUSINESS_STORE_KEY, previous);
      }
      throw error;
    }
    if (!options.storage) window.dispatchEvent(new CustomEvent(BUSINESS_STORE_EVENT));
    return result;
  };
  return !options.storage && navigator.locks?.request ? navigator.locks.request('road-ready-document-transfer', run) : run();
}
