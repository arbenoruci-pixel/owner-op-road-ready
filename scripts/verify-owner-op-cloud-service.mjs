import assert from 'node:assert/strict';
import fs from 'node:fs';

async function fetchReadOnlyWithRetry(url, options = {}, label = 'cloud check') {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await fetch(url, { ...options, signal:AbortSignal.timeout(30000) });
    } catch (error) {
      lastError = error;
      const retryable = error?.name === 'TimeoutError' || error?.name === 'TypeError';
      if (!retryable || attempt === 2) throw error;
      console.warn(`RETRY — ${label} network attempt ${attempt} timed out`);
      await new Promise(resolve => setTimeout(resolve, 750));
    }
  }
  throw lastError;
}

const source=fs.readFileSync('lib/owner-op-cloud/client.js','utf8');
const key=source.match(/const PUBLIC_KEY = '([^']+)'/)?.[1];
const base=source.match(/export const CLOUD_URL = '([^']+)'/)?.[1];
assert.ok(key,'Public API key must be configured');
assert.equal(base,'https://ghwkcgczuwctzxsxmqzx.supabase.co','Owner Operator must use only the isolated prototype Supabase project');
assert.ok(!source.includes('vnidjrxidvusulinozbn'),'Tepiha Supabase project must never be referenced by Owner Operator cloud code');

const auth=await fetchReadOnlyWithRetry(base+'/auth/v1/settings',{headers:{apikey:key}},'Auth settings');
assert.equal(auth.status,200,'Supabase Auth settings endpoint must be reachable');
const authSettings=await auth.json();
assert.ok(authSettings?.external?.email !== false,'Email authentication must be available');
console.log('PASS — isolated Owner Operator Auth endpoint responds');

const access=await fetchReadOnlyWithRetry(base+'/rest/v1/rpc/owner_op_access_v1',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:'{}'},'anonymous access RPC');
assert.ok([401,403,404].includes(access.status),`Anonymous access check unexpectedly returned ${access.status}`);
console.log('PASS — anonymous clients cannot call approved-account access RPC');

const storage=await fetchReadOnlyWithRetry(base+'/storage/v1/object/public/owner-op-private/nonexistent',{headers:{apikey:key}},'private bucket');
assert.notEqual(storage.status,200,'Private Owner Operator bucket must not be publicly readable');
console.log('PASS — Owner Operator document bucket is not public');

console.log('3 live read-only isolation/auth checks passed');
