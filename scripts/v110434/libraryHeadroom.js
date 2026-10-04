// Only historical app-owned recovery copies can move out of localStorage.
// Their exact bytes are committed and read back before the old copy is removed.
import {withRecoveryStorageLock} from '../../../../lib/local-db/recoveryStorage.js';
import {sha256} from '../backup/chunkedZipV110431.js';
export const RECOVERY_KEYS=[
 'owner-op-road-ready-pre-update-snapshot-v1',
 'owner-op-road-ready-pre-cloud-raw-v1',
 'owner-op-road-ready-emergency-export-copy-v1',
];
export function archiveRecoveryCopies(db,storage){
 return withRecoveryStorageLock(()=>archiveRecoveryCopiesLocked(db,storage),{requireLock:true});
}
async function archiveRecoveryCopiesLocked(db,storage){
 let released=0;
 for(const key of RECOVERY_KEYS){
  const raw=storage.getItem(key);if(!raw)continue;
  let state;try{state=JSON.parse(raw);}catch{continue;}
  if(!state||typeof state!=='object'||Array.isArray(state))continue;
  const archiveKey='library-storage-recovery:'+key+':'+await sha256(new TextEncoder().encode(raw));
  const stamp=new Date().toISOString();
  await db.transaction('rw',db.sync_meta,db.app_snapshots,async()=>{
   await db.sync_meta.put({key:archiveKey,value:{storageKey:key,raw},updated_at:stamp});
   // Preserve the existing restore choice. Distinct localStorage versions remain
   // available in the complete-device backup as separate recovery records.
   if(!(await db.app_snapshots.get(key)))await db.app_snapshots.put({key,state,updated_at:stamp});
  });
  const saved=await db.sync_meta.get(archiveKey);
  if(saved?.value?.raw!==raw)throw Error('Recovery copy could not be verified. Your saved data was kept.');
  if(storage.getItem(key)===raw){storage.removeItem(key);released+=raw.length;}
 }
 return released;
}
