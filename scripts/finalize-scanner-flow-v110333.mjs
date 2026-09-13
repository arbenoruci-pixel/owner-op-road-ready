import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8'),scan='source/src/modules/scan/';
function patch(path,before,after){const source=read(path);if(source.includes(after))return;assert.equal(source.split(before).length-1,1,'Scanner capture anchor: '+path);fs.writeFileSync(path,source.replace(before,after));}
for(const [source,target] of [
  ['CameraAdapterV3.jsx','v3/CameraAdapterV3.jsx'],
  ['ScanIntake.jsx','ScanIntakeV110328.jsx'],
  ['pageTransition.js','v3/pageTransitionV110333.js'],
])fs.copyFileSync('scripts/v110333/'+source,scan+target);
const css='source/src/command-center.css',styles=read('scripts/v110333/scannerFlow.css');if(!read(css).includes(styles))fs.appendFileSync(css,'\n'+styles+'\n');
const VERSION='110.3.33',BUILD='v110333-continuous-capture-simple-review';
for(const path of ['release-version.json','public/app-version.json']){const value=JSON.parse(read(path));Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.33 Continuous capture and simpler page review',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Keep watching for the next page while the captured photo is processing.','Open captured pages from the camera thumbnail and finish with Done.','Review larger pages, rotate directly and zoom from a full-page view.']});fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
for(const path of ['package.json','package-lock.json']){const value=JSON.parse(read(path));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let source=read(path);for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]])source=source.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['\"][^'\"]+['\"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(path,source);}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.32');assert.equal(meta.build,'v110332-mixed-background-paper-capture');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — v110.3.33 continuous capture and simpler page review installed');
