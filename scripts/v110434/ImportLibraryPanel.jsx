'use client';
import React,{useRef,useState} from 'react';
import {openLibraryZip} from './libraryZipV110434.js';
import {previewLibrary,applyLibrary} from './libraryStorageV110434.js';
import './libraryV110434.css';
const display=v=>v==null||v===''?'Not set':Array.isArray(v)?v.join(', '):typeof v==='object'?JSON.stringify(v):String(v);
const labels={gross:'Amount',documentTransferDays:'Service days',documentWorkflowStage:'Document stage',operationalStatus:'Work status',serviceOutcome:'Outcome',loadNo:'Load',type:'Document type',pickupDate:'Pickup source date',deliveryDate:'Delivery source date'};
export default function ImportLibraryPanel(){
 const input=useRef(null);const [busy,setBusy]=useState(false),[progress,setProgress]=useState(null),[bundle,setBundle]=useState(null),[review,setReview]=useState(null),[accepted,setAccepted]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function read(e){const file=e.target.files?.[0];e.target.value='';if(!file)return;setBusy(true);setError('');setMessage('');setBundle(null);setReview(null);setAccepted(false);try{const b=await openLibraryZip(file,setProgress);const r=await previewLibrary(b,{onProgress:setProgress});setBundle(b);setReview(r);}catch(e){setError(e.message||'Could not open this package.');}finally{setBusy(false);setProgress(null);}}
 async function apply(){setBusy(true);setError('');try{const r=await applyLibrary(bundle,review,{acceptDifferences:accepted,onProgress:setProgress});setMessage(r.already?'Already imported. Newer saved details were kept.':`Saved on this device: ${r.loads} load folders, ${r.newDocuments} new files, ${r.keptDocuments} existing files kept.`);setBundle(null);setReview(null);setAccepted(false);}catch(e){setError(e.message||'Import failed.');}finally{setBusy(false);setProgress(null);}}
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
   {review.differences.length?<><details><summary>{review.differences.length} saved details to update</summary><ul className="rr-library-differences">{review.differences.map(d=><li key={d.key}><strong>{d.label} · {labels[d.field]||d.field}</strong><span>Saved: {display(d.saved)}</span><span>Import: {display(d.incoming)}</span></li>)}</ul></details><label className="rr-library-check"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} disabled={busy}/>Use the imported details shown above</label></>:null}
   <p className="rr-library-note">Driving hours, signatures and payment records are preserved. Source dates that need checking stay marked for review.</p>
   <div className="rr-library-actions"><button type="button" className="rr-library-primary" disabled={busy||review.differences.length>0&&!accepted} onClick={apply}>{review.already?'Check saved originals':'Import folders & files'}</button><button type="button" disabled={busy} onClick={()=>{setBundle(null);setReview(null);setAccepted(false);setError('');}}>Cancel</button></div>
   <details><summary>Package coverage</summary><p>{bundle.manifest.coverageNote}</p></details>
  </section>:null}
 </section>;
}
