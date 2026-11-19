import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { issueDocumentInvite, readRecruitingDocuments, uploadRecruitingDocument } from '../../lib/recruiting/documents.js';

const url = 'https://example.test/api/recruiting/documents';
const id = randomUUID();
const owner = 'Bearer test-session';
const token = randomBytes(32).toString('base64url');
const upload = 'Upload ' + token;
const expiresAt = '2027-01-01T16:00:00Z';
const pdf = Buffer.from('%PDF-1.4\nExample data.');
const state = { requested: ['cdl', 'registration'], received: [], expiresAt };

function secret(t) {
  const before = process.env.RECRUITING_INTAKE_SECRET;
  process.env.RECRUITING_INTAKE_SECRET = 'f0'.repeat(32);
  t.after(() => {
    if (before === undefined) delete process.env.RECRUITING_INTAKE_SECRET;
    else process.env.RECRUITING_INTAKE_SECRET = before;
  });
}
function issue(authorization = owner) {
  return new Request(url, { method: 'POST', headers: { authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({ applicationId: id, kinds: ['cdl', 'registration'] }) });
}
function put(overrides = {}, file = pdf) {
  return new Request(url, { method: 'PUT', headers: {
    authorization: upload, 'Content-Type': 'application/pdf', 'X-Document-Kind': 'cdl',
    'X-Document-Consent': 'insurance-review-v1', ...overrides,
  }, body: file });
}

test('reviewer receives a cryptographically random link once; only its digest reaches the database', async t => {
  let sent;
  const db = t.mock.method(globalThis, 'fetch', async (path, opts) => {
    assert.ok(path.endsWith('issue_documents'));
    assert.equal(opts.headers.authorization, owner);
    sent = JSON.parse(opts.body);
    return Response.json(expiresAt);
  });
  assert.equal((await issueDocumentInvite(issue(upload))).status, 401);
  assert.equal(db.mock.callCount(), 0);
  const result = await issueDocumentInvite(issue());
  const link = await result.json();
  assert.equal(result.status, 201);
  assert.match(link.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(link.expiresAt, expiresAt);
  assert.equal(sent.p_token_hash, createHash('sha256').update(link.token).digest('hex'));
  assert.ok(!JSON.stringify(sent).includes(link.token));
  assert.match(result.headers.get('cache-control'), /no-store/);
});

test('an expired invitation, unsigned consent, an unrequested kind, invalid file signature and oversize reject the upload', async t => {
  secret(t);
  let expired = false;
  const db = t.mock.method(globalThis, 'fetch', async path => {
    assert.ok(path.endsWith('invitation'));
    return expired ? Response.json({ message: 'invalid_invitation' }, { status: 410 }) : Response.json(state);
  });
  assert.equal((await uploadRecruitingDocument(put({ 'X-Document-Consent': '' }))).status, 422);
  assert.equal((await uploadRecruitingDocument(put({ 'Content-Type': 'text/html' }))).status, 415);
  assert.equal((await uploadRecruitingDocument(put({ 'content-length': '3145729' }))).status, 413);
  assert.equal(db.mock.callCount(), 0);
  assert.equal((await uploadRecruitingDocument(put({ 'X-Document-Kind': 'parking' }))).status, 403);
  assert.equal((await uploadRecruitingDocument(put({}, Buffer.from('text payload')))).status, 415);
  expired = true;
  assert.equal((await uploadRecruitingDocument(put())).status, 410);
});

test('candidate cannot read attachments or application identity and sends only consented bytes', async t => {
  secret(t);
  let saved;
  const db = t.mock.method(globalThis, 'fetch', async (path, opts) => {
    assert.ok(!JSON.stringify(opts).includes(token));
    assert.equal(opts.headers['x-recruiting-key'], process.env.RECRUITING_INTAKE_SECRET);
    if (path.endsWith('invitation')) return Response.json({ ...state, debug: 'never expose metadata' });
    assert.ok(path.endsWith('upload_document'));
    saved = JSON.parse(opts.body);
    return Response.json(true);
  });
  let res = await readRecruitingDocuments(new Request(url + '?applicationId=' + id + '&kind=cdl', { headers: { authorization: upload } }));
  assert.equal(res.status, 403);
  assert.equal(db.mock.callCount(), 0);
  res = await readRecruitingDocuments(new Request(url, { headers: { authorization: upload } }));
  assert.deepEqual(await res.json(), { ok: true, ...state, consentVersion: 'insurance-review-v1' });
  assert.equal((await uploadRecruitingDocument(put())).status, 201);
  assert.equal(saved.p_content, pdf.toString('base64'));
  assert.equal(saved.p_kind, 'cdl');
  assert.equal(saved.p_consent, 'insurance-review-v1');
  assert.equal(saved.p_token_hash, createHash('sha256').update(token).digest('hex'));
});

test('only an approved reviewer session can download; responses are private attachments', async t => {
  let approved = false;
  const uri = url + '?applicationId=' + id + '&kind=cdl';
  t.mock.method(globalThis, 'fetch', async (path, opts) => {
    assert.ok(path.endsWith('download_document'));
    assert.equal(opts.headers.authorization, owner);
    return approved ? Response.json({ mime: 'application/pdf', content: pdf.toString('base64') })
      : Response.json({ message: 'insufficient_privilege' }, { status: 403 });
  });
  assert.equal((await readRecruitingDocuments(new Request(uri))).status, 401);
  const request = () => new Request(uri, { headers: { authorization: owner } });
  assert.equal((await readRecruitingDocuments(request())).status, 403);
  approved = true;
  const result = await readRecruitingDocuments(request());
  assert.equal(result.status, 200);
  assert.match(result.headers.get('cache-control'), /no-store/);
  assert.equal(result.headers.get('content-disposition'), 'attachment; filename="cdl.pdf"');
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), pdf);
});
