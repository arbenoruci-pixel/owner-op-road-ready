'use client';
import { useEffect } from 'react';
import { cloudSession, autoBackupEnabled, backupLocalData } from '../../../../lib/owner-op-cloud/client.js';
export default function CloudBackupAgent(){
 useEffect(()=>{let stopped=false;
  const run=async()=>{if(stopped||document.visibilityState!=='visible'||navigator.onLine===false)return;try{const s=await cloudSession();if(s&&autoBackupEnabled(s.user.id))await backupLocalData({maxUploads:20});}catch{/* backupLocalData retains errors in its dedicated status journal */}};
  const first=setTimeout(run,15000),timer=setInterval(run,120000);
  window.addEventListener('online',run);document.addEventListener('visibilitychange',run);
  return()=>{stopped=true;clearTimeout(first);clearInterval(timer);window.removeEventListener('online',run);document.removeEventListener('visibilitychange',run);};
 },[]);return null;
}
