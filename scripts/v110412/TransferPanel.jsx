'use client';
import React,{useEffect,useRef,useState} from 'react';
import {sharePreparedBackupFile} from '../../../../lib/local-db/backupFile.js';
import {MAX_FILE_BYTES,prepareTransfer,validateTransfer} from './transferCoreV110412.js';
import {importTransfer,readTransferOriginal} from './transferStorageV110412.js';
import './transferV110412.css';

export default function TransferPanel({folder,week,folders,documents,allDocuments,businessStore,onImported}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[ready,setReady]=useState(null),[preview,setPreview]=useState(null);
  const input=useRef(null),intent=useRef('week'),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>()=>{if(ready?.url)URL.revokeObjectURL(ready.url);},[ready]);
  const kind=folder?'load':'week';
  const label=scope=>scope.kind==='load'?`Load ${scope.loadNo}`:`Week ${scope.weekStart==='undated'?'(date not set)':scope.weekStart}`;
  async function exportSelected() {
    if(busy)return;setBusy(true);setError('');setReady(null);setPreview(null);
    try {
      const result=await prepareTransfer({scope:kind,folder,week,folders,documents,allDocuments,businessStore},readTransferOriginal,(done,total)=>mounted.current&&setMessage(`Preparing ${kind}: ${done}/${total} originals…`));
      if(mounted.current){setReady({...result,url:URL.createObjectURL(result.file)});setMessage('Export ready. Save the file, then import it on your other device.');}
    }catch(failure){if(mounted.current){setError(failure.message||'Export failed.');setMessage('');}}
    finally{if(mounted.current)setBusy(false);}
  }
  function chooseImport(scope){intent.current=scope;setPreview(null);setError('');setMessage('');input.current?.click();}
  async function readFile(event) {
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    setBusy(true);setError('');setReady(null);setMessage('Checking transfer file…');
    try {
      if(file.size>MAX_FILE_BYTES)throw new Error('Transfer file is too large. Export each load separately.');
      const payload=JSON.parse(await file.text());
      const checked=await validateTransfer(payload);
      if(checked.scope.kind!==intent.current)throw new Error(`This is a ${checked.scope.kind} file. Choose Import ${checked.scope.kind}.`);
      if(mounted.current){setPreview(payload);setMessage('');}
    }catch(failure){if(mounted.current){setError(failure instanceof SyntaxError?'This file is not a valid Road Ready transfer.':failure.message);setMessage('');}}
    finally{if(mounted.current)setBusy(false);}
  }
  async function apply() {
    if(!preview||busy)return;setBusy(true);setError('');setMessage('Importing…');
    try {
      const result=await importTransfer(preview);
      if(mounted.current){setPreview(null);setMessage(`Imported ${result.addedDocuments} documents and ${result.addedRecords} records. ${result.keptDocuments} existing documents and ${result.keptRecords} existing records kept.${result.restoredOriginals?` ${result.restoredOriginals} originals restored.`:''}`);onImported?.();}
    }catch(failure){if(mounted.current){setError(`Import stopped: ${failure.message}`);setMessage('');}}
    finally{if(mounted.current)setBusy(false);}
  }
  async function share() {
    if(!ready||busy)return;setBusy(true);
    const result=await sharePreparedBackupFile(ready.file);
    if(mounted.current){setMessage(result.mode==='shared'?'Transfer shared.':result.mode==='cancelled'?'Sharing cancelled. The file is still ready.':'Tap Download transfer to save the file.');setBusy(false);}
  }
  return <div className="rr-transfer" aria-label="Load and week transfer">
    <div className="rr-transfer-actions">
      {folder||week?<button type="button" disabled={busy} onClick={exportSelected}>Export {kind}</button>:null}
      {folder||!week?<button type="button" disabled={busy} onClick={()=>chooseImport('load')}>Import load</button>:null}
      {!folder?<button type="button" disabled={busy} onClick={()=>chooseImport('week')}>Import week</button>:null}
    </div>
    <input ref={input} type="file" accept=".json,application/json" aria-label="Choose transfer file" onChange={readFile} hidden disabled={busy}/>
    {message?<p role="status">{message}</p>:null}{error?<p className="rr-docs-error" role="alert">{error}</p>:null}
    {ready?<div className="rr-transfer-review" aria-label="Prepared transfer"><strong>{label(ready.payload.scope)}</strong><p>{ready.payload.records.loads.length} {ready.payload.records.loads.length===1?'load':'loads'} · {ready.payload.documents.length} originals included</p><div className="rr-transfer-actions"><button type="button" onClick={share} disabled={busy}>Save / Share transfer</button><a href={ready.url} download={ready.file.name}>Download transfer</a></div></div>:null}
    {preview?<div className="rr-transfer-review" aria-label="Review import"><strong>{label(preview.scope)}</strong><p>{preview.records.loads.length} loads · {preview.documents.length} documents · {Object.entries(preview.records).filter(([key])=>key!=='loads').reduce((sum,[,rows])=>sum+rows.length,0)} other records</p><p>Files return to their saved load numbers and weeks. Existing records are kept. This imports document folders, fuel and expenses; driving logs and driver profiles stay unchanged.</p><div className="rr-transfer-actions"><button type="button" disabled={busy} onClick={apply}>Import {preview.scope.kind} now</button><button type="button" disabled={busy} onClick={()=>{setPreview(null);setMessage('Import cancelled.');}}>Cancel import</button></div></div>:null}
  </div>;
}
