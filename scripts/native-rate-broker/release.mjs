import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const read=p=>fs.readFileSync(p,'utf8'),previous=JSON.parse(read('release-version.json')),version='110.4.106';
assert.ok(['110.4.105',version].includes(previous.version));
const sha=String(process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'})).trim();
assert.match(sha,/^[a-f0-9]{40}$/i);
const build='v1104106-native-rate-broker-'+sha.slice(0,12),now=new Date().toISOString();
for(const file of ['release-version.json','public/app-version.json']){
 const value=JSON.parse(read(file));Object.assign(value,{version,build,sourceCommit:sha,force:false,label:'v110.4.106 Native rate broker reading',releasedAt:now,updatedAt:now,notes:['Read the broker name from source-linked native rate terms and matching payment instructions.','Preserve exact names and source evidence without AI or domain-based name guesses.']});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
}
for(const file of ['package.json','package-lock.json']){const value=JSON.parse(read(file));value.version=version;if(value.packages?.[''])value.packages[''].version=version;fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');}
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=version;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
for(const file of ['source/src/core/update/appUpdate.js','public/sw.js','source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx','lib/owner-op-cloud/cloudMirrorV110450.js','scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(file,read(file).replaceAll(previous.version,version).replaceAll(previous.build,build));
console.log('PASS — native rate broker reading release '+version+' '+sha);

for(const file of ['packages/smart-reader-core/src/engine.js','packages/smart-reader-core/package.json',
 'scripts/browser-native-pdf-v110363.mjs','scripts/v110373/browser-reader-evidence.mjs','scripts/v110382/browser-bol.mjs','scripts/v110384/browser-rows.mjs','scripts/browser-ratecon-structure-v110388.mjs','scripts/v110393/browser-bol-source.mjs','scripts/v110394/browser-bol-form.mjs','scripts/v110410/browser-bol-columns.mjs','scripts/v110411/browser-rate.mjs','scripts/v110411/browser-filing.mjs','scripts/v110464/browser-rate.mjs','scripts/v110466/browser-rate.mjs','scripts/native-pdf-route/browser.mjs'])fs.writeFileSync(file,read(file).replaceAll('0.3.40','0.3.41'));
