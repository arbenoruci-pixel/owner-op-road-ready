import React, {useEffect, useMemo, useRef, useState} from 'react';
import {inspectionReadiness, officerEmailLink} from './inspectionReadiness.js';
import {createCurrentInspectionShare} from '../../../../lib/owner-op-cloud/inspectionShare.js';
import {assertInspectionUnchanged} from '../../../../lib/owner-op-cloud/inspectionSnapshot.js';
import './inspectionWizard.css';
import {validInspectionUsdot} from './inspectionIdentity.js';

const steps = ['Driver & truck','Logs & signatures','Documents','Review package','Officer email'];
const documents = [
  'Driver license and medical qualification documents are available.',
  'Registration, insurance, annual inspection and applicable IFTA / permits are available.',
  'Current load / BOL matches this trip, or I have confirmed that I am empty.',
  'I have reviewed the documents supporting my ELD exemption, when applicable.',
];

export default function InspectionWizard({state, onReview, onSaveUsdot, onLocalPreview, onExports, createShare = createCurrentInspectionShare}) {
  const live = useRef(state); live.current = state;
  const mounted = useRef(true), running = useRef(false);
  useEffect(() => {mounted.current = true;return () => {mounted.current = false;};}, []);
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(''), [error, setError] = useState('');
  const [identity, setIdentity] = useState(false), [logs, setLogs] = useState(false), [checked, setChecked] = useState({});
  const [share, setShare] = useState(null), [reviewed, setReviewed] = useState(false), [email, setEmail] = useState('');
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {const id=setInterval(()=>setClock(Date.now()),30000);return()=>clearInterval(id);}, []);
  const readiness = useMemo(() => inspectionReadiness(state, new Date(clock)), [state, clock]);
  const savedUsdot = String(readiness.profile.usdot || '').trim();
  const [usdotDraft, setUsdotDraft] = useState(savedUsdot);
  useEffect(() => {setUsdotDraft(savedUsdot);}, [savedUsdot, state.activeDriverId]);
  const usdotDirty = usdotDraft.trim() !== savedUsdot;
  const identityKey = JSON.stringify(readiness.profile);
  useEffect(() => {setIdentity(false);setLogs(false);setReviewed(false);}, [identityKey, state.activeDriverId]);
  useEffect(() => {setLogs(false);setReviewed(false);}, [state.eventsByDay, state.signatureByDay, state.formByDay]);
  const stale = useMemo(() => {
    if(!share)return false;
    try {assertInspectionUnchanged(share.inspection,state);return Date.parse(share.expires_at)<=clock || readiness.today!==share.inspection.endDay;}
    catch {return true;}
  }, [share, state, clock, readiness.today]);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const url = share ? origin + '/inspection#' + share.token : '';
  const mailto = share && !stale ? officerEmailLink(email,share,origin) : '';
  const docsReady = documents.every((_,i) => checked[i]);
  const ready = !readiness.missing.length && readiness.logsReady;
  const canNext = step===0 ? identity && !readiness.missing.length && !usdotDirty : step===1 ? logs && readiness.logsReady : step===2 ? docsReady : step===3 ? ready && share && !stale && reviewed : false;
  async function prepare() {
    if(running.current)return;
    running.current=true;setBusy(true);setError('');setReviewed(false);setShare(null);
    document.activeElement?.blur?.();
    try {
      const result=await createShare({getState:()=>live.current,walletKeys:[],onProgress:message=>{if(mounted.current)setProgress(message);}});
      if(mounted.current){setShare(result);setProgress('Eight log dates verified. Review the exact officer package below.');}
    } catch(e) {if(mounted.current){setError(e?.message || 'Could not prepare the link. Retry.');setProgress('');}}
    finally {running.current=false;if(mounted.current)setBusy(false);}
  }
  function checkBeforeEmail(event) {
    try {
      if(!share || !mailto || !reviewed || !ready)throw Error('Review a current package before opening the email.');
      assertInspectionUnchanged(share.inspection,live.current);
      if(Date.parse(share.expires_at)<=Date.now())throw Error('This link expired. Prepare a new package.');
    } catch(e) {event.preventDefault();setError(e.message);setStep(3);setReviewed(false);}
  }
  return <main className="inspection-wizard" aria-label="DOT inspection preparation">
    <p className="inspection-eyebrow">DOT INSPECTION · STEP {step+1} OF 5</p>
    <ol className="inspection-steps" aria-label="Preparation steps">{steps.map((label,i)=><li key={label} aria-current={step===i?'step':undefined} className={i===step?'current':i<step?'done':''}>{i+1}<span>{label}</span></li>)}</ol>
    <h1>{steps[step]}</h1>
    {step===0 && <>
      <p>Confirm who is driving and the equipment being inspected.</p>
      <dl>{[['Driver',readiness.profile.driverName],['Carrier / USDOT',[readiness.profile.carrierName,readiness.profile.usdot].filter(Boolean).join(' / ')],['Truck',readiness.profile.unit],['Trailer',readiness.profile.trailer||'No trailer recorded — confirm your equipment'],['Main office',readiness.profile.mainOffice],['Home time zone',readiness.zone]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'Missing'}</dd></div>)}</dl>
      {readiness.missing.length>0 && <p className="inspection-error" role="alert">Complete: {readiness.missing.join(', ')}.</p>}
      <label className="inspection-email">Carrier USDOT number<input type="text" inputMode="numeric" autoComplete="off" maxLength={9} value={usdotDraft} onChange={e=>{setUsdotDraft(e.target.value);setIdentity(false);}} placeholder="Enter your carrier's USDOT" /></label>
      <button type="button" disabled={!onSaveUsdot || !usdotDirty || !validInspectionUsdot(usdotDraft)} onClick={()=>{onSaveUsdot(usdotDraft.trim());setIdentity(false);}}>Save USDOT</button>
      {!savedUsdot && <p>Enter the USDOT number for the carrier shown above, tap Save USDOT, then confirm the details.</p>}
      {usdotDirty && <p role="status">{validInspectionUsdot(usdotDraft) ? 'Tap Save USDOT before continuing.' : 'Enter a USDOT number using digits only.'}</p>}
      <button onClick={()=>onReview?.({day:readiness.today,tab:'form'})}>Edit driver / equipment details</button>
      <label className="inspection-check"><input type="checkbox" checked={identity} onChange={e=>setIdentity(e.target.checked)}/>I checked the driver, truck, trailer and carrier details.</label>
    </>}
    {step===1 && <>
      <p>Current day and previous 7 days. Open any day that needs attention; completed days need your certification.</p>
      <div className="inspection-days">{readiness.days.map(row=><article key={row.day}>
        <div><b>{row.day}{row.today?' · Today':''}</b><span>{row.gaps.length?`${row.gaps.length} unrecorded interval(s)`:`${row.eventCount} timeline rows`}</span><span>{row.today?'Active day · signature not required yet':row.signed?'Certified':'Needs signature / recertification'}</span></div>
        <button onClick={()=>onReview?.({day:row.day,tab:!row.signed?'sign':'log'})}>{row.blocked?'Review day':'Open day'}</button>
        {row.issues.length>0 && <details><summary>{row.issues.length} review item(s)</summary><ul>{row.issues.map((item,i)=><li key={i}><b>{item.title}</b><p>{item.detail}</p></li>)}</ul></details>}
      </article>)}</div>
      <label className="inspection-check"><input type="checkbox" checked={logs} onChange={e=>setLogs(e.target.checked)}/>I reviewed the eight days, mileage, locations, shipping details and any listed alerts.</label>
      {!readiness.logsReady && <p className="inspection-error">Review missing time and unsigned completed days before continuing. Only record what actually happened.</p>}
    </>}
    {step===2 && <>
      <p>Have the supporting documents ready on this device or on paper. The email link contains the eight log days; present these documents separately.</p>
      {documents.map((label,i)=><label className="inspection-check" key={label}><input type="checkbox" checked={!!checked[i]} onChange={e=>setChecked({...checked,[i]:e.target.checked})}/>{label}</label>)}
      <button onClick={()=>onReview?.({view:'wallet'})}>Open document wallet</button>
    </>}
    {step===3 && <>
      <p>Prepare a verified snapshot, then open the same package the officer will see.</p>
      {!ready && <p className="inspection-error">The latest records need attention. Go back and review the driver details, log dates and signatures.</p>}
      {!share || stale ? <button className="primary" disabled={busy} onClick={prepare}>{busy?'Preparing…':stale?'Refresh changed package':'Verify records & create link'}</button> : <>
        <p className="inspection-success">8 / 8 dates · {share.inspection.snapshots[0].sourceDay} – {share.inspection.endDay}</p>
        <p>Captured {new Date(share.inspection.capturedAt).toLocaleString()} · {share.inspection.timeZone}</p>
        <a className="inspection-primary" href={url} target="_blank" rel="noopener noreferrer">Open officer package</a>
        <label className="inspection-check"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I opened the package and checked the driver, dates and log details.</label>
      </>}
      {stale && <p className="inspection-error">Records changed or this link expired. Prepare and review a fresh package.</p>}
      <button onClick={onLocalPreview}>View logs on this device</button>
    </>}
    {step===4 && <>
      <p>Enter the officer’s address. The next button opens a prepared email in your email app; tap Send there.</p>
      <label className="inspection-email">Officer email<input type="email" autoComplete="off" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e=>setEmail(e.target.value)} placeholder="officer@example.gov" /></label>
      {mailto && reviewed && ready ? <a className="inspection-primary" href={mailto} onClick={checkBeforeEmail}>Open email to officer</a> : <button className="primary" disabled>{!ready||stale?'Refresh and review the package':'Enter a valid officer email'}</button>}
      {stale && <p className="inspection-error">The package needs refreshing. Go back to review.</p>}
      <p>Expires {share?new Date(share.expires_at).toLocaleString():''}. Manual RODS sharing.</p>
      {share && !stale && <><label className="inspection-email">Inspection link<input readOnly value={url} onFocus={e=>e.target.select()} /></label><button onClick={async()=>{try{await navigator.clipboard.writeText(url);setProgress('Link copied.');}catch{setError('Select the link above and copy it.');}}}>Copy link</button></>}
    </>}
    {progress && <p role="status">{progress}</p>}
    {error && <div className="inspection-error" role="alert"><p>{error}</p><button onClick={()=>window.dispatchEvent(new Event('road-ready-open-sync-status'))}>Open Synchronization status</button></div>}
    <footer>{step>0 && <button disabled={busy} onClick={()=>{setError('');setStep(step-1);}}>Back</button>}{step<4 && <button className="primary" disabled={busy||!canNext} onClick={()=>{setError('');setProgress('');setStep(step+1);}}>Continue</button>}</footer>
    <button className="inspection-secondary" onClick={onExports}>Other export options</button>
  </main>;
}
