import React, {useEffect, useMemo, useRef, useState} from 'react';
import {inspectionReadiness, officerEmailLink} from './inspectionReadiness.js';
import {createCurrentInspectionShare} from '../../../../lib/owner-op-cloud/inspectionShare.js';
import {assertInspectionUnchanged} from '../../../../lib/owner-op-cloud/inspectionSnapshot.js';
import './inspectionWizard.css';
import {InspectionConflicts} from './InspectionConflicts.jsx';
import {validInspectionUsdot} from './inspectionIdentity.js';

const steps = ['Review', 'Inspection link', 'Officer email'];

export default function InspectionWizard({state, onReview, onSaveUsdot, onLocalPreview, onExports, createShare = createCurrentInspectionShare}) {
  const live = useRef(state); live.current = state;
  const mounted = useRef(true), running = useRef(false);
  useEffect(() => {mounted.current = true;return () => {mounted.current = false;};}, []);
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(''), [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [conflicts, setConflicts] = useState([]), [choices, setChoices] = useState({});
  const [share, setShare] = useState(null), [reviewed, setReviewed] = useState(false), [email, setEmail] = useState('');
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {const id=setInterval(()=>setClock(Date.now()),30000);return()=>clearInterval(id);}, []);
  const readiness = useMemo(() => inspectionReadiness(state, new Date(clock)), [state, clock]);
  const savedUsdot = String(readiness.profile.usdot || '').trim();
  const [usdotDraft, setUsdotDraft] = useState(savedUsdot);
  useEffect(() => {setUsdotDraft(savedUsdot);}, [savedUsdot, state.activeDriverId]);
  const usdotDirty = usdotDraft.trim() !== savedUsdot;
  const identityKey = JSON.stringify(readiness.profile);
  useEffect(() => {setConfirmed(false);setReviewed(false);}, [identityKey, state.activeDriverId]);
  useEffect(() => {setConfirmed(false);setReviewed(false);}, [state.eventsByDay, state.signatureByDay, state.formByDay]);
  const stale = useMemo(() => {
    if(!share)return false;
    try {assertInspectionUnchanged(share.inspection,state);return Date.parse(share.expires_at)<=clock || readiness.today!==share.inspection.endDay;}
    catch {return true;}
  }, [share, state, clock, readiness.today]);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const url = share ? origin + '/inspection#' + share.token : '';
  const mailto = share && !stale ? officerEmailLink(email,share,origin) : '';
  const ready = !readiness.missing.length && readiness.logsReady;
  const canNext = step===0 ? confirmed && ready && !usdotDirty : step===1 ? ready && share && !stale && reviewed : false;
  async function prepare(selectedChoices = null) {
    if(running.current)return;
    running.current=true;setBusy(true);setError('');setReviewed(false);setShare(null);setConflicts([]);setChoices({});
    document.activeElement?.blur?.();
    try {
      const result=await createShare({getState:()=>live.current,walletKeys:[],choices:selectedChoices,onProgress:message=>{if(mounted.current)setProgress(message);}});
      if(mounted.current){setShare(result);setProgress('Your inspection link is ready.');}
    } catch(e) {if(mounted.current){setError(e?.message || 'Could not prepare the link. Retry.');setConflicts(e?.conflicts || []);setProgress('');}}
    finally {running.current=false;if(mounted.current)setBusy(false);}
  }
  function advance() {
    setError('');setProgress('');setStep(step+1);
    if(step===0)prepare();
  }
  function checkBeforeEmail(event) {
    try {
      if(!share || !mailto || !reviewed || !ready)throw Error('Review a current package before opening the email.');
      assertInspectionUnchanged(share.inspection,live.current);
      if(Date.parse(share.expires_at)<=Date.now())throw Error('This link expired. Prepare a new package.');
    } catch(e) {event.preventDefault();setError(e.message);setStep(1);setReviewed(false);}
  }
  return <main className="inspection-wizard" aria-label="DOT inspection preparation">
    <p className="inspection-eyebrow">DOT INSPECTION · STEP {step+1} OF 3</p>
    <ol className="inspection-steps" aria-label="Preparation steps">{steps.map((label,i)=><li key={label} aria-current={step===i?'step':undefined} className={i===step?'current':i<step?'done':''}>{i+1}<span>{label}</span></li>)}</ol>
    <h1>{steps[step]}</h1>
    {step===0 && <>
      <p>Check your details, then prepare the officer’s link here.</p>
      <dl>{[['Driver',readiness.profile.driverName],['Carrier / USDOT',[readiness.profile.carrierName,readiness.profile.usdot].filter(Boolean).join(' / ')],['Truck / trailer',[readiness.profile.unit,readiness.profile.trailer||'No trailer'].join(' / ')],['Log dates',`${readiness.days[0].day} – ${readiness.today}`]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'Missing'}</dd></div>)}</dl>
      {readiness.missing.length>0 && <p className="inspection-error" role="alert">Complete: {readiness.missing.join(', ')}.</p>}
      <details open={!savedUsdot || undefined} className="inspection-card"><summary>Edit carrier / driver details</summary>
        <label className="inspection-email">Carrier USDOT number<input type="text" inputMode="numeric" autoComplete="off" maxLength={9} value={usdotDraft} onChange={e=>{setUsdotDraft(e.target.value);setConfirmed(false);}} placeholder="Enter your carrier's USDOT" /></label>
        <button type="button" disabled={!onSaveUsdot || !usdotDirty || !validInspectionUsdot(usdotDraft)} onClick={()=>{onSaveUsdot(usdotDraft.trim());setConfirmed(false);}}>Save USDOT</button>
        {usdotDirty && <p role="status">{validInspectionUsdot(usdotDraft) ? 'Tap Save USDOT before continuing.' : 'Enter a USDOT number using digits only.'}</p>}
        <p>Main office: {readiness.profile.mainOffice || 'Missing'}<br/>Home time zone: {readiness.zone}</p>
        <button onClick={()=>onReview?.({day:readiness.today,tab:'form'})}>Edit driver / equipment details</button>
      </details>
      <details open={!readiness.logsReady || undefined} className="inspection-card"><summary>{readiness.logsReady?'8 log days checked':'Log days needing attention'}</summary>
        <p>Today does not need a signature yet.</p>
        <div className="inspection-days">{readiness.days.map(row=><article key={row.day}>
          <b>{row.day}{row.today?' · Today':''}</b>
          <p>{row.gaps.length?`${row.gaps.length} unrecorded interval(s) · `:''}{row.today?'Active day':row.signed?'Certified':'Needs signature / recertification'}</p>
          <button onClick={()=>onReview?.({day:row.day,tab:row.gaps.length?'log':!row.signed?'sign':'log'})}>{row.blocked?'Review day':'Open day'}</button>
          {row.issues.length>0 && <details open={row.blocked || undefined}><summary>{row.issues.length} review item(s)</summary><ul>{row.issues.map((item,i)=><li key={i}><b>{item.title}</b><p>{item.detail}</p></li>)}</ul></details>}
        </article>)}</div>
      </details>
      {!readiness.logsReady && <p className="inspection-error">Open the marked day to review missing time or its signature. Record only what actually happened.</p>}
      <details className="inspection-card"><summary>Supporting documents</summary>
        <p>Have your license, medical documents, registration, insurance, annual inspection, permits and current load / BOL available. Include ELD exemption documents when applicable.</p>
        <p>This link contains the eight log days. Present supporting documents separately.</p>
        <button onClick={()=>onReview?.({view:'wallet'})}>Open document wallet</button>
      </details>
      <label className="inspection-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed the driver, equipment and logs, and have my supporting documents ready.</label>
    </>}
    {step===1 && <>
      <p>We prepare your eight log days here. You do not need to start a full backup.</p>
      {!ready && <p className="inspection-error">The records changed. Go back to review the marked details.</p>}
      {!share || stale ? <button className="primary" disabled={busy || conflicts.length>0} onClick={()=>prepare()}>{busy?'Preparing…':stale?'Refresh changed package':'Prepare inspection link'}</button> : <>
        <p className="inspection-success">8 / 8 dates · {share.inspection.snapshots[0].sourceDay} – {share.inspection.endDay}</p>
        <p>Captured {new Date(share.inspection.capturedAt).toLocaleString()} · {share.inspection.timeZone}</p>
        <a className="inspection-primary" href={url} target="_blank" rel="noopener noreferrer">Open officer package</a>
        <label className="inspection-check"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I opened the package and checked the driver, dates and log details.</label>
      </>}
      {stale && <p className="inspection-error">Records changed or the link expired. Prepare a fresh link.</p>}
      <button onClick={onLocalPreview}>View logs on this device</button>
    </>}
    {step===2 && <>
      <p>Enter the officer’s address. The next button opens a prepared email in your email app; tap Send there.</p>
      <label className="inspection-email">Officer email<input type="email" autoComplete="off" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e=>setEmail(e.target.value)} placeholder="officer@example.gov" /></label>
      {mailto && reviewed && ready ? <a className="inspection-primary" href={mailto} onClick={checkBeforeEmail}>Open email to officer</a> : <button className="primary" disabled>{!ready||stale?'Refresh and review the package':'Enter a valid officer email'}</button>}
      {stale && <p className="inspection-error">The package needs refreshing. Go back to review.</p>}
      <p>Expires {share?new Date(share.expires_at).toLocaleString():''}. Manual RODS sharing.</p>
      {share && !stale && <><label className="inspection-email">Inspection link<input readOnly value={url} onFocus={e=>e.target.select()} /></label><button onClick={async()=>{try{await navigator.clipboard.writeText(url);setProgress('Link copied.');}catch{setError('Select the link above and copy it.');}}}>Copy link</button></>}
    </>}
    {progress && <p role="status">{progress}</p>}
    {conflicts.length>0 && <InspectionConflicts conflicts={conflicts} choices={choices} onChoose={(key,side)=>setChoices(current=>({...current,[key]:side}))} busy={busy} onConfirm={()=>prepare(choices)}/>}
    {error && !conflicts.length && <div className="inspection-error" role="alert"><p>{error}</p><button disabled={busy} onClick={()=>prepare()}>Try again</button><details><summary>Connection settings</summary><button onClick={()=>window.dispatchEvent(new Event('road-ready-open-sync-status'))}>Open Synchronization status</button></details></div>}
    <footer>{step>0 && <button disabled={busy} onClick={()=>{setError('');setConflicts([]);setChoices({});setStep(step-1);}}>Back</button>}{step<2 && <button className="primary" disabled={busy||!canNext} onClick={advance}>{step===0?'Prepare inspection link':'Continue to email'}</button>}</footer>
    <details className="inspection-alternatives"><summary>Other export options</summary><button onClick={onExports}>Download or preview logs</button></details>
  </main>;
}
