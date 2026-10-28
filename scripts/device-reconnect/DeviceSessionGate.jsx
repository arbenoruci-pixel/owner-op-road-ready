'use client';
import React,{useEffect,useState} from 'react';
import {CURRENT_APP_VERSION} from '../../core/update/appUpdate.js';
import {cloudClient,cloudSession} from '../../../../lib/owner-op-cloud/client.js';
import {getOwnerOpDb} from '../../../../lib/local-db/dexie.js';
import {flushAppSnapshots} from '../../../../lib/local-db/appState.js';
import {DEVICE_EVENT,verifyDeviceSession,invalidateDeviceSession,sessionId} from '../../../../lib/owner-op-cloud/deviceSessionV110463.js';

export default function DeviceSessionGate({children}){
 const [opened,setOpened]=useState(false),[allowed,setAllowed]=useState(false),[message,setMessage]=useState('Checking this device…');
 const [checking,setChecking]=useState(true),[retryAction,setRetryAction]=useState(null);
 useEffect(()=>{
  let disposed=false,running=false,revoked=false,recheck=false,epoch=0;
  const foreground=()=>document.visibilityState!=='hidden';
  const lock=message=>{if(!disposed){setAllowed(false);setMessage(message);}};
  const retire=async sid=>{
   if(revoked)return;revoked=true;epoch++;
   lock('Opened on another device. Keeping your local work before signing out…');
   try{
    if(disposed||sessionId(await cloudSession())!==sid){revoked=false;return;}
    await flushAppSnapshots();
    const state=window.__rrAccountState?.(),db=getOwnerOpDb();
    if(state&&db)await db.app_snapshots.put({key:'single-device-signout:'+Date.now(),state:structuredClone(state),updated_at:new Date().toISOString()});
    if(disposed||sessionId(await cloudSession())!==sid){revoked=false;return;}
    const {error}=await cloudClient().auth.signOut({scope:'local'});if(error)throw error;
   }catch{revoked=false;lock('This device is locked. Your local work is retained. Reconnect to finish signing out.');}
  };
  const run=async()=>{
   if(disposed||revoked||!foreground())return;
   if(running){recheck=true;return;}
   running=true;recheck=false;const started=epoch;setChecking(true);setMessage('Checking the current device connection…');
   try{await verifyDeviceSession();if(!disposed&&!revoked&&started===epoch&&navigator.onLine&&foreground()){setOpened(true);setAllowed(true);}}
   catch(e){if(e.deviceRevoked)await retire(e.sid);else if(started===epoch&&!e.deviceCheckInterrupted)lock(e.message||'Reconnect to verify the active device.');}
   finally{
    running=false;if(!disposed)setChecking(false);
    if(recheck&&!disposed&&!revoked&&navigator.onLine&&foreground())void run();
   }
  };
  const observed=e=>{if(e.detail?.active===false)void retire(e.detail.sid);};
  const retry=()=>{epoch++;invalidateDeviceSession();lock('Reconnecting and checking this device…');void run();};
  const offline=()=>{epoch++;invalidateDeviceSession();setChecking(false);lock('Offline. Reconnect to use this device. Your saved work stays here.');};
  const visible=()=>{
   if(foreground())retry();
   else{epoch++;invalidateDeviceSession();lock('Checking this device when you return…');}
  };
  const pagehide=()=>{epoch++;invalidateDeviceSession();lock('Checking this device when you return…');};
  setRetryAction(()=>retry);
  window.addEventListener(DEVICE_EVENT,observed);window.addEventListener('offline',offline);window.addEventListener('online',retry);window.addEventListener('pageshow',visible);window.addEventListener('pagehide',pagehide);document.addEventListener('visibilitychange',visible);
  void run();const timer=setInterval(()=>{if(!running&&foreground()&&navigator.onLine)void run();},4000);
  return()=>{disposed=true;clearInterval(timer);invalidateDeviceSession();window.removeEventListener(DEVICE_EVENT,observed);window.removeEventListener('offline',offline);window.removeEventListener('online',retry);window.removeEventListener('pageshow',visible);window.removeEventListener('pagehide',pagehide);document.removeEventListener('visibilitychange',visible);};
 },[]);
 const blockLockedEvent=event=>{if(!allowed){event.preventDefault();event.stopPropagation();}};
 return <>{opened?<div ref={node=>{if(node){if(!allowed&&node.contains(document.activeElement))document.activeElement?.blur?.();node.inert=!allowed;}}} aria-hidden={!allowed||undefined} onClickCapture={blockLockedEvent} onKeyDownCapture={blockLockedEvent} onKeyUpCapture={blockLockedEvent} onSubmitCapture={blockLockedEvent}>{children}</div>:null}{!allowed?<main role="alert" aria-busy={checking} style={{position:'fixed',inset:0,zIndex:2147483647,background:'#f4f7fb',color:'#172b46',padding:28,fontFamily:'system-ui',display:'grid',placeContent:'center'}}><section style={{maxWidth:480}}><h1>{checking?'Checking your connection':'Connection needs attention'}</h1><p>{message}</p><button type="button" onClick={()=>retryAction?.()} disabled={checking||!retryAction} style={{padding:'14px 20px',borderRadius:14,fontSize:17,fontWeight:700}}>Retry connection</button><p style={{fontSize:14}}>Your saved work stays on this device. Reconnection is checked automatically while this app is open.</p><small>Road Ready {CURRENT_APP_VERSION}</small></section></main>:null}</>;
}
