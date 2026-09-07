import assert from 'node:assert/strict';
import fs from 'node:fs';
const origin='https://owner-op-road-ready.vercel.app';
const expected=process.env.GITHUB_SHA;
const localMeta=JSON.parse(fs.readFileSync('public/app-version.json','utf8'));
const VERSION=localMeta.version,BUILD=localMeta.build;
assert.match(expected||'',/^[0-9a-f]{40}$/,'Production verification requires the exact main commit');
let meta;
for(let n=0;n<60;n++){
 const response=await fetch(`${origin}/app-version.json?verify=${expected}&attempt=${n}`,{cache:'no-store'});
 if(response.ok){const candidate=await response.json();if(candidate.version===VERSION&&candidate.build===BUILD&&candidate.sourceCommit===expected){meta=candidate;break;}}
 await new Promise(r=>setTimeout(r,5000));
}
assert.ok(meta,'Production alias did not reach the expected commit within five minutes');assert.equal(meta.force,false);
const response=await fetch(`${origin}/sw.js?verify=${expected}`,{cache:'no-store'});assert.equal(response.status,200);const worker=await response.text();assert.ok(worker.includes(`OWNER_OP_SW_VERSION = '${VERSION}'`));assert.ok(worker.includes(`OWNER_OP_SW_BUILD = '${BUILD}'`));
const home=await fetch(origin,{cache:'no-store'});assert.equal(home.status,200);
fs.mkdirSync('browser-test-results',{recursive:true});fs.writeFileSync('browser-test-results/production-verification.json',JSON.stringify({checkedAt:new Date().toISOString(),origin,expectedCommit:expected,meta,workerVersion:VERSION,workerBuild:BUILD,httpStatus:home.status,workerCacheControl:response.headers.get('cache-control')},null,2));
console.log('PASS — production origin, exact commit, manifest and service worker agree');
