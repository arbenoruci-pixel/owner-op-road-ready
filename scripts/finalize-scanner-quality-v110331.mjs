import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8'),scan='source/src/modules/scan/';
function patch(path,before,after){const source=read(path);if(source.includes(after))return;assert.equal(source.split(before).length-1,1,'Scanner capture anchor: '+path);fs.writeFileSync(path,source.replace(before,after));}
for(const [source,target] of [
  ['CameraAdapterV3.jsx','v3/CameraAdapterV3.jsx'],
  ['DocumentQualityV11036.js','v3/DocumentQualityV11036.js'],
  ['captureWindow.js','v3/captureWindowV110331.js'],
  ['paperCleanup.js','v3/paperCleanupV110331.js'],
])fs.copyFileSync('scripts/v110331/'+source,scan+target);
patch(scan+'v3/ScannerEngineV3.js',"method:'local-paper-illumination-v11036'","method:'paper-surface-v110331'");
const VERSION='110.3.31',BUILD='v110331-fast-capture-paper-cleanup';
for(const path of ['release-version.json','public/app-version.json']){const value=JSON.parse(read(path));Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.31 Faster capture and cleaner document paper',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Capture after three sharp, agreeing observations, tolerating one corner outlier.','Correct fold shadows and paper color while retaining fine print and colored ink.','Keep original photos intact and process locally in our own scanner.']});fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
for(const path of ['package.json','package-lock.json']){const value=JSON.parse(read(path));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let source=read(path);for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]])source=source.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['\"][^'\"]+['\"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(path,source);}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.30');assert.equal(meta.build,'v110330-refined-paper-worker');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — v110.3.31 faster capture and paper surface cleanup installed');
