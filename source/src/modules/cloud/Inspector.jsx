'use client';
import React, { useEffect, useState } from 'react';
import { cloudApi, readCloudFile } from '../../../../lib/owner-op-cloud/client.js';
import { dailyModel, durationLabel, eightDays, minuteAt, timeLabel } from '../../../../lib/owner-op-cloud/core.js';
import './cloud.css';
const STATUSES = ['OFF','SB','D','ON'];
function text(v) { return typeof v === 'string' || typeof v === 'number' ? String(v) : ''; }
function signatureSource(snapshot) {
  if (!snapshot?.dayData?.signature?.signed) return null;
  const s = snapshot.dayData.signature, d = snapshot.driverSignature;
  const src = s.signatureDataUrl || s.dataUrl || d?.signatureDataUrl || d?.dataUrl || (typeof d === 'string' ? d : '');
  return /^data:image\/(png|jpeg|webp);base64,/.test(src) ? src : null;
}
export function LogSheet({ day, snapshot, profile = {}, generatedAt, endDay, zone, error }) {
  const cutoff = day === endDay && generatedAt ? minuteAt(generatedAt, zone || 'America/Chicago') : 1440;
  const model = snapshot ? dailyModel(snapshot, cutoff) : null;
  const sourceProfile = snapshot?.profileAtBackup || profile;
  const signature = signatureSource(snapshot);
  const x = min => 65 + Math.max(0, Math.min(1440, min)) / 1440 * 850;
  const y = status => 57 + STATUSES.indexOf(status) * 37;
  return <article className="rr-day">
    <header className="rr-day-heading"><div><span className="rr-eyebrow">ROAD READY · MANUAL RODS</span><h2>Driver daily log</h2></div><div><strong>{day}</strong><small>{snapshot?.homeTerminalTimeZone || zone}</small></div></header>
    <div className="rr-log-meta"><div><span>Driver</span><b>{text(sourceProfile.driverName) || text(profile.driverName) || 'Not provided'}</b></div><div><span>Motor carrier</span><b>{text(sourceProfile.carrierName) || text(profile.carrierName) || 'Not provided'}</b></div><div><span>Unit / trailer</span><b>{[text(sourceProfile.unit),text(sourceProfile.trailer)].filter(Boolean).join(' / ') || 'Not provided'}</b></div><div><span>USDOT</span><b>{text(sourceProfile.usdot) || text(profile.usdot) || 'Not provided'}</b></div></div>
    {!snapshot ? <div className="rr-warning"><b>Record unavailable</b><p>{error || 'No cloud record was included for this date. No duty status has been inferred.'}</p></div> : <>
      <div className="rr-log-address"><span>Home terminal: {text(sourceProfile.homeTerminal) || 'Not provided'}</span><span>Main office: {text(sourceProfile.mainOffice) || 'Not provided'}</span></div>
      <svg className="rr-log-grid" viewBox="0 0 960 220" role="img" aria-label={'Duty-status graph for ' + day}>
        {Array.from({length:25},(_,h)=><g key={h}><line x1={x(h*60)} x2={x(h*60)} y1="35" y2="186" className={h%6===0?'rr-grid-major':'rr-grid-minor'}/><text x={x(h*60)} y="22" textAnchor="middle">{h}</text></g>)}
        {STATUSES.map(s=><g key={s}><text x="4" y={y(s)+4}>{s}</text><line x1="65" x2="915" y1={y(s)+18} y2={y(s)+18} className="rr-grid-major"/></g>)}
        {model.rows.filter(r=>r.valid&&r.start<cutoff).map((r,i,rows)=><g key={r.id||i}><line x1={x(r.start)} x2={x(Math.min(r.end,cutoff))} y1={y(r.status)} y2={y(r.status)} className="rr-duty-line"/>{rows[i+1]&&r.end===rows[i+1].start&&r.end<=cutoff?<line x1={x(r.end)} x2={x(r.end)} y1={y(r.status)} y2={y(rows[i+1].status)} className="rr-duty-transition"/>:null}</g>)}
        {cutoff<1440?<line x1={x(cutoff)} x2={x(cutoff)} y1="35" y2="190" className="rr-cutoff"/>:null}
        <text x="65" y="211">{cutoff<1440?'Current day · shown through '+timeLabel(cutoff):'24-hour timeline · source events shown without automatic gap filling'}</text>
      </svg>
      <div className="rr-totals">{STATUSES.map(s=><div key={s}><span>{s}</span><b>{durationLabel(model.totals[s])}</b></div>)}<div><span>Recorded miles</span><b>{model.miles===null?'Not recorded':model.miles}</b></div></div>
      <div className="rr-cert"><b>Certification recorded:</b> {text(snapshot.dayData.certifyStatus)||'Not certified'}{snapshot.dayData.signature?.signedAt?<span> · {new Date(snapshot.dayData.signature.signedAt).toLocaleString()}</span>:null}{signature?<img src={signature} alt="Saved driver signature"/>:null}</div>
      {model.warnings.length?<details className="rr-warning" open><summary>Record completeness checks ({model.warnings.length})</summary>{model.warnings.map((w,i)=><p key={i}>{w}</p>)}</details>:null}
      <div className="rr-table-wrap"><table className="rr-events"><thead><tr><th>Duty</th><th>Start</th><th>End</th><th>Location</th><th>Remarks / source</th></tr></thead><tbody>{model.rows.map((r,i)=><tr key={r.id||i}><td><b>{r.status||'Missing'}</b></td><td>{timeLabel(r.start)}</td><td>{timeLabel(r.end)}</td><td>{[text(r.city),text(r.state)].filter(Boolean).join(', ')||text(r.location)||'Not recorded'}</td><td>{text(r.note)||text(r.description)||'—'}{r.changeReason||r.editReason?<small>Change: {text(r.changeReason||r.editReason)}</small>:null}<small>{text(r.source)}</small></td></tr>)}</tbody></table></div>
    </>}
    <footer className="rr-log-footer">Read-only inspection copy · Original records are preserved · {generatedAt ? 'Package generated '+new Date(generatedAt).toLocaleString() : 'Private cloud archive'}</footer>
  </article>;
}
export function DocumentViewer({ file, token, onClose }) {
  const [url,setUrl]=useState(''),[error,setError]=useState('');
  useEffect(()=>{let cancelled=false,objectUrl='';readCloudFile(file,token).then(bytes=>{if(cancelled)return;objectUrl=URL.createObjectURL(new Blob([bytes],{type:file.mime_type}));setUrl(objectUrl);}).catch(e=>setError(e.message));return()=>{cancelled=true;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[file,token]);
  return <div className="rr-viewer" role="dialog" aria-modal="true" aria-label="Document viewer"><header><b>{file.label||file.metadata?.title||file.original_name||'Document'}</b><div>{url?<a href={url} target="_blank" rel="noopener noreferrer">Open original</a>:null}<button onClick={onClose}>Close</button></div></header>{error?<p role="alert">{error}</p>:!url?<p>Loading verified document…</p>:file.mime_type==='application/pdf'?<iframe src={url} title="Original PDF" sandbox="allow-same-origin" referrerPolicy="no-referrer"/>:<img src={url} alt={file.label||'Document'}/>}</div>;
}
export default function Inspector() {
  const [token,setToken]=useState(''),[manifest,setManifest]=useState(null),[logs,setLogs]=useState({}),[errors,setErrors]=useState({}),[fatal,setFatal]=useState(''),[viewer,setViewer]=useState(null),[loaded,setLoaded]=useState(false);
  useEffect(()=>{
    const capability=window.location.hash.slice(1);setToken(capability);let cancelled=false;
    (async()=>{try{
      const m=await cloudApi({action:'inspect',token:capability});if(cancelled)return;setManifest(m);
      const entries=m.items.filter(x=>x.kind==='log');
      for(let i=0;i<entries.length;i+=2){await Promise.all(entries.slice(i,i+2).map(async file=>{try{const bytes=await readCloudFile(file,capability);const payload=JSON.parse(new TextDecoder().decode(bytes));if(payload.sourceDay!==file.log_date)throw new Error('Log date integrity check failed');if(!cancelled)setLogs(v=>({...v,[file.log_date]:payload}));}catch(e){if(!cancelled)setErrors(v=>({...v,[file.log_date]:e.message}));}}));}
      if(!cancelled)setLoaded(true);
    }catch(e){if(!cancelled)setFatal(e.message);}})();return()=>{cancelled=true;};
  },[]);
  return <main className="rr-cloud rr-inspection">
    <header className="rr-hero"><div><span className="rr-eyebrow">ROAD READY · ROADSIDE INSPECTION</span><h1>Driver records</h1><p>A read-only package of selected documents and eight daily log dates.</p></div>{manifest?<button className="rr-primary rr-no-print" onClick={()=>window.print()} disabled={!loaded}>Print / Save PDF</button>:null}</header>
    {fatal?<section className="rr-card rr-warning" role="alert"><h2>This inspection link is unavailable</h2><p>{fatal}</p><p>Ask the driver for a new inspection link or the offline copies.</p></section>:!manifest?<section className="rr-card">Opening inspection package…</section>:<>
      <section className="rr-card"><div className="rr-log-meta"><div><span>Driver</span><b>{manifest.profile?.driverName||'Not provided'}</b></div><div><span>Motor carrier</span><b>{manifest.profile?.carrierName||'Not provided'}</b></div><div><span>Log dates</span><b>{manifest.starts_on} — {manifest.ends_on}</b></div><div><span>Home-terminal time</span><b>{manifest.home_timezone}</b></div></div><p className="rr-muted">Snapshot generated {new Date(manifest.generated_at).toLocaleString()}. Link expires {new Date(manifest.expires_at).toLocaleString()}.</p></section>
      <section className="rr-card"><h2>Selected wallet documents</h2><div className="rr-documents">{manifest.items.filter(x=>x.kind==='wallet').map(file=><button key={file.item_key} onClick={()=>setViewer(file)}><span className="rr-file-icon">{file.mime_type==='application/pdf'?'PDF':'IMG'}</span><span><b>{file.label}</b><small>{file.metadata?.expiresOn?'Expires '+file.metadata.expiresOn:'Original document'} · {(file.size_bytes/1024).toFixed(0)} KB</small></span><span>Open ↗</span></button>)}</div>{!manifest.items.some(x=>x.kind==='wallet')?<p>No wallet documents were selected for this package.</p>:null}</section>
      <nav className="rr-date-nav rr-no-print">{eightDays(manifest.ends_on).map(day=><a key={day} href={'#day-'+day} onClick={e=>{e.preventDefault();document.getElementById('day-'+day)?.scrollIntoView({behavior:'smooth'});}}>{day.slice(5)}</a>)}</nav>
      {!loaded?<p className="rr-no-print" role="status">Loading and verifying saved logs…</p>:null}
      {eightDays(manifest.ends_on).map(day=><div id={'day-'+day} key={day}><LogSheet day={day} snapshot={logs[day]} profile={manifest.profile} generatedAt={manifest.generated_at} endDay={manifest.ends_on} zone={manifest.home_timezone} error={errors[day]||(!loaded&&manifest.items.some(x=>x.log_date===day)?'Loading saved record…':null)}/></div>)}
      <p className="rr-muted rr-no-print">The driver controls this time-limited link. Downloads already obtained remain with their recipient. Wallet originals open separately from the printable daily-log packet.</p>
    </>}
    {viewer?<DocumentViewer file={viewer} token={token} onClose={()=>setViewer(null)}/>:null}
  </main>;
}
