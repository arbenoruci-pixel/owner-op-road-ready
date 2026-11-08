import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const code=fs.readFileSync('scripts/verify-owner-op-cloud-service.mjs','utf8').replace(/^import .*;\n/gm,'');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function probe(statuses){let calls=0;const messages=[];await new AsyncFunction('assert','fs','process','console','fetch',code)(assert,fs,{env:{}},{log:m=>messages.push(m),warn:m=>messages.push(m)},async()=>({status:statuses[calls++],json:async()=>({external:{email:true}})}));return {calls,messages};}
test('quota restriction reports unverified live health, preserves static checks and avoids repeated blocked requests',async()=>{const r=await probe([402]);assert.equal(r.calls,1);assert.ok(r.messages.some(m=>/BLOCKED LIVE.*402.*unverified/.test(m)));assert.ok(!r.messages.some(m=>m.startsWith('PASS')));});
test('reachable backend retains all three live security assertions',async()=>{const r=await probe([200,403,400]);assert.equal(r.calls,3);assert.equal(r.messages.filter(m=>m.startsWith('PASS')).length,3);});
test('invalid auth, anonymous access and public bucket responses still fail',async()=>{for(const statuses of [[401],[200,200],[200,403,200]])await assert.rejects(probe(statuses),{name:'AssertionError'});});
