import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const VERSION='110.3.82',BUILD='v110382-bol-reader-quality';
const read=path=>fs.readFileSync(path,'utf8');
import './v110382/install.mjs';
const result=spawnSync(process.execPath,['--test','scripts/v110382/test-barcode.mjs','scripts/v110382/test-quality.mjs','scripts/v110382/test-integration.mjs'],{stdio:'inherit'});
if(result.error)throw result.error;assert.equal(result.status,0,'BOL reader and scanner regressions must pass');
for(const path of ['release-version.json','public/app-version.json']){
 const value=JSON.parse(read(path));const stamp=new Date().toISOString();
 Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.82 BOL Reader and scanner quality',releasedAt:stamp,updatedAt:stamp,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
 notes:['BOL barcode cross-checks keep leading zeros, original-pixel proof and unresolved OCR conflicts.','Read net, tare, total weight and temperature instructions; missing units remain for review.','Ignore detached corroborated consignee noise and prose fragments posing as carrier labels.','Scanner focus samples stay inside the paper and include text-region diagnostics.','Original documents, confirmed readings and existing load/logbook boundaries stay preserved.']});
 fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){const value=JSON.parse(read(path));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
 let value=read(path);for(const [key,replacement] of [['VERSION',VERSION],['BUILD',BUILD]]){const pattern=new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`,'g');assert.equal([...value.matchAll(pattern)].length,1);value=value.replace(pattern,`const ${name}_${key} = '${replacement}';`);}fs.writeFileSync(path,value);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,read(path).replaceAll("'110.3.81'","'"+VERSION+"'").replaceAll("'v110381-compact-on-duty'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — 110.3.82 BOL Reader and scanner quality preserve prior startup and day isolation');
