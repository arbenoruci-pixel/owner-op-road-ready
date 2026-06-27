'use client';

import { getOwnerOpDb } from '../local-db/dexie.js';
import { buildMutation, createUuid } from './payload.js';
import { enqueueMutation } from './clientSync.js';

export async function queueDocumentUpload({ file, metadata = {}, link = {} }) {
  const db = getOwnerOpDb();
  if (!db) throw new Error('IndexedDB is not available');
  if (!file) throw new Error('file is required');

  const clientDocumentId = metadata.client_document_id || metadata.clientDocumentId || createUuid();
  const localBlobId = createUuid();
  const now = new Date().toISOString();

  await db.transaction('rw', db.documents_local, db.document_blobs, async () => {
    await db.documents_local.put({
      local_id: clientDocumentId,
      server_id: null,
      client_document_id: clientDocumentId,
      driver_id: 'pending-server-driver',
      type: metadata.type || 'other',
      status: 'active',
      original_file_name: file.name || metadata.file_name || 'document',
      mime_type: file.type || metadata.mime_type || null,
      file_size_bytes: file.size || null,
      storage_path: null,
      expires_on: metadata.expires_on || metadata.expiresOn || null,
      created_at: now,
      sync_state: 'queued'
    });

    await db.document_blobs.put({
      local_blob_id: localBlobId,
      client_document_id: clientDocumentId,
      blob: file,
      mime_type: file.type || metadata.mime_type || null,
      file_name: file.name || metadata.file_name || 'document',
      size: file.size || null,
      created_at: now
    });
  });

  const mutation = buildMutation({
    entity: 'document',
    operation: 'upload',
    entityClientId: clientDocumentId,
    payload: {
      client_document_id: clientDocumentId,
      local_blob_id: localBlobId,
      type: metadata.type || 'other',
      title: metadata.title || null,
      notes: metadata.notes || null,
      file_name: file.name || metadata.file_name || 'document',
      mime_type: file.type || metadata.mime_type || null,
      file_size_bytes: file.size || null,
      issued_on: metadata.issued_on || metadata.issuedOn || null,
      expires_on: metadata.expires_on || metadata.expiresOn || null,
      relation_type: link.relation_type || link.relationType || null,
      log_date: link.log_date || link.logDate || null,
      duty_event_chain_id: link.duty_event_chain_id || link.dutyEventChainId || null,
      load_id: link.load_id || link.loadId || null,
      client_created_at: now
    }
  });

  await enqueueMutation(mutation);
  return { client_document_id: clientDocumentId, local_blob_id: localBlobId };
}
