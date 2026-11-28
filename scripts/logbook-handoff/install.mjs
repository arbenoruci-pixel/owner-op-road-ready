import assert from 'node:assert/strict';
import fs from 'node:fs';
const lib = 'lib/owner-op-cloud/';
fs.copyFileSync('scripts/logbook-handoff/days.js', lib+'logbookHandoffDays.js');
function replace(path, before, after) {
  const s = fs.readFileSync(path,'utf8');
  assert.equal(s.split(before).length,2,'Unexpected implementation in '+path+': '+before.slice(0,60));
  fs.writeFileSync(path,s.replace(before,()=>after));
}
const snap = 'lib/local-db/appState.js';
replace(snap,"import {snapshotChange}", "import {queueDayChanges} from '../owner-op-cloud/logbookHandoffDays.js';\nimport {snapshotChange}");
replace(snap,"    await db.app_snapshots.put({ key, state:stateAtCall, updated_at: now });\n    await db.sync_meta.put({ key: 'last_local_write_at', value: now, updated_at: now });",
`    await db.transaction('rw', db.app_snapshots, db.sync_meta, async () => {
      if (key === APP_STATE_KEY && change.records) {
        const previous = await db.app_snapshots.get(key);
        await queueDayChanges(db,localStorage.getItem('owner-op-account-data-owner-v1'),previous?.state,stateAtCall,now);
      }
      await db.app_snapshots.put({key,state:stateAtCall,updated_at:now});
      await db.sync_meta.put({key:'last_local_write_at',value:now,updated_at:now});
    });`);
const sync = lib+'accountSyncV110455.js';
replace(sync,"import Dexie from 'dexie';","import Dexie from 'dexie';\nimport {pendingDaysKey,reviewDriverDays,acknowledgeDays,omitNewEmptyDays} from './logbookHandoffDays.js';");
const guard='   if(!receiving)assertPhoneLogbookRetained(local.encoded,merge.records,{receivingArchive,base});';
replace(sync,guard,`   const pendingDays=(await db.sync_meta.get(pendingDaysKey(uid)))?.value || {};
   const rawPhoneRecords=recordsFrom(local);
   merge=reviewDriverDays(merge,local.encoded,remoteRecords,pendingDays,receiving);
   let reviewedDays=null;
`+guard);
replace(sync,'    merge.records={...merge.records};merge.conflicts=merge.conflicts.filter', '    reviewedDays=Object.fromEntries(merge.conflicts.map(c=>[c.key,choices[c.key]]));\n    merge.records={...merge.records};merge.conflicts=merge.conflicts.filter');
replace(sync,"    const receipt=await checked(revision?cloudClient().rpc('road_ready_account_patch_v1'","    if(receiving)await acknowledgeHandoff(handoff.generation);\n    const receipt=await checked(revision?cloudClient().rpc('road_ready_account_patch_v1'");
replace(sync,"   if(changed)await accountStep('Receiving saved records'", "   local.confirmDays=()=>acknowledgeDays(db,uid,pendingDays,rawPhoneRecords,local.encoded,payload.records,reviewedDays);\n   if(changed)await accountStep('Receiving saved records'");
replace(sync,"   await db.sync_meta.put({key:BASE_KEY,value:{...base,uid,records:base.records||records},updated_at:now});",
"   await local.confirmDays();\n   await db.sync_meta.put({key:BASE_KEY,value:{...base,uid,records:base.records||records},updated_at:now});");
replace(sync,'   tabBase=nextBase;', '   tabBase=nextBase;\n   if(!changed)await local.confirmDays();');
replace(sync,'return {conflicts:merge.conflicts,canOpenLocal,blocked:receiving};',
'return {conflicts:merge.conflicts,canOpenLocal:canOpenLocal || (receiving && bound===uid && meaningful),blocked:receiving};');

replace(sync,'records:mergeScope(remote?.payload?.records||{},merge.records,scope)};let revision=',
'records:mergeScope(remote?.payload?.records||{},omitNewEmptyDays(merge.records,remoteRecords,pendingDays),scope)};let revision=');

replace(sync,'if(choices&&conflictReview&&((', 'if(choices&&conflictReview?.generation===writer.generation&&((');
replace(sync,'conflictReview={local:local.encoded,remote:remote?.payload?.records,scope};',
'conflictReview={local:local.encoded,remote:remote?.payload?.records,scope,generation:writer.generation};');
const gate='source/src/modules/cloud/AccountSyncGateV110455.jsx';
replace(gate,'if(result.canOpenLocal===true)setReady(true); return;',
'if(result.canOpenLocal===true)setReady(true); if(result.blocked)setReview(true); return;');
