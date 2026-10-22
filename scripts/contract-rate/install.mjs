import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const read=file=>fs.readFileSync(file,'utf8');
const identity='source/src/modules/scan/documentIdentityV110334.js';
const before="if(current==='gate_pass'||current==='other'||analysis.lowEvidence===true";
const after="if(current==='gate_pass'||(!analysis.userSelectedTypeV11036&&['bol','pod'].includes(current))||current==='other'||analysis.lowEvidence===true";
let source=read(identity);
if(!source.includes(after)){
  assert.equal(source.split(before).length,2,'Unqualified shipping-type fallback anchor');
  fs.writeFileSync(identity,source.replace(before,after));
}

// Release stamps are applied after all historical materializers. Original
// documents and user records are outside this installer.
const version='110.4.82';
const sha=process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.match(sha,/^[a-f0-9]{40}$/i);
const build='v110482-contract-rate-'+sha.slice(0,12),previous=JSON.parse(read('release-version.json'));
assert.ok(['110.4.81',version].includes(previous.version),'Contract rate repair requires the current main runtime');
for(const file of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(read(file));
  Object.assign(value,{version,build,sourceCommit:sha,force:false,label:'v110.4.82 Contract rate recognition',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
    notes:['Recognize verbal carrier rate agreements and their referenced pickup/delivery schedules.','Keep matching contract pages together and retain the exact load reference and total.','Require a source-supported BOL or POD type, with explicit diagnostics when AI cannot complete its response.']});
  fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
}
for(const file of ['package.json','package-lock.json']){
  const value=JSON.parse(read(file));value.version=version;if(value.packages?.[''])value.packages[''].version=version;
  fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
}
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=version;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
for(const file of ['source/src/core/update/appUpdate.js','public/sw.js','source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx','lib/owner-op-cloud/cloudMirrorV110450.js','lib/owner-op-cloud/recordSyncV110451.js','scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(file,read(file).replaceAll(previous.version,version).replaceAll(previous.build,build));
for(const file of ['packages/smart-reader-core/src/engine.js','packages/smart-reader-core/package.json',
  'scripts/browser-native-pdf-v110363.mjs','scripts/v110373/browser-reader-evidence.mjs','scripts/v110382/browser-bol.mjs','scripts/v110384/browser-rows.mjs','scripts/browser-ratecon-structure-v110388.mjs','scripts/v110393/browser-bol-source.mjs','scripts/v110394/browser-bol-form.mjs','scripts/v110410/browser-bol-columns.mjs','scripts/v110411/browser-rate.mjs','scripts/v110411/browser-filing.mjs','scripts/v110464/browser-rate.mjs','scripts/v110466/browser-rate.mjs'])fs.writeFileSync(file,read(file).replaceAll('0.3.38','0.3.39'));
console.log(`PASS — ${version}: contract rates, conservative shipping types and AI output diagnostics`);
