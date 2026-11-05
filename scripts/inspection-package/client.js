'use client';
import {cloudApi,cloudClient,cloudSession,localState} from './client.js';
import {assertActiveDevice,deviceId} from './deviceSessionV110463.js';
import {flushAppSnapshots} from '../local-db/appState.js';
import {captureInspection,assertInspectionUnchanged,assertInspectionComplete} from './inspectionSnapshot.js';
import {captureInspectionWallet,assertWalletUnchanged,walletFileHash,assertWalletManifest} from './inspectionWallet.js';
import {canonical} from './core.js';
import {bounded} from './mirrorCoreV110450.js';

let preparing=false;
export async function createCurrentInspectionShare({getState,walletKeys,onProgress=()=>{}}={}){
  if(preparing)throw Error('An inspection link is already being prepared.');
  if(navigator.onLine===false)throw Error('Connect to the internet to prepare the inspection link.');
  preparing=true;let share;
  try{
    const active=await assertActiveDevice();
    if(!active?.active||active.receive)throw Error('Wait for this device to finish receiving your logbook.');
    const session=await cloudSession(),uid=session?.user?.id;
    if(!uid)throw Error('Sign in before preparing an inspection link.');
    await flushAppSnapshots();
    const read=async()=>getState?.()||window.__rrAccountState?.()||await localState();
    const state=await read(),captured=captureInspection(state),wallet=captureInspectionWallet(state);
    assertInspectionComplete(captured);
    const check=async()=>{
      const current=await read();assertInspectionUnchanged(captured,current);assertWalletUnchanged(wallet,current);
      const writer=await assertActiveDevice();
      if(!writer?.active||writer.receive||writer.generation!==active.generation||writer.sid!==active.sid)throw Error('The active device changed. Prepare the inspection on your active phone.');
      if((await cloudSession())?.user?.id!==uid)throw Error('Account changed while preparing inspection.');
    };
    const selected=walletKeys===undefined?wallet:wallet.filter(row=>walletKeys.includes(row.key));
    if(walletKeys?.some(key=>!selected.some(row=>row.key===key)))throw Error('A selected document is unavailable on this phone. Open Digital Wallet.');
    if(selected.length>50)throw Error('This inspection can include up to 50 wallet documents.');
    let catalog=await cloudApi({action:'catalog'});
    const expected=[];
    for(const row of selected){
      await check();const sha256=await walletFileHash(row);
      const saved=catalog.wallet?.find(doc=>doc.document_key===row.key);
      if(saved?.sha256!==sha256||canonical(saved?.metadata)!==canonical(row.metadata)){
        onProgress('Preparing Digital Wallet: '+row.metadata.title+'…');
        await cloudApi({action:'upload_document',document_key:row.key,data_url:row.dataUrl,metadata:row.metadata,expected_revision:saved?.revision||0});
      }
      expected.push({key:row.key,sha256,metadata:row.metadata});
    }
    onProgress('Preparing eight log days and '+selected.length+' wallet documents…');
    // Read the revision immediately before the atomic publication, after file
    // uploads. This path never merges account records or edits any log day.
    for(let attempt=0;attempt<2;attempt++){
      await check();
      if(attempt)catalog=await cloudApi({action:'catalog'});
      const result=await bounded(cloudClient().from('road_ready_account_workspaces').select('revision').eq('user_id',uid).maybeSingle(),15000);
      if(result.error)throw result.error;
      if(!Number.isInteger(result.data?.revision))throw Error('The inspection account is not ready. Your logs remain on this phone.');
      const expectedArchive=Object.fromEntries(captured.snapshots.map(s=>[s.sourceDay,catalog.days?.find(row=>row.log_date===s.sourceDay)?.current_file_id||null]));
      try{share=await cloudApi({action:'create_snapshot_share',inspection:captured,expected_revision:result.data.revision,expected_archive:expectedArchive,device_id:deviceId(),wallet_keys:selected.map(row=>row.key)});break;}
      catch(error){if(attempt||error.status!==409)throw error;}
    }
    await check();
    if(share.log_count!==8||share.captured_at!==captured.capturedAt||share.document_count!==selected.length)throw Error('Inspection package verification failed. Prepare it again.');
    // The server binds immutable file IDs. Verify the actual published wallet
    // hashes and metadata before showing a link, including concurrent changes.
    const manifest=await cloudApi({action:'inspect',token:share.token});
    assertWalletManifest(manifest,expected);
    await check();
    return {...share,inspection:captured,wallet};
  }catch(error){
    if(share?.id)await cloudApi({action:'revoke_share',payload:{id:share.id}}).catch(()=>{});
    throw error;
  }finally{preparing=false;}
}
