'use client';
import React,{useRef,useState} from 'react';
import {inspectRecovery,applyRecovery} from './recoveryStorageV110413.js';
import {MAX_FILE_BYTES} from './transferCoreV110412.js';
export default function RecoveryPanel(){
  const input=useRef(null),[preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  async function read(event){const file=event.target.files?.[0];event.target.value='';if(!file)return;setBusy(true);setError('');setMessage('');setPreview(null);try{if(file.size>MAX_FILE_BYTES)throw new Error('This recovery file is too large.');const p=JSON.parse(await file.text());await inspectRecovery(p);setPreview(p);}catch(e){setError(e.message||'Could not open recovery file.');}finally{setBusy(false);}}
  async function apply(){setBusy(true);setError('');try{const result=await applyRecovery(preview);setMessage(result.already?'This recovery was already applied. Newer local details were kept.':`Recovered ${result.addedDocuments} originals and reviewed ${result.corrected} document records.`);setPreview(null);}catch(e){setError('Recovery stopped: '+e.message);}finally{setBusy(false);}}
  return <div className="rr-evidence-recovery" aria-label="Reviewed recovery">
    <button type="button" disabled={busy} onClick={()=>input.current?.click()}>Import reviewed recovery</button>
    <input hidden type="file" ref={input} accept=".json,application/json" aria-label="Choose recovery file" onChange={read}/>
    {busy?<p role="status">Checking and saving originals…</p>:null}{message?<p role="status">{message}</p>:null}{error?<p role="alert">{error}</p>:null}
    {preview?<section aria-label="Review recovery"><h4>Review recovered documents</h4><p>{preview.transfer.documents.length} originals · {preview.documentCorrections.length} document corrections</p><ul>{(preview.summary||[]).slice(0,30).map((s,i)=><li key={i}>{s}</li>)}</ul>{preview.coverageNote?<p>{preview.coverageNote}</p>:null}<p>Updates only the listed document and load details. Changed local fields stop the recovery for review. Originals are preserved and driving logs stay unchanged.</p><div className="rr-evidence-actions"><button type="button" disabled={busy} onClick={apply}>Apply reviewed recovery</button><button type="button" disabled={busy} onClick={()=>setPreview(null)}>Cancel recovery</button></div></section>:null}
  </div>;
}
