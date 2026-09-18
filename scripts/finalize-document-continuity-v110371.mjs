import './v110371/install.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const VERSION='110.3.71',BUILD='v110371-document-continuity';
const read=path=>fs.readFileSync(path,'utf8');
for(const path of ['release-version.json','public/app-version.json']) {
 const value=JSON.parse(read(path));Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.71 Saved reading continuity',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
 notes:['Keep confirmed readings when rereading the same saved document pages.','Checkpoint confirmed review changes on this device and recover after reopening.','Keep retrieved cloud originals offline when storage succeeds.','Keep file cloud status separate from local reading corrections.']});fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){const value=JSON.parse(read(path));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]) {
 let value=read(path);for(const [key,replacement] of [['VERSION',VERSION],['BUILD',BUILD]]){const pattern=new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`,'g');assert.equal([...value.matchAll(pattern)].length,1);value=value.replace(pattern,`const ${name}_${key} = '${replacement}';`);}fs.writeFileSync(path,value);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs'])fs.writeFileSync(path,read(path).replaceAll("'110.3.70'","'"+VERSION+"'").replaceAll("'v110370-durable-route-removal'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — 110.3.71 document continuity installed; protected module hashes unchanged');
