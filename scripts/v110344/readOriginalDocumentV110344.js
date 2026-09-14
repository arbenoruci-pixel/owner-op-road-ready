const MAX_BYTES = 25 * 1024 * 1024;
const failure = (error, status) => Response.json({ok:false, error}, {status, headers:{'Cache-Control':'private, no-store'}});

// Resolve the authenticated driver's document on the server. A caller cannot
// choose a bucket or storage path, even if their local metadata was modified.
export function createDocumentOriginalHandlerV110344({authenticate, createAdmin, findDriver}) {
  return async function POST(request) {
    try {
      const auth = await authenticate(request);
      if (auth.error) return failure('sign_in_required', auth.status || 401);
      let body;
      try { body = await request.json(); } catch { return failure('invalid_request', 400); }
      const id = body?.client_document_id;
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(id)) return failure('invalid_document_id', 400);
      const admin = createAdmin();
      // Read only: never create a driver profile while opening a file.
      const result = await findDriver(admin, auth.user.id);
      if (result.error || !result.driver?.id) return failure('document_access_denied', result.status || 403);
      const driverId = result.driver.id;
      const {data:doc, error} = await admin.from('documents').select('*')
        .eq('driver_id', driverId).eq('client_document_id', id).maybeSingle();
      if (error) return failure('document_lookup_failed', 502);
      if (!doc || doc.driver_id !== driverId) return failure('document_not_found', 404);
      const path = String(doc.storage_path || '');
      if (!path.startsWith(driverId + '/') || path.split('/').some(part => part === '.' || part === '..') || path.includes('\\')) return failure('document_access_denied', 403);
      if (Number(doc.file_size_bytes) > MAX_BYTES) return failure('document_too_large', 413);
      const {data:blob, error:downloadError} = await admin.storage.from('driver-documents').download(path);
      if (downloadError || !blob?.size) return failure('cloud_original_unavailable', 502);
      if (blob.size > MAX_BYTES) return failure('document_too_large', 413);
      if (Number(doc.file_size_bytes) > 0 && blob.size !== Number(doc.file_size_bytes)) return failure('document_size_mismatch', 502);
      const mime = ['application/pdf','image/jpeg','image/png','image/webp','image/tiff','image/heic'].includes(doc.mime_type) ? doc.mime_type : 'application/octet-stream';
      return new Response(blob, {headers:{'Content-Type':mime, 'Content-Disposition':'attachment', 'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff'}});
    } catch { return failure('cloud_original_unavailable', 502); }
  };
}
