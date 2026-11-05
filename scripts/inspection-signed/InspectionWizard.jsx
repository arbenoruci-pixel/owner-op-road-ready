import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createCurrentInspectionShare} from '../../../../lib/owner-op-cloud/inspectionShare.js';
import {captureInspection,assertInspectionUnchanged} from '../../../../lib/owner-op-cloud/inspectionSnapshot.js';
import {timeLabel} from '../../../../lib/owner-op-cloud/core.js';
import {inspectionReadiness,officerEmailLink} from './inspectionReadiness.js';
import {LogSheet} from '../cloud/Inspector.jsx';
import './inspectionWizard.css';

export default function InspectionWizard({state,onReview,createShare=createCurrentInspectionShare}){
  const live=useRef(state);live.current=state;
  const mounted=useRef(true),running=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [clock,setClock]=useState(Date.now()),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false);
  const [share,setShare]=useState(null),[email,setEmail]=useState(''),[error,setError]=useState(''),[progress,setProgress]=useState('');
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),30000);return()=>clearInterval(timer);},[]);
  const pack=useMemo(()=>captureInspection(state,new Date(clock)),[state,clock]);
  const readiness=useMemo(()=>inspectionReadiness(state,new Date(clock)),[state,clock]);
  const day=pack.snapshots.some(s=>s.sourceDay===selected)?selected:pack.endDay;
  const snapshot=pack.snapshots.find(s=>s.sourceDay===day);
  const today=pack.snapshots.at(-1),cutoff=today.inspectionView.cutoff;
  const ready=readiness.logsReady&&!readiness.missing.length;
  const stale=useMemo(()=>{
    if(!share)return false;
    try{assertInspectionUnchanged(share.inspection,state);return Date.parse(share.expires_at)<=clock||share.inspection.endDay!==pack.endDay;}catch{return true;}
  },[share,state,clock,pack.endDay]);
  const origin=typeof window==='undefined'?'':window.location.origin;
  const url=share&&!stale?origin+'/inspection#'+share.token:'';
  const mailto=url?officerEmailLink(email,share,origin):'';
  async function prepare(){
    if(running.current||!ready)return;
    running.current=true;setBusy(true);setError('');setShare(null);
    document.activeElement?.blur?.();
    try{
      const result=await createShare({getState:()=>live.current,walletKeys:[],onProgress:message=>{if(mounted.current)setProgress(message);}});
      if(mounted.current){setShare(result);setProgress('Inspection link ready.');}
    }catch(e){if(mounted.current){setError(e?.message||'Could not prepare the link. Try again.');setProgress('');}}
    finally{running.current=false;if(mounted.current)setBusy(false);}
  }
  function beforeEmail(event){
    try{if(!share||stale||!mailto)throw Error('Prepare the inspection link again.');assertInspectionUnchanged(share.inspection,live.current);}
    catch(e){event.preventDefault();setError(e.message);}
  }
  return <main className="inspection-wizard inspection-single-log" aria-label="DOT inspection logbook">
    <p className="inspection-eyebrow">DOT INSPECTION</p>
    <h1>Inspection logbook</h1>
    <p>Signed daily logs and today through {timeLabel(cutoff)}{today.inspectionView.dotEvent?' · On Duty — DOT Inspection':''}.</p>
    <nav className="inspection-date-tabs" aria-label="Inspection dates">{pack.snapshots.map(row=><button type="button" key={row.sourceDay} aria-pressed={row.sourceDay===day} onClick={()=>setSelected(row.sourceDay)}>{row.sourceDay.slice(5)}{row.sourceDay===pack.endDay?' · Today':''}</button>)}</nav>
    <LogSheet day={day} snapshot={snapshot} profile={pack.profile} generatedAt={pack.capturedAt} endDay={pack.endDay} zone={pack.timeZone}/>
    {!ready && <div className="inspection-error" role="alert">
      {readiness.missing.length>0 && <><p>Complete your driver details: {readiness.missing.join(', ')}.</p><button onClick={()=>onReview?.({day:pack.endDay,tab:'form'})}>Open driver details</button></>}
      {readiness.days.filter(row=>row.blocked).map(row=><p key={row.day}>{row.day}: {row.signed?'Review missing log time.':'Signature needed.'} <button onClick={()=>onReview?.({day:row.day,tab:row.signed?'log':'sign'})}>Open log</button></p>)}
    </div>}
    {(!url||stale) && <button type="button" className="primary" disabled={busy||!ready} onClick={prepare}>{busy?'Preparing…':stale?'Refresh inspection link':'Prepare inspection link'}</button>}
    {progress && <p role="status">{progress}</p>}
    {error && <p className="inspection-error" role="alert">{error}</p>}
    {url && <section className="inspection-card" aria-label="Share inspection logbook">
      <a className="inspection-primary" href={url} target="_blank" rel="noopener noreferrer">Open inspection link</a>
      <label className="inspection-email">Officer email<input type="email" autoComplete="off" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e=>setEmail(e.target.value)} placeholder="officer@example.gov"/></label>
      {mailto && <a className="inspection-primary" href={mailto} onClick={beforeEmail}>Open email to officer</a>}
      <p>The email opens in your email app. Tap Send there.</p>
      <button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(url);setProgress('Link copied.');}catch{setError('Open the inspection link and copy its address.');}}}>Copy inspection link</button>
    </section>}
  </main>;
}
