import fs from 'node:fs';
import assert from 'node:assert/strict';
import {installWordReaderV110342} from './owned-reader/installWordReader.mjs';
installWordReaderV110342();
const VERSION='110.3.42',BUILD='v110342-word-layout-reader';
for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(fs.readFileSync(path,'utf8'));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.42 Read document columns and shaded fields',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Use source word positions to separate document columns.','Recheck incomplete readings and shaded form fields.','Inspect uncertain BOL labels with a bounded source-region reread.']});
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){
  const value=JSON.parse(fs.readFileSync(path,'utf8'));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let source=fs.readFileSync(path,'utf8');
  for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]])source=source.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['\"][^'\"]+['\"];?`),`const ${name}_${key} = '${value}';`);
  fs.writeFileSync(path,source);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,fs.readFileSync(path,'utf8').replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
const test='scripts/test-duty-graph-continuity.mjs';
const before="assert.equal(meta.version,'110.3.41');assert.equal(meta.build,'v110341-merged-reading-fields');";
const after=`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`;
const source=fs.readFileSync(test,'utf8');
if(!source.includes(after)){assert.equal(source.split(before).length-1,1,'Reader release test anchor');fs.writeFileSync(test,source.replace(before,after));}
console.log('PASS — v110.3.42 word layout, shaded fields and bounded identifier rereading installed');
