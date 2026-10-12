'use client';
import React,{useEffect,useState} from 'react';
import {syncAccount,accountStatus,ACCOUNT_EVENT} from '../../../../lib/owner-op-cloud/accountSyncV110455.js';
export default function AccountSyncGate({children}){
 const [ready,setReady]=useState(false),[status,setStatus]=useState(accountStatus);
 useEffect(()=>{
  let cancelled=false,timer,retry,archive,running=false,pendingSave=false;
  const update=e=>setStatus(e.detail);
  // A background network failure must never unmount the driver's open logbook.
  // Ownership mismatch remains a separate, hard gate below.
  const finish=result=>{if(!cancelled&&!result?.busy&&!result?.blocked&&!result?.handoffPending)setReady(open=>open||!result?.error||result.canOpenLocal===true);};
  const run=async({initial=false}={})=>{
   if(cancelled||running)return;
   if(!initial&&((document.visibilityState!=='visible'&&!pendingSave)||document.activeElement?.matches('input,textarea,select,[contenteditable=true]')||window.__rrAccountState?.()?.sheet))return;
   const saved=pendingSave;let retryDelay=0;
   pendingSave=false;running=true;
   try{
    clearTimeout(archive);
    const result=await syncAccount({initial,scope:'records'});
    // A different tab may own the receive lock. No capture ran in that case.
    if(result?.busy&&saved){pendingSave=true;retryDelay=250;}
    finish(result);
    if(!result?.error&&!result?.busy&&!result?.blocked&&!result?.conflicts&&!result?.offline&&!result?.paused&&!result?.disabled&&!result?.signedOut){
     // Let App hydrate before receiving originals. New saves preempt this pass.
     archive=setTimeout(()=>{if(!cancelled&&document.visibilityState==='visible'&&!window.__rrAccountState?.()?.sheet)syncAccount().then(finish);},1500);
    }
   }
   finally{
    running=false;
    // A save during a receive/read needs a fresh capture after that run settles.
    if(pendingSave&&!cancelled){clearTimeout(retry);retry=setTimeout(run,retryDelay);}
   }
  };
  window.addEventListener(ACCOUNT_EVENT,update);
  run({initial:true});
  timer=setInterval(run,15000);
  // Start after the durable local save, before iOS can suspend a hidden page.
  const saved=()=>{pendingSave=true;run();};
  window.addEventListener('online',run);window.addEventListener('pageshow',run);window.addEventListener('pagehide',run);window.addEventListener('owner-op-business-updated',saved);window.addEventListener('road-ready-local-saved',saved);document.addEventListener('visibilitychange',run);
  return()=>{cancelled=true;clearInterval(timer);clearTimeout(retry);clearTimeout(archive);window.removeEventListener(ACCOUNT_EVENT,update);window.removeEventListener('online',run);window.removeEventListener('pageshow',run);window.removeEventListener('pagehide',run);window.removeEventListener('owner-op-business-updated',saved);window.removeEventListener('road-ready-local-saved',saved);document.removeEventListener('visibilitychange',run);};
 },[]);
 if(!ready||status.phase==='account_mismatch')return <main style={{padding:28,fontFamily:'system-ui',maxWidth:520,margin:'auto',color:'#172b46'}}><h2>{status.phase==='account_mismatch'?'Account data protected':'Opening your logbook'}</h2><p role="status">{status.message}</p>{status.phase==='error'?<><p>Your saved records are safe.</p><button onClick={()=>syncAccount({initial:true,scope:'records'}).then(result=>{if(!result?.busy&&!result?.blocked&&!result?.handoffPending)setReady(open=>open||!result?.error||result.canOpenLocal===true);})}>Retry sync</button></>:null}</main>;
 const attention=['error','offline','paused'].includes(status.phase);
 return <>{children}{attention?<aside aria-label="Account synchronization" style={{position:'fixed',bottom:64,left:12,right:12,zIndex:999,padding:12,borderRadius:16,background:'#fff5dc',color:'#172b46',boxShadow:'0 3px 14px #0002',fontSize:14}}><span role="status">{status.message}</span>{status.phase==='paused'?<a href="/cloud">Resume in cloud settings</a>:status.phase==='error'?<button onClick={()=>syncAccount()}>Retry sync</button>:null}</aside>:null}</>;
}
