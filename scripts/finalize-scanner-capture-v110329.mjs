import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8'),scan='source/src/modules/scan/';
function patch(path,before,after){const source=read(path);if(source.includes(after))return;assert.equal(source.split(before).length-1,1,'Scanner capture anchor: '+path);fs.writeFileSync(path,source.replace(before,after));}
fs.copyFileSync('scripts/v110329/documentBoundary.js',scan+'v3/documentBoundaryV110329.js');
fs.writeFileSync(scan+'v3/EdgeDetectorV3.js',"export {detectDocumentBoundary as detectDocumentEdgesV3} from './documentBoundaryV110329.js';\n");
for(const name of ['CameraAdapterV3.jsx','DocumentQualityV11036.js'])fs.copyFileSync('scripts/v110329/'+name,scan+'v3/'+name);
fs.copyFileSync('scripts/v110329/ScanIntake.jsx',scan+'ScanIntakeV110328.jsx');
patch(scan+'v3/ScannerEngineV3.js','const straightened = autoOrientDocumentV10943(corrected, {','const straightened = options.preserveOrientation ? {image:corrected} : autoOrientDocumentV10943(corrected, {');
const VERSION='110.3.29',BUILD='v110329-document-boundaries-continuous-camera';
for(const path of ['release-version.json','public/app-version.json']){const value=JSON.parse(read(path));Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.29 Paper detection and continuous scanning',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Verify paper candidates against all four edges and interior detail.','Crop the actual still photo and retain the selected corners through reading.','Capture several pages without reopening the camera; review before saving.']});fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
for(const path of ['package.json','package-lock.json']){const value=JSON.parse(read(path));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let source=read(path);for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]])source=source.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['\"][^'\"]+['\"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(path,source);}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.28');assert.equal(meta.build,'v110328-scanner-page-workflow');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — v110.3.29 document boundaries, retained crop and continuous camera installed');
