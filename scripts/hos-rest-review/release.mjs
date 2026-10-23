import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const read=file=>fs.readFileSync(file,'utf8');
const version='110.4.84',previous=JSON.parse(read('release-version.json'));
assert.ok(['110.4.83',version].includes(previous.version),'Rest review requires the saved-profile repair');
const sha=String(process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'})).trim();
assert.match(sha,/^[a-f0-9]{40}$/i);
const build='v110484-rest-review-'+sha.slice(0,12);
for(const file of ['release-version.json','public/app-version.json']) {
  const value=JSON.parse(read(file));
  Object.assign(value,{version,build,sourceCommit:sha,force:false,label:'v110.4.84 Rest review and midnight editing',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),notes:[
    'Evaluate split sleeper requirements from the paired periods instead of flagging every short Sleeper interval.',
    'Open historical live Sleeper, Off Duty and On Duty intervals through midnight, matching the daily graph.',
    'Preserve recorded times when viewing, cancelling or changing notes; retain explicit End edits after reload.',
  ]});
  fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
}
for(const file of ['package.json','package-lock.json']) {
  const value=JSON.parse(read(file));value.version=version;if(value.packages?.[''])value.packages[''].version=version;
  fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
}
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=version;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
for(const file of ['source/src/core/update/appUpdate.js','public/sw.js','source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx','lib/owner-op-cloud/cloudMirrorV110450.js','lib/owner-op-cloud/recordSyncV110451.js','scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(file,read(file).replaceAll(previous.version,version).replaceAll(previous.build,build));
console.log('PASS — non-forced rest-review release '+version);
