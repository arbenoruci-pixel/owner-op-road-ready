import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
function patch(path,before,after){const s=read(path);if(s.includes(after))return;if(s.split(before).length!==2)throw Error('Single-device anchor changed: '+path);fs.writeFileSync(path,s.replace(before,()=>after));}
fs.copyFileSync('scripts/v110463/deviceSession.js','lib/owner-op-cloud/deviceSessionV110463.js');
fs.copyFileSync('scripts/v110463/DeviceSessionGate.jsx','source/src/modules/auth/DeviceSessionGateV110463.jsx');
const auth='source/src/modules/auth/AuthGate.jsx';
patch(auth,"import './auth.css';","import './auth.css';\nimport DeviceSessionGate from './DeviceSessionGateV110463.jsx';\nimport {requestDeviceActivation} from '../../../../lib/owner-op-cloud/deviceSessionV110463.js';");
patch(auth,"if (signInError) throw signInError;","if (signInError) throw signInError;\n        requestDeviceActivation(data.session);");
patch(auth,'      {children}','      <DeviceSessionGate>{children}</DeviceSessionGate>');
const VERSION='110.4.63',BUILD='v110463-single-active-device';
for(const path of ['release-version.json','public/app-version.json']){
 const v=JSON.parse(read(path));Object.assign(v,{version:VERSION,build:BUILD,force:false,label:'v110.4.63 One active device',sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Signing in on another device locks the previous device.','A newly active device receives the saved logbook before editing.','Previous local work is retained for recovery.']});fs.writeFileSync(path,JSON.stringify(v,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){const v=JSON.parse(read(path));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(v,null,2)+'\n');}
for(const path of ['source/src/core/update/appUpdate.js','public/sw.js','source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx','lib/owner-op-cloud/cloudMirrorV110450.js','lib/owner-op-cloud/recordSyncV110451.js','scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,read(path).replaceAll('110.4.62',VERSION).replaceAll('v110462-logbook-first-sync',BUILD));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS one active device installed');
