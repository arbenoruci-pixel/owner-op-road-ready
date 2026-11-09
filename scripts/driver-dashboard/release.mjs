import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const read=p=>fs.readFileSync(p,'utf8'),version='110.4.115';
const old=JSON.parse(read('release-version.json'));
assert.ok(['110.4.114',version].includes(old.version),'Expected previous Road Ready release');
const sha=String(process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'})).trim();
assert.match(sha,/^[a-f0-9]{40}$/i);
const build='v1104115-driver-dashboard-'+sha.slice(0,12),now=new Date().toISOString();
for(const file of ['release-version.json','public/app-version.json']){
 const data=JSON.parse(read(file));Object.assign(data,{version,build,sourceCommit:sha,force:false,label:'v110.4.115 Driver Home and Active Load',releasedAt:now,updatedAt:now,notes:['Owner-approved photo Home and iPhone-style compact icons.','Active Load full screen uses existing guided steps and actual recorded load data.','Weekly collapsible recent loads; logbook, originals, billing and DOT workflow unchanged.']});fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
}
for(const file of ['package.json','package-lock.json']){const data=JSON.parse(read(file));data.version=version;if(data.packages?.[''])data.packages[''].version=version;fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');}
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=version;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
for(const file of ['source/src/core/update/appUpdate.js','public/sw.js','source/src/shared/ui/ToolsSheet.jsx','lib/owner-op-cloud/cloudMirrorV110450.js','scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs']){
 if(!fs.existsSync(file))continue;
 fs.writeFileSync(file,read(file).replaceAll('110.4.114',version).replaceAll('v1104114-compact-business-'+sha.slice(0,12),build));
}
console.log('PASS — driver dashboard release '+version+' '+sha);

