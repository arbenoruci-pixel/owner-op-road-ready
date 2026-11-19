import { createHash, randomBytes } from 'node:crypto';

// Uses the existing Road Ready project. Every data operation is checked by a
// per-purpose RPC; there is no service-role key in the recruiting route.
const BASE = 'https://ghwkcgczuwctzxsxmqzx.supabase.co/rest/v1/rpc/road_ready_recruiting_';
const API_KEY = 'sb_publishable_YP8uKzWiV-l-ZiJhy9smbQ_hmbEPBrb';
const KINDS = ['cdl', 'cdlBack', 'registration', 'parking', 'mvrRelease'];
const CONSENT = 'insurance-review-v1';
const MAX_BYTES = 3 * 1024 * 1024;
const FORMATS = {
  'application/pdf': { extension: 'pdf', signature: Buffer.from('%PDF-') },
  'image/jpeg': { extension: 'jpg', signature: Buffer.from('ffd8ff', 'hex') },
  'image/png': { extension: 'png', signature: Buffer.from('89504e470d0a1a0a', 'hex') },
};
const PRIVATE = {
  'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', Vary: 'Authorization',
  'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer',
};
const failure = (status, message) => Object.assign(new Error(message), { status });
const json = (data, status = 200) => Response.json(data, { status, headers: PRIVATE });
const unavailable = 'Document service is temporarily unavailable. Please try again.';
const invalidLink = 'This document link is invalid or expired. Request a new link from Narta Express.';

function respondError(error) {
  return json({ ok: false, error: error.status ? error.message : unavailable }, error.status || 503);
}

function applicationId(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) {
    throw failure(422, 'Select a valid application.');
  }
  return id;
}

function owner(request) {
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer \S+$/i.test(authorization)) throw failure(401, 'Sign in to the Narta recruiting account.');
  return { authorization };
}

function inviteCredentials(request) {
  const token = /^Upload ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization') || '')?.[1];
  if (!token) throw failure(410, invalidLink);
  const key = process.env.RECRUITING_INTAKE_SECRET;
  if (!/^[a-f0-9]{64}$/i.test(key || '')) throw failure(503, unavailable);
  return { headers: { 'x-recruiting-key': key }, hash: createHash('sha256').update(token).digest('hex') };
}

async function rpc(name, body, credentials) {
  const response = await fetch(BASE + name, {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(24000),
    headers: { apikey: API_KEY, 'Content-Type': 'application/json', ...credentials }, body: JSON.stringify(body),
  });
  if (response.ok) return response.json();
  const detail = await response.json().catch(() => ({}));
  const known = {
    invalid_invitation: [410, invalidLink],
    review_required: [409, 'Mark this application reviewed before creating a document link.'],
    already_uploaded: [409, 'This document was already received. Contact Narta Express if you need to replace it.'],
    application_missing: [404, 'Application could not be found.'], document_missing: [404, 'Document could not be found.'],
    unrequested_kind: [403, 'This document was not requested.'], consent_required: [422, 'Confirm permission to share these documents.'],
    too_large: [413, 'Each file must be 3 MiB or smaller.'], invalid_document: [415, 'Choose a PDF, JPEG or PNG file.'],
    invalid_document_selection: [422, 'Select the CDL and any other documents needed for review.'],
  };
  if (Object.hasOwn(known, detail?.message)) throw failure(...known[detail.message]);
  if (credentials.authorization && [401, 403].includes(response.status)) {
    throw failure(response.status, response.status === 401 ? 'Sign in to Road Ready.' : 'Narta recruiting access is required.');
  }
  throw failure(503, unavailable);
}

async function limitedBytes(request, limit) {
  if (Number(request.headers.get('content-length')) > limit) throw failure(413, 'File or request exceeds the size limit.');
  const reader = request.body?.getReader();
  if (!reader) throw failure(400, 'Request data is missing.');
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw failure(413, 'File or request exceeds the size limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, length);
}

export async function issueDocumentInvite(request) {
  try {
    const credentials = owner(request);
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
      throw failure(415, 'Send the document request as JSON.');
    }
    const bytes = await limitedBytes(request, 2048);
    let data;
    try { data = JSON.parse(bytes.toString('utf8')); } catch { throw failure(400, 'Invalid document request.'); }
    const id = applicationId(data?.applicationId);
    const kinds = data.kinds;
    if (!Array.isArray(kinds) || !kinds.includes('cdl') || kinds.length > KINDS.length ||
        new Set(kinds).size !== kinds.length || !kinds.every(kind => KINDS.includes(kind))) {
      throw failure(422, 'Select the CDL and any other documents needed for review.');
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = await rpc('issue_documents', {
      p_application_id: id, p_kinds: kinds, p_token_hash: createHash('sha256').update(token).digest('hex'),
    }, credentials);
    if (typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt))) throw failure(503, unavailable);
    return json({ ok: true, token, expiresAt }, 201);
  } catch (error) { return respondError(error); }
}

export async function readRecruitingDocuments(request) {
  try {
    const params = new URL(request.url).searchParams;
    if ((request.headers.get('authorization') || '').startsWith('Upload ')) {
      if (params.size) throw failure(403, 'This link only supports sending requested documents.');
      const { headers, hash } = inviteCredentials(request);
      const state = await rpc('invitation', { p_token_hash: hash }, headers);
      return json({ ok: true, requested: state.requested, received: state.received, expiresAt: state.expiresAt, consentVersion: CONSENT });
    }
    const credentials = owner(request);
    const id = applicationId(params.get('applicationId'));
    const kind = params.get('kind');
    if (!kind) {
      const overview = await rpc('document_overview', { p_application_id: id }, credentials);
      return json({ ok: true, ...overview });
    }
    if (!KINDS.includes(kind)) throw failure(422, 'Select a supported document type.');
    const doc = await rpc('download_document', { p_application_id: id, p_kind: kind }, credentials);
    if (!Object.hasOwn(FORMATS, doc?.mime) || typeof doc.content !== 'string') throw failure(503, unavailable);
    const file = Buffer.from(doc.content, 'base64');
    if (file.length < 8 || file.length > MAX_BYTES) throw failure(503, unavailable);
    return new Response(file, {
      headers: { ...PRIVATE, 'Content-Type': doc.mime, 'Content-Length': String(file.length),
        'Content-Disposition': 'attachment; filename="' + kind + '.' + FORMATS[doc.mime].extension + '"',
        'Content-Security-Policy': "sandbox; default-src 'none'" },
    });
  } catch (error) { return respondError(error); }
}

export async function uploadRecruitingDocument(request) {
  try {
    const { headers, hash } = inviteCredentials(request);
    const kind = request.headers.get('x-document-kind');
    const mime = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (!KINDS.includes(kind)) throw failure(422, 'Select a requested document.');
    if (request.headers.get('x-document-consent') !== CONSENT) throw failure(422, 'Confirm permission to share these documents.');
    if (!Object.hasOwn(FORMATS, mime)) throw failure(415, 'Choose a PDF, JPEG or PNG file.');
    if (Number(request.headers.get('content-length')) > MAX_BYTES) throw failure(413, 'Each file must be 3 MiB or smaller.');
    // Check the capability before reading large applicant-controlled bytes. The
    // upload RPC checks again under its row lock in case the invite was rotated.
    const state = await rpc('invitation', { p_token_hash: hash }, headers);
    if (!state.requested.includes(kind)) throw failure(403, 'This document was not requested.');
    const file = await limitedBytes(request, MAX_BYTES);
    const signature = FORMATS[mime].signature;
    if (file.length < 8 || !file.subarray(0, signature.length).equals(signature)) {
      throw failure(415, 'The file does not match its format. Choose a PDF, JPEG or PNG file.');
    }
    const success = await rpc('upload_document', {
      p_token_hash: hash, p_kind: kind, p_mime: mime, p_content: file.toString('base64'), p_consent: CONSENT,
    }, headers);
    if (success !== true) throw failure(503, unavailable);
    return json({ ok: true }, 201);
  } catch (error) { return respondError(error); }
}
