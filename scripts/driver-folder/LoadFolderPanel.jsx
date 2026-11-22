'use client';
import React,{useState} from 'react';
import {documentType,documentIdentity,documentLabel} from './smartFolders.js';
import {createDocumentPreview} from './documentPreviewV110450.js';
import {openSource,sourceFile} from './documentActionsV110415.js';
import {reviewedEvidenceComponents} from './evidenceCoreV110413.js';
import {billingReadinessV102} from './ownerOpsStoreV102.js';
import {outlookOwnerKey} from './outlookConnectionV110320.js';
import {exactLoad} from './manualLoadCore.js';
import {persistManualStore,readBusinessStore} from './manualLoadRuntime.js';
import LoadControls from './LoadControls.jsx';
import {originalState,podReview,recordedPodReview,storeStopReview,routeStops,sendStatus} from './folderReview.js';
import './loadFolderPanel.css';

const titles = {rate_confirmation:'Rate confirmation',bol:'Bill of lading (BOL)',pod:'Signed POD',fuel_receipt:'Fuel receipts',other:'Other documents'};
function transmission(load, invoices) {
  let receipt = null;
  try {
    const owner = outlookOwnerKey();
    if (owner) receipt = JSON.parse(localStorage.getItem('road-ready-invoice-send-v110320:'+owner+':'+(load.id||load.loadNo)));
  } catch { /* Account send status is optional on a new device. */ }
  return sendStatus(receipt,invoices,load.loadNo);
}
function FileActions({sources,open,review,canReview}) {
  return sources.map(({doc,pages})=><div className="rr-folder-file" key={documentIdentity(doc)}>
    <strong>{documentLabel(doc)}</strong><small>{originalState(doc)}</small>
    <div><button type="button" onClick={()=>open(doc,pages)}>View original</button>
    {canReview ? <button type="button" onClick={()=>review(doc)}>Review signature</button> : null}</div>
  </div>);
}
export default function LoadFolderPanel({folder,rows,target,businessStore,ownerStore,onBack,onScan,onManual,onOpenLog,onBilling,onChange,onExport,exporting,exportLinks,error}){
  const [expanded,setExpanded]=useState(''),[packet,setPacket]=useState(false),[review,setReview]=useState(null),[step,setStep]=useState('');
  const [issue,setIssue]=useState(''),[busy,setBusy]=useState(false);
  const source=folder.source, load={...source,...target,notes:target?.notes||source.notes||'',stops:target?.stops?.length?target.stops:source.stops,loadNo:folder.reference};
  const stops=routeStops(load), delivery=stops.filter(s=>!s.pickup);
  const pod=rows.find(row=>row.kind==='pod');
  const signedBol=folder.documents.filter(doc=>documentType(doc)==='bol' && (doc.podSigned||doc.extracted?.podSigned||load.driverFolderPodReviews?.[doc.sha256]));
  const proofFiles=[...new Set([...(pod?.files||[]),...signedBol])], proof=podReview(load,proofFiles,doc=>reviewedEvidenceComponents(doc,['pod','delivery_evidence'],folder.reference,businessStore));
  const billing=target && billingReadinessV102(load,folder.documents,businessStore);
  const tonu=String(load.documentWorkflowStage||load.status||'').toLowerCase()==='tonu';
  const effectiveRows=rows.map(r=>r.kind==='pod'&&!r.files.length&&signedBol.length ? {...r,files:signedBol,sources:signedBol.map(doc=>({doc,pages:[]})),status:proof.blocked?'review':'saved'} : r);
  const required=effectiveRows.filter(r=>!tonu||r.kind==='rate_confirmation'), onFile=required.filter(r=>r.files.length).length;
  const submission=transmission(load,ownerStore?.invoices);
  const billingMissing=(billing?.missing||[]).filter(x=>x.id!=='pod'||proof.blocked);
  const ready=Boolean(billing && !billingMissing.length && (tonu || !proof.blocked) && required.every(r=>r.files.length && r.status!=='partial' && (r.kind==='pod'||r.status!=='review')));
  const reviewItems=required.filter(r=>r.kind!=='pod' && ['partial','review'].includes(r.status)).map(r=>titles[r.kind]);
  const toggle=kind=>{setExpanded(old=>old===kind?'':kind);setIssue('');};
  async function view(doc,pages=[]){try{setIssue('');await openSource(doc,pages);}catch(e){setIssue(e.message);}}
  async function beginReview(doc) {
    if(busy)return;
    // Both viewing and recording a review require an actual original.
    const viewer=createDocumentPreview();
    setBusy(true);setIssue('');
    try{
      const file=await sourceFile(doc),bytes=await file.arrayBuffer();
      const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
      viewer.show(file);
      setReview({doc,sha256,sourceNote:target?.notes});setStep(String(doc.stopSequence||doc.extracted?.stopSequence||''));
    }catch(e){viewer?.close();setIssue(e.message);}finally{setBusy(false);}
  }
  function recordReview(signed) {
    try{
      const store=readBusinessStore(), current=exactLoad(store,target.id,target.loadNo);
      if((current.notes||'')!==(review.sourceNote||''))throw Error('The load note changed. Reopen the folder and review the original again.');
      const sameFile=(store.documents||[]).find(d=>documentIdentity(d)===documentIdentity(review.doc) && (d.canonicalLoadNo||d.loadNo||'').toUpperCase()===folder.reference && !(d.deleted||d.deletedAt));
      if(!sameFile || String(sameFile.sha256||sameFile.content_hash||'').toLowerCase()!==review.sha256)throw Error('The saved original changed or its identity could not be confirmed. Add a checked delivery copy to this folder.');
      const record=recordedPodReview({...load,...current,notes:current.notes||load.notes,stops:current.stops?.length?current.stops:load.stops},{sha256:review.sha256},signed,step);
      persistManualStore({...store,loads:store.loads.map(item=>item===current?{...item,driverFolderPodReviews:{...item.driverFolderPodReviews,[review.sha256]:storeStopReview(item.driverFolderPodReviews?.[review.sha256],record)},updatedAt:Date.now()}:item)});
      setReview(null);onChange();setIssue('');
    }catch(e){setIssue(e.message);}
  }
  function intake(kind){return <div className="rr-folder-intake">{target?<button type="button" className="rr-folder-primary" onClick={()=>onManual(kind)}>Choose photo or PDF</button>:null}<button type="button" onClick={()=>onScan(kind==='other'?'auto':kind)}>Smart Scan</button></div>;}
  function rowView(row){
    const isPod=row.kind==='pod', alternative=row.label?.includes('(photos)')||(isPod&&proof.authorized&&!proof.blocked), needsReview=isPod && proofFiles.length && proof.blocked && !alternative;
    const label=alternative?(row.label?.includes('(photos)')?row.label:'Authorized delivery proof'):titles[row.kind];
    const status=needsReview?proof.label:row.status==='partial'?'More pages needed':row.status==='review'?'Check details':row.files.length?(isPod&&!alternative?'Receiver signature checked':'On file'):row.status==='later'?(isPod?'Add after unloading':'Add at pickup'):'Missing';
    const tone=(needsReview||['review','partial','missing'].includes(row.status))?'warn':row.files.length?'ok':'neutral';
    const visible=expanded===row.kind;
    return <section className="rr-folder-item" key={row.kind}>
      <button type="button" className="rr-folder-row" aria-label={label} aria-expanded={visible} onClick={()=>toggle(row.kind)}>
        <span className={'rr-folder-icon '+tone} aria-hidden="true">{tone==='ok'?'✓':tone==='warn'?'!':'+'}</span>
        <span><strong>{label}</strong><small>{status}</small></span><span aria-hidden="true">›</span>
      </button>
      {visible?<div className="rr-folder-options">
        <FileActions sources={row.sources} open={view} review={beginReview} canReview={Boolean(target && (isPod||row.kind==='bol') && !alternative)}/>
        {isPod && proof.note?<p className="rr-folder-note">{proof.note}</p>:null}
        {intake(row.kind)}
      </div>:null}
    </section>;
  }
  function optional(kind,docs){return <section className="rr-folder-item"><button type="button" className="rr-folder-row" aria-label={titles[kind]} aria-expanded={expanded===kind} onClick={()=>toggle(kind)}><span><strong>{titles[kind]}</strong><small>{docs.length?docs.length+' on file':'Optional'}</small></span><span>›</span></button>
    {expanded===kind?<div className="rr-folder-options"><FileActions sources={docs.map(doc=>({doc,pages:[]}))} open={view}/>{intake(kind)}</div>:null}</section>;}
  return <article className="rr-folder-panel">
    <button className="rr-folder-back" type="button" onClick={packet?()=>{setPacket(false);setExpanded('');}:onBack}>{packet?'‹ Load folder':'‹ All load folders'}</button>
    <header className="rr-folder-head"><small>{folder.shipment?'SHIPMENT / BOL':'LOAD FOLDER'}</small><div><h2>{packet?'Review factoring packet':folder.reference}</h2><span>{folder.completed?'Completed':'Active'}</span></div><p>{packet?'Load '+folder.reference:[folder.origin,folder.destination].filter(Boolean).join(' to ')}</p>{folder.broker?<p>{folder.broker}</p>:null}</header>
    {!packet && stops.length?<section className="rr-folder-card"><h3>Stops <small>{stops.length}</small></h3>{stops.map((stop,i)=><div className="rr-folder-stop" key={i}><small>{stop.pickup?'PICKUP':'DELIVERY'+(delivery.length>1?' '+stop.sequence:'')}</small><strong>{stop.name || 'Location unavailable'}</strong>{stop.address && stop.address!==stop.name?<span>{stop.address}</span>:null}{stop.date||stop.appointment?<span>{[stop.date,stop.appointment,stop.zone].filter(Boolean).join(' · ')}</span>:null}</div>)}</section>:null}
    <section className="rr-folder-card"><h3 className="rr-smart-summary">Load documents <small>{onFile} of {required.length} on file</small></h3>
      {required.map(rowView)}
    </section>
    {review?<section className="rr-folder-card"><h3>Receiver signature</h3><p>Record what you saw on the delivery original for load {folder.reference}.</p>
      {delivery.length>1?<label>Delivery stop<select value={step} onChange={e=>setStep(e.target.value)}><option value="">Choose a stop</option>{delivery.map(s=><option key={s.sequence} value={s.sequence}>{s.sequence} · {s.name}</option>)}</select></label>:null}
      <div className="rr-folder-intake"><button onClick={()=>recordReview(true)}>Receiver signature present</button><button onClick={()=>recordReview(false)}>Signature missing or unclear</button><button onClick={()=>setReview(null)}>Cancel</button></div></section>:null}
    {((proof.note&&!proof.confirmed.length)||proof.missingStops.length>0) && !tonu?<aside className="rr-folder-note"><strong>POD needs review</strong><p>{proof.note}{proof.note&&proof.missingStops.length?' ':''}{proof.missingStops.length?proof.label+'.':''}</p></aside>:null}
    {error||issue?<p role="alert" className="rr-folder-error">{issue||error}</p>:null}
    {packet?<section className="rr-folder-card"><h3>Factoring submission</h3><strong>{submission}</strong><p>{ready?'Paperwork ready for billing review. The invoice screen checks recipient, rate and original files.':(!tonu&&proof.blocked?'Check the receiver-signed POD. ':'')+(billingMissing.length||reviewItems.length?'To review: '+[...new Set([...billingMissing.map(x=>x.label),...reviewItems])].join(', ')+'.':'Review the attached originals.')}</p>
      {target && onBilling?<button className="rr-folder-primary" type="button" onClick={()=>onBilling(target.loadNo)}>Open billing for this load</button>:null}</section>:<>
      {target?<LoadControls load={{...target,...(folder.completed?{operationalStatus:'delivered'}:{})}} onChange={onChange}/>:null}
      {target&&onBilling?<button className="rr-folder-primary" type="button" onClick={()=>{setPacket(true);setExpanded('');}}>Review factoring packet</button>:null}
      <section className="rr-folder-card">{optional('fuel_receipt',folder.documents.filter(d=>documentType(d)==='fuel_receipt'))}
      <details className="rr-folder-logs"><summary>Trip logbook <small>View only</small></summary>{folder.logs.length?folder.logs.map(log=><button key={log.driverId+'/'+log.day} disabled={!log.available||!log.canOpen} onClick={()=>onOpenLog?.(log)}>{log.day} · {log.available?(log.signed?'Signed':'Unsigned'):'Unavailable'}</button>):<p>No linked days yet.</p>}</details>
      {optional('other',folder.documents.filter(d=>!['rate_confirmation','bol','pod','fuel_receipt'].includes(documentType(d))))}</section>
      {load.notes?<details className="rr-folder-card"><summary>Load notes</summary><p>{load.notes}</p></details>:null}
      {folder.documents.length?<details className="rr-folder-card"><summary>Original files</summary><button type="button" disabled={exporting} onClick={onExport}>{exporting?'Preparing…':'Download originals'}</button>{exportLinks?.map(({file,url})=><a key={url} href={url} download={file.name}>Save {file.name}</a>)}</details>:null}
    </>}
  </article>;
}
