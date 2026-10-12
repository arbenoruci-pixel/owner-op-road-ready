import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=path=>fs.readFileSync(path,'utf8');
function patch(path,before,after){const text=read(path);if(!text.includes(before)){assert.ok(text.includes(after),'Active-device anchor: '+path);return;}assert.equal(text.split(before).length,2,'Active-device anchor: '+path);fs.writeFileSync(path,text.replace(before,()=>after));}
const sync='lib/owner-op-cloud/accountSyncV110455.js';
patch(sync,'   await assertActiveDevice();\n   const session=',`   const writer=await assertActiveDevice();
   if(!writer?.active)throw Object.assign(Error('Open this account on the active device.'),{deviceRevoked:true});
   const session=`);
patch(sync,"const check=async()=>{await assertActiveDevice();",`const check=async()=>{const verified=await assertActiveDevice();if(!verified?.active||verified.generation!==writer.generation||verified.sid!==writer.sid)throw Object.assign(Error('The active device changed. Your local work is retained.'),{deviceRevoked:true});`);
patch(sync,"   if(merge.conflicts.length){conflictReview={local:local.encoded,remote:remote?.payload?.records,scope};await db.sync_meta.put({key:'account-sync-v110455:conflicts',value:{uid,revision:remote?.revision,conflicts:merge.conflicts},updated_at:new Date().toISOString()});show({phase:'conflict',message:'Changes on two devices need review. Both versions are kept.',conflicts:merge.conflicts});return {conflicts:merge.conflicts};}",`   if(merge.conflicts.length){
    // The verified active device owns new edits. Incoming devices already take
    // the account copy above. Keep both versions durably before resolving old
    // multi-device conflicts, including atomic signed driver days and deletes.
    await check();
    const recovery={uid,generation:writer.generation,revision:remote?.revision,scope,conflicts:merge.conflicts};
    const digest=await hashBytes(new TextEncoder().encode(canonical(recovery)));
    await db.sync_meta.put({key:'single-device-conflicts:'+digest,value:recovery,updated_at:new Date().toISOString()});
    const records={...merge.records};
    for(const conflict of merge.conflicts)resolveConflict(records,conflict,'local');
    merge={records,conflicts:[]};
   }`);
// The active-device policy replaces the old manual conflict-selection flow.
patch(sync,"let active=null,activeScope=null,interruptArchive=false,status={phase:'idle',message:'Checking account data…'},conflictReview=null;","let active=null,activeScope=null,interruptArchive=false,status={phase:'idle',message:'Checking account data…'};");
patch(sync,"export function syncAccount({initial=false,choices=null,scope='all'}={}){\n if(choices&&conflictReview?.scope)scope=conflictReview.scope;","export function syncAccount({initial=false,scope='all'}={}){");
patch(sync,'syncAccount({initial,choices,scope})','syncAccount({initial,scope})');
patch(sync,`   if(choices&&conflictReview&&same(conflictReview.local,local.encoded)&&same(conflictReview.remote,remote?.payload?.records)){
    merge.records={...merge.records};merge.conflicts=merge.conflicts.filter(c=>{if(!['local','remote'].includes(choices[c.key]))return true;resolveConflict(merge.records,c,choices[c.key]);return false;});
   }`,'   // Conflict ownership is determined by the active-device lease.');
patch(sync,"await db.sync_meta.delete('account-sync-v110455:conflicts');conflictReview=null;","await db.sync_meta.delete('account-sync-v110455:conflicts');");
const core='lib/owner-op-cloud/accountCoreV110455.js';
patch(core," const active=state.teamDrivers?.some(d=>d.id===localState.activeDriverId)?localState.activeDriverId:state.teamDrivers?.[0]?.id||Object.keys(books)[0]||'driver_primary';",` const members=Array.isArray(state.activeTeamDriverIds)?state.teamDrivers?.filter(d=>state.activeTeamDriverIds.includes(d.id)):state.teamDrivers;
 const active=members?.some(d=>d.id===localState.activeDriverId)?localState.activeDriverId:members?.[0]?.id||state.teamDrivers?.[0]?.id||Object.keys(books)[0]||'driver_primary';`);
patch(core,"state.coDrivers=state.teamDrivers.filter(d=>d.id!==active).map(d=>d.name).join(', ');","state.coDrivers=(members||[]).filter(d=>d.id!==active).map(d=>d.name).join(', ');");
fs.copyFileSync('scripts/v110470/AccountSyncGate.jsx','source/src/modules/cloud/AccountSyncGateV110455.jsx');
fs.copyFileSync('scripts/v110470/ipad-logbook.css','source/src/ipad-logbook-v110470.css');
const app='source/src/app/App.jsx';
if(!read(app).includes('ipad-logbook-v110470.css'))fs.appendFileSync(app,"\nimport '../ipad-logbook-v110470.css';\n");
console.log('PASS active-device conflict recovery and spacious iPad logbook installed');
