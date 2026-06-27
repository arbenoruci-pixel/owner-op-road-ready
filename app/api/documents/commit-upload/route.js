import { createSupabaseAdminClient, jsonError, jsonOk, requireAuthenticatedUser, requireDriverForUser } from '../../../../lib/supabase/server.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'driver-documents';
const DOCUMENT_TYPES = new Set([
  'driver_license',
  'medical_card',
  'insurance',
  'registration',
  'annual_inspection',
  'bol',
  'pod',
  'fuel_receipt',
  'scale_ticket',
  'inspection_photo',
  'other'
]);

function cleanType(type) {
  return DOCUMENT_TYPES.has(type) ? type : 'other';
}

async function fileExists(admin, bucket, storagePath) {
  const parts = storagePath.split('/');
  const fileName = parts.pop();
  const folder = parts.join('/');
  const { data, error } = await admin.storage.from(bucket).list(folder, { search: fileName, limit: 1 });
  if (error) throw error;
  return Boolean((data || []).find(item => item.name === fileName));
}

async function findLogDay(admin, driverId, logDate) {
  if (!logDate) return null;
  const { data, error } = await admin
    .from('log_days')
    .select('*')
    .eq('driver_id', driverId)
    .eq('log_date', logDate)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function POST(request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.error) return jsonError(auth.error, auth.status, auth.detail);

  const admin = createSupabaseAdminClient();
  const driverResult = await requireDriverForUser(admin, auth.user.id, auth.user);
  if (driverResult.error) return jsonError(driverResult.error, driverResult.status, driverResult.detail);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('invalid_json', 400);
  }

  const clientDocumentId = body.client_document_id || body.clientDocumentId;
  const storagePath = body.storage_path || body.storagePath;
  if (!clientDocumentId || !storagePath) return jsonError('client_document_id_and_storage_path_required', 400);

  if (!storagePath.startsWith(`${driverResult.driver.id}/`)) {
    return jsonError('storage_path_driver_mismatch', 403);
  }

  try {
    const exists = await fileExists(admin, BUCKET, storagePath);
    if (!exists) return jsonError('storage_object_not_found', 404);

    const documentInsert = {
      id: body.document_id || body.documentId || undefined,
      client_document_id: clientDocumentId,
      driver_id: driverResult.driver.id,
      uploaded_by: auth.user.id,
      type: cleanType(body.type || 'other'),
      status: 'active',
      storage_bucket: BUCKET,
      storage_path: storagePath,
      original_file_name: body.original_file_name || body.originalFileName || body.file_name || body.fileName || null,
      mime_type: body.mime_type || body.mimeType || null,
      file_size_bytes: body.file_size_bytes || body.fileSizeBytes || null,
      sha256: body.sha256 || null,
      title: body.title || null,
      notes: body.notes || null,
      issued_on: body.issued_on || body.issuedOn || null,
      expires_on: body.expires_on || body.expiresOn || null,
      client_created_at: body.client_created_at || body.clientCreatedAt || null,
      device_id: body.device_id || body.deviceId || null
    };

    Object.keys(documentInsert).forEach((key) => documentInsert[key] === undefined && delete documentInsert[key]);

    const { data: document, error: insertError } = await admin
      .from('documents')
      .insert(documentInsert)
      .select('*')
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        const { data: existing, error: existingError } = await admin
          .from('documents')
          .select('*')
          .eq('client_document_id', clientDocumentId)
          .single();
        if (existingError) throw existingError;
        return jsonOk({ status: 'duplicate', document: existing });
      }
      throw insertError;
    }

    const logDate = body.log_date || body.logDate || null;
    const logDay = await findLogDay(admin, driverResult.driver.id, logDate);
    const relationType = body.relation_type || body.relationType || null;
    const dutyEventChainId = body.duty_event_chain_id || body.dutyEventChainId || body.event_chain_id || body.eventChainId || null;
    const shouldLink = relationType || logDay || dutyEventChainId || body.load_id || body.loadId;

    let link = null;
    if (shouldLink) {
      const { data: linkRow, error: linkError } = await admin
        .from('document_links')
        .insert({
          document_id: document.id,
          driver_id: driverResult.driver.id,
          log_day_id: logDay?.id || null,
          duty_event_chain_id: dutyEventChainId,
          load_id: body.load_id || body.loadId || null,
          relation_type: relationType || 'supporting_document',
          created_by: auth.user.id
        })
        .select('*')
        .single();
      if (linkError) throw linkError;
      link = linkRow;
    }

    return jsonOk({ status: 'processed', document, link });
  } catch (error) {
    return jsonError('commit_upload_failed', 500, error.message);
  }
}
