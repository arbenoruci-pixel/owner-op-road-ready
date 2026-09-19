import './v110378/install.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const VERSION='110.3.78',BUILD='v110378-unified-duty-shipment';
const read=path=>fs.readFileSync(path,'utf8');
const tests=spawnSync(process.execPath,['--test','scripts/v110378/test-shipment-duty.mjs'],{stdio:'inherit'});
if(tests.error)throw tests.error;
assert.equal(tests.status,0,'v110.3.78 duty/shipment regressions must pass');
for(const path of ['release-version.json','public/app-version.json']){
 const value=JSON.parse(read(path));Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.78 Shared duty editor and shipment review',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Edit, Insert and Change Status share status, activity, location and note controls.','Recorded trailer pickup/drop activities remain visible in Edit; current GPS never silently replaces a recorded location.','Changing a guide cannot rewrite a recorded pickup identity; exact existing manual plans are reused when unambiguous.','Conflicting shipment rows have an explicit driver-confirmed review with preserved originals and history.']});fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){const value=JSON.parse(read(path));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
for(const [path,prefix] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
 let value=read(path);for(const [key,replacement] of [['VERSION',VERSION],['BUILD',BUILD]]){const re=new RegExp(`const ${prefix}_${key}\\s*=\\s*['"][^'"]+['"];?`,'g');assert.equal([...value.matchAll(re)].length,1);value=value.replace(re,`const ${prefix}_${key} = '${replacement}';`);}fs.writeFileSync(path,value);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])if(fs.existsSync(path))fs.writeFileSync(path,read(path).replaceAll("'110.3.77'","'"+VERSION+"'").replaceAll("'v110377-fast-secure-session'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — 110.3.78 shared duty fields and explicit shipment identity review installed');
