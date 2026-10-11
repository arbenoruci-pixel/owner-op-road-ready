import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const VERSION='110.4.65',BUILD='v110465-device-recheck';
for(const path of ['release-version.json','public/app-version.json']){
 const v=JSON.parse(read(path));Object.assign(v,{version:VERSION,build:BUILD,force:false,label:'v110.4.65 Safe device recheck',sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Keep an offline device locked when an older verification finishes.','Verify the active device again after reconnecting.','Preserve existing logs, signatures and documents during route cleanup.']});fs.writeFileSync(path,JSON.stringify(v,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){const v=JSON.parse(read(path));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(v,null,2)+'\n');}
for(const path of ['source/src/core/update/appUpdate.js','public/sw.js','source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx','lib/owner-op-cloud/cloudMirrorV110450.js','lib/owner-op-cloud/recordSyncV110451.js','scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,read(path).replaceAll('110.4.64',VERSION).replaceAll('v110464-smart-rate-reader',BUILD));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS safe active-device recheck installed');
