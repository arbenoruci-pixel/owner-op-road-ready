import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
await import('./insert-continuity/install.mjs');
// Reapply after historical team installers, even if another installer loaded
// the helper earlier in this build process.
await import('./solo-driver/install.mjs?finalize=v110469');
const read=p=>fs.readFileSync(p,'utf8');
const VERSION='110.4.69',BUILD='v110469-insert-continuity-solo';
for(const path of ['release-version.json','public/app-version.json']) {
  const v=JSON.parse(read(path));Object.assign(v,{version:VERSION,build:BUILD,force:false,label:'v110.4.69 Insert continuity and Solo',sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Keep known sleeper and midnight Driving lines visible in Insert.','Preserve duty time outside the inserted interval when saving.','Keep Solo selected after removing a co-driver; add them explicitly to return to team driving.']});fs.writeFileSync(path,JSON.stringify(v,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){const v=JSON.parse(read(path));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(v,null,2)+'\n');}
for(const path of ['source/src/core/update/appUpdate.js','public/sw.js','source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx','lib/owner-op-cloud/cloudMirrorV110450.js','lib/owner-op-cloud/recordSyncV110451.js','scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,read(path).replaceAll('110.4.66',VERSION).replaceAll('v110466-signed-rate-agreement',BUILD));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
for(const script of ['insert-continuity/continuity.test.mjs','solo-driver/membership.test.mjs','verify-isolation-locks-v110.mjs'])execFileSync(process.execPath,['scripts/'+script],{stdio:'inherit'});

await import('./finalize-single-device-ipad-v110470.mjs');
