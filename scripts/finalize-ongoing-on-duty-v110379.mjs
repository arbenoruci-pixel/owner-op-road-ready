import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const VERSION='110.3.79',BUILD='v110379-ongoing-on-duty-handoff';
const read=path=>fs.readFileSync(path,'utf8');
import './v110379/install.mjs';
const result=spawnSync(process.execPath,['scripts/v110379/test-ongoing-on-duty.mjs'],{stdio:'inherit'});
if(result.error)throw result.error;assert.equal(result.status,0,'Unified duty and pickup regressions must pass');
for(const path of ['release-version.json','public/app-version.json']){
 const value=JSON.parse(read(path));const stamp=new Date().toISOString();
 Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.79 Update the ongoing ON Duty handoff',releasedAt:stamp,updatedAt:stamp,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
 notes:['Changing an unfinished Drop Off to Drop & Hook updates the current ON-duty interval with audit history; recorded pickups stay separate.','Current status and recorded-event Edit share one Duty Form, activity vocabulary, location controls and save layout.','Active load guidance cannot rewrite a recorded pickup; conflicting references require driver review.','Historical GPS asks before replacing location; destination edits keep BOL and load numbers separate.','Explicit pickup corrections preserve audit history and update only that event’s linked selected-day route.','Unlinked manual route entries are labelled as plans; stored duty times and original documents are not reset.']});
 fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){const value=JSON.parse(read(path));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
 let value=read(path);for(const [key,replacement] of [['VERSION',VERSION],['BUILD',BUILD]]){const pattern=new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`,'g');assert.equal([...value.matchAll(pattern)].length,1);value=value.replace(pattern,`const ${name}_${key} = '${replacement}';`);}fs.writeFileSync(path,value);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,read(path).replaceAll("'110.3.78'","'"+VERSION+"'").replaceAll("'v110378-unified-duty-recorded-trips'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — 110.3.79 release preserves prior startup, Reader and day-isolation changes');
