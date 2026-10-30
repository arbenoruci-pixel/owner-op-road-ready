'use client';
import { cloudApi, cloudSession, localState, readCloudFile } from './client.js';
import { syncAccount } from './accountSyncV110455.js';
import { assertActiveDevice, deviceId } from './deviceSessionV110463.js';
import { flushAppSnapshots } from '../local-db/appState.js';
import { captureInspection, assertArchiveCoverage, assertInspectionUnchanged } from './inspectionSnapshot.js';
import { verifyInspectionRecords } from './inspectionSync.js';

let preparing=false;
export async function createCurrentInspectionShare({getState, walletKeys=[], onProgress=()=>{}}={}) {
  if(preparing)throw Error('An inspection link is already being prepared.');
  if(navigator.onLine===false)throw Error('Connect to the internet to create the current inspection link.');
  preparing=true;
  try {
    await assertActiveDevice();
    const session=await cloudSession(),uid=session?.user?.id;
    if(!uid)throw Error('Sign in before creating an inspection link.');
    onProgress('Checking the latest saved logbook…');
    await flushAppSnapshots();
    // Dismiss the email keyboard before receiving records on mobile Safari.
    if(typeof document!=='undefined')document.activeElement?.blur?.();
    const synced=await verifyInspectionRecords(syncAccount,onProgress,{includeDocuments:walletKeys.length>0});
    await flushAppSnapshots();
    const read=async()=>getState?.() || window.__rrAccountState?.() || await localState();
    const captured=captureInspection(await read());
    const catalog=await cloudApi({action:'catalog'});
    const archived=[], expectedArchive={};
    let next=0,completed=0;
    async function readArchive(){while(next<captured.snapshots.length){
      const snapshot=captured.snapshots[next++];
      const entry=catalog.days?.find(row=>row.log_date===snapshot.sourceDay);
      expectedArchive[snapshot.sourceDay]=entry?.current_file_id||null;
      if(entry?.current_file_id){
        const bytes=await readCloudFile({file_id:entry.current_file_id,mime_type:'application/gzip',sha256:entry.content_sha256});
        const payload=JSON.parse(new TextDecoder().decode(bytes));
        if(payload.sourceDay!==snapshot.sourceDay)throw Error('Saved log date verification failed.');
        archived.push(payload);
      }
      onProgress(`Checking saved log dates · ${++completed} / 8`);
    }}
    await Promise.all([readArchive(),readArchive()]);
    assertArchiveCoverage(captured,archived);
    assertInspectionUnchanged(captured,await read());
    await assertActiveDevice();
    if((await cloudSession())?.user?.id!==uid)throw Error('Account changed while preparing inspection.');
    onProgress('Saving the verified inspection snapshot…');
    // One request stores immutable files and atomically binds precisely these
    // eight files. It never promotes them into the editable daily archive.
    const result=await cloudApi({action:'create_snapshot_share',inspection:captured,
      expected_revision:synced.revision,expected_archive:expectedArchive,device_id:deviceId(),wallet_keys:walletKeys});
    try { assertInspectionUnchanged(captured,await read()); }
    catch(error){await cloudApi({action:'revoke_share',payload:{id:result.id}}).catch(()=>{});throw error;}
    if(result.log_count!==8 || result.captured_at!==captured.capturedAt)throw Error('Inspection snapshot verification failed.');
    return {...result,inspection:captured};
  } finally {preparing=false;}
}
