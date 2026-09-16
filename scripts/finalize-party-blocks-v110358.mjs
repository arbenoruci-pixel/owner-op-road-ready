import fs from 'node:fs';
import assert from 'node:assert/strict';
const VERSION='110.3.58',BUILD='v110358-shipping-party-blocks';
const read=path=>fs.readFileSync(path,'utf8');
function patch(path,before,after){
  const source=read(path);if(source.includes(after))return;
  assert.equal(source.split(before).length-1,1,`Shipping party anchor: ${path}`);
  fs.writeFileSync(path,source.replace(before,after));
}
const scan='source/src/modules/scan/';
patch(scan+'imageReaderV110323.js',"read(detail.file,'party-detail-'+(index+1),'7',", "read(detail.file,'party-detail-'+(index+1),detail.pageSegMode||'7',");
patch(scan+'OwnedReaderPreview.jsx','Adjacent company suffix: <mark>{e.quote}</mark>', "{selection.candidate.continuationKind==='party_block'?'Additional company line:':'Adjacent company suffix:'} <mark>{e.quote}</mark>");

for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(read(path));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.58 Shipping party blocks',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
    notes:['Keep freight terms out of company fields and preserve wrapped company and facility rows together.','Reread complete party rows with their labels and use block reading for wrapped fields.','Preserve source evidence, distinct company names and human confirmation for uncertain readings.']});
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){
  const value=JSON.parse(read(path));value.version=VERSION;
  if(value.packages?.[''])value.packages[''].version=VERSION;
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
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.57');assert.equal(meta.build,'v110357-party-evidence-recovery');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
patch('scripts/test-editor-grips-v110355.mjs',"assert.equal(meta.version,'110.3.57'); assert.equal(meta.build,'v110357-party-evidence-recovery');",`assert.equal(meta.version,'${VERSION}'); assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — 110.3.58 shipping party blocks installed');
