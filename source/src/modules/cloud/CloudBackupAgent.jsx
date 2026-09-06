'use client';
import { useEffect } from 'react';
import { cloudSession, autoBackupEnabled, backupLocalData } from '../../../../lib/owner-op-cloud/client.js';
import { runAuthorizedFullMigration } from '../../../../lib/owner-op-cloud/migration.js';

export default function CloudBackupAgent(){
 useEffect(()=>{let stopped=false,running=false;
  const run=async()=>{
   if(stopped||running||document.visibilityState!=='visible'||navigator.onLine===false)return;
   running=true;
   try{
    const session=await cloudSession();
    if(!session)return;
    const migration=await runAuthorizedFullMigration().catch(()=>null);
    if(migration?.status==='pending'||migration?.status==='running')return;
    if(autoBackupEnabled(session.user.id))await backupLocalData({maxUploads:20});
   }catch{/* dedicated migration/backup journals retain the error state */}
   finally{running=false;}
  };
  const first=setTimeout(run,4000),timer=setInterval(run,120000);
  window.addEventListener('online',run);document.addEventListener('visibilitychange',run);
  return()=>{stopped=true;clearTimeout(first);clearInterval(timer);window.removeEventListener('online',run);document.removeEventListener('visibilitychange',run);};
 },[]);return null;
}
