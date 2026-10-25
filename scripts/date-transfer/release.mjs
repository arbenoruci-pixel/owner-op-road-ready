import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const read=f=>fs.readFileSync(f,'utf8'),previous=JSON.parse(read('release-version.json')),version='110.4.85';
assert.ok(['110.4.84',version].includes(previous.version));
const sha=String(process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'})).trim(),build='v110485-date-transfer-'+sha.slice(0,12);
for(const f of ['release-version.json','public/app-version.json']){const v=JSON.parse(read(f));Object.assign(v,{version,build,sourceCommit:sha,force:false,label:'v110.4.85 Date export and Smart Import',notes:['Export selected calendar dates with original PDFs, scanner photos, relationships and checksums.','Preview and merge Road Ready packages without replacing existing HOS evidence or signatures.','Restore missing originals, skip identical files and preserve conflicts for explicit review.']});fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');}
for(const f of ['package.json','package-lock.json']){const v=JSON.parse(read(f));v.version=version;if(v.packages?.[''])v.packages[''].version=version;fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');}
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=version;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
for(const f of ['source/src/core/update/appUpdate.js','public/sw.js','source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx','lib/owner-op-cloud/cloudMirrorV110450.js','lib/owner-op-cloud/recordSyncV110451.js','scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(f,read(f).replaceAll(previous.version,version).replaceAll(previous.build,build));
console.log('PASS — date transfer release '+version+' '+sha);
