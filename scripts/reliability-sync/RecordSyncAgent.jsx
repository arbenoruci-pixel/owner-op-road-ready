'use client';
import React,{useEffect,useState} from 'react';
import {syncRecords,recordSyncStatus,listCorrections,SYNC_EVENT} from '../../../../lib/owner-op-cloud/recordSyncV110451.js';
import {accountStatus} from '../../../../lib/owner-op-cloud/accountSyncV110455.js';
import {createRecordIndexer} from '../../../../lib/owner-op-cloud/recordIndexerReliability.js';
export default function RecordSyncAgent(){
 const [status,setStatus]=useState(recordSyncStatus);
 useEffect(()=>{
  const queue=createRecordIndexer({sync:()=>syncRecords({changed:true}),
   corrections:async()=>{const pending=(await listCorrections()).filter(r=>r.status==='pending').length;setStatus(s=>({...s,pending}));},
   available:()=>navigator.onLine!==false&&document.visibilityState==='visible'&&accountStatus().phase!=='syncing',
   onError:()=>{},
  });
  const change=e=>{setStatus(e.detail);if(e.detail.phase==='idle')queue.wake({retry:true});};
  const saved=e=>{if(e.detail?.source!=='account-receive')queue.saved();};
  const wake=()=>queue.wake(),online=()=>queue.wake({retry:true});
  window.addEventListener(SYNC_EVENT,change);
  window.addEventListener('road-ready-local-saved',saved);
  window.addEventListener('owner-op-business-updated',saved);
  window.addEventListener('online',online);
  window.addEventListener('pageshow',wake);
  document.addEventListener('visibilitychange',wake);
  const account=()=>{if(accountStatus().phase!=='syncing')queue.wake();};
  window.addEventListener('road-ready-account-sync',account);
  queue.start();
  return()=>{queue.stop();window.removeEventListener(SYNC_EVENT,change);window.removeEventListener('road-ready-local-saved',saved);window.removeEventListener('owner-op-business-updated',saved);window.removeEventListener('online',online);window.removeEventListener('pageshow',wake);document.removeEventListener('visibilitychange',wake);window.removeEventListener('road-ready-account-sync',account);};
 },[]);
 return status.pending?<a href="/cloud" style={{position:'fixed',bottom:58,left:12,zIndex:998,padding:'8px 12px',background:'#eef5ff',borderRadius:16,color:'#184e9e',fontSize:13}}>Review corrections ({status.pending}) ›</a>:null;
}
