'use client';
import React,{useRef,useState} from 'react';
import {openLibraryZip} from './libraryZipV110434.js';
import {previewLibrary,applyLibrary} from './libraryStorageV110434.js';
import './libraryV110434.css';
const display=v=>v==null||v===''?'Not set':Array.isArray(v)?v.join(', '):typeof v==='object'?JSON.stringify(v):String(v);
const labels={gross:'Amount',documentTransferDays:'Service days',documentWorkflowStage:'Document stage',operationalStatus:'Work status',serviceOutcome:'Outcome',loadNo:'Load',type:'Document type',pickupDate:'Pickup source date',deliveryDate:'Delivery source date'};
export default function ImportLibraryPanel(){
 const input=useRef(null);const [busy,setBusy]=useState(false),[progress,setProgress]=useState(null),[bundle,setBundle]=useState(null),[review,setReview]=useState(null),[accepted,setAccepted]=useState(false),[confirmedBrokers,setConfirmedBrokers]=useState([]),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function read(e){const file=e.target.files?.[0];e.target.value='';if(!file)return;setBusy(true);setError('');setMessage('');setBundle(null);setReview(null);setAccepted(false);setConfirmedBrokers([]);try{const b=await openLibraryZip(file,setProgress);const r=await previewLibrary(b,{onProgress:setProgress});setBundle(b);setReview(r);}catch(e){setError(e.message||'Could not open this package.');}finally{setBusy(false);setProgress(null);}}
 async function apply(){setBusy(true);setError('');try{const r=await applyLibrary(bundle,review,{acceptDifferences:accepted,confirmedBrokerLoads:confirmedBrokers,onProgress:setProgress});setMessage(r.already?'Already imported. Newer saved details were kept.':`Saved on this device: ${r.loads} load folders, ${r.newDocuments} new files, ${r.keptDocuments} existing files kept.`);setBundle(null);setReview(null);setAccepted(false);setConfirmedBrokers([]);}catch(e){setError(e.message||'Import failed.');}finally{setBusy(false);setProgress(null);}}
 return <section className="rr-library-panel" aria-label="Import load library">
  <div className="rr-library-heading"><span className="rr-library-icon" aria-hidden="true">↓</span><div><h3>Import documents</h3><p>Load folders · DOT · linked logbooks</p></div></div>
  <button type="button" className="rr-library-primary" disabled={busy} onClick={()=>input.current?.click()}>Choose import ZIP</button>
  <input ref={input} type="file" hidden accept=".zip,application/zip" aria-label="Choose load library ZIP" onChange={read}/>
  {busy?<p role="status">{progress?.phase||'Checking package'}{progress?` · ${progress.done} / ${progress.total}`:''}…</p>:null}
  {error?<p role="alert" className="rr-library-error">{error}</p>:null}{message?<p role="status">{message}</p>:null}
  {bundle&&review?<section aria-label="Preview load import" className="rr-library-preview">
   <h4>{bundle.manifest.loads.length} load folders</h4><p>{bundle.manifest.documents.length} originals · {bundle.manifest.logbook.length} saved driver days · {bundle.manifest.cases.length} inspection folders</p>
   <p>{review.newLoads} new loads · {review.newDocuments} new originals</p>
   {review.already?<p>This package has already been imported.</p>:<p>Completed work goes to Closed. Saved logbooks are available under each matching load.</p>}
   {review.brokerConflicts?.length?<section className="rr-library-brokers" aria-label="Review broker conflicts">
    <h4>Check the broker</h4><p>The same load number has a different saved broker. Compare the details before combining these records.</p>
    {review.brokerConflicts.map(c=><fieldset key={c.loadNo}><legend>Load {c.loadNo}</legend>
     <div className="rr-library-broker-values">{[['Saved on this device',c.saved],['From import ZIP',c.incoming]].map(([label,l])=><div key={label}><strong>{label}</strong><p>{display(l.broker)}</p><p>{display(l.origin)} → {display(l.destination)}</p><p>Amount: {display(l.gross)}</p><p>Pickup: {display(l.pickupDate)} · Delivery: {display(l.deliveryDate)}</p></div>)}</div>
     <label className="rr-library-check"><input type="checkbox" disabled={busy} checked={confirmedBrokers.includes(c.loadNo)} onChange={e=>setConfirmedBrokers(v=>e.target.checked?[...v,c.loadNo]:v.filter(n=>n!==c.loadNo))}/>Same load {c.loadNo} — use broker {c.incoming.broker} from the ZIP</label>
    </fieldset>)}
    <p className="rr-library-note">Confirm only if these are the same job. If they are different jobs, cancel and keep your saved records.</p>
   </section>:null}
   {review.differences.length?<><details><summary>{review.differences.length} saved details to update</summary><ul className="rr-library-differences">{review.differences.map(d=><li key={d.key}><strong>{d.label} · {labels[d.field]||d.field}</strong><span>Saved: {display(d.saved)}</span><span>Import: {display(d.incoming)}</span></li>)}</ul></details><label className="rr-library-check"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} disabled={busy}/>Use the imported details shown above</label></>:null}
   <p className="rr-library-note">Driving hours, signatures and payment records are preserved. Source dates that need checking stay marked for review.</p>
   <div className="rr-library-actions"><button type="button" className="rr-library-primary" disabled={busy||review.differences.length>0&&!accepted||review.brokerConflicts?.some(c=>!confirmedBrokers.includes(c.loadNo))} onClick={apply}>{review.already?'Check saved originals':'Import folders & files'}</button><button type="button" disabled={busy} onClick={()=>{setBundle(null);setReview(null);setAccepted(false);setConfirmedBrokers([]);setError('');}}>Cancel</button></div>
   <details><summary>Package coverage</summary><p>{bundle.manifest.coverageNote}</p></details>
  </section>:null}
 </section>;
}
