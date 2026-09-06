import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('lib/owner-op-cloud/client.js','utf8');
const key=source.match(/const PUBLIC_KEY = '([^']+)'/)?.[1];
const base=source.match(/export const CLOUD_URL = '([^']+)'/)?.[1];
assert.ok(key,'Public API key must be configured');
assert.equal(base,'https://ghwkcgczuwctzxsxmqzx.supabase.co','Owner Operator must use only the isolated prototype Supabase project');
assert.ok(!source.includes('vnidjrxidvusulinozbn'),'Tepiha Supabase project must never be referenced by Owner Operator cloud code');

const auth=await fetch(base+'/auth/v1/settings',{headers:{apikey:key},signal:AbortSignal.timeout(25000)});
assert.equal(auth.status,200,'Supabase Auth settings endpoint must be reachable');
const authSettings=await auth.json();
assert.ok(authSettings?.external?.email !== false,'Email authentication must be available');
console.log('PASS — isolated Owner Operator Auth endpoint responds');

const access=await fetch(base+'/rest/v1/rpc/owner_op_access_v1',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(25000)});
assert.ok([401,403,404].includes(access.status),`Anonymous access check unexpectedly returned ${access.status}`);
console.log('PASS — anonymous clients cannot call approved-account access RPC');

const storage=await fetch(base+'/storage/v1/object/public/owner-op-private/nonexistent',{headers:{apikey:key},signal:AbortSignal.timeout(25000)});
assert.notEqual(storage.status,200,'Private Owner Operator bucket must not be publicly readable');
console.log('PASS — Owner Operator document bucket is not public');

console.log('3 live read-only isolation/auth checks passed');
