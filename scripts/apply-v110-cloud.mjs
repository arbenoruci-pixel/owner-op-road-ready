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

// Lock the old sync path at its own module boundary. The new prototype cloud
// uses lib/owner-op-cloud/client.js and is unaffected by this guard.
const syncPath='lib/sync/clientSync.js';
let sync=fs.readFileSync(syncPath,'utf8');
if(!sync.includes('const ENABLE_LEGACY_SYNC =')){
 const anchor='const ONLINE_RETRY_INTERVAL_MS = 60_000;';
 if(!sync.includes(anchor))throw new Error('Legacy sync flag anchor missing');
 sync=sync.replace(anchor,`${anchor}\nconst ENABLE_LEGACY_SYNC = process.env.NEXT_PUBLIC_OWNER_OP_LEGACY_SYNC_ENABLED === 'true';`);
}
const guards=[
 ["export async function enqueueMutation(mutation) {","export async function enqueueMutation(mutation) {\n  if (!ENABLE_LEGACY_SYNC) return null;"],
 ["export async function queueDutyEventDiffs(previousEventsByDay = {}, nextEventsByDay = {}) {","export async function queueDutyEventDiffs(previousEventsByDay = {}, nextEventsByDay = {}) {\n  if (!ENABLE_LEGACY_SYNC) return;"],
 ["export async function queueInspectionDiffs(previousInspectionByDay = {}, nextInspectionByDay = {}) {","export async function queueInspectionDiffs(previousInspectionByDay = {}, nextInspectionByDay = {}) {\n  if (!ENABLE_LEGACY_SYNC) return;"],
 ["export async function runSyncNow() {","export async function runSyncNow() {\n  if (!ENABLE_LEGACY_SYNC) return { skipped:true, reason:'legacy_sync_disabled_for_migration' };"],
 ["export async function runPullSyncNow() {","export async function runPullSyncNow() {\n  if (!ENABLE_LEGACY_SYNC) return { skipped:true, reason:'legacy_sync_disabled_for_migration' };"],
 ["export function startSyncEngine() {","export function startSyncEngine() {\n  if (!ENABLE_LEGACY_SYNC) return;"]
];
for(const [before,after] of guards){
 if(!sync.includes(after)){
  if(!sync.includes(before))throw new Error(`Legacy sync guard anchor missing: ${before}`);
  sync=sync.replace(before,after);
 }
}
if(!sync.includes("reason:'legacy_sync_disabled_for_migration'")||!sync.includes('if (!ENABLE_LEGACY_SYNC) return;'))throw new Error('Legacy sync safety guards failed');
fs.writeFileSync(syncPath,sync);

const stateSource=fs.readFileSync('lib/local-db/appState.js','utf8');
if(!stateSource.includes('PRE_CLOUD_RAW_STATE_KEY')||!stateSource.includes('preservePreCloudRawSnapshot'))throw new Error('One-time raw local snapshot protection missing');

fs.writeFileSync('release-version.json',JSON.stringify({version:VERSION,build:BUILD,label:'Pre-cloud data safety lock'},null,2)+'\n');
const previous=JSON.parse(fs.readFileSync('public/app-version.json','utf8'));
fs.writeFileSync('public/app-version.json',JSON.stringify({...previous,version:VERSION,build:BUILD,label:'Pre-cloud data safety lock',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),force:false,notes:['Legacy cloud pull/push is disabled during prototype migration.','A one-time raw local snapshot is preserved before app normalization.','Owner Operator login and prototype cloud remain isolated from Tepiha.']},null,2)+'\n');
const update='source/src/core/update/appUpdate.js';let code=fs.readFileSync(update,'utf8');
code=code.replace(/const FALLBACK_APP_VERSION\s*=\s*['\"][^'\"]+['\"];?/,`const FALLBACK_APP_VERSION = '${VERSION}';`).replace(/const FALLBACK_APP_BUILD\s*=\s*['\"][^'\"]+['\"];?/,`const FALLBACK_APP_BUILD = '${BUILD}';`).replace(/export const CURRENT_APP_VERSION\s*=\s*[^;]+;/,'export const CURRENT_APP_VERSION = FALLBACK_APP_VERSION;').replace(/export const CURRENT_APP_BUILD\s*=\s*[^;]+;/,'export const CURRENT_APP_BUILD = FALLBACK_APP_BUILD;');
fs.writeFileSync(update,code);
let sw=fs.readFileSync('public/sw.js','utf8');sw=sw.replace(/const OWNER_OP_SW_VERSION\s*=\s*['\"][^'\"]+['\"];?/,`const OWNER_OP_SW_VERSION = '${VERSION}';`).replace(/const OWNER_OP_SW_BUILD\s*=\s*['\"][^'\"]+['\"];?/,`const OWNER_OP_SW_BUILD = '${BUILD}';`);fs.writeFileSync('public/sw.js',sw);
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])if(fs.existsSync(p)){let s=fs.readFileSync(p,'utf8');s=s.replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION);fs.writeFileSync(p,s);}
console.log('PASS — data safety lock active: legacy sync disabled by default; one-time raw local snapshot preserved');
