import fs from 'node:fs';
const read=path=>fs.readFileSync(path,'utf8');
const VERSION='110.4.60',BUILD='v110460-verified-document-reuse';
for(const path of ['release-version.json','public/app-version.json']){
 const value=JSON.parse(read(path));
 Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.4.60 Efficient document sync',sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Reuse verified original files already on this device.','Avoid repeated downloads when only document details change.','Full cloud backups remain manual.']});
 fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){
 const value=JSON.parse(read(path));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;
 fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['source/src/core/update/appUpdate.js','public/sw.js','source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx','lib/owner-op-cloud/cloudMirrorV110450.js','lib/owner-op-cloud/recordSyncV110451.js','scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,read(path).replaceAll('110.4.59',VERSION).replaceAll('v110459-prompt-device-sync',BUILD));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS verified original reuse release installed');
