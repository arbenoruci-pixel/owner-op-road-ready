import fs from 'node:fs';
import assert from 'node:assert/strict';
const VERSION='110.3.49',BUILD='v110349-reading-evidence';
function patch(path,before,after){
  const source=fs.readFileSync(path,'utf8');
  if(source.includes(after))return;
  assert.equal(source.split(before).length-1,1,`Reading evidence anchor: ${path}: ${before}`);
  fs.writeFileSync(path,source.replace(before,after));
}
const reader='source/src/modules/scan/imageReaderV110323.js';
patch(reader,'import {needsReadingRetry,hasReadableBolReference}', 'import {needsReadingRetry,hasReadableBolReference,needsAmountSourceVerification}');
patch(reader,'    const criticalReads=shipping?', '    const verifyAmounts=needsAmountSourceVerification(pagePasses);\n    const criticalReads=shipping?');
patch(reader,"if(!first||first.confidence<.78||disputed||needsReadingRetry(pagePasses)","if(verifyAmounts||!first||first.confidence<.78||disputed||needsReadingRetry(pagePasses)");
patch(reader,"await read(original,'source-page','11');","await read(original,'source-page',verifyAmounts?'3':'11');");
for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(fs.readFileSync(path,'utf8'));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.49 Preserve supported readings',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Preserve strong labeled values when weaker retries agree.','Check financial amounts against original pixels.','Keep conflicting values available for source review.']});
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
const before="assert.equal(meta.version,'110.3.48');assert.equal(meta.build,'v110348-pdf-reading');";
const after=`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`;
const source=fs.readFileSync(test,'utf8');
if(!source.includes(after)){assert.equal(source.split(before).length-1,1,'Reader release test anchor');fs.writeFileSync(test,source.replace(before,after));}
console.log('PASS — v110.3.49 agreeing evidence and original amount verification installed');
