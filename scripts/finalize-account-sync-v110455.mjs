import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
function patch(path,before,after){const s=read(path);if(s.includes(after))return;if(s.split(before).length!==2)throw Error('Account sync anchor changed: '+path);fs.writeFileSync(path,s.replace(before,()=>after));}
for(const [source,target] of [['accountCore.js','lib/owner-op-cloud/accountCoreV110455.js'],['accountFiles.js','lib/owner-op-cloud/accountFilesV110455.js'],['accountSync.js','lib/owner-op-cloud/accountSyncV110455.js'],['AccountSyncGate.jsx','source/src/modules/cloud/AccountSyncGateV110455.jsx']])fs.copyFileSync('scripts/v110455/'+source,target);
patch('app/road-ready-client.jsx',"import App from", "import AccountSyncGate from '../source/src/modules/cloud/AccountSyncGateV110455.jsx';\nimport App from");
patch('app/road-ready-client.jsx','<RecordEditGuard><App/><CloudBackupAgent/><RecordSyncAgent/></RecordEditGuard>','<AccountSyncGate><RecordEditGuard><App/><CloudBackupAgent/><RecordSyncAgent/></RecordEditGuard></AccountSyncGate>');
if(!read('source/src/app/App.jsx').includes("import {flushSync} from 'react-dom';"))patch('source/src/app/App.jsx',"import React, { useMemo", "import {flushSync} from 'react-dom';\nimport React, { useMemo");
patch('source/src/app/App.jsx','const [offlineHydrated, setOfflineHydrated] = useState(false);',`const [offlineHydrated, setOfflineHydrated] = useState(false);
  const accountLiveRef=useRef(null);accountLiveRef.current=offlineHydrated?state:null;
  React.useEffect(()=>{
    window.__rrAccountState=()=>accountLiveRef.current;
    const apply=e=>{const next=e.detail;if(!next)return;lastEventsByDayRef.current=next.eventsByDay||{};lastInspectionByDayRef.current=next.inspectionByDay||{};undoPreviousStateRef.current=undoableStateSnapshot(next);undoFingerprintRef.current=undoDataFingerprint(next);undoSuppressRef.current=true;flushSync(()=>setState(next));};
    window.addEventListener('road-ready-account-apply',apply);
    return()=>{delete window.__rrAccountState;window.removeEventListener('road-ready-account-apply',apply);};
  },[]);`);
patch('lib/local-db/appState.js',"await db.sync_meta.put({ key: 'last_local_write_at', value: now, updated_at: now });", "await db.sync_meta.put({ key: 'last_local_write_at', value: now, updated_at: now });\n    if(key===APP_STATE_KEY)window.dispatchEvent(new Event('road-ready-local-saved'));");
patch('lib/local-db/dexie.js','  return db;',"  db.version(4).stores({account_receive_staging: '&key, user_id, updated_at'});\n  return db;");
const VERSION='110.4.57',BUILD='v110457-resumable-device-transfer';
for(const path of ['release-version.json','public/app-version.json']){const v=JSON.parse(read(path));Object.assign(v,{version:VERSION,build:BUILD,label:'v110.4.57 Account sync',sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Open your records without false device-change warnings.','Keep load checklists readable and review only genuine changes.','Full cloud backups remain manual.']});fs.writeFileSync(path,JSON.stringify(v,null,2)+'\n');}
for(const path of ['package.json','package-lock.json']){const v=JSON.parse(read(path));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(v,null,2)+'\n');}
for(const[path,name]of[['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(path);for(const[key,value]of[['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(path,s);}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx','lib/owner-op-cloud/cloudMirrorV110450.js','lib/owner-op-cloud/recordSyncV110451.js'])fs.writeFileSync(path,read(path).replaceAll('110.4.54',VERSION).replaceAll('110.4.55',VERSION).replaceAll('110.4.56',VERSION));
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,read(path).replaceAll("'110.4.55'","'"+VERSION+"'").replaceAll("'v110455-account-device-sync'","'"+BUILD+"'").replaceAll("'110.4.54'","'"+VERSION+"'").replaceAll("'v110454-manual-cloud-backup'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — shared account records and verified offline copies installed');

await import('./v110455/account-core.test.mjs');
await import('./v110455/account-files.test.mjs');

patch('source/src/core/integrity/logbookIntegrityV107.js','step.checklist.map(item => ({ ...item }))',"step.checklist.map(item => item && typeof item === 'object' ? { ...item } : item)");
patch('source/src/app/App.jsx',"import {flushSync} from 'react-dom';","import {flushSync} from 'react-dom';\nimport {repairChecklistState} from '../../../lib/owner-op-cloud/accountCoreV110455.js';");
patch('source/src/app/App.jsx','function normalizeState(s) {\n  s = normalizeTeamDriverState(s);','function normalizeState(s) {\n  s = normalizeTeamDriverState(repairChecklistState(s));');
await import('./v110455/account-regression.test.mjs');

// Incomplete receive checkpoints are transport data, never a user backup/index.
for(const path of ['lib/owner-op-cloud/cloudMirrorV110450.js','lib/owner-op-cloud/recordSyncV110451.js'])patch(path,'for(const table of db.tables)tables[table.name]=await table.toArray();',"for(const table of db.tables)if(table.name!=='account_receive_staging')tables[table.name]=await table.toArray();");
patch('source/src/modules/backup/largeBackupV110431.js','const tables=[...db.tables].sort(',"const tables=[...db.tables].filter(table=>table.name!=='account_receive_staging').sort(");
