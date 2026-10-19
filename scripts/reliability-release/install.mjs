import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {releaseSourceCommit} from '../reader-foundation/release.mjs';

const version='110.4.78',sourceCommit=releaseSourceCommit(),build='v110478-reliability-review-'+sourceCommit.slice(0,12);
const read=file=>fs.readFileSync(file,'utf8'),json=file=>JSON.parse(read(file)),writeJSON=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
const previous=json('release-version.json');assert.ok(['110.4.77',version].includes(previous.version),'Reliability review follows the fully materialized current release');
const releasedAt=previous.version===version&&previous.build===build?previous.releasedAt:new Date().toISOString();
const metadata={version,build,force:false,label:'Road Ready reliability review',sourceCommit,releasedAt,updatedAt:releasedAt,reviewBuild:true,notes:[
  'Background synchronization groups durable saves, retries temporary failures with backoff and requires review of conflicting versions.',
  'Working records can open after verified handoff while original documents continue synchronizing.',
  'HOS clocks, historical ranges and edit previews share the same evidence and carrier rules; uncertain history is marked for review.',
  'Chicago changes are saved as pending proposals with historical log zones retained.',
  'Document reviews preserve complete source evidence and originals, reuse identical content and retain separate signed versions and filing contexts.',
  'IFTA, Safety and IRP preparation retains scope, source verification and review history.',
  'A separate sample workspace is available in preview deployments. Production publication requires review and a verified full-data restore.',
]};
const stamps=['source/src/core/update/appUpdate.js','public/sw.js','source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx','lib/owner-op-cloud/cloudMirrorV110450.js','lib/owner-op-cloud/recordSyncV110451.js','scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'];
const after=new Map(stamps.map(file=>[file,read(file).replaceAll(previous.version,version).replaceAll(previous.build,build)]));
assert.ok(after.get('source/src/core/update/appUpdate.js').includes(`const FALLBACK_APP_VERSION = '${version}';`));
assert.ok(after.get('public/sw.js').includes(`const OWNER_OP_SW_BUILD = '${build}';`));
const revision=json('scripts/reliability-release/reviewed-locks.json'),locks=json('module-locks.v1.json');
for(const [file,expected]of Object.entries(revision.runtimeFiles||{}))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),expected,'Reviewed HOS implementation differs: '+file);
for(const [file,expected] of Object.entries(revision.files)){
  const actual=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.equal(actual,expected.after,'Reviewed reliability module differs: '+file);
  assert.ok([expected.before,expected.after].includes(locks.files[file]),'Unknown stable-module predecessor: '+file);
}
for(const [file,expected]of Object.entries(revision.files))locks.files[file]=expected.after;
locks.release=version;locks.reliabilityReviewV110478={baseCommit:revision.baseCommit,scope:revision.scope,tests:revision.tests,publication:'Pending user review and full live-data restore verification'};
for(const file of ['release-version.json','public/app-version.json'])writeJSON(file,{...json(file),...metadata});
for(const file of ['package.json','package-lock.json']){const value=json(file);value.version=version;if(value.packages?.[''])value.packages[''].version=version;writeJSON(file,value);}
for(const [file,value] of after)fs.writeFileSync(file,value);
writeJSON('module-locks.v1.json',locks);
writeJSON('public/reliability-review.json',{...metadata,sampleRoute:'/reliability-preview',liveDataChanged:false,fullLiveRestoreVerified:false,timezoneActivated:false});
console.log(`PASS reliability review ${version}, nonforced, source ${sourceCommit}`);

