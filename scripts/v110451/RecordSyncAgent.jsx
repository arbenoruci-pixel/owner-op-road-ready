'use client';
import React,{useEffect,useState} from 'react';
import {syncRecords,recordSyncStatus,SYNC_EVENT} from '../../../../lib/owner-op-cloud/recordSyncV110451.js';
export default function RecordSyncAgent(){
 const [status,setStatus]=useState(recordSyncStatus);
 useEffect(()=>{const run=()=>{if(document.visibilityState==='visible')syncRecords();},change=e=>setStatus(e.detail),first=setTimeout(run,15000),timer=setInterval(run,90000);window.addEventListener(SYNC_EVENT,change);window.addEventListener('online',run);document.addEventListener('visibilitychange',run);return()=>{clearTimeout(first);clearInterval(timer);window.removeEventListener(SYNC_EVENT,change);window.removeEventListener('online',run);document.removeEventListener('visibilitychange',run);};},[]);
 return status.pending?<a href="/cloud" style={{position:'fixed',bottom:58,left:12,zIndex:998,padding:'8px 12px',background:'#eef5ff',borderRadius:16,color:'#184e9e',fontSize:13}}>Review corrections ({status.pending}) ›</a>:null;
}
