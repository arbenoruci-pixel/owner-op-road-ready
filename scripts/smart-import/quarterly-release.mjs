import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const read = file => fs.readFileSync(file,'utf8');
// Last-stage stamp; none of the earlier generator anchors or HOS locks change.
const previous=JSON.parse(read('release-version.json')), version='110.4.86';
assert.ok(['110.4.85',version].includes(previous.version));
const sha=String(process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'})).trim();
assert.match(sha,/^[a-f0-9]{40}$/i);
const build='v110486-motive-quarter-'+sha.slice(0,12);
for(const file of ['release-version.json','public/app-version.json']) {
  const value=JSON.parse(read(file));Object.assign(value,{version,build,sourceCommit:sha,force:false,label:'v110.4.86 Motive quarterly miles',notes:['Import Motive Vehicle Gateway miles by truck and jurisdiction for a quarter.','Retain the original CSV, source units and checksums; block overlapping mileage totals.','Manual daily logbook miles, HOS events and signatures stay separate.']});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
}
for(const file of ['package.json','package-lock.json']) { const value=JSON.parse(read(file));value.version=version;if(value.packages?.[''])value.packages[''].version=version;fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n'); }
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=version;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
for(const file of ['source/src/core/update/appUpdate.js','public/sw.js','source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx','lib/owner-op-cloud/cloudMirrorV110450.js','lib/owner-op-cloud/recordSyncV110451.js','scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(file,read(file).replaceAll(previous.version,version).replaceAll(previous.build,build));
for(const file of ['core.js','storage.js','month.js','SmartImportPanel.jsx','MonthlyRecords.jsx','QuarterlyMileage.jsx'])assert.equal(read('source/src/modules/smart-import/'+file),read('scripts/smart-import/'+file),'Materialization overwrote quarterly import '+file);
console.log('PASS — final Motive quarterly release '+version+' '+sha);
