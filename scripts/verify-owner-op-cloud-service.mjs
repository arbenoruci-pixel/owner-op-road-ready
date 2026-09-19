import assert from 'node:assert/strict';
import fs from 'node:fs';

async function fetchReadOnlyWithRetry(url, options = {}, label = 'cloud check') {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fetch(url, { ...options, signal:AbortSignal.timeout(20000) });
    } catch (error) {
      lastError = error;
      const retryable = error?.name === 'TimeoutError' || error?.name === 'TypeError';
      if (!retryable) throw error;
      if (attempt < 3) {
        console.warn(`RETRY — ${label} network attempt ${attempt} unavailable`);
        await new Promise(resolve => setTimeout(resolve, 750 * attempt));
      }
    }
  }
  console.warn(`SKIP LIVE — ${label} could not be reached after retries: ${lastError?.name || 'network error'}`);
  return null;
}

const source=fs.readFileSync('lib/owner-op-cloud/client.js','utf8');
const key=source.match(/const PUBLIC_KEY = '([^']+)'/)?.[1];
const base=source.match(/export const CLOUD_URL = '([^']+)'/)?.[1];
assert.ok(key,'Public API key must be configured');
assert.equal(base,'https://ghwkcgczuwctzxsxmqzx.supabase.co','Owner Operator must use only the isolated prototype Supabase project');
assert.ok(!source.includes('vnidjrxidvusulinozbn'),'Tepiha Supabase project must never be referenced by Owner Operator cloud code');

const auth=await fetchReadOnlyWithRetry(base+'/auth/v1/settings',{headers:{apikey:key}},'Auth settings');
if (auth) {
  assert.equal(auth.status,200,'Supabase Auth settings endpoint returned an unexpected status');
  const authSettings=await auth.json();
  assert.ok(authSettings?.external?.email !== false,'Email authentication must be available');
  console.log('PASS — isolated Owner Operator Auth endpoint responds');
}

const access=await fetchReadOnlyWithRetry(base+'/rest/v1/rpc/owner_op_access_v1',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:'{}'},'anonymous access RPC');
if (access) {
  assert.ok([401,403,404].includes(access.status),`Anonymous access check unexpectedly returned ${access.status}`);
  console.log('PASS — anonymous clients cannot call approved-account access RPC');
}

const storage=await fetchReadOnlyWithRetry(base+'/storage/v1/object/public/owner-op-private/nonexistent',{headers:{apikey:key}},'private bucket');
if (storage) {
  assert.notEqual(storage.status,200,'Private Owner Operator bucket must not be publicly readable');
  console.log('PASS — Owner Operator document bucket is not public');
}

const reached=[auth,access,storage].filter(Boolean).length;
console.log(`${reached}/3 live read-only isolation/auth checks reached the service; static project-isolation checks remain mandatory`);
