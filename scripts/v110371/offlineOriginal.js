const integrityFailure = message => Object.assign(new Error(message), {code:'original_integrity_failed'});
const identity = row => JSON.stringify([row.local_id, row.client_document_id, row.sha256 || '', row.file_size_bytes ?? null, row.mime_type || '']);

export async function keepOriginalOffline(db, document, blob) {
  if (!db?.documents_local || !db.document_blobs || !document?.client_document_id || !(blob instanceof Blob) || !blob.size) {
    throw new Error('The original could not be saved on this device.');
  }
  const current = await db.documents_local.where('client_document_id').equals(document.client_document_id).first();
  if (!current?.local_id) throw new Error('Reopen this saved document before keeping it offline.');
  if (Number(current.file_size_bytes) > 0 && Number(current.file_size_bytes) !== blob.size) throw integrityFailure('Original file size does not match.');
  const checksum = current.sha256;
  if (checksum != null && checksum !== '' && (typeof checksum !== 'string' || !/^[a-f0-9]{64}$/i.test(checksum))) {
    throw integrityFailure('Original file checksum is invalid. Reopen the verified original instead.');
  }
  if (typeof checksum === 'string' && checksum.length) {
    if (!globalThis.crypto?.subtle) throw integrityFailure('Could not verify this original on this device.');
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    const hash = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
    if (hash !== current.sha256.toLowerCase()) throw integrityFailure('Original file checksum does not match.');
  }
  // Network and hashing finish before the IndexedDB transaction begins.
  return db.transaction('rw', db.documents_local, db.document_blobs, async () => {
    const fresh = await db.documents_local.where('client_document_id').equals(document.client_document_id).first();
    if (!fresh || identity(fresh) !== identity(current)) throw integrityFailure('This document changed. Reopen it before saving offline.');
    const old = await db.document_blobs.where('client_document_id').equals(document.client_document_id).first();
    if (old?.blob?.size) return false;
    await db.document_blobs.put({local_blob_id:`offline-original-${document.client_document_id}`,
      client_document_id:document.client_document_id, blob, created_at:new Date().toISOString()});
    await db.documents_local.update(fresh.local_id, {local_blob_state:'available', offline_original_saved_at:new Date().toISOString()});
    return true;
  });
}
