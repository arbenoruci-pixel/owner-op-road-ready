'use client';

import { getOwnerOpDb } from '../../../../lib/local-db/dexie.js';

function uuid(prefix = 'scan') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function safeFileName(value = 'document') {
  return String(value || 'document')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'document';
}

async function accessToken() {
  if (typeof window === 'undefined' || typeof window.ownerOpGetAccessToken !== 'function') return null;
  try {
    return await window.ownerOpGetAccessToken();
  } catch {
    return null;
  }
}

function authHeaders(token, extra = {}) {
  return token ? { ...extra, Authorization:`Bearer ${token}` } : extra;
}

async function uploadToCloud({ file, localDocument, metadata }) {
  if (typeof window === 'undefined' || !navigator.onLine) return { status:'offline' };
  const token = await accessToken();
  if (!token) return { status:'signed_out' };

  const createResponse = await fetch('/api/documents/create-upload', {
    method:'POST',
    headers:authHeaders(token, { 'Content-Type':'application/json' }),
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
  if (!createResponse.ok) throw new Error(`create_upload_${createResponse.status}`);
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
  if (!uploadResponse.ok) throw new Error(`upload_${uploadResponse.status}`);

  const commitResponse = await fetch('/api/documents/commit-upload', {
    method:'POST',
    headers:authHeaders(token, { 'Content-Type':'application/json' }),
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
      client_created_at:localDocument.created_at,
    }),
  });
  if (!commitResponse.ok) throw new Error(`commit_upload_${commitResponse.status}`);
  return { status:'synced', body:await commitResponse.json(), storagePath };
}

export async function saveScannedDocument({ file, type = 'other', title = '', metadata = {}, extracted = {}, classification = {} }) {
  if (!file) throw new Error('file_required');
  const db = getOwnerOpDb();
  const localId = uuid('document');
  const clientDocumentId = uuid('client_document');
  const localBlobId = uuid('blob');
  const createdAt = nowIso();
  const originalFileName = safeFileName(file.name || `${localId}.bin`);
  const localDocument = {
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

  if (db) {
    await db.transaction('rw', db.documents_local, db.document_blobs, async () => {
      await db.documents_local.put(localDocument);
      await db.document_blobs.put({
        local_blob_id:localBlobId,
        client_document_id:clientDocumentId,
        blob:file,
        created_at:createdAt,
      });
    });
  }

  let cloud = { status:'local_only' };
  try {
    cloud = await uploadToCloud({ file, localDocument, metadata });
    if (db && cloud.status === 'synced') {
      await db.documents_local.update(localId, {
        sync_state:'synced',
        server_id:cloud.body?.document?.id || null,
        storage_path:cloud.storagePath || null,
        updated_at:nowIso(),
      });
    }
  } catch (error) {
    cloud = { status:'local_only', error:String(error?.message || error) };
    if (db) {
      await db.documents_local.update(localId, {
        sync_state:'local_only',
        last_error:cloud.error,
        updated_at:nowIso(),
      });
    }
  }

  return { localDocument, localBlobId, cloud };
}

export async function getScannedDocumentBlob(clientDocumentId) {
  const db = getOwnerOpDb();
  if (!db || !clientDocumentId) return null;
  const row = await db.document_blobs.where('client_document_id').equals(clientDocumentId).first();
  return row?.blob || null;
}
