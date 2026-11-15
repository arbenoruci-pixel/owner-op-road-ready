'use client';
import {useEffect} from 'react';
import {checkAuthorizedLogbookRecovery} from '../../../../lib/owner-op-cloud/authorizedLogbookRecovery.js';
export default function AuthorizedLogbookRecoveryAgent(){
 useEffect(()=>{
  let stopped=false,running=false,last=0;
  const check=async()=>{
   if(stopped||running||Date.now()-last<60000||document.visibilityState!=='visible')return;
   running=true;last=Date.now();
   try{const r=await checkAuthorizedLogbookRecovery();if(r.deferred)last=0;}catch{}finally{running=false;}
  };
  const timer=setInterval(check,15000);check();
  window.addEventListener('online',check);document.addEventListener('visibilitychange',check);
  return()=>{stopped=true;clearInterval(timer);window.removeEventListener('online',check);document.removeEventListener('visibilitychange',check);};
 },[]);
 return null;
}
