import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const VERSION='110.3.88',BUILD='v110388-ratecon-structure';
const read=path=>fs.readFileSync(path,'utf8');
const identityPath='source/src/modules/scan/documentIdentityV110334.js';
let identity=read(identityPath);
const importBefore="import {extraPageIdentity,attachmentRelationship} from './ownedPageIdentityV110338.js';";
const importAfter="import {extraPageIdentity,attachmentRelationship,alignRateContinuationPages} from './ownedPageIdentityV110338.js';";
if(!identity.includes(importAfter)){
 assert.equal(identity.split(importBefore).length-1,1,'RateCon app identity import');
 identity=identity.replace(importBefore,importAfter);
}
const before="  const types=[...new Set(pageTypes.filter(p=>!p.supporting).map(p=>p.typeId).filter(Boolean))];";
const after="  alignRateContinuationPages(analysis,pageTypes);\n"+before;
if(!identity.includes(after)){
 assert.equal(identity.split(before).length-1,1,'RateCon app continuation boundary');
 identity=identity.replace(before,after);
}
fs.writeFileSync(identityPath,identity);
fs.copyFileSync('scripts/owned-reader/pageIdentity.js','source/src/modules/scan/ownedPageIdentityV110338.js');
const result=spawnSync(process.execPath,['--test','packages/smart-reader-core/test/sertifi-rate.test.mjs'],{stdio:'inherit'});
if(result.error)throw result.error;assert.equal(result.status,0,'Rate confirmation structure regressions must pass');
const appResult=spawnSync(process.execPath,['scripts/test-ratecon-app-v110388.mjs'],{stdio:'inherit'});
if(appResult.error)throw appResult.error;assert.equal(appResult.status,0,'Rate confirmation app integration must pass');
for(const browser of ['scripts/browser-native-pdf-v110363.mjs','scripts/v110373/browser-reader-evidence.mjs','scripts/v110382/browser-bol.mjs','scripts/v110384/browser-rows.mjs'])fs.writeFileSync(browser,read(browser).replaceAll("'0.3.24'","'0.3.25'"));
for(const path of ['release-version.json','public/app-version.json']){
 const value=JSON.parse(read(path));const stamp=new Date().toISOString();
 Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.88 Rate confirmation reading',releasedAt:stamp,updatedAt:stamp,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
 notes:['Read native pickup and delivery blocks with appointment notes and partial addresses.','Resolve short dates using the matching signed document and explicit date-order evidence.','Keep rate continuation and signing pages accounted for, with original source evidence.']});
 fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){const value=JSON.parse(read(path));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
 let value=read(path);for(const [key,replacement] of [['VERSION',VERSION],['BUILD',BUILD]]){const pattern=new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`,'g');assert.equal([...value.matchAll(pattern)].length,1);value=value.replace(pattern,`const ${name}_${key} = '${replacement}';`);}fs.writeFileSync(path,value);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,read(path).replaceAll("'110.3.87'","'"+VERSION+"'").replaceAll("'v110387-weight-review-flow'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — 110.3.88 RateCon stops, linked dates and continuation pages preserve exact evidence');
