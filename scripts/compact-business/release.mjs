import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const read=p=>fs.readFileSync(p,'utf8'), previous=JSON.parse(read('release-version.json')), version='110.4.114';
assert.ok(['110.4.113',version].includes(previous.version));
const sha=String(process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'})).trim();
assert.match(sha,/^[a-f0-9]{40}$/i);
const build='v1104114-compact-business-'+sha.slice(0,12), now=new Date().toISOString();
for(const file of ['release-version.json','public/app-version.json']){const value=JSON.parse(read(file));Object.assign(value,{version,build,sourceCommit:sha,force:false,label:'v110.4.114 Compact dark workspace',releasedAt:now,updatedAt:now,notes:['Compact, unified dark Home, load inbox, documents and billing.','Read-only gross dashboard: this week, this month and all saved history.','Originals, signatures, HOS and approved DOT workflow remain unchanged.']});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');}
for(const file of ['package.json','package-lock.json']){const value=JSON.parse(read(file));value.version=version;if(value.packages?.[''])value.packages[''].version=version;fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');}
// Release label only; locked runtime digests are deliberately unchanged.
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=version;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
for(const file of ['source/src/core/update/appUpdate.js','public/sw.js','source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx','lib/owner-op-cloud/cloudMirrorV110450.js','scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(file,read(file).replaceAll(previous.version,version).replaceAll(previous.build,build));
console.log('PASS — compact business release '+version+' '+sha);
