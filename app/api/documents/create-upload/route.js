import { createSupabaseAdminClient, jsonError, jsonOk, requireAuthenticatedUser, requireDriverForUser } from '../../../../lib/supabase/server.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'driver-documents';

function sanitizeFileName(name = 'document') {
  return String(name)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'document';
}

function documentFolder(driverId, body) {
  if (body.event_chain_id || body.eventChainId) return `${driverId}/duty-events/${body.event_chain_id || body.eventChainId}`;
  if (body.log_date || body.logDate) return `${driverId}/log-days/${body.log_date || body.logDate}`;
  return `${driverId}/wallet`;
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
  if (!clientDocumentId) return jsonError('client_document_id_required', 400);

  const documentId = body.document_id || body.documentId || crypto.randomUUID();
  const fileName = sanitizeFileName(body.file_name || body.fileName || body.original_file_name || body.originalFileName || `${documentId}.bin`);
  const storagePath = `${documentFolder(driverResult.driver.id, body)}/${documentId}-${fileName}`;

  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error) return jsonError('signed_upload_failed', 500, error.message);

  return jsonOk({
    client_document_id: clientDocumentId,
    document_id: documentId,
    bucket: BUCKET,
    storage_path: storagePath,
    signed_upload: data
  });
}
