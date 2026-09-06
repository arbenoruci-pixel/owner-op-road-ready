import fs from 'node:fs';
const VERSION='110.0.2',BUILD='v110002-pre-cloud-data-safety-lock';
const wallet='source/src/modules/wallet/DigitalWalletScreen.jsx';
let src=fs.readFileSync(wallet,'utf8');
if(!src.includes("from '../cloud/CloudLaunchBar.jsx'"))src="import CloudLaunchBar from '../cloud/CloudLaunchBar.jsx';\n"+src;
if(!src.includes('<CloudLaunchBar state={state} />')){
 const anchor='<WalletOverview summary={summary} onEditDoc={setEditingDocId} />';
 if(!src.includes(anchor))throw new Error('Wallet cloud integration anchor missing');
 src=src.replace(anchor,'<CloudLaunchBar state={state} />\n      '+anchor);
}
fs.writeFileSync(wallet,src);
fs.writeFileSync('app/road-ready-client.jsx',"'use client';\nimport App from '../source/src/App.jsx';\nimport AuthGate from '../source/src/modules/auth/AuthGate.jsx';\nimport CloudBackupAgent from '../source/src/modules/cloud/CloudBackupAgent.jsx';\nexport default function RoadReadyClient(){return <AuthGate><App/><CloudBackupAgent/></AuthGate>;}\n");

// Data-safety lock: legacy cloud pull/push remains disabled unless a future
// migration explicitly opts in. A one-time raw snapshot is preserved before
// startup normalization so old logs remain recoverable during prototype work.
const appPath='source/src/app/App.jsx';
let app=fs.readFileSync(appPath,'utf8');
if(!app.includes('const ENABLE_LEGACY_SYNC =')){
 const demo=/const DEMO_CERTIFY_STATUS\s*=\s*ENABLE_DEMO_DATA\s*\?\s*initialCertifyStatus\s*:\s*\{\}\s*;?/;
 if(!demo.test(app))throw new Error('Legacy sync safety constant anchor missing');
 app=app.replace(demo,match=>`${match}\nconst ENABLE_LEGACY_SYNC = process.env.NEXT_PUBLIC_OWNER_OP_LEGACY_SYNC_ENABLED === 'true';`);
}
if(!app.includes("owner-op-road-ready-pre-cloud-raw-v1")){
 const saved=/if\s*\(\s*saved\s*\)\s*\{\s*const\s+recovered\s*=\s*await\s+recoverSuspiciousTodayState\(saved\)\s*;?/;
 if(!saved.test(app))throw new Error('Pre-cloud snapshot anchor missing');
 app=app.replace(saved,match=>{
   const recoveredPart=match.match(/const\s+recovered[\s\S]*$/)?.[0] || 'const recovered = await recoverSuspiciousTodayState(saved);';
   return `if (saved) {\n      try {\n        if (typeof window !== 'undefined' && !window.localStorage.getItem('owner-op-pre-cloud-safety-lock-v1')) {\n          await savePreUpdateSnapshot(saved, { kind:'pre_cloud_safety_lock', sourceVersion:CURRENT_APP_VERSION, createdAt:new Date().toISOString() });\n          try { window.localStorage.setItem('owner-op-road-ready-pre-cloud-raw-v1', JSON.stringify(saved)); } catch {}\n          window.localStorage.setItem('owner-op-pre-cloud-safety-lock-v1', 'saved');\n        }\n      } catch {}\n      ${recoveredPart}`;
 });
}
app=app.replace(/installOwnerOpAuthBridge\(\);/g,'if (ENABLE_LEGACY_SYNC) installOwnerOpAuthBridge();');
app=app.replace(/startSyncEngine\(\);/g,'if (ENABLE_LEGACY_SYNC) startSyncEngine();');
app=app.replace(/if\s*\(previousEventsByDay\)\s*\{\s*queueDutyEventDiffs\(previousEventsByDay,\s*state\.eventsByDay\s*\|\|\s*\{\}\)\.catch\(\(\)\s*=>\s*\{\}\);\s*\}/g,"if (ENABLE_LEGACY_SYNC && previousEventsByDay) { queueDutyEventDiffs(previousEventsByDay, state.eventsByDay || {}).catch(() => {}); }");
app=app.replace(/if\s*\(previousInspectionByDay\)\s*\{\s*queueInspectionDiffs\(previousInspectionByDay,\s*state\.inspectionByDay\s*\|\|\s*\{\}\)\.catch\(\(\)\s*=>\s*\{\}\);\s*\}/g,"if (ENABLE_LEGACY_SYNC && previousInspectionByDay) { queueInspectionDiffs(previousInspectionByDay, state.inspectionByDay || {}).catch(() => {}); }");
if(!app.includes('if (ENABLE_LEGACY_SYNC) startSyncEngine();')||!app.includes('owner-op-road-ready-pre-cloud-raw-v1')||!app.includes('ENABLE_LEGACY_SYNC && previousEventsByDay'))throw new Error('Pre-cloud data safety lock failed');
fs.writeFileSync(appPath,app);

fs.writeFileSync('release-version.json',JSON.stringify({version:VERSION,build:BUILD,label:'Pre-cloud data safety lock'},null,2)+'\n');
const previous=JSON.parse(fs.readFileSync('public/app-version.json','utf8'));
fs.writeFileSync('public/app-version.json',JSON.stringify({...previous,version:VERSION,build:BUILD,label:'Pre-cloud data safety lock',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),force:false,notes:['Legacy cloud pull/push remains disabled during prototype migration.','A one-time raw local snapshot is preserved before startup normalization.','Owner Operator login and new prototype cloud remain isolated from Tepiha.']},null,2)+'\n');
const update='source/src/core/update/appUpdate.js';let code=fs.readFileSync(update,'utf8');
code=code.replace(/const FALLBACK_APP_VERSION\s*=\s*['\"][^'\"]+['\"];?/,`const FALLBACK_APP_VERSION = '${VERSION}';`).replace(/const FALLBACK_APP_BUILD\s*=\s*['\"][^'\"]+['\"];?/,`const FALLBACK_APP_BUILD = '${BUILD}';`).replace(/export const CURRENT_APP_VERSION\s*=\s*[^;]+;/,'export const CURRENT_APP_VERSION = FALLBACK_APP_VERSION;').replace(/export const CURRENT_APP_BUILD\s*=\s*[^;]+;/,'export const CURRENT_APP_BUILD = FALLBACK_APP_BUILD;');
fs.writeFileSync(update,code);
let sw=fs.readFileSync('public/sw.js','utf8');sw=sw.replace(/const OWNER_OP_SW_VERSION\s*=\s*['\"][^'\"]+['\"];?/,`const OWNER_OP_SW_VERSION = '${VERSION}';`).replace(/const OWNER_OP_SW_BUILD\s*=\s*['\"][^'\"]+['\"];?/,`const OWNER_OP_SW_BUILD = '${BUILD}';`);fs.writeFileSync('public/sw.js',sw);
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])if(fs.existsSync(p)){let s=fs.readFileSync(p,'utf8');s=s.replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION);fs.writeFileSync(p,s);}
console.log('PASS — pre-cloud data safety lock applied; legacy sync disabled by default and raw local snapshot preserved');
