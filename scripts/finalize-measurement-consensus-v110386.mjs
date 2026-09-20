import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const VERSION='110.3.86',BUILD='v110386-measurement-consensus';
import './v110386/install.mjs';
const read=path=>fs.readFileSync(path,'utf8');
const result=spawnSync(process.execPath,['--test','packages/smart-reader-core/test/measurement-consensus-v110386.test.mjs'],{stdio:'inherit'});
if(result.error)throw result.error;assert.equal(result.status,0,'Measurement consensus and grouped confirmation regressions must pass');
for(const browser of ['scripts/browser-native-pdf-v110363.mjs','scripts/v110373/browser-reader-evidence.mjs'])fs.writeFileSync(browser,read(browser).replaceAll("'0.3.22'","'0.3.23'"));
for(const path of ['release-version.json','public/app-version.json']){
 const value=JSON.parse(read(path));const stamp=new Date().toISOString();
 Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.86 Weight consensus and simpler review',releasedAt:stamp,updatedAt:stamp,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
 notes:['Resolve partial weight readings only against matching observed numbers and source evidence.','Review net, tare and total together and select their unit once.','Keep real number conflicts, original confidence and every source reading.','Use existing saved reading evidence without repeating OCR.']});
 fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){const value=JSON.parse(read(path));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
 let value=read(path);for(const [key,replacement] of [['VERSION',VERSION],['BUILD',BUILD]]){const pattern=new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`,'g');assert.equal([...value.matchAll(pattern)].length,1);value=value.replace(pattern,`const ${name}_${key} = '${replacement}';`);}fs.writeFileSync(path,value);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,read(path).replaceAll("'110.3.85'","'"+VERSION+"'").replaceAll("'v110385-measurement-detail-binding'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — 110.3.86 weight consensus and one-unit review preserve exact evidence and prior isolation');
