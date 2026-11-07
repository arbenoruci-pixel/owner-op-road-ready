'use client';
import React,{useEffect,useMemo,useState} from 'react';
import {reconcileLoadFoldersV10974} from './loadFolderReconciliationV10974.js';
import {collectShipmentScanCandidates} from '../scan/shipmentFiling.js';
import {loadView} from './driverDocumentsV110415.js';
import {openSource,prepareLoadFiles} from './documentActionsV110415.js';
import {buildSmartFolders,folderChecklist,folderSummary,documentType,documentIdentity,documentLabel,savedTime,originalSyncLabel} from './smartFolders.js';
import LoadFoldersAdvanced from './LoadFoldersV10969.jsx';
import './smartFolders.css';

export default function SmartLoadFolders(props){
 const {loads=[],documents=[],state={},businessStore={},loading=false,onScan,onOpenLog}=props;
 const [selected,setSelected]=useState(()=>{try{const value=sessionStorage.getItem('road-ready-open-load-folder')||'';sessionStorage.removeItem('road-ready-open-load-folder');return value;}catch{return '';}}),[filter,setFilter]=useState('active'),[query,setQuery]=useState(''),[revision,setRevision]=useState(0),[advanced,setAdvanced]=useState(false),[error,setError]=useState(''),[opening,setOpening]=useState(''),[share,setShare]=useState(null),[sharing,setSharing]=useState(false);
 useEffect(()=>{const refresh=()=>setRevision(v=>v+1);window.addEventListener('road-ready-repair-applied',refresh);window.addEventListener('road-ready-evidence-filed',refresh);return()=>{window.removeEventListener('road-ready-repair-applied',refresh);window.removeEventListener('road-ready-evidence-filed',refresh);};},[]);
 useEffect(()=>()=>share?.forEach(f=>URL.revokeObjectURL(f.url)),[share]);
 const model=useMemo(()=>reconcileLoadFoldersV10974({loads,documents,state,businessStore}),[loads,documents,state,businessStore,revision]);
 const smart=useMemo(()=>buildSmartFolders({folders:model.folders,documents:model.allDocuments,candidates:collectShipmentScanCandidates(state,businessStore),state,businessStore}),[model,state,businessStore]);
 const views=useMemo(()=>new Map(smart.folders.map(f=>[f.id,f.shipment?null:loadView(f.source,f.documents,businessStore)])),[smart,businessStore]);
 const checks=useMemo(()=>new Map(smart.folders.map(f=>[f.id,folderChecklist(f,views.get(f.id)?.rows)])),[smart,views]);
 const folder=smart.folders.find(f=>f.id===selected),rows=folder?checks.get(folder.id):[];
 const needle=query.trim().toLowerCase();
 const shown=smart.folders.filter(f=>(needle||filter==='all'||(filter==='completed'?f.completed:!f.completed))&&(!needle||[f.reference,f.origin,f.destination,f.broker,...f.documents.map(documentLabel)].join(' ').toLowerCase().includes(needle)));
 const go=id=>{setSelected(id);setError('');setShare(null);};
 const scan=(kind='auto')=>{if(folder)try{sessionStorage.setItem('road-ready-open-load-folder',folder.id);}catch{}onScan?.({kind,loadNo:folder?.reference||'',shipmentReference:folder?.shipment?folder.reference:'',date:''});};
 async function open(doc,pages=[]){if(opening)return;setError('');setOpening(documentIdentity(doc));try{await openSource(doc,pages);}catch(e){setError(e.message||'Could not open this document.');}finally{setOpening('');}}
 async function prepareShare(){if(sharing||!folder)return;setSharing(true);setError('');try{const files=await prepareLoadFiles(folder.documents);setShare(files.map(file=>({file,url:URL.createObjectURL(file)})));}catch(e){setError(e.message);}finally{setSharing(false);}}
 function fileRow(doc,pages=[]){return <button type="button" className="rr-smart-file" key={documentIdentity(doc)} disabled={Boolean(opening)} onClick={()=>open(doc,pages)}><span><strong>{documentLabel(doc)}</strong><small>{doc.document_date||doc.documentDate|| (savedTime(doc)?'Saved '+new Date(savedTime(doc)).toLocaleDateString('en-US'):'Saved document')}{originalSyncLabel(doc)?' · '+originalSyncLabel(doc):''}</small></span><b>{opening===documentIdentity(doc)?'Opening…':'Open ›'}</b></button>;}
 if(advanced)return <><button className="rr-smart-back" type="button" onClick={()=>setAdvanced(false)}>‹ Load folders</button><LoadFoldersAdvanced {...props}/></>;
 return <section className="rr-smart" aria-label="Smart load folders">
  {folder?<>
   <button className="rr-smart-back" type="button" onClick={()=>go('')}>‹ All load folders</button>
   <header className="rr-smart-heading"><div><small>{folder.completed?'COMPLETED':'ACTIVE'} · {folder.shipment?'SHIPMENT / BOL':'LOAD'}</small><h2>{folder.reference}</h2></div><span className={folder.completed?'rr-smart-pill complete':'rr-smart-pill'}>{folder.completed?'Completed':'Active'}</span></header>
   <p className="rr-smart-route">{folder.origin||'Pickup not set'} → {folder.destination||'Delivery not set'}</p>
   {folder.broker?<p className="rr-smart-muted">{folder.broker}</p>:null}
   <div className="rr-smart-summary"><strong>{folderSummary(rows)}</strong><span>{rows.filter(r=>r.files.length).length} / 3 document types saved</span></div>
   {error?<p className="rr-smart-error" role="alert">{error}</p>:null}
   <div className="rr-smart-checklist">{rows.map(row=><section key={row.kind} aria-label={row.label}>
    <button type="button" className="rr-smart-check" disabled={Boolean(opening)} onClick={()=>row.sources.length?open(row.sources[0].doc,row.sources[0].pages):scan(row.kind)}>
     <span className={'rr-smart-indicator '+row.status}>{row.files.length?'✓':row.status==='later'?'○':'+'}</span><span><strong>{row.label}</strong><small>{row.detail}</small></span><b>{row.sources.length===1?'Open ›':!row.sources.length?'Add ›':row.files.length+' files'}</b>
    </button>
    {row.sources.length>1?<div className="rr-smart-sources">{row.sources.map(s=>fileRow(s.doc,s.pages))}</div>:null}
   </section>)}</div>
   <section className="rr-smart-section" aria-label="Trip logbooks"><h3>Logbooks <span>{folder.logs.length} days linked</span></h3>
    {folder.logs.length?folder.logs.map(log=><button className="rr-smart-file" type="button" key={log.driverId+'/'+log.day} disabled={!log.available||!log.canOpen} onClick={()=>onOpenLog?.(log)}><span><strong>{log.day}</strong><small>{log.driverName} · {log.available?(log.signed?'Signature saved':'Not signed'):'Log unavailable'}{!log.canOpen?' · switch driver in Logbook':''}</small></span><b>{log.available&&log.canOpen?'Open ›':''}</b></button>):<p className="rr-smart-muted">Logs appear here when the trip is recorded with this load reference.</p>}
   </section>
   <section className="rr-smart-section" aria-label="Fuel receipts"><h3>Fuel receipts <span>Optional</span></h3>{folder.documents.filter(d=>documentType(d)==='fuel_receipt').map(d=>fileRow(d))}<button type="button" className="rr-smart-add" onClick={()=>scan('fuel_receipt')}>+ Add fuel receipt</button></section>
   {folder.documents.some(d=>!['rate_confirmation','bol','pod','fuel_receipt'].includes(documentType(d)))?<section className="rr-smart-section"><h3>Other load documents</h3>{folder.documents.filter(d=>!['rate_confirmation','bol','pod','fuel_receipt'].includes(documentType(d))).map(d=>fileRow(d))}</section>:null}
   <div className="rr-smart-actions"><button type="button" onClick={()=>scan()}>+ Add document</button><button type="button" disabled={sharing||!folder.documents.length} onClick={prepareShare}>{sharing?'Preparing…':'Share documents'}</button></div>
   {share?<div className="rr-smart-section" role="region" aria-label="Share load documents"><h3>Original files</h3>{share.map(({file,url},i)=><a key={i} href={url} download={file.name}>Save {file.name}</a>)}</div>:null}
  </>:<>
   <h2>Load folders</h2><p className="rr-smart-muted">One trip. All its paperwork.</p>
   <label className="rr-smart-search"><span>Find a load</span><input type="search" placeholder="Load, BOL, broker or destination" value={query} onChange={e=>setQuery(e.target.value)}/></label>
   <div className="rr-smart-tabs" role="group" aria-label="Load status">{[['active','Active'],['completed','Completed'],['all','All']].map(([id,label])=><button type="button" key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label} <span>{smart.folders.filter(f=>id==='all'||(id==='completed'?f.completed:!f.completed)).length}</span></button>)}</div>
   {needle?<p className="rr-smart-muted">Searching active and completed loads</p>:null}
   {loading?<p role="status">Loading folders…</p>:null}
   <div className="rr-smart-cards">{shown.map(f=><button type="button" className="rr-smart-card" key={f.id} onClick={()=>go(f.id)}><span className="rr-smart-card-head"><strong>{f.shipment?'Shipment / BOL':'Load'} {f.reference}</strong><b>›</b></span><span>{f.origin||'Pickup not set'} → {f.destination||'Delivery not set'}</span>{f.broker?<small>{f.broker}</small>:null}<span className="rr-smart-card-bottom"><strong>{folderSummary(checks.get(f.id))}</strong><small>{f.documents.length} files · {f.logs.length} log days</small></span></button>)}</div>
   {!shown.length&&!loading?<p className="rr-smart-empty">{needle?'No matching load. Try its BOL or destination.':filter==='active'?'No active loads. Your finished trips are in Completed.':'No loads in this view yet.'}</p>:null}
   {smart.unfiled.length?<details className="rr-smart-section"><summary>Unfiled documents ({smart.unfiled.length})</summary><p className="rr-smart-muted">These originals need a load link.</p>{error?<p role="alert" className="rr-smart-error">{error}</p>:null}{smart.unfiled.slice(0,20).map(d=>fileRow(d))}<button type="button" className="rr-smart-add" onClick={()=>setAdvanced(true)}>Assign documents to a load</button></details>:null}
   <button type="button" className="rr-smart-add" onClick={()=>onScan?.({kind:'rate_confirmation'})}>+ New load / Ratecon</button>
  </>}
  <details className="rr-smart-options"><summary>More options</summary><button type="button" onClick={()=>setAdvanced(true)}>Organize files, weekly archive &amp; exports</button></details>
 </section>;
}
