import fs from 'node:fs';
const previous='110.4.132',version='110.4.133';
for(const path of ['release-version.json','public/app-version.json']){
 const meta=JSON.parse(fs.readFileSync(path));meta.version=version;meta.build=meta.build.replace('v1104132-original-index-','v1104133-duty-continuity-');meta.label='Continue live duty across midnight';meta.notes=['Continue new live duty selections through the next status change.'];
 fs.writeFileSync(path,JSON.stringify(meta,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){const value=JSON.parse(fs.readFileSync(path));value.version=version;if(value.packages?.[''])value.packages[''].version=version;fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
for(const path of ['public/sw.js','source/src/core/update/appUpdate.js','source/src/shared/ui/ToolsSheet.jsx','source/src/modules/home/HomeScreen.jsx','source/src/modules/home/DriverDashboard.jsx','lib/owner-op-cloud/cloudMirrorV110450.js','scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,fs.readFileSync(path,'utf8').replaceAll(previous,version).replaceAll('v1104132-original-index-','v1104133-duty-continuity-'));
const lock=JSON.parse(fs.readFileSync('module-locks.v1.json'));lock.release=version;fs.writeFileSync('module-locks.v1.json',JSON.stringify(lock,null,2)+'\n');
