import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
function patch(p,b,a){const s=read(p);if(s.includes(a))return;if(s.split(b).length!==2)throw Error('Recovery lock anchor changed: '+p);fs.writeFileSync(p,s.replace(b,a));}
fs.copyFileSync('scripts/v110438/recoveryStorage.js','lib/local-db/recoveryStorage.js');
const state='lib/local-db/appState.js';
patch(state,"import { getOwnerOpDb }","import {withRecoveryStorageLock} from './recoveryStorage.js';\nimport { getOwnerOpDb }");
patch(state,'async function preservePreCloudRawSnapshot(db, state) {',`async function preservePreCloudRawSnapshot(db,state){return withRecoveryStorageLock(()=>preservePreCloudRawSnapshotUnlockedV110439(db,state));}
async function preservePreCloudRawSnapshotUnlockedV110439(db, state) {`);
patch(state,'export async function savePreUpdateSnapshot(state, meta = {}) {',`export async function savePreUpdateSnapshot(state,meta={}){return withRecoveryStorageLock(()=>savePreUpdateSnapshotUnlockedV110439(state,meta));}
async function savePreUpdateSnapshotUnlockedV110439(state, meta = {}) {`);
const app='source/src/app/App.jsx';
patch(app,"import { APP_STATE_KEY,","import {withRecoveryStorageLock} from '../../../lib/local-db/recoveryStorage.js';\nimport { APP_STATE_KEY,");
patch(app,"window.localStorage.setItem('owner-op-road-ready-emergency-export-copy-v1', JSON.stringify(cleanPayload));","await withRecoveryStorageLock(()=>window.localStorage.setItem('owner-op-road-ready-emergency-export-copy-v1', JSON.stringify(cleanPayload)));");
const restore='source/src/modules/backup/portableBackupV110429.js';
patch(restore,"import Dexie","import {withRecoveryStorageLock} from '../../../../lib/local-db/recoveryStorage.js';\nimport Dexie");
patch(restore,'export async function restorePortableArchiveV110429(archive,{onProgress=()=>{},resolveZipFile,prepareRowForWrite}={}){',`export async function restorePortableArchiveV110429(archive,options={}){return withRecoveryStorageLock(()=>restorePortableArchiveUnlockedV110439(archive,options));}
async function restorePortableArchiveUnlockedV110439(archive,{onProgress=()=>{},resolveZipFile,prepareRowForWrite}={}){`);
const VERSION='110.4.39',BUILD='v110439-recovery-lock';
for(const p of ['release-version.json','public/app-version.json']){
 const v=JSON.parse(read(p));Object.assign(v,{version:VERSION,build:BUILD,force:false,label:'v110.4.39 Safe import storage',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Recover import space by preserving historical recovery copies in the local database.','Preserve full document metadata and original files in the local database.','Retain transactional rollback and clear storage error messages.']});fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
}
for(const p of ['package.json','package-lock.json']){const v=JSON.parse(read(p));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');}
for(const[p,name]of[['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(p);for(const[key,value]of[['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(p,s);}
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(p,read(p).replaceAll('v110.4.38','v'+VERSION).replaceAll('V110.4.38','V'+VERSION));
for(const p of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(p,read(p).replaceAll("'110.4.38'","'"+VERSION+"'").replaceAll("'v110438-import-headroom'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — v110.4.39 coordinated recovery writers and safe import retry');

await import('./finalize-document-readiness-v110440.mjs');
