'use client';
import React,{useEffect,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {usePortalClient} from './PortalSession.jsx';
import {money,ReadState,useRead} from './Step3Workspace.jsx';
import {correctScannedReceiptTotal,listMaintenanceReceipts,saveMaintenanceReceipt,saveScannedReceipt} from './maintenanceReceipts.js';
import {scanTotalDecision} from './maintenanceScanTotal.js';
import {chicagoDay} from './financials.js';
import {maintenanceDraft} from './maintenanceReview.js';
import MaintenanceEditor from './MaintenanceEditor.jsx';
import MaintenanceHistory,{ServiceRecord} from './MaintenanceHistory.jsx';
import MaintenanceOverview,{MaintenanceIcon} from './MaintenanceOverview.jsx';
import ScanReceiptTotal from './ScanReceiptTotal.jsx';
import css from './maintenance.module.css';

const fileTypes=['application/pdf','image/jpeg','image/png'];
const editableAmount=cents=>Number.isSafeInteger(cents) ? (cents/100).toFixed(2) : '';

export default function TruckTools({operator,refresh,done,onChooseLoad,onScanStatus}) {
  const client=usePortalClient();
  const state=useRead(()=>listMaintenanceReceipts(client,operator.id),[client,operator.id,refresh]);
  const [draft,setDraft]=useState(null),[scan,setScan]=useState(null),[url,setUrl]=useState(null);
  const [Scanner,setScanner]=useState(null),[opening,setOpening]=useState(false),[progress,setProgress]=useState(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [manualDuplicate,setManualDuplicate]=useState(null);
  const fileInput=useRef(null),request=useRef(null),read=useRef(null),lock=useRef(false),mounted=useRef(false);
  const active=useRef(null);
  const file=scan?.file;
  const canScan=process.env.NEXT_PUBLIC_OPERATOR_POD_SCANNER!=='false';

  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;read.current?.abort();};},[]);
  useEffect(()=>{if(!file){setUrl(null);return;}const next=URL.createObjectURL(file);setUrl(next);return()=>URL.revokeObjectURL(next);},[file]);

  function showScan(next) {
    active.current=next;
    setScan(next);
    onScanStatus?.(next ? {phase:next.phase,message:next.message} : null);
  }
  function clear() {
    read.current?.abort();read.current=null;
    showScan(null);setError('');setManualDuplicate(null);setDraft(null);setScanner(null);
    request.current=null;
  }
  function startManual() {clear();setMessage('');setDraft(maintenanceDraft());}

  async function persistScan(job) {
    if(lock.current || active.current?.id!==job.id)return;
    lock.current=true;setError('');
    showScan({...job,phase:'saving',error:''});
    try {
      const result=job.editing
        ? await correctScannedReceiptTotal(client,operator.id,job.saved.recordId,job.saved.totalCents,job.amountCents)
        : await saveScannedReceipt(client,operator.id,job.id,job.file,job.receipt,job.amountCents,
            job.totalSource,job.recordedDate,{allowPossibleDuplicate:job.allowPossibleDuplicate===true});
      if(!mounted.current || active.current?.id!==job.id)return;
      if(result.status==='possible_duplicate'){
        showScan({...job,phase:'duplicate',duplicate:result});
        return;
      }
      if(!job.editing && !['saved','already_saved'].includes(result.status))throw Error('The save could not be confirmed. Retry this receipt.');
      const amount=Number.isSafeInteger(result.totalCents) ? money(result.totalCents) : '';
      const note=job.editing ? 'Receipt total updated' : result.status==='already_saved' ? 'Receipt already saved' : 'Receipt saved';
      showScan({...job,phase:'saved',saved:result,editing:false,error:'',message:note+(amount?' · '+amount:'')});
      done?.();
    } catch(e) {
      if(mounted.current && active.current?.id===job.id)showScan({...job,phase:'retry',error:e.message || 'Keep this receipt open and retry the save.'});
    } finally {lock.current=false;}
  }

  async function selectFile(next) {
    if(!next||lock.current)return;
    if(!fileTypes.includes(next.type)||!next.size||next.size>3*1024*1024)throw Error('Choose a PDF, JPEG or PNG original up to 3 MiB.');
    clear();setMessage('');setProgress(null);
    const job={id:crypto.randomUUID(),recordedDate:chicagoDay(),file:next,phase:'reading'};
    const control=new AbortController();
    read.current=control;showScan(job);
    let receipt;
    try {
      const {readMaintenanceReceipt}=await import('./maintenanceReceiptReader.js');
      receipt=await readMaintenanceReceipt(next,{signal:control.signal,focusTotal:true,onProgress:(fraction,label)=>{
        if(!control.signal.aborted)setProgress(prev=>({label,fraction:Math.max(prev?.fraction || 0,fraction)}));
      }});
    } catch { /* A readable original can still be saved with the driver's total. */ }
    if(control.signal.aborted || !mounted.current || active.current?.id!==job.id)return;
    read.current=null;
    const decision=scanTotalDecision(receipt);
    if(decision.status==='auto'){
      await persistScan({...job,receipt,amountCents:decision.cents,totalSource:'reader'});
    } else {
      showScan({...job,phase:decision.status,receipt,amountText:editableAmount(decision.cents),reason:decision.reason});
    }
  }

  async function openScan() {
    if(opening||Scanner||lock.current)return;
    setOpening(true);setError('');setMessage('');
    try {
      const {default:Camera}=await import('roadready-pod-scanner');
      if(!Camera)throw Error();
      if(mounted.current)setScanner(()=>Camera);
    } catch {if(mounted.current)setError('The scanner could not open. Choose a receipt file or enter the service manually.');}
    finally {if(mounted.current)setOpening(false);}
  }
  async function saveManual(form,details) {
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');
    try {
      request.current ||= crypto.randomUUID();
      const result=await saveMaintenanceReceipt(client,operator.id,request.current,new FormData(form),null,details,{allowPossibleDuplicate:Boolean(manualDuplicate)});
      if(!mounted.current)return;
      if(result.status==='possible_duplicate'){setManualDuplicate(result);return;}
      if(result.status!=='saved'&&result.status!=='already_saved')throw Error('The save could not be confirmed. Retry this receipt.');
      clear();setMessage(result.status==='already_saved'?'This service is already in your history.':
        details.totalCents!=null?'Service and expense saved.':'Maintenance record saved.');
      done?.();
    } catch(e) {if(mounted.current)setError(e.message||'The save could not be confirmed. Retry this receipt.');}
    finally {lock.current=false;if(mounted.current)setBusy(false);}
  }

  const duplicateId=scan?.duplicate?.recordId || manualDuplicate?.recordId;
  const match=duplicateId&&state.value?.find(r=>r.id===duplicateId);
  const matched=match&&<ServiceRecord record={match} client={client}/>;
  const selecting=scan && scan.phase!=='saved';
  return <div className={css.root} data-operator-update-pending={Boolean(draft||selecting||Scanner||opening||busy)}>
    <input hidden ref={fileInput} type="file" accept={fileTypes.join(',')} aria-label="Choose service receipt" onChange={e=>{
      const next=e.target.files?.[0];e.target.value='';void selectFile(next).catch(err=>setError(err.message));
    }}/>
    {selecting ? <ScanReceiptTotal key={scan.id} scan={{...scan,progress,error:error || scan.error}} originalUrl={url}
      onConfirm={cents=>persistScan({...scan,amountCents:cents,totalSource:'driver'})}
      onRetry={()=>persistScan(scan)} onSaveSeparate={()=>persistScan({...scan,allowPossibleDuplicate:true})}
      onKeepExisting={()=>{clear();setMessage('Kept the existing receipt.');}}
      onCancel={()=>{if(scan.editing){showScan({...scan,phase:'saved',editing:false,error:''});}else clear();}}
      onManual={()=>{read.current?.abort();read.current=null;showScan({...scan,phase:'confirm',amountText:''});}}
      onChooseLoad={()=>{clear();onChooseLoad(file);}} onChooseFile={()=>fileInput.current?.click()} matched={matched}/>
      : draft ? <MaintenanceEditor draft={draft} setDraft={updater=>{setManualDuplicate(null);setError('');setDraft(updater);}}
        busy={busy} duplicate={manualDuplicate} matched={matched} onSubmit={saveManual} onBack={clear} error={error}/>
      : <div className={css.dashboard}><header><h2>Truck maintenance</h2></header>
        <MaintenanceOverview records={state.value} loadError={state.error} client={client}/>
        <div className={css.captureBar}>
          {canScan && <button type="button" className={css.scanButton} disabled={opening} onClick={openScan}>
            <MaintenanceIcon name="scan"/>{opening?'Opening camera…':'Scan receipt'}
          </button>}
          <div className={css.captureOptions}>
            <button type="button" onClick={()=>fileInput.current?.click()}><MaintenanceIcon name="file"/>Choose file</button>
            <button type="button" onClick={startManual}><MaintenanceIcon name="edit"/>Manual entry</button>
          </div>
        </div>
        {(scan?.phase==='saved' || message) && <div className={css.savedNote}>
          <span role="status"><MaintenanceIcon name="check"/>{scan?.message || message}</span>
          {scan?.phase==='saved' && <div className={css.savedActions}>
            {url && <a aria-label="View original receipt" href={url} target="_blank" rel="noreferrer">View receipt</a>}
            {scan.saved?.totalSource==='reader' && Number.isSafeInteger(scan.saved.totalCents) && <button type="button" onClick={()=>
              showScan({...scan,phase:'confirm',editing:true,amountText:editableAmount(scan.saved.totalCents),reason:undefined})}>Edit total</button>}
          </div>}
        </div>}
        {error&&<p role="alert">{error}</p>}
        <ReadState state={state}>{records=><MaintenanceHistory records={records} client={client}/>}</ReadState></div>}
    {Scanner&&<Scanner purpose="maintenance" onCancel={()=>setScanner(null)}
      onChooseFile={()=>{flushSync(()=>setScanner(null));fileInput.current?.click();}} onUpload={selectFile}/>}
  </div>;
}
