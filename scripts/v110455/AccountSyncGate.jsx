'use client';
import React,{useEffect,useState} from 'react';
import {syncAccount,accountStatus,ACCOUNT_EVENT} from '../../../../lib/owner-op-cloud/accountSyncV110455.js';
function details(value){
 if(value===undefined)return 'Removed from this device';
 const lines=[];
 function show(v,label=''){
  if(v?.__rrAccountFile||typeof v==='string'&&v.startsWith('data:')){lines.push(label+': Saved file');return;}
  if(Array.isArray(v)){v.slice(0,80).forEach((row,i)=>show(row,label+' '+(i+1)));return;}
  if(v&&typeof v==='object'){for(const [k,x] of Object.entries(v)){if(/^(id|local_id|client_document_id|__)/.test(k))continue;show(x,(label?label+' · ':'')+k.replace(/([a-z])([A-Z])/g,'$1 $2'));}return;}
  if(v!==null&&v!=='')lines.push(label+': '+String(v));
 }
 show(value);return lines.slice(0,120).join('\n')||'No recorded details';
}
export default function AccountSyncGate({children}){
 const [ready,setReady]=useState(false),[status,setStatus]=useState(accountStatus),[review,setReview]=useState(false),[choices,setChoices]=useState({});
 useEffect(()=>{
  let cancelled=false,timer,retry;
  const update=e=>setStatus(e.detail);
  const run=()=>{if(document.visibilityState!=='visible'||document.activeElement?.matches('input,textarea,select,[contenteditable=true]')||window.__rrAccountState?.()?.sheet)return;syncAccount();};
  window.addEventListener(ACCOUNT_EVENT,update);
  syncAccount({initial:true}).finally(()=>{if(!cancelled)setReady(true);});
  timer=setInterval(run,30000);
  const saved=()=>{clearTimeout(retry);retry=setTimeout(run,2500);};
  window.addEventListener('online',run);window.addEventListener('owner-op-business-updated',saved);window.addEventListener('road-ready-local-saved',saved);document.addEventListener('visibilitychange',run);
  return()=>{cancelled=true;clearInterval(timer);clearTimeout(retry);window.removeEventListener(ACCOUNT_EVENT,update);window.removeEventListener('online',run);window.removeEventListener('owner-op-business-updated',saved);window.removeEventListener('road-ready-local-saved',saved);document.removeEventListener('visibilitychange',run);};
 },[]);
 if(!ready||status.phase==='account_mismatch')return <main style={{padding:28,fontFamily:'system-ui',maxWidth:520,margin:'auto'}}><h2>{status.phase==='account_mismatch'?'Account data protected':'Opening your records'}</h2><p role="status">{status.message}</p></main>;
 const attention=['error','offline','conflict'].includes(status.phase);
 return <>{children}{attention?<aside aria-label="Account synchronization" style={{position:'fixed',bottom:64,left:12,right:12,zIndex:999,padding:12,borderRadius:16,background:'#fff5dc',color:'#172b46',boxShadow:'0 3px 14px #0002',fontSize:14}}><span role="status">{status.message}</span>{status.phase==='conflict'?<button onClick={()=>setReview(true)}>Review changes ({status.conflicts.length})</button>:status.phase==='error'?<button onClick={()=>syncAccount()}>Retry sync</button>:null}</aside>:null}{review&&status.conflicts?.length?<section role="dialog" aria-modal="true" aria-label="Review changes from your devices" style={{position:'fixed',inset:12,overflow:'auto',zIndex:3000,background:'white',padding:20,borderRadius:20,color:'#172b46'}}><h2>Review device changes</h2><p>Choose the version to keep for each item. The previous versions remain in recovery history.</p>{status.conflicts.map(c=><fieldset key={c.key} style={{marginBottom:18}}><legend>{JSON.parse(c.key).slice(0,3).join(' · ')}</legend>{['local','remote'].map(side=><label key={side} style={{display:'block',padding:8}}><input type="radio" name={c.key} checked={choices[c.key]===side} onChange={()=>setChoices(v=>({...v,[c.key]:side}))}/>{side==='local'?'This device':'Saved account copy'}<pre style={{whiteSpace:'pre-wrap',maxHeight:200,overflow:'auto',fontSize:12}}>{details(c[side])}</pre></label>)}</fieldset>)}<button disabled={status.conflicts.some(c=>!choices[c.key])} onClick={async()=>{await syncAccount({choices});setReview(false);setChoices({});}}>Save selected versions</button><button onClick={()=>setReview(false)}>Keep reviewing later</button></section>:null}</>;
}
