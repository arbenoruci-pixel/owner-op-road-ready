import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const VERSION='110.4.66',BUILD='v110466-signed-rate-agreement';
for(const path of ['release-version.json','public/app-version.json']){
 const v=JSON.parse(read(path));Object.assign(v,{version:VERSION,build:BUILD,force:false,label:'v110.4.66 Signed rate agreements',sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Recognize signed Rate Agreement and other supported rate headings.','Keep embedded Sertifi stamps separate from standalone signing certificates.','Preserve original PDFs, source evidence and confirmed values.']});fs.writeFileSync(path,JSON.stringify(v,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){const v=JSON.parse(read(path));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(v,null,2)+'\n');}
for(const path of ['source/src/core/update/appUpdate.js','public/sw.js','source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx','lib/owner-op-cloud/cloudMirrorV110450.js','lib/owner-op-cloud/recordSyncV110451.js','scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,read(path).replaceAll('110.4.65',VERSION).replaceAll('v110465-device-recheck',BUILD));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS signed Rate Agreement classification installed');

for(const path of ['packages/smart-reader-core/src/engine.js','packages/smart-reader-core/package.json'])fs.writeFileSync(path,read(path).replaceAll('0.3.37','0.3.38'));
for(const path of ['scripts/browser-native-pdf-v110363.mjs','scripts/v110373/browser-reader-evidence.mjs','scripts/v110382/browser-bol.mjs','scripts/v110384/browser-rows.mjs','scripts/browser-ratecon-structure-v110388.mjs','scripts/v110393/browser-bol-source.mjs','scripts/v110394/browser-bol-form.mjs','scripts/v110410/browser-bol-columns.mjs','scripts/v110411/browser-rate.mjs','scripts/v110411/browser-filing.mjs','scripts/v110464/browser-rate.mjs'])fs.writeFileSync(path,read(path).replaceAll("'0.3.37'","'0.3.38'"));

await import('./finalize-insert-solo-v110469.mjs');
