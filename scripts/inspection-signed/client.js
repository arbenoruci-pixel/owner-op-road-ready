'use client';
import {cloudApi,cloudClient,cloudSession,localState} from './client.js';
import {assertActiveDevice,deviceId} from './deviceSessionV110463.js';
import {flushAppSnapshots} from '../local-db/appState.js';
import {captureInspection,assertInspectionUnchanged,assertInspectionComplete} from './inspectionSnapshot.js';
import {bounded} from './mirrorCoreV110450.js';

let preparing=false;
export async function createCurrentInspectionShare({getState,walletKeys=[],onProgress=()=>{}}={}){
  if(preparing)throw Error('An inspection link is already being prepared.');
  if(navigator.onLine===false)throw Error('Connect to the internet to prepare the inspection link.');
  preparing=true;
  try{
    const active=await assertActiveDevice();
    if(active?.receive)throw Error('This device is still receiving your logbook. Try again when it is ready.');
    const session=await cloudSession(),uid=session?.user?.id;
    if(!uid)throw Error('Sign in before preparing an inspection link.');
    await flushAppSnapshots();
    const read=async()=>getState?.()||window.__rrAccountState?.()||await localState();
    const captured=captureInspection(await read());
    assertInspectionComplete(captured);
    onProgress('Preparing signed logs and today’s DOT inspection entry…');
    // Read only the revision required by the server's atomic ownership check.
    // Inspection must never synchronize/resolve/rewrite the driver's logbook.
    const result=await bounded(cloudClient().from('road_ready_account_workspaces').select('revision').eq('user_id',uid).maybeSingle(),15000);
    if(result.error)throw result.error;
    if(!Number.isInteger(result.data?.revision))throw Error('The inspection account is not ready. Your logbook remains saved.');
    const catalog=await cloudApi({action:'catalog'}),expectedArchive={};
    for(const snapshot of captured.snapshots)expectedArchive[snapshot.sourceDay]=catalog.days?.find(row=>row.log_date===snapshot.sourceDay)?.current_file_id||null;
    assertInspectionUnchanged(captured,await read());
    const verified=await assertActiveDevice();
    if(verified?.receive)throw Error('This device is still receiving your logbook.');
    if((await cloudSession())?.user?.id!==uid)throw Error('Account changed while preparing inspection.');
    const share=await cloudApi({action:'create_snapshot_share',inspection:captured,expected_revision:result.data.revision,expected_archive:expectedArchive,device_id:deviceId(),wallet_keys:walletKeys});
    try{assertInspectionUnchanged(captured,await read());}
    catch(error){await cloudApi({action:'revoke_share',payload:{id:share.id}}).catch(()=>{});throw error;}
    if(share.log_count!==8||share.captured_at!==captured.capturedAt)throw Error('Inspection snapshot verification failed.');
    return {...share,inspection:captured};
  }finally{preparing=false;}
}
