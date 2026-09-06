import assert from 'node:assert/strict';
import fs from 'node:fs';
// Read-only integration probes. No real user, file or log is created.
const source=fs.readFileSync('lib/owner-op-cloud/client.js','utf8');
const key=source.match(/const PUBLIC_KEY = '([^']+)'/)?.[1];
assert.ok(key,'Public API key must be configured');
const endpoint='https://vnidjrxidvusulinozbn.supabase.co/functions/v1/owner-op-cloud-v1';
async function probe(name,body,status,authorization){
 const response=await fetch(endpoint,{method:body?'POST':'GET',headers:{apikey:key,...(body?{'Content-Type':'application/json'}:{}),...(authorization?{Authorization:authorization}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
 const json=await response.json();
 assert.equal(response.status,status,`${name}: ${JSON.stringify(json)}`);
 if(!body)assert.equal(json.status,'ready');
 console.log('PASS — live cloud service: '+name);
}
await probe('service responds',null,200);
await probe('catalog denies missing login',{action:'catalog'},401);
await probe('catalog denies forged login',{action:'catalog'},401,'Bearer invalid.test.token');
await probe('officer package denies nonexistent capability',{action:'inspect',token:'0'.repeat(64)},403);
console.log('4 live read-only cloud service checks passed');
