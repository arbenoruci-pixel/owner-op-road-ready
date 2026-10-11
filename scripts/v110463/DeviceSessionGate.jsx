'use client';
import React,{useEffect,useState} from 'react';
import {cloudClient} from '../../../../lib/owner-op-cloud/client.js';
import {getOwnerOpDb} from '../../../../lib/local-db/dexie.js';
import {flushAppSnapshots} from '../../../../lib/local-db/appState.js';
import {DEVICE_EVENT,verifyDeviceSession} from '../../../../lib/owner-op-cloud/deviceSessionV110463.js';

export default function DeviceSessionGate({children}){
 const [opened,setOpened]=useState(false),[allowed,setAllowed]=useState(false),[message,setMessage]=useState('Checking this device…');
 useEffect(()=>{
  let disposed=false,running=false,revoked=false;
  const lock=message=>{if(!disposed){setAllowed(false);setMessage(message);}};
  const retire=async()=>{
   if(revoked)return;revoked=true;
   lock('Opened on another device. Keeping your local work before signing out…');
   try{
    await flushAppSnapshots();
    const state=window.__rrAccountState?.(),db=getOwnerOpDb();
    if(state&&db)await db.app_snapshots.put({key:'single-device-signout:'+Date.now(),state:structuredClone(state),updated_at:new Date().toISOString()});
    // Local sign-out must not revoke the newly signed-in device.
    const {error}=await cloudClient().auth.signOut({scope:'local'});if(error)throw error;
   }catch{revoked=false;lock('This device is locked. Your local work is retained. Reconnect to finish signing out.');}
  };
  const run=async()=>{
   if(disposed||running||revoked)return;running=true;
   try{await verifyDeviceSession();if(!disposed){setOpened(true);setAllowed(true);}}
   catch(e){if(e.deviceRevoked)await retire();else lock(e.message||'Connect to verify the active device.');}
   finally{running=false;}
  };
  const observed=e=>{if(e.detail?.active===false)void retire();};
  const offline=()=>lock('Offline. Reconnect to use this device. Your saved work stays here.');
  const visible=()=>{if(document.visibilityState==='visible'){lock('Checking this device…');void run();}};
  window.addEventListener(DEVICE_EVENT,observed);window.addEventListener('offline',offline);window.addEventListener('online',run);window.addEventListener('pageshow',visible);document.addEventListener('visibilitychange',visible);
  void run();const timer=setInterval(run,4000);
  return()=>{disposed=true;clearInterval(timer);window.removeEventListener(DEVICE_EVENT,observed);window.removeEventListener('offline',offline);window.removeEventListener('online',run);window.removeEventListener('pageshow',visible);document.removeEventListener('visibilitychange',visible);};
 },[]);
 return <>{opened?<div inert={allowed?undefined:''} aria-hidden={!allowed||undefined}>{children}</div>:null}{!allowed?<main role="alert" style={{position:'fixed',inset:0,zIndex:2147483647,background:'#f4f7fb',color:'#172b46',padding:28,fontFamily:'system-ui',display:'grid',placeContent:'center'}}><section style={{maxWidth:480}}><h1>One active device</h1><p>{message}</p></section></main>:null}</>;
}
