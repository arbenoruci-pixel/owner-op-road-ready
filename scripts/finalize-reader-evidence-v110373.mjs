import './v110373/install.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const sources=spawnSync(process.execPath,['scripts/v110373/test-original-page-source.mjs'],{stdio:'inherit'});
if(sources.error)throw sources.error;
assert.equal(sources.status,0,'Retained original source evidence must resolve before publication');
const VERSION='110.3.73',BUILD='v110373-reader-stop-evidence';
const read=path=>fs.readFileSync(path,'utf8');
function patch(path,before,after){const source=read(path);if(source.includes(after))return;assert.equal(source.split(before).length-1,1,'Release anchor '+path);fs.writeFileSync(path,source.replace(before,after));}
for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(read(path));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.73 Reader stop evidence',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
    notes:['Use complete bounded native-PDF stop blocks for addresses and appointments.','Keep source evidence distinct and remove exact duplicate labels.','Show unit, VIN and source-backed POD/late-fee/detention clauses.','Flag similar document references without replacing characters or merging pages.']});
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){
  const value=JSON.parse(read(path));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let value=read(path);
  for(const [key,replacement] of [['VERSION',VERSION],['BUILD',BUILD]]){
    const pattern=new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`,'g');
    assert.equal([...value.matchAll(pattern)].length,1,'Unique release marker '+path+' '+key);
    value=value.replace(pattern,`const ${name}_${key} = '${replacement}';`);
  }
  fs.writeFileSync(path,value);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs'])
  fs.writeFileSync(path,read(path).replaceAll("'110.3.72'","'"+VERSION+"'").replaceAll("'v110372-driving-day-continuity'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — 110.3.73 Reader stop evidence installed; protected module hashes unchanged');
