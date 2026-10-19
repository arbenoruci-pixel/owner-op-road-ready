import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = path => fs.readFileSync(path, 'utf8');
function patch(path, before, after) {
  const source = read(path); if (source.includes(after)) return;
  assert.equal(source.split(before).length, 2, 'Reliability sync anchor: ' + path + ' / ' + before.slice(0, 70));
  fs.writeFileSync(path, source.replace(before, () => after));
}
const lib = 'lib/owner-op-cloud/', ui = 'source/src/modules/cloud/';
fs.copyFileSync('scripts/reliability-sync/scheduler.js', lib + 'syncSchedulerReliability.js');
fs.copyFileSync('scripts/reliability-sync/snapshot.js', lib + 'syncSnapshotReliability.js');
fs.copyFileSync('scripts/reliability-sync/AccountSyncGate.jsx', ui + 'AccountSyncGateV110455.jsx');
fs.copyFileSync('scripts/reliability-sync/sync.css', ui + 'syncReliability.css');
const snapshots = 'lib/local-db/appState.js';
patch(snapshots, "import { getOwnerOpDb } from './dexie.js';", "import { getOwnerOpDb } from './dexie.js';\nimport {snapshotChange} from '../owner-op-cloud/syncSnapshotReliability.js';");
patch(snapshots, '  return queueSnapshotWrite(key, async () => {', `  return queueSnapshotWrite(key, async () => {
    const prior = await db.app_snapshots.get(key);
    const change = key === APP_STATE_KEY ? snapshotChange(prior?.state, stateAtCall) : {write:true,records:false,archive:true};
    if(!change.write)return prior?.updated_at || now;`);
patch(snapshots, "    if(key===APP_STATE_KEY)window.dispatchEvent(new Event('road-ready-local-saved'));", `    if(key===APP_STATE_KEY && change.archive)window.dispatchEvent(new CustomEvent('road-ready-local-saved',{detail:{scope:change.records?'records':'all',savedAt:now}}));`);
const sync = lib + 'accountSyncV110455.js';
patch(sync, "export const ACCOUNT_EVENT='road-ready-account-sync',APPLY_EVENT='road-ready-account-apply';", "import {archiveChanged,statusTransition} from './syncSnapshotReliability.js';\nexport const ACCOUNT_EVENT='road-ready-account-sync',APPLY_EVENT='road-ready-account-apply';");
patch(sync, "let active=null,activeScope=null,interruptArchive=false,status={phase:'idle',message:'Checking account data…'};", "let active=null,activeScope=null,interruptArchive=false,status={phase:'idle',message:'Checking account data…'},conflictReview=null;");
patch(sync, "function show(v){status={...status,...v};window.dispatchEvent(new CustomEvent(ACCOUNT_EVENT,{detail:status}));}", `function show(v){const transition=statusTransition(status,{...v,scope:activeScope||status.scope});status=transition.next;if(transition.changed)window.dispatchEvent(new CustomEvent(ACCOUNT_EVENT,{detail:status}));}
export function requestRecordPriority(){priorityChannel?.postMessage('records');if(activeScope==='all')interruptArchive=true;}`);
patch(sync, "export function syncAccount({initial=false,scope='all'}={}){", "export function syncAccount({initial=false,choices=null,scope='all'}={}){\n if(choices&&conflictReview?.scope)scope=conflictReview.scope;");
patch(sync, 'return active.then(()=>syncAccount({initial,scope}));', 'return active.then(()=>syncAccount({initial,choices,scope}));');
const marker = '// RELIABILITY_REVIEW_CONFLICTS';
if (!read(sync).includes(marker)) {
  let source = read(sync);
  const start = source.indexOf('   // Conflict ownership is determined by the active-device lease.');
  const end = source.indexOf('   if(local.epoch!==mutationEpoch', start);
  assert.ok(start >= 0 && end > start, 'Active-device conflict review boundary');
  source = source.slice(0, start) + `   ${marker}
   // The active-device lease still guards every read/write. Differing recorded
   // versions need an explicit selection; a lease is not approval to edit logs.
   if(choices&&conflictReview&&same(conflictReview.local,local.encoded)&&same(conflictReview.remote,remote?.payload?.records)){
    merge.records={...merge.records};merge.conflicts=merge.conflicts.filter(c=>{if(!['local','remote'].includes(choices[c.key]))return true;resolveConflict(merge.records,c,choices[c.key]);return false;});
   }
   if(merge.conflicts.length){
    await check();conflictReview={local:local.encoded,remote:remote?.payload?.records,scope};
    const recovery={uid,generation:writer.generation,revision:remote?.revision,scope,conflicts:merge.conflicts};
    const digest=await hashBytes(new TextEncoder().encode(canonical(recovery)));
    await db.sync_meta.put({key:'single-device-conflicts:'+digest,value:recovery,updated_at:new Date().toISOString()});
    await db.sync_meta.put({key:'account-sync-v110455:conflicts',value:recovery,updated_at:new Date().toISOString()});
    show({phase:'conflict',message:choices?'Records changed while you reviewed. Compare the latest versions.':'Saved versions differ. Review the exact changes before choosing.',conflicts:merge.conflicts});
    return {conflicts:merge.conflicts,canOpenLocal,blocked:receiving};
   }
` + source.slice(end);
  fs.writeFileSync(sync, source);
}
patch(sync, "await db.sync_meta.delete('account-sync-v110455:conflicts');\n   show({phase:", "await db.sync_meta.delete('account-sync-v110455:conflicts');conflictReview=null;\n   show({phase:");
patch(sync, "return {revision,changed,scope,handoffPending:", "return {revision,changed,scope,recordsReady:scope==='records'&&!receivingArchive,archivePending:scope==='records'&&archiveChanged(payload.records,saved?.records||{}),handoffPending:");
patch(sync, "  }catch(e){if(e.deferred)return {deferred:true,canOpenLocal};const message=e?.message||String(e);", `  }catch(e){if(e.deferred)return {deferred:true,canOpenLocal};const message=e?.message||String(e);
   if(!e.deviceRevoked&&/Records changed during sync|Documents changed during sync|A saved document changed during sync|Another device saved changes|Another tab changed records|Finish your open edit/.test(message)){
    show({phase:'waiting',message:'Changes saved locally. Synchronization is waiting for the current edit.'});return {transient:true,reason:message,canOpenLocal,blocked:receiving};
   }`);
patch(sync, "Dexie.on('storagemutated',parts=>{const keys=Object.keys(parts);for(const name of Object.keys(TABLE_KEYS))if(parts.all||keys.some(k=>k.startsWith('idb://'+db.name+'/'+name+'/')))mark(name);});", `Dexie.on('storagemutated',parts=>{const keys=Object.keys(parts);let changed=false;for(const name of Object.keys(TABLE_KEYS))if(parts.all||keys.some(k=>k.startsWith('idb://'+db.name+'/'+name+'/'))){mark(name);changed=true;}if(changed)window.dispatchEvent(new CustomEvent('road-ready-local-saved',{detail:{scope:'all'}}));});`);
// Receiving business/profile settings is not a local user change. Existing
// subscribers still refresh, while the queue ignores the tagged notification.
for (const name of ['owner-op-operator-profile-updated', 'road-ready-owner-ops-updated-v102'])
  patch(sync, `window.dispatchEvent(new CustomEvent('${name}'));`, `window.dispatchEvent(new CustomEvent('${name}',{detail:{source:'account-receive'}}));`);
patch(sync, 'window.dispatchEvent(new CustomEvent(BUSINESS_STORE_EVENT));', "window.dispatchEvent(new CustomEvent(BUSINESS_STORE_EVENT,{detail:{source:'account-receive'}}));");
patch(sync, "return {offline:true};", "return {offline:true,blocked:receiving};");
patch(sync, 'canOpenLocal=meaningful&&!joining;', 'canOpenLocal=meaningful&&!receiving;');
patch(sync, 'blocked:joining||e.deviceRevoked===true', 'blocked:receiving||e.deviceRevoked===true');
for(const kind of ['paused','disabled'])patch(sync, `return {${kind}:true,blocked:joining};`, `return {${kind}:true,blocked:receiving};`);
console.log('PASS reliability sync queue, semantic durable-save notifications, retained conflict review and quiet progress installed');
