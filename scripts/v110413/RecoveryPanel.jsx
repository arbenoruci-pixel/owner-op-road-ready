'use client';
import React,{useRef,useState} from 'react';
import {inspectRecovery,previewRecovery,applyRecovery} from './recoveryStorageV110413.js';
import {MAX_FILE_BYTES} from './transferCoreV110412.js';
import {CATALOG,FIELD_LABELS} from './evidenceCoreV110413.js';
const labels={kind:'Document type',loadNo:'Load number',date:'Document date',gross:'Agreed amount',revenue:'Agreed amount',documentTransferDays:'Folder dates',documentWorkflowStage:'Service stage',review:'Reviewed source details'};
function display(value,field){if(value==null||value==='')return 'Not set';if(field==='kind')return CATALOG[value]?.label||value;if(typeof value==='object')return JSON.stringify(value);return String(value);}
export default function RecoveryPanel(){
  const input=useRef(null),[preview,setPreview]=useState(null),[review,setReview]=useState(null),[accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  async function read(event){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    setBusy(true);setError('');setMessage('');setPreview(null);setReview(null);setAccepted(false);
    try{if(file.size>MAX_FILE_BYTES)throw new Error('This recovery file is too large.');const p=JSON.parse(await file.text());await inspectRecovery(p);const next=await previewRecovery(p);setPreview(p);setReview(next);}catch(e){setError(e.message||'Could not open recovery file.');}finally{setBusy(false);}
  }
  async function apply(){
    setBusy(true);setError('');
    try{const result=await applyRecovery(preview,{review,acceptDifferences:accepted});setMessage(result.already?'This recovery was already applied. Newer local details were kept.':`Recovered ${result.addedDocuments} originals and reviewed ${result.corrected} document records.`);setPreview(null);setReview(null);setAccepted(false);}
    catch(e){setError('Recovery stopped: '+e.message);setAccepted(false);try{setReview(await previewRecovery(preview));}catch{setReview(null);}}
    finally{setBusy(false);}
  }
  const differences=review?.conflicts||[];
  return <div className="rr-evidence-recovery" aria-label="Reviewed recovery">
    <button type="button" disabled={busy} onClick={()=>input.current?.click()}>Import reviewed recovery</button>
    <input hidden type="file" ref={input} accept=".json,application/json" aria-label="Choose recovery file" onChange={read}/>
    {busy?<p role="status">Checking and saving originals…</p>:null}{message?<p role="status">{message}</p>:null}{error?<p role="alert">{error}</p>:null}
    {preview?<section aria-label="Review recovery">
      <h4>Review recovered documents</h4><p>{preview.transfer.documents.length} originals · {preview.documentCorrections.length} document corrections</p>
      {differences.length?<section aria-label="Recovery differences" className="rr-recovery-differences">
        <h4>{differences.length} differences to review</h4><p>Compare the details saved on this device with the reviewed recovery. No changes have been saved yet.</p>
        <ul>{differences.map(d=><li key={d.key}><strong>{d.label}</strong><span>{labels[d.field]||FIELD_LABELS[d.field]||d.field}</span><dl><dt>Saved on this device</dt><dd>{display(d.saved,d.field)}</dd><dt>Recovered from originals</dt><dd>{display(d.recovered,d.field)}</dd></dl></li>)}</ul>
        <label className="rr-evidence-check"><input type="checkbox" checked={accepted} disabled={busy} onChange={e=>setAccepted(e.target.checked)}/>Use recovered details for all {differences.length} differences</label>
      </section>:null}
      <p>Apply the listed document and load corrections. Original files and driving logs stay unchanged.</p>
      <div className="rr-evidence-actions"><button type="button" disabled={busy||!review||!!differences.length&&!accepted} onClick={apply}>Apply reviewed recovery</button><button type="button" disabled={busy} onClick={()=>{setPreview(null);setReview(null);setAccepted(false);setError('');}}>Cancel recovery</button></div>
      <details className="rr-recovery-notes"><summary>Recovery details and source notes</summary><ul>{(preview.summary||[]).slice(0,30).map((s,i)=><li key={i}>{s}</li>)}</ul>{preview.coverageNote?<p>{preview.coverageNote}</p>:null}</details>
    </section>:null}
  </div>;
}
