'use client';
import React, { useEffect, useState } from 'react';
import { cloudClient, cloudSession, cloudApi, localState, backupLocalData, backupStatus, autoBackupEnabled, enableAutoBackup, readCloudFile, saveDownload } from '../../../../lib/owner-op-cloud/client.js';
import { eightDays, profileFromState } from '../../../../lib/owner-op-cloud/core.js';
import { getHomeTerminalTimeZone } from '../../core/time/homeTerminalTime.js';
import { DocumentViewer, LogSheet } from './Inspector.jsx';
import './cloud.css';
export default function CloudHub() {
  const [session,setSession]=useState(null),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[catalog,setCatalog]=useState(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[status,setStatus]=useState(null),[selected,setSelected]=useState([]),[share,setShare]=useState(null),[shares,setShares]=useState([]),[viewer,setViewer]=useState(null),[archive,setArchive]=useState(null),[cursor,setCursor]=useState(null),[log,setLog]=useState(null),[automatic,setAutomatic]=useState(false);
  async function refresh() {
    const s=await cloudSession();setSession(s);if(!s){setCatalog(null);return;}
    const state=await localState();
    await cloudApi({action:'bootstrap',payload:{profile:profileFromState(state||{}),home_timezone:getHomeTerminalTimeZone(state||{})}});
    const c=await cloudApi({action:'catalog'});setCatalog(c);setStatus(backupStatus(s.user.id));setAutomatic(autoBackupEnabled(s.user.id));
    const list=await cloudApi({action:'list_shares'});setShares(list.shares);
  }
  useEffect(()=>{
    refresh().catch(e=>setError(e.message));
    const {data}=cloudClient().auth.onAuthStateChange((_event,s)=>{setSession(s);setTimeout(()=>refresh().catch(e=>setError(e.message)),0);});
    const onStatus=e=>setStatus(e.detail);window.addEventListener('owner-op-cloud-status',onStatus);
    return()=>{data.subscription.unsubscribe();window.removeEventListener('owner-op-cloud-status',onStatus);};
  },[]);
  async function auth(signup=false) {
    setBusy(true);setError('');setMessage('');
    try {const result=signup?await cloudClient().auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+'/cloud'}}):await cloudClient().auth.signInWithPassword({email,password});if(result.error)throw result.error;setPassword('');if(signup&&!result.data.session)setMessage('Check your email to confirm the account, then return here and sign in.');else await refresh();}catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function sync() {
    setBusy(true);setError('');
    try {let s;do{s=await backupLocalData({maxUploads:25,bootstrap:true,onProgress:setMessage});if(s.busy)throw new Error('Another tab is backing up. Keep this page open and retry after it finishes.');setStatus(s);if(s.errors?.length)break;}while(s.remaining);if(!s.errors?.length){setMessage('Cloud backup verified. Original local records have been kept.');enableAutoBackup(session.user.id,true);setAutomatic(true);}else setError(s.errors.join('\n'));await refresh();}catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function createShare() {
    setBusy(true);setError('');
    try {
      const state=await localState();
      const s=state?await backupLocalData({maxUploads:80,bootstrap:true,onProgress:setMessage,onlyDays:eightDays(catalog.window_end)}):{};
      if(s.busy)throw new Error('A backup is already running. Finish it before creating the inspection package.');
      if(s.remaining)throw new Error('Finish the pending wallet and eight-day backup before sharing.');
      if(s.errors?.length)throw new Error('Resolve backup errors before sharing:\n'+s.errors.join('\n'));
      const r=await cloudApi({action:'create_share',wallet_keys:selected});setShare({...r,url:window.location.origin+'/inspection#'+r.token});setMessage('Inspection link created. Review the package before sending it.');await refresh();
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function older(more=false) {setBusy(true);setError('');try{const p=await cloudApi({action:'list_days',payload:more&&cursor?{before:cursor}:{}});setArchive(v=>more?[...(v||[]),...p.days]:p.days);setCursor(p.next_before);}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function openDay(row) {setBusy(true);setError('');try{const bytes=await readCloudFile({file_id:row.current_file_id,mime_type:'application/gzip',sha256:row.content_sha256});setLog({row,snapshot:JSON.parse(new TextDecoder().decode(bytes)),bytes});}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function revoke(id) {setBusy(true);try{await cloudApi({action:'revoke_share',payload:{id}});if(share?.id===id)setShare(null);await refresh();setMessage('Future access through that inspection link is blocked.');}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <main className="rr-cloud">
    <header className="rr-hero"><div><a href="/" className="rr-back">← Return to Road Ready</a><span className="rr-eyebrow">ROAD READY · PRIVATE CLOUD</span><h1>Wallet & logbook vault</h1><p>Your original documents, eight-day inspection view, and compressed log archive.</p></div>{session?<button disabled={busy} onClick={async()=>{await cloudClient().auth.signOut();setCatalog(null);setShare(null);}}>Sign out</button>:null}</header>
    {error?<section className="rr-warning rr-card" role="alert"><b>Action needs attention</b><p style={{whiteSpace:'pre-line'}}>{error}</p><small>Local records have not been deleted or replaced.</small></section>:null}
    {message?<p className="rr-status" role="status">{message}</p>:null}
    {!session?<section className="rr-card rr-login"><h2>Connect your private vault</h2><p>Sign in with your Owner Operator account. Cloud access is separate from Tepiha.</p><label>Email<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><div className="rr-actions"><button className="rr-primary" disabled={busy||!email||!password} onClick={()=>auth(false)}>Sign in</button><button disabled={busy||!email||password.length<8} onClick={()=>auth(true)}>Create account</button></div><small>Existing records on this device stay in place. Signing in does not send an inspection package.</small></section>:<>
      <section className="rr-card"><div className="rr-section-head"><div><span className="rr-eyebrow">DEVICE BACKUP</span><h2>Keep the cloud copy current</h2><p className="rr-muted">Connected as {session.user.email}</p></div><button className="rr-primary" disabled={busy} onClick={sync}>{busy?'Working…':'Back up wallet & all logs'}</button></div><p>Documents go to private Storage. Log snapshots are compressed and indexed by date. Older days load only when requested. Original versions are retained.</p><label className="rr-checkbox"><input type="checkbox" checked={automatic} onChange={e=>{enableAutoBackup(session.user.id,e.target.checked);setAutomatic(e.target.checked);}}/>Automatic backup while this app is open and online</label>{status?<p className={status.complete?'rr-ok':'rr-muted'}>{status.complete?'Latest backup pass completed.':'Backup has pending items or errors.'}{status.checkedAt?' Checked '+new Date(status.checkedAt).toLocaleString():''}</p>:<p className="rr-muted">This device has not completed its first cloud backup.</p>}</section>
      {catalog?<>
        <div className="rr-stats"><div><span>Wallet files</span><b>{catalog.wallet.length}</b></div><div><span>Saved log dates</span><b>{catalog.stats.days}</b></div><div><span>Private files & revisions</span><b>{(catalog.stats.file_bytes/1024/1024).toFixed(2)} MB</b></div></div>
        <section className="rr-card"><div className="rr-section-head"><div><span className="rr-eyebrow">ROADSIDE WINDOW</span><h2>Today + previous seven days</h2><p>{catalog.window_start} — {catalog.window_end} · {catalog.account.home_timezone}</p></div></div><div className="rr-day-cards">{eightDays(catalog.window_end).map(day=>{const row=catalog.days.find(x=>x.log_date===day);return <button key={day} disabled={!row||busy} onClick={()=>openDay(row)}><span>{day.slice(5)}</span><b>{row?'Open log':'Missing'}</b><small>{row?.summary?.certification||'No cloud record'}</small></button>;})}</div><p className="rr-muted">Missing dates are shown explicitly. No off-duty or sleeper periods are fabricated.</p></section>
        <section className="rr-card"><h2>Digital wallet</h2><p>Select only the documents to include in the officer's link.</p><div className="rr-wallet-list">{catalog.wallet.map(file=><div className="rr-wallet-row" key={file.document_key}><input aria-label={'Include '+(file.metadata.title||file.document_key)} type="checkbox" checked={selected.includes(file.document_key)} onChange={e=>setSelected(v=>e.target.checked?[...v,file.document_key]:v.filter(k=>k!==file.document_key))}/><button onClick={()=>setViewer({...file,label:file.metadata.title||file.document_key})}><b>{file.metadata.title||file.document_key}</b><small>{file.metadata.expiresOn?'Expires '+file.metadata.expiresOn:'Original document'} · Revision {file.revision}</small></button><button onClick={()=>setViewer({...file,label:file.metadata.title||file.document_key})}>Open ↗</button></div>)}</div>{!catalog.wallet.length?<p className="rr-muted">Add documents in Digital Wallet, then back up this device.</p>:null}<div className="rr-actions"><button className="rr-primary" disabled={busy} onClick={createShare}>Create 8-day inspection link</button><span>{selected.length} wallet documents selected · Link lasts 4 hours</span></div>
          {share?<div className="rr-share"><b>Review before sending</b><p>{share.log_count}/8 log dates · {share.document_count} documents</p>{share.log_count<8?<p className="rr-warning">Some log dates are missing. The officer's view will show those gaps.</p>:null}<input readOnly value={share.url} aria-label="Inspection link" onFocus={e=>e.target.select()}/><div className="rr-actions"><a className="rr-button" target="_blank" rel="noopener noreferrer" href={share.url}>Review officer view</a><button onClick={()=>navigator.clipboard?.writeText(share.url).then(()=>setMessage('Inspection link copied.')).catch(()=>setMessage('Select and copy the link above.'))}>Copy link</button><button onClick={()=>revoke(share.id)}>Revoke link</button></div></div>:null}
        </section>
        <section className="rr-card"><div className="rr-section-head"><div><h2>Older log archive</h2><p>Compressed originals stay private. No automatic deletion after eight days.</p></div><button disabled={busy} onClick={()=>older(false)}>Browse saved dates</button></div>{archive?<><div className="rr-archive">{archive.filter(x=>x.log_date<catalog.window_start).map(row=><button disabled={busy} key={row.log_date} onClick={()=>openDay(row)}><b>{row.log_date}</b><span>Revision {row.current_revision} · Open / export</span></button>)}</div>{cursor?<button disabled={busy} onClick={()=>older(true)}>Load more dates</button>:null}</>:null}</section>
        {shares.length?<section className="rr-card"><h2>Inspection access</h2>{shares.map(s=><div className="rr-access-row" key={s.id}><span>{s.starts_on} — {s.ends_on}<small>{s.revoked_at?'Revoked':'Expires '+new Date(s.expires_at).toLocaleString()}</small></span>{!s.revoked_at&&new Date(s.expires_at)>new Date()?<button disabled={busy} onClick={()=>revoke(s.id)}>Revoke</button>:null}</div>)}<p className="rr-muted">Revocation blocks new access. Files already downloaded remain with the recipient.</p></section>:null}
      </>:<section className="rr-card">Loading private cloud catalog…</section>}
    </>}
    {log?<section className="rr-log-overlay"><div className="rr-log-controls rr-no-print"><button onClick={()=>setLog(null)}>← Close log</button><button onClick={()=>saveDownload(log.bytes,'road-ready-day-'+log.row.log_date+'.json')}>Export original backup</button><button onClick={()=>window.print()}>Print / Save PDF</button></div><LogSheet day={log.row.log_date} snapshot={log.snapshot} profile={catalog?.account?.profile} zone={log.row.home_timezone} generatedAt={log.row.updated_at} endDay={catalog?.window_end}/></section>:null}
    {viewer?<DocumentViewer file={viewer} onClose={()=>setViewer(null)}/>:null}
  </main>;
}
