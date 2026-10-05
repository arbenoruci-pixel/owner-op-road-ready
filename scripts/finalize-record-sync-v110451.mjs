import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
function patch(path,before,after){const s=read(path);if(s.includes(after))return;if(s.split(before).length!==2)throw Error('Record sync anchor changed: '+path);fs.writeFileSync(path,s.replace(before,()=>after));}
for(const [source,target] of [['recordsCore.js','lib/owner-op-cloud/recordsCoreV110451.js'],['recordSync.js','lib/owner-op-cloud/recordSyncV110451.js'],['RecordSyncPanel.jsx','source/src/modules/cloud/RecordSyncPanelV110451.jsx'],['RecordSyncAgent.jsx','source/src/modules/cloud/RecordSyncAgentV110451.jsx'],['RecordEditGuard.jsx','source/src/modules/cloud/RecordEditGuardV110451.jsx']])fs.copyFileSync('scripts/v110451/'+source,target);
const hub='source/src/modules/cloud/CloudHub.jsx';
patch(hub,"import CloudBackupPanel", "import RecordSyncPanel from './RecordSyncPanelV110451.jsx';\nimport CloudBackupPanel");
patch(hub,'{session?<CloudBackupPanel/>:null}','{session?<><CloudBackupPanel/><RecordSyncPanel/></>:null}');
const entry='app/road-ready-client.jsx';
patch(entry,"import App from", "import RecordEditGuard from '../source/src/modules/cloud/RecordEditGuardV110451.jsx';\nimport RecordSyncAgent from '../source/src/modules/cloud/RecordSyncAgentV110451.jsx';\nimport App from");
patch(entry,'<AuthGate><App/><CloudBackupAgent/></AuthGate>','<AuthGate><RecordEditGuard><App/><CloudBackupAgent/><RecordSyncAgent/></RecordEditGuard></AuthGate>');
patch('lib/local-db/appState.js','const snapshotWriteQueueByKey = new Map();','const snapshotWriteQueueByKey = new Map();\nexport async function flushAppSnapshots(){while(snapshotWriteQueueByKey.size)await Promise.allSettled([...snapshotWriteQueueByKey.values()]);}');
const VERSION='110.4.52',BUILD='v110452-retained-duplicate-records';
fs.writeFileSync('lib/owner-op-cloud/cloudMirrorV110450.js',read('lib/owner-op-cloud/cloudMirrorV110450.js').replaceAll('110.4.50',VERSION));
for(const path of ['release-version.json','public/app-version.json']){const v=JSON.parse(read(path));Object.assign(v,{version:VERSION,build:BUILD,label:'v110.4.52 Records and corrections',sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Index saved device records with driver and load identities.','Keep revision history and conflict-safe targeted corrections.','Preserve local-only operation and independent full backups.']});fs.writeFileSync(path,JSON.stringify(v,null,2)+'\n');}
for(const path of ['package.json','package-lock.json']){const v=JSON.parse(read(path));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(v,null,2)+'\n');}
for(const[path,name]of[['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(path);for(const[key,value]of[['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(path,s);}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replaceAll('v110.4.50','v'+VERSION).replaceAll('V110.4.50','V'+VERSION));
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,read(path).replaceAll("'110.4.50'","'"+VERSION+"'").replaceAll("'v110450-verified-device-cloud-copy'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — indexed device records, revision history and conflict-safe corrections installed');
await import('./finalize-evidence-workspace-v110453.mjs');
