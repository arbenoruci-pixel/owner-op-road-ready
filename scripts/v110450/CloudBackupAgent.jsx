'use client';
import React,{useEffect,useState} from 'react';
import {mirrorStatus,mirrorEvent} from '../../../../lib/owner-op-cloud/cloudMirrorV110450.js';
export default function CloudBackupAgent(){
 const [status,setStatus]=useState(mirrorStatus);
 useEffect(()=>{
  const update=e=>setStatus(e.detail);
  window.addEventListener(mirrorEvent,update);
  return()=>window.removeEventListener(mirrorEvent,update);
 },[]);
 if(['idle','disabled'].includes(status.phase))return null;
 const label=status.phase==='running'?'Backing up all records…':status.phase==='verified'?'Cloud copy verified':status.phase==='paused'?'Cloud backup paused':status.phase==='partial'?'Backup: files need attention':status.phase==='offline'?'Backup needs connection':'Backup needs attention';
 return <a href="/cloud" aria-label={label} style={{position:'fixed',bottom:'calc(env(safe-area-inset-bottom, 0px) + 8px)',left:12,zIndex:999,maxWidth:'calc(100vw - 115px)',padding:'8px 12px',border:'1px solid #cad7e2',borderRadius:18,background:status.phase==='verified'?'#edfdf6':'#fff8e7',color:'#18304c',fontSize:12,fontWeight:700,textDecoration:'none'}}>{label} ›</a>;
}
