'use client';
import React, { useEffect, useRef, useState } from 'react';
import { syncAccount, accountStatus, ACCOUNT_EVENT, requestRecordPriority } from '../../../../lib/owner-op-cloud/accountSyncV110455.js';
import { createSyncScheduler } from '../../../../lib/owner-op-cloud/syncSchedulerReliability.js';
import { recordsFrom, equivalentRecords, LOCAL_KEYS } from '../../../../lib/owner-op-cloud/accountCoreV110455.js';
import { BUSINESS_STORE_KEY } from '../business/businessStore.js';
import './syncReliability.css';

function fields(value, path = '', out = {}) {
  if (value === undefined) { out[path || 'Record'] = 'Removed'; return out; }
  if (value?.__rrAccountFile) { out[path || 'Original'] = `Original file · ${value.size || 0} bytes · ${(value.chunks || []).map(c => c.hash || c.sha256 || c).join(', ')}`; return out; }
  if (typeof value === 'string' && value.startsWith('data:')) { out[path || 'File'] = value; return out; }
  if (Array.isArray(value)) { value.forEach((v, i) => fields(v, `${path} ${i + 1}`, out)); if (!value.length) out[path] = 'Empty'; return out; }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) fields(item, `${path ? path + ' · ' : ''}${key.replace(/([a-z])([A-Z])/g, '$1 $2')}`, out);
    return out;
  }
  out[path || 'Value'] = value === null || value === '' ? 'Not set' : String(value);
  return out;
}
function changedFields(conflict) {
  const local = fields(conflict.local), remote = fields(conflict.remote);
  return [...new Set([...Object.keys(local), ...Object.keys(remote)])].filter(k => local[k] !== remote[k])
    .map(label => ({ label, local: local[label] ?? 'Removed', remote: remote[label] ?? 'Removed' }));
}
function conflictTitle(conflict) {
  const [kind, first, second] = JSON.parse(conflict.key);
  if (kind === 'day') return `Logbook · ${second} · ${first}`;
  return [kind === 'guide' ? 'Load' : first, conflict.local?.loadNo || conflict.remote?.loadNo || second].filter(Boolean).join(' · ');
}
function FieldValue({value}) {
  if (typeof value === 'string' && value.startsWith('data:')) return <div>
    {/^data:image\/(png|jpeg|webp);/i.test(value) ? <img src={value} alt="Retained signature or original" style={{maxWidth:'100%',maxHeight:160,background:'#fff'}}/> : null}
    <a href={value} download="retained-original">Open retained original</a>
  </div>;
  return <pre>{value}</pre>;
}

export default function AccountSyncGate({ children }) {
  const [ready, setReady] = useState(false), [status, setStatus] = useState(accountStatus);
  const [details, setDetails] = useState(false), [review, setReview] = useState(false);
  const [choices, setChoices] = useState({}), [retry, setRetry] = useState({ failures: 0, retryAt: 0 });
  const scheduler = useRef(null);
  const reviewedVersions=useRef('');
  useEffect(()=>{
    if(!status.conflicts?.length)return;
    const versions=JSON.stringify(status.conflicts.map(({key,local,remote})=>({key,local,remote})));
    if(versions!==reviewedVersions.current){reviewedVersions.current=versions;setChoices({});}
  },[status.conflicts]);
  useEffect(() => {
    if (!details) return;
    const close = event => { if (event.key === 'Escape') setDetails(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [details]);
  useEffect(() => {
    const finish = result => {
      if (result?.conflicts?.length) { if(result.canOpenLocal===true)setReady(true); return; }
      if (result?.recordsReady===true) setReady(true);
      if (!result?.busy && !result?.blocked && !result?.handoffPending)
        setReady(open => open || !result?.error || result.canOpenLocal === true);
      if (!result?.conflicts?.length && !result?.error && !result?.busy) { setReview(false); setChoices({}); }
    };
    const queue = createSyncScheduler({
      sync: syncAccount, onResult: finish, prioritize: requestRecordPriority, onRetry: setRetry,
      online: () => navigator.onLine !== false,
      canRun: ({ initial, dirty, scope }) => initial ||
        ((document.visibilityState === 'visible' || dirty && scope === 'records') &&
         !document.activeElement?.matches('input,textarea,select,[contenteditable=true]') && !window.__rrAccountState?.()?.sheet),
    });
    scheduler.current = queue;
    const localValue = key => { const raw = localStorage.getItem(key); if (raw === null) return undefined; try { return JSON.parse(raw); } catch { return raw; } };
    const savedSettings = () => recordsFrom({ business: localValue(BUSINESS_STORE_KEY) || {},
      locals: Object.fromEntries(LOCAL_KEYS.map(key => [key, localValue(key)])) });
    let settingsRecords = savedSettings();
    const update = event => setStatus(event.detail);
    const openDetails = () => setDetails(true);
    const saved = event => {
      if (event.detail?.source === 'account-receive') { settingsRecords = savedSettings(); return; }
      if (event.type !== 'road-ready-local-saved') {
        const next = savedSettings(); if (equivalentRecords(settingsRecords, next)) return; settingsRecords = next;
      }
      queue.saved({ scope: event.detail?.scope || 'records' });
    };
    const wake = () => queue.wake(), reconnect = () => queue.wake({ reconnect: true });
    const offline = () => setStatus(current => ({ ...current, phase: 'offline', message: 'Offline. Pending changes stay on this device until connected.' }));
    const leave = () => queue.wake();
    window.addEventListener(ACCOUNT_EVENT, update);
    window.addEventListener('road-ready-open-sync-status', openDetails);
    window.addEventListener('road-ready-local-saved', saved);
    window.addEventListener('owner-op-business-updated', saved);
    window.addEventListener('road-ready-owner-ops-updated-v102', saved);
    window.addEventListener('owner-op-operator-profile-updated', saved);
    window.addEventListener('online', reconnect); window.addEventListener('offline', offline); window.addEventListener('pageshow', wake);
    window.addEventListener('pagehide', leave); document.addEventListener('visibilitychange', wake);
    document.addEventListener('focusout', wake); queue.start();
    return () => {
      queue.stop(); scheduler.current = null;
      window.removeEventListener(ACCOUNT_EVENT, update);
      window.removeEventListener('road-ready-open-sync-status', openDetails);
      window.removeEventListener('road-ready-local-saved', saved);
      window.removeEventListener('owner-op-business-updated', saved);
      window.removeEventListener('road-ready-owner-ops-updated-v102', saved);
      window.removeEventListener('owner-op-operator-profile-updated', saved);
      window.removeEventListener('online', reconnect); window.removeEventListener('offline', offline); window.removeEventListener('pageshow', wake);
      window.removeEventListener('pagehide', leave); document.removeEventListener('visibilitychange', wake);
      document.removeEventListener('focusout', wake);
    };
  }, []);
  const retryNow = () => scheduler.current?.retry();
  const opening=!ready || status.phase === 'account_mismatch';
  const openingView=<main className="rr-sync-opening">
    <h2>{status.phase === 'account_mismatch' ? 'Account data protected' : 'Opening your logbook'}</h2>
    <p role="status">{status.message}</p>
    {status.phase === 'error' || retry.failures > 0 ? <button onClick={retryNow}>Retry sync</button> : null}
    {status.conflicts?.length && status.phase!=='account_mismatch' ? <button onClick={()=>setReview(true)}>Review saved versions</button> : null}
  </main>;
  const issue = status.issue || (retry.failures >= 4 ? { phase: 'error', message: 'Synchronization needs attention. Your pending changes will be checked again.' } : null);
  return <>{opening?openingView:children}
    {!opening?<>
    {details ? <aside className="rr-sync-details" aria-label="Account synchronization">
      <div><strong>{issue ? 'Synchronization needs attention' : 'Saved records'}</strong><button aria-label="Close sync details" onClick={() => setDetails(false)}>×</button></div>
      <p role={issue ? 'status' : undefined}>{issue?.message || status.message}</p>
      {status.completedAt ? <small>Last completed check: {new Date(status.completedAt).toLocaleString()}</small> : null}
      {retry.retryAt ? <small>Another attempt is scheduled. You can keep working.</small> : null}
      <div className="rr-sync-actions">
        <a href="/cloud">Cloud settings</a>
        {status.conflicts?.length ? <button onClick={() => setReview(true)}>Review changes ({status.conflicts.length})</button> :
          status.phase === 'paused' ? null : <button onClick={retryNow}>Retry sync</button>}
      </div>
    </aside> : null}
    </>:null}
    {review && status.conflicts?.length && status.phase!=='account_mismatch' ? <section className="rr-sync-review" role="dialog" aria-modal="true" aria-label="Review changes from your devices">
      <header><button onClick={() => setReview(false)}>Back to app</button><h2>Review device changes</h2></header>
      <p>These saved versions differ. Compare the changes before choosing. Both versions remain in recovery history.</p>
      {status.conflicts.map(conflict => <fieldset key={conflict.key}>
        <legend>{conflictTitle(conflict)}</legend>
        <div className="rr-sync-choice">{['local', 'remote'].map(side => <label key={side}>
          <input type="radio" name={conflict.key} checked={choices[conflict.key] === side} onChange={() => setChoices(current => ({ ...current, [conflict.key]: side }))}/>
          {side === 'local' ? 'Keep this device’s version' : 'Keep the saved account version'}
        </label>)}</div>
        {changedFields(conflict).map(row => <article className="rr-sync-diff" key={row.label}><b>{row.label}</b>
          <div><span>This device</span><FieldValue value={row.local}/></div><div><span>Saved account</span><FieldValue value={row.remote}/></div>
        </article>)}
      </fieldset>)}
      <footer><button disabled={status.conflicts.some(c => !choices[c.key]) || status.phase === 'syncing'} onClick={() => scheduler.current?.retry(choices)}>Confirm selected versions</button>
        <button onClick={() => setReview(false)}>Keep reviewing later</button></footer>
    </section> : null}
  </>;
}
