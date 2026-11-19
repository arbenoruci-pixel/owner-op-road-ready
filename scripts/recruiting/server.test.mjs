import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { listApplications, reviewApplication, submitApplication } from '../../lib/recruiting/applications.js';

const url = 'https://example.test/api/recruiting/applications';
const sample = {
  requestId: randomUUID(), fullName: 'Test Applicant', email: 'applicant@example.com', phone: '(312) 555-0100',
  activeClassA: true, cdlState: 'IL', age24: false, cdlMonths: 36, otrMonths: 36, amazonMonths: 12,
  priorCarrier: 'Example Carrier', amazonCarrier: 'Example Relay Carrier', drivingHistory: 'review',
  startDate: '2027-01-20', truckYear: 2019, truckMake: 'Example', truckModel: 'Tractor',
  registrationState: 'IL', registrationStatus: 'pending', garagingAddress: '100 Example Dr, Test, IL 60000',
  physicalDamage: false, documents: ['registration'], consent: true,
};
const bearer = { authorization: 'Bearer test-token' };
function request(method, payload, headers) {
  return new Request(url, {
    method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload),
  });
}

test('minimums, consent and the body size limit are enforced before storage', async t => {
  const db = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected database call'); });
  for (const [key, value] of Object.entries({
    activeClassA: false, cdlMonths: 35, otrMonths: 35, amazonMonths: 11, consent: false,
    truckVin: 'INVALID', email: 'invalid', startDate: '2027-02-31', documents: ['identity_scan'],
  })) {
    assert.equal((await submitApplication(request('POST', { ...sample, [key]: value }))).status, 422, key);
  }
  assert.equal((await submitApplication(request('POST', { text: 'x'.repeat(13000) }))).status, 413);
  assert.equal((await submitApplication(request('POST', { website: 'spam.example' }))).status, 200);
  assert.equal(db.mock.callCount(), 0);
});

test('intake sends only reviewed fields, retains the request ID across retries and confirms only a successful write', async t => {
  const previous = process.env.RECRUITING_INTAKE_SECRET;
  process.env.RECRUITING_INTAKE_SECRET = 'ab'.repeat(32);
  t.after(() => {
    if (previous === undefined) delete process.env.RECRUITING_INTAKE_SECRET;
    else process.env.RECRUITING_INTAKE_SECRET = previous;
  });
  let result;
  const db = t.mock.method(globalThis, 'fetch', async () => result);
  for (const [response, status] of [
    [new Response(null, { status: 500 }), 503], [Response.json('accepted'), 201],
    [Response.json('limited'), 429], [Response.json('conflict'), 409],
  ]) {
    result = response;
    const candidate = { ...sample, ssn: 'unrequested', reviewed_at: 'forged' };
    const r = await submitApplication(request('POST', candidate, { 'x-vercel-forwarded-for': '192.0.2.5' }));
    assert.equal(r.status, status);
    assert.equal((await r.json()).ok, status === 201);
    const [path, options] = db.mock.calls.at(-1).arguments;
    assert.ok(path.endsWith('/rpc/road_ready_submit_recruiting'));
    assert.ok(options.headers['x-recruiting-key']);
    const record = JSON.parse(options.body);
    assert.equal(record.p_id, sample.requestId);
    assert.match(record.p_source_hash, /^[a-f0-9]{64}$/);
    assert.equal(record.p_details.age24, false);
    assert.equal(record.p_details.drivingHistory, 'review');
    assert.ok(!('ssn' in record.p_details) && !('reviewed_at' in record.p_details));
  }
});

test('read and review require Narta recruiting membership', async t => {
  const db = t.mock.method(globalThis, 'fetch', async () => Response.json([]));
  assert.equal((await listApplications(new Request(url))).status, 401);
  assert.equal((await reviewApplication(request('PATCH', { id: sample.requestId }))).status, 401);
  assert.equal(db.mock.callCount(), 0);
  assert.equal((await listApplications(new Request(url, { headers: bearer }))).status, 403);
  assert.equal((await reviewApplication(request('PATCH', { id: sample.requestId }, bearer))).status, 403);
  assert.ok(db.mock.calls.every(call => call.arguments[0].includes('/road_ready_recruiting_reviewers?')));
});

test('owner count contains only unread count and review uses the authorized session', async t => {
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    assert.equal(options.headers.authorization, bearer.authorization);
    if (path.includes('/road_ready_recruiting_reviewers?')) return Response.json([{ user_id: 'owner' }]);
    if (options.method === 'HEAD') return new Response(null, { headers: { 'Content-Range': '0-0/1' } });
    assert.ok(path.endsWith('/rpc/road_ready_review_recruiting'));
    assert.deepEqual(JSON.parse(options.body), { p_id: sample.requestId });
    return Response.json(true);
  });
  const count = await listApplications(new Request(url + '?count=1', { headers: bearer }));
  assert.deepEqual(await count.json(), { ok: true, unread: 1 });
  assert.match(count.headers.get('Cache-Control'), /no-store/);
  assert.deepEqual(await (await reviewApplication(request('PATCH', { id: sample.requestId }, bearer))).json(), { ok: true });
});
