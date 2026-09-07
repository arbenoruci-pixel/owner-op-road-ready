import assert from 'node:assert/strict';
import fs from 'node:fs';
const origin='https://owner-op-road-ready.vercel.app';
const expected=process.env.GITHUB_SHA;
assert.match(expected||'',/^[0-9a-f]{40}$/,'Production verification requires the exact main commit');
let meta;
for(let n=0;n<60;n++){
 const response=await fetch(`${origin}/app-version.json?verify=${expected}&attempt=${n}`,{cache:'no-store'});
 if(response.ok){const candidate=await response.json();if(candidate.version==='110.2.3'&&candidate.build==='v110203-motive-override-chips'&&candidate.sourceCommit===expected){meta=candidate;break;}}
 await new Promise(r=>setTimeout(r,5000));
}
assert.ok(meta,'Production alias did not reach the expected commit within five minutes');assert.equal(meta.force,false);
const response=await fetch(`${origin}/sw.js?verify=${expected}`,{cache:'no-store'});assert.equal(response.status,200);const worker=await response.text();assert.match(worker,/OWNER_OP_SW_VERSION = '110\.2\.3'/);assert.match(worker,/OWNER_OP_SW_BUILD = 'v110203-motive-override-chips'/);
const home=await fetch(origin,{cache:'no-store'});assert.equal(home.status,200);
fs.mkdirSync('browser-test-results',{recursive:true});fs.writeFileSync('browser-test-results/production-verification.json',JSON.stringify({checkedAt:new Date().toISOString(),origin,expectedCommit:expected,meta,workerVersion:'110.2.3',workerBuild:'v110203-motive-override-chips',httpStatus:home.status,workerCacheControl:response.headers.get('cache-control')},null,2));
console.log('PASS — production origin, exact commit, manifest and service worker agree');
