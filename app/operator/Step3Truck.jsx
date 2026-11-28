'use client';
import React,{useEffect,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {usePortalClient} from './PortalSession.jsx';
import {ReadState,useRead} from './Step3Workspace.jsx';
import {listMaintenanceReceipts,saveMaintenanceReceipt} from './maintenanceReceipts.js';
import {maintenanceDraft} from './maintenanceReview.js';
import MaintenanceEditor from './MaintenanceEditor.jsx';
import MaintenanceHistory,{ServiceRecord} from './MaintenanceHistory.jsx';
import css from './maintenance.module.css';

const fileTypes=['application/pdf','image/jpeg','image/png'];
export default function TruckTools({operator,refresh,done,onChooseLoad}) {
  const client=usePortalClient();
  const state=useRead(()=>listMaintenanceReceipts(client,operator.id),[client,operator.id,refresh]);
  const [draft,setDraft]=useState(null),[file,setFile]=useState(null),[url,setUrl]=useState(null);
  const [Scanner,setScanner]=useState(null),[opening,setOpening]=useState(false),[reading,setReading]=useState(false);
  const [progress,setProgress]=useState(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[duplicate,setDuplicate]=useState(null);
  const fileInput=useRef(null),request=useRef(null),read=useRef(null),lock=useRef(false),mounted=useRef(false);
  const canScan=process.env.NEXT_PUBLIC_OPERATOR_POD_SCANNER!=='false';

  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;read.current?.abort();};},[]);
  useEffect(()=>{if(!file){setUrl(null);return;}const next=URL.createObjectURL(file);setUrl(next);return()=>URL.revokeObjectURL(next);},[file]);
  function clear() {
    read.current?.abort();read.current=null;setReading(false);setError('');setDuplicate(null);
    setDraft(null);setFile(null);setScanner(null);request.current=null;
  }
  function startManual() {clear();setMessage('');setDraft(maintenanceDraft());}
  async function selectFile(next) {
    if(!next)return;
    if(!fileTypes.includes(next.type)||!next.size||next.size>3*1024*1024) {
      throw Error('Choose a PDF, JPEG or PNG original up to 3 MiB.');
    }
    clear();setMessage('');setProgress(null);setFile(next);setDraft(maintenanceDraft(null,true));
    const control=new AbortController();read.current=control;setReading(true);
    try {
      const {readMaintenanceReceipt}=await import('./maintenanceReceiptReader.js');
      const result=await readMaintenanceReceipt(next,{signal:control.signal,onProgress:(fraction,label)=>{
        if(!control.signal.aborted)setProgress(prev=>({label,fraction:Math.max(prev?.fraction || 0,fraction)}));
      }});
      if(!control.signal.aborted)setDraft(maintenanceDraft(result,true));
    } catch(e) {
      if(!control.signal.aborted)setError(e.message||'The receipt could not be read. Enter its details below.');
    } finally {if(!control.signal.aborted){read.current=null;setReading(false);}}
  }
  async function openScan() {
    if(opening||Scanner)return;
    setOpening(true);setError('');setMessage('');
    try {
      const {default:Camera}=await import('roadready-pod-scanner');
      if(!Camera)throw Error();
      if(mounted.current)setScanner(()=>Camera);
    } catch {if(mounted.current)setError('The scanner could not open. Choose a receipt file or enter the service manually.');}
    finally {if(mounted.current)setOpening(false);}
  }
  async function save(form,details) {
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');
    try {
      request.current ||= crypto.randomUUID();
      const result=await saveMaintenanceReceipt(client,operator.id,request.current,new FormData(form),file,details,{allowPossibleDuplicate:Boolean(duplicate)});
      if(result.status==='possible_duplicate'){setDuplicate(result);return;}
      if(result.status!=='saved'&&result.status!=='already_saved')throw Error('The save could not be confirmed. Retry this receipt.');
      clear();setMessage(result.status==='already_saved'?'This service is already in your history.':
        details.totalCents!=null?'Service and expense saved.':'Maintenance record saved.');
      done?.();
    } catch(e) {setError(e.message||'The save could not be confirmed. Retry this receipt.');}
    finally {lock.current=false;setBusy(false);}
  }
  const matched=duplicate&&state.value?.find(r=>r.id===duplicate.recordId);
  return <div className={css.root} data-operator-update-pending={Boolean(draft||Scanner||opening||reading||busy)}>
    <input hidden ref={fileInput} type="file" accept={fileTypes.join(',')} aria-label="Choose service receipt" onChange={e=>{
      const next=e.target.files?.[0];e.target.value='';void selectFile(next).catch(err=>setError(err.message));
    }}/>
    {draft ? <MaintenanceEditor draft={draft} setDraft={updater=>{setDuplicate(null);setError('');setDraft(updater);}} file={file}
      originalUrl={url} reading={reading} progress={progress} onSkip={()=>{read.current?.abort();read.current=null;setReading(false);}}
      onChooseLoad={onChooseLoad} onRetake={canScan ? openScan : undefined} onChooseReceipt={()=>fileInput.current?.click()}
      busy={busy} duplicate={duplicate} matched={matched&&<ServiceRecord record={matched} client={client}/>} onSubmit={save} onBack={clear} error={error}/>
      : <div className={css.page}><header><h2>Truck maintenance</h2></header>
        {message && <p role="status" className={css.match}>{message}</p>}
        <div className={css.actions}>
          {canScan&&<button type="button" className={css.primary} disabled={opening} onClick={openScan}>{opening?'Opening camera…':'Scan receipt'}</button>}
          <button type="button" onClick={()=>fileInput.current?.click()}>Choose file</button>
          <button type="button" onClick={startManual}>Manual entry</button>
        </div>
        {error&&<p role="alert">{error}</p>}
        <ReadState state={state}>{records=><MaintenanceHistory records={records} client={client}/>}</ReadState></div>}
    {Scanner&&<Scanner purpose="maintenance" onCancel={()=>setScanner(null)}
      onChooseFile={()=>{flushSync(()=>setScanner(null));fileInput.current?.click();}} onUpload={selectFile}/>}
  </div>;
}
