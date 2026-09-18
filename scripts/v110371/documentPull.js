// Metadata pulls must retain device-only reading state for the same owner and
// immutable original. This helper does not touch duty events, links or blobs.
const nonempty = value => typeof value === 'string' && value.length > 0;
const conflict = message => Object.assign(new Error(message), {code:'document_pull_conflict'});

export const documentOriginalIdentity = row => JSON.stringify([row.local_id, row.client_document_id, row.sha256 || '', row.file_size_bytes ?? null, row.mime_type || '']);

function sameOwner(local, row) {
  if (local.driver_id === row.driver_id) return true;
  if (local.driver_id !== 'local-owner-op') return false;
  if (local.server_id === row.id) return true;
  // The authenticated pull may acknowledge an upload whose final local write
  // was interrupted. Require its exact client identity and original metadata.
  return !nonempty(local.server_id) && nonempty(local.client_document_id) &&
    local.client_document_id === row.client_document_id &&
    nonempty(local.mime_type) && local.mime_type === row.mime_type &&
    Number(local.file_size_bytes) > 0 &&
    Number(local.file_size_bytes) === Number(row.file_size_bytes);
}

export function mergePulledDocument(local, row) {
  if (!nonempty(row?.id) || !nonempty(row?.driver_id)) throw conflict('The document update has no owner or identity.');
  if (local) {
    if (!sameOwner(local, row) ||
        (nonempty(local.client_document_id) && nonempty(row.client_document_id) && local.client_document_id !== row.client_document_id) ||
        (nonempty(local.server_id) && local.server_id !== row.id)) {
      throw conflict('Document ownership or identity changed. The saved original and reading have been kept.');
    }
    for (const key of ['sha256','mime_type','storage_path']) {
      if (nonempty(local[key]) && nonempty(row[key]) && local[key] !== row[key]) {
        throw conflict('Document original changed. The saved original and reading have been kept.');
      }
    }
    if (Number(local.file_size_bytes) > 0 && Number(row.file_size_bytes) > 0 && Number(local.file_size_bytes) !== Number(row.file_size_bytes)) {
      throw conflict('Document original size changed. The saved original and reading have been kept.');
    }
  }
  const merged = {...local, local_id:local?.local_id || row.client_document_id || row.id,
    server_id:row.id, driver_id:row.driver_id, sync_state:'synced'};
  // Undefined fields in a partial response carry no deletion intent. Keep all
  // unmentioned local metadata, especially extracted and its checkpoint CAS.
  for (const key of ['type','status','original_file_name','expires_on','created_at','updated_at']) {
    if (row[key] !== undefined) merged[key] = row[key];
  }
  for (const key of ['client_document_id','mime_type','storage_path','sha256']) {
    if (nonempty(row[key])) merged[key] = row[key];
  }
  if (Number(row.file_size_bytes) > 0) merged.file_size_bytes = row.file_size_bytes;
  const checkpoint = local?.extracted?.readerContinuityV110371;
  if (checkpoint?.draft && checkpoint.originalKey === documentOriginalIdentity(local) &&
      checkpoint.savedKey === JSON.stringify(local.extracted?.readerReviewV110345 ?? null)) {
    // Adding a previously unknown fingerprint must not orphan a valid draft.
    // Conflicting known fingerprints have already been rejected above.
    merged.extracted = {...local.extracted, readerContinuityV110371:{...checkpoint,
      originalKey:documentOriginalIdentity(merged)}};
  }
  return merged;
}

export async function upsertPulledDocuments(db, rows = []) {
  if (!rows.length) return;
  return db.transaction('rw', db.documents_local, async () => {
    for (const row of rows) {
      const key = row.client_document_id || row.id;
      const byClient = nonempty(row.client_document_id)
        ? await db.documents_local.where('client_document_id').equals(row.client_document_id).toArray() : [];
      const direct = await db.documents_local.get(key);
      const byServer = nonempty(row.id)
        ? await db.documents_local.where('server_id').equals(row.id).toArray() : [];
      const candidates = [...byClient];
      for (const record of byServer) if (!candidates.some(item => item.local_id === record.local_id)) candidates.push(record);
      if (direct && !candidates.some(item => item.local_id === direct.local_id)) candidates.push(direct);
      if (!candidates.length) {
        await db.documents_local.put(mergePulledDocument(null,row));
        continue;
      }
      // Some older clients already stored both a local-id row and a client-id
      // row. Update each in place without deleting either row's review history.
      const merged = candidates.map(local => mergePulledDocument(local,row));
      for (const document of merged) await db.documents_local.put(document);
    }
  });
}
