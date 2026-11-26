import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { makeLoginHandler } from '../../supabase/functions/rr-lease-login/handler.js';
import { allRows, appointment, loadOriginal, operatorClient, usd } from '../../app/operator/portalData.js';

const origin = 'https://owner-op-road-ready.vercel.app';
const project = 'https://ghwkcgczuwctzxsxmqzx.supabase.co';
const email = 'driver@example.invalid';
const challenge = 'Z'.repeat(43);
function loginFixture({ allowed = true, existing = false } = {}) {
  const calls = [],
    jobs = [],
    errors = [];
  const env = {
    SUPABASE_SERVICE_ROLE_KEY: 'unit-test-server-key',
    SUPABASE_ANON_KEY: 'unit-test-public-key',
    SUPABASE_URL: project,
  };
  const handler = makeLoginHandler({
    getEnv: (key) => env[key],
    waitUntil: (job) => jobs.push(job),
    logFailure: (stage) => errors.push(stage),
    request: async (url, init) => {
      const endpoint = new URL(url);
      calls.push({ endpoint, init, body: JSON.parse(init.body) });
      if (endpoint.pathname.endsWith('reserve_login_request')) return Response.json(allowed);
      if (existing && endpoint.pathname.endsWith('/admin/users'))
        return Response.json({ error_code: 'email_exists' }, { status: 422 });
      return Response.json({});
    },
  });
  const send = (body, reqOrigin = origin) =>
    handler(
      new Request(origin + '/api/mock-login', {
        method: 'POST',
        headers: { origin: reqOrigin, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
  return { send, calls, jobs, errors };
}

test('only the verified invite can start native email login; responses conceal membership', async () => {
  for (const options of [{ allowed: false }, { allowed: true }, { allowed: true, existing: true }]) {
    const f = loginFixture(options);
    const response = await f.send({
      email,
      code_challenge: challenge,
      redirect_to: 'https://example.invalid/ref',
    });
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), {});
    await Promise.all(f.jobs);
    assert.deepEqual(f.errors, []);
    assert.equal(f.calls.length, options.allowed ? 3 : 1);
    if (options.allowed) {
      assert.deepEqual(f.calls[1].body, { email, email_confirm: false });
      assert.equal(f.calls[2].endpoint.searchParams.get('redirect_to'), origin + '/operator');
      assert.equal(f.calls[2].init.headers.apikey, 'unit-test-public-key');
      assert.deepEqual(f.calls[2].body, {
        email,
        create_user: false,
        code_challenge: challenge,
        code_challenge_method: 's256',
      });
    }
  }
});

test('reject wrong origins, invalid PKCE and oversized requests before side effects', async () => {
  const f = loginFixture();
  assert.equal((await f.send({ email, code_challenge: challenge }, 'https://unrelated.invalid')).status, 403);
  assert.equal((await f.send({ email, code_challenge: 'invalid' })).status, 400);
  assert.equal((await f.send({ email, code_challenge: challenge, extra: 'x'.repeat(2100) })).status, 400);
  assert.equal(f.jobs.length, 0);
  assert.equal(f.calls.length, 0);
});

test('operator SDK sends passwordless requests only through invite gate with a browser-generated PKCE challenge', async () => {
  const saved = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), body: JSON.parse(opts.body) });
    return Response.json({}, { status: 202 });
  };
  try {
    const client = operatorClient();
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: origin + '/operator' },
    });
    assert.equal(error, null);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, project + '/functions/v1/rr-lease-login');
    assert.equal(calls[0].body.email, email);
    assert.match(calls[0].body.code_challenge, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(Object.keys(calls[0].body).length, 2);
  } finally {
    globalThis.fetch = saved;
  }
});

test('download from private storage and chunked database retains exact original and rejects wrong/unavailable data', async () => {
  const bytes = Buffer.from('%PDF-1.4\nprobe payload');
  const doc = {
    id: 'doc',
    is_ready: true,
    mime_type: 'application/pdf',
    byte_size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
  const parts = [bytes.subarray(0, 5), bytes.subarray(5)];
  const db = { rpc: async (_name, args) => ({ data: parts[args.p_index].toString('base64') }) };
  const chunkDoc = { ...doc, storage_backend: 'database', chunk_count: 2 };
  const file = await loadOriginal(db, chunkDoc);
  assert.equal(file.type, 'application/pdf');
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
  await assert.rejects(loadOriginal(db, { ...chunkDoc, sha256: '0'.repeat(64) }), /differs/);
  await assert.rejects(loadOriginal(db, { ...chunkDoc, is_ready: false }), /verified/);
  await assert.rejects(loadOriginal({ rpc: async () => ({ error: Error('denied') }) }, chunkDoc), /retrieve/);
  const store = {
    storage: {
      from: (bucket) => ({
        download: async (path) => {
          assert.equal(bucket, 'rr-lease-private');
          assert.equal(path, 'only-owned-path');
          return { data: new Blob([bytes]) };
        },
      }),
    },
  };
  assert.equal(
    (await loadOriginal(store, { ...doc, storage_backend: 'storage', storage_path: 'only-owned-path' })).size,
    bytes.length
  );
});

test('statement helpers retain all pages, missing values and appointment time zone', async () => {
  const input = Array.from({ length: 402 }, (_, id) => id);
  const every = await allRows(() => ({ range: async (a, b) => ({ data: input.slice(a, b + 1) }) }));
  assert.deepEqual(every, input);
  assert.equal(usd(null), 'Pending');
  assert.equal(usd(215000), '$2,150.00');
  assert.match(appointment('2026-11-27T17:15:00Z', 'America/Chicago'), /11:15 AM CST/);
  assert.match(appointment('2026-11-27T17:15:00Z', null), /5:15 PM UTC/);
});
