'use client';
import React,{useEffect,useState} from 'react';
import {EDIT_LOCK} from '../../../../lib/owner-op-cloud/recordSyncV110451.js';
import {flushAppSnapshots} from '../../../../lib/local-db/appState.js';
export default function RecordEditGuard({children}){
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  let release,cancelled=false;const controller=new AbortController();
  if(!navigator.locks?.request){setReady(true);return;}
  navigator.locks.request(EDIT_LOCK,{mode:'shared',signal:controller.signal},()=>new Promise(resolve=>{release=resolve;if(cancelled)resolve();else setReady(true);})).catch(error=>{if(error.name!=='AbortError')setReady(true);});
  return()=>{cancelled=true;controller.abort();flushAppSnapshots().finally(()=>release?.());};
 },[]);
 return ready?children:<p role="status">Opening saved records…</p>;
}
