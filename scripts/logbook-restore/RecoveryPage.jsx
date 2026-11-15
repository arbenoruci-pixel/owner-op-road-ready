'use client';
import React,{useEffect,useRef,useState} from 'react';
import AuthGate from '../auth/AuthGate.jsx';
import {getOwnerOpDb} from '../../../../lib/local-db/dexie.js';
import {APP_STATE_KEY} from '../../../../lib/local-db/appState.js';
import {checkAuthorizedLogbookRecovery} from '../../../../lib/owner-op-cloud/authorizedLogbookRecovery.js';
function Recovery(){
 const [message,setMessage]=useState('Opening your retained phone copy…'),[busy,setBusy]=useState(true),runRef=useRef(null);
 useEffect(()=>{
  let stopped=false,running=false,current=null,timer;
  const apply=event=>{current=event.detail;};
  window.addEventListener('road-ready-account-apply',apply);
  const run=async()=>{
   if(stopped||running)return;running=true;setBusy(true);
   try{
    current=(await getOwnerOpDb().app_snapshots.get(APP_STATE_KEY))?.state;
    if(!current)throw Error('The saved phone logbook is unavailable. No records were changed.');
    window.__rrAccountState=()=>current;
    setMessage('Restoring the authorized original days…');
    const result=await checkAuthorizedLogbookRecovery({restoreHere:true});
    if(stopped)return;
    if(result.error)throw Error(result.error);
    if(result.deferred){setMessage('Close other Road Ready tabs, then retry. Your saved records are retained.');return;}
    setMessage(result.status==='applied'?'Original logbook days are saved. Opening your logbook…':'No pending recovery for this phone. Opening your logbook…');
    timer=setTimeout(()=>window.location.replace('/'),700);
   }catch(error){if(!stopped)setMessage(error.message);}
   finally{running=false;if(!stopped)setBusy(false);}
  };
  runRef.current=run;run();
  return()=>{stopped=true;clearTimeout(timer);window.removeEventListener('road-ready-account-apply',apply);delete window.__rrAccountState;runRef.current=null;};
 },[]);
 return <main style={{minHeight:'100dvh',background:'#061321',color:'#edf5ff',padding:'max(32px, env(safe-area-inset-top)) 24px',fontFamily:'system-ui',boxSizing:'border-box'}}><h1 style={{fontSize:26,color:'inherit'}}>Restore original logbook</h1><p role="status" style={{lineHeight:1.6}}>{message}</p>{!busy?<div style={{display:'flex',gap:20,alignItems:'center'}}><button onClick={()=>runRef.current?.()} style={{padding:'12px 20px',background:'#235b9a',color:'#fff',border:0,borderRadius:12}}>Retry recovery</button><a href="/" style={{color:'#8fcaff'}}>Open logbook</a></div>:null}</main>;
}
export default function AuthorizedLogbookRecoveryPage(){return <AuthGate><Recovery/></AuthGate>;}
