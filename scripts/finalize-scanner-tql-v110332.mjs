import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8'),scan='source/src/modules/scan/';
function patch(path,before,after){const source=read(path);if(source.includes(after))return;assert.equal(source.split(before).length-1,1,'Scanner capture anchor: '+path);fs.writeFileSync(path,source.replace(before,after));}
for(const [source,target] of [
  ['CameraAdapterV3.jsx','v3/CameraAdapterV3.jsx'],
  ['documentBoundary.js','v3/documentBoundaryV110329.js'],
])fs.copyFileSync('scripts/v110332/'+source,scan+target);
const VERSION='110.3.32',BUILD='v110332-mixed-background-paper-capture';
for(const path of ['release-version.json','public/app-version.json']){const value=JSON.parse(read(path));Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.32 Paper capture across pale and textured backgrounds',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Find complete paper across pale boards, carpet and upholstery.','Use color boundaries alongside brightness and reject dense background texture.','Keep the frame from capture time when the native still photo is delayed.']});fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
for(const path of ['package.json','package-lock.json']){const value=JSON.parse(read(path));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let source=read(path);for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]])source=source.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['\"][^'\"]+['\"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(path,source);}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.31');assert.equal(meta.build,'v110331-fast-capture-paper-cleanup');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — v110.3.32 mixed-background paper detection and immediate capture fallback installed');
