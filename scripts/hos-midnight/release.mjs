import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const read=file=>fs.readFileSync(file,'utf8');
const previous=JSON.parse(read('release-version.json'));
const version='110.4.108';
assert.ok(['110.4.107',version].includes(previous.version),'HOS midnight release requires the current email documents release');
const sha=String(process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'})).trim();
assert.match(sha,/^[a-f0-9]{40}$/i);
const build='v1104108-hos-midnight-'+sha.slice(0,12),now=new Date().toISOString();
for(const file of ['release-version.json','public/app-version.json']) {
  const value=JSON.parse(read(file));
  Object.assign(value,{version,build,sourceCommit:sha,force:false,
    label:'v110.4.108 HOS split continuity',releasedAt:now,updatedAt:now,notes:[
      'Follow qualifying split sleeper periods across midnight when reviewing driving limits.',
      'Keep provisional split requirements visible and preserve actual HOS violations.',
      'Refresh compact HOS clocks while the current status remains open; preserve recorded log and signature data.',
    ]});
  fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
}
for(const file of ['package.json','package-lock.json']) {
  const value=JSON.parse(read(file));value.version=version;
  if(value.packages?.[''])value.packages[''].version=version;
  fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
}
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=version;
fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
for(const file of ['source/src/core/update/appUpdate.js','public/sw.js','source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx','lib/owner-op-cloud/cloudMirrorV110450.js','scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs']) {
  fs.writeFileSync(file,read(file).replaceAll(previous.version,version).replaceAll(previous.build,build));
}
console.log('PASS — HOS split continuity release '+version+' '+sha);
