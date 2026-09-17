import fs from 'node:fs';
import assert from 'node:assert/strict';
const VERSION='110.3.62',BUILD='v110362-rate-stop-fields';
const read=path=>fs.readFileSync(path,'utf8');
function patch(path,before,after){const source=read(path);if(source.includes(after))return;assert.equal(source.split(before).length-1,1,'Release anchor '+path);fs.writeFileSync(path,source.replace(before,after));}
for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(read(path));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.62 Rate confirmation stop fields',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
    notes:['Read stop company and appointment date candidates with exact source evidence.','Read certificate references and completion dates without using signer timestamps.','Keep ambiguous dates, multiple stops and conflicting readings in review.']});
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
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.61');assert.equal(meta.build,'v110361-trucking-document-catalog');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
patch('scripts/test-editor-grips-v110355.mjs',"assert.equal(meta.version,'110.3.61'); assert.equal(meta.build,'v110361-trucking-document-catalog');",`assert.equal(meta.version,'${VERSION}'); assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — 110.3.62 stop and certificate field reading installed');
