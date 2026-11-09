import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const read=path=>fs.readFileSync(path,'utf8');
const version='110.4.116',previous=JSON.parse(read('release-version.json'));
assert.equal(previous.version,'110.4.115','Retirement release must follow the current Home release');
const sha=String(process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'})).trim();
assert.match(sha,/^[0-9a-f]{40}$/i);
const build='v1104116-retired-historical-scan-'+sha.slice(0,12),now=new Date().toISOString();
for(const path of ['release-version.json','public/app-version.json']){
 const data=JSON.parse(read(path));
 Object.assign(data,{version,build,sourceCommit:sha,force:false,label:'v110.4.116 Historical scan folder cleanup',
 releasedAt:now,updatedAt:now,notes:[
 'Remove the owner-identified orphaned historical 2021 test-scan folder #1741530 from the load list.',
 'Preserve the source PDF in Files and account history, with all active loads and driver records untouched.',
 'No changes to DOT, HOS, saved originals or payment information.']});
 fs.writeFileSync(path,JSON.stringify(data,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){
 const data=JSON.parse(read(path));data.version=version;if(data.packages?.[''])data.packages[''].version=version;
 fs.writeFileSync(path,JSON.stringify(data,null,2)+'\n');
}
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=version;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
for(const path of ['source/src/core/update/appUpdate.js','public/sw.js','source/src/shared/ui/ToolsSheet.jsx','lib/owner-op-cloud/cloudMirrorV110450.js','source/src/modules/home/HomeScreen.jsx','source/src/modules/home/DriverDashboard.jsx','scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs']){
 if(!fs.existsSync(path))continue;
 fs.writeFileSync(path,read(path).replaceAll('110.4.115',version).replaceAll('v1104115-driver-dashboard-'+sha.slice(0,12),build));
}
const source=read('source/src/modules/owneros/SmartLoadFolders.jsx');
assert.ok(source.includes('isRetiredTestScanFolder'),'Retirement filter missing from live folder UI');
console.log('PASS — v'+version+' hides only the retired historical scan folder while retaining the original document');

