import fs from 'node:fs';
import assert from 'node:assert/strict';
import {installReaderLayoutV110337} from './v110337/install.mjs';
installReaderLayoutV110337();
const VERSION='110.3.37',BUILD='v110337-reader-layout-evidence';
for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(fs.readFileSync(path,'utf8'));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.37 Reader layout and source checks',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Recognize non-negotiable BOL headings.','Show shipping block candidates with their exact source lines.','Remove unverified party and trailer values caused by flattened columns.']});
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
const before="assert.equal(meta.version,'110.3.36');assert.equal(meta.build,'v110336-phone-capture-reader-guards');";
const after=`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`;
const source=fs.readFileSync(test,'utf8');
if(!source.includes(after)){assert.equal(source.split(before).length-1,1,'Reader release test anchor');fs.writeFileSync(test,source.replace(before,after));}
console.log('PASS — v110.3.37 reader layout and source checks installed');
