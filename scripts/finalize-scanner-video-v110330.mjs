import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8'),scan='source/src/modules/scan/';
function patch(path,before,after){const source=read(path);if(source.includes(after))return;assert.equal(source.split(before).length-1,1,'Scanner capture anchor: '+path);fs.writeFileSync(path,source.replace(before,after));}
for(const [source,target] of [
  ['documentBoundary.js','v3/documentBoundaryV110329.js'],
  ['ScannerEngineV3.js','v3/ScannerEngineV3.js'],
  ['imageUtilsV3.js','v3/imageUtilsV3.js'],
  ['processDocument.js','v3/processDocumentV110330.js'],
  ['processDocumentClient.js','v3/processDocumentClientV110330.js'],
  ['documentProcessingWorker.js','v3/documentProcessingWorkerV110330.js'],
  ['ScanIntake.jsx','ScanIntakeV110328.jsx'],
])fs.copyFileSync('scripts/v110330/'+source,scan+target);
const VERSION='110.3.30',BUILD='v110330-refined-paper-worker';
for(const path of ['release-version.json','public/app-version.json']){const value=JSON.parse(read(path));Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.30 Refined paper edges and faster processing',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Refine corners at the paper/background transition.','Process photos in our own local worker while keeping the camera responsive.','Decode the source and normalize paper once while preserving originals.']});fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
for(const path of ['package.json','package-lock.json']){const value=JSON.parse(read(path));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let source=read(path);for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]])source=source.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['\"][^'\"]+['\"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(path,source);}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.29');assert.equal(meta.build,'v110329-document-boundaries-continuous-camera');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — v110.3.30 refined paper boundaries and local worker installed');
