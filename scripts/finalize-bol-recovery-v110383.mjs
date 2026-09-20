import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const VERSION='110.3.83',BUILD='v110383-bol-recovery-speed';
const read=path=>fs.readFileSync(path,'utf8');
import './v110383/install.mjs';
const result=spawnSync(process.execPath,['--test','scripts/v110383/test-speed.mjs','scripts/v110383/test-ranking.mjs'],{stdio:'inherit'});
if(result.error)throw result.error;assert.equal(result.status,0,'Reader recovery and speed regressions must pass');
const cancellation=spawnSync(process.execPath,['scripts/test-reread-cancellation-v110347.mjs'],{stdio:'inherit'});
if(cancellation.error)throw cancellation.error;assert.equal(cancellation.status,0,'OCR cancellation isolation must pass');
for(const path of ['release-version.json','public/app-version.json']){
 const value=JSON.parse(read(path));const stamp=new Date().toISOString();
 Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.83 BOL recovery and faster reading',releasedAt:stamp,updatedAt:stamp,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
 notes:['Recognize a damaged BOL footer using corroborating shipping fields and unchanged source proof.','Reread bounded BOL areas when OCR damages the number label; unresolved digits stay for confirmation.','Reuse completed OCR only for the same image and parameters; canceled jobs and explicit retries remain independent.','Avoid repeated field analysis while ranking reading passes.','Original documents and existing load and logbook boundaries stay preserved.']});
 fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){const value=JSON.parse(read(path));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
 let value=read(path);for(const [key,replacement] of [['VERSION',VERSION],['BUILD',BUILD]]){const pattern=new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`,'g');assert.equal([...value.matchAll(pattern)].length,1);value=value.replace(pattern,`const ${name}_${key} = '${replacement}';`);}fs.writeFileSync(path,value);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,read(path).replaceAll("'110.3.82'","'"+VERSION+"'").replaceAll("'v110382-bol-reader-quality'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — 110.3.83 BOL recovery and reading speed preserve prior startup and day isolation');
