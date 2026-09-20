import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const VERSION='110.3.85',BUILD='v110385-measurement-detail-binding';
const read=path=>fs.readFileSync(path,'utf8');
const result=spawnSync(process.execPath,['--test','packages/smart-reader-core/test/measurement-detail-v110385.test.mjs'],{stdio:'inherit'});
if(result.error)throw result.error;assert.equal(result.status,0,'Split measurement detail regressions must pass');
for(const browser of ['scripts/browser-native-pdf-v110363.mjs','scripts/v110373/browser-reader-evidence.mjs'])fs.writeFileSync(browser,read(browser).replaceAll("'0.3.21'","'0.3.22'"));
for(const path of ['release-version.json','public/app-version.json']){
 const value=JSON.parse(read(path));const stamp=new Date().toISOString();
 Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.85 Split measurement detail binding',releasedAt:stamp,updatedAt:stamp,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
 notes:['Bind a complete number to its separate label within an isolated measurement crop.','Open the complete observed number for source review before invalid fragments.','Preserve exact crop coordinates, original confidence, missing units and conflicting readings.','Keep full-page row and column guards intact.']});
 fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){const value=JSON.parse(read(path));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
 let value=read(path);for(const [key,replacement] of [['VERSION',VERSION],['BUILD',BUILD]]){const pattern=new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`,'g');assert.equal([...value.matchAll(pattern)].length,1);value=value.replace(pattern,`const ${name}_${key} = '${replacement}';`);}fs.writeFileSync(path,value);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,read(path).replaceAll("'110.3.84'","'"+VERSION+"'").replaceAll("'v110384-bol-row-evidence'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — 110.3.85 split measurement detail and source review preserve exact evidence and prior isolation');
