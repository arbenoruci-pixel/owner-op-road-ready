'use client';

import React, { useMemo, useState } from 'react';
import { buildLoadFoldersV10969 } from './loadFolderEngineV10969.js';
import { openVaultDocumentV102, vaultDocumentLabelV102, vaultDocumentTypeV102 } from './documentVaultV102.js';
import './loadFoldersV10969.css';

function text(value=''){ return String(value ?? '').replace(/\s+/g,' ').trim(); }
function dateLabel(value=''){
  const raw=text(value).slice(0,10);
  const d=new Date(`${raw}T12:00:00`);
  return Number.isNaN(d.getTime())?raw:d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
}

export default function LoadFoldersV10969({ loads=[],documents=[],state={},businessStore={},loading=false,onScan,onOpenLog,onContinueBilling }){
  const [query,setQuery]=useState('');
  const [openLoadNo,setOpenLoadNo]=useState('');
  const folders=useMemo(()=>buildLoadFoldersV10969({loads,documents,state,businessStore}),[loads,documents,state,businessStore]);
  const filtered=useMemo(()=>{
    const q=text(query).toLowerCase();
    if(!q) return folders;
    return folders.filter(folder=>[folder.loadNo,folder.title,folder.broker,...folder.days].join(' ').toLowerCase().includes(q));
  },[folders,query]);
  const open=folders.find(folder=>folder.loadNo===openLoadNo)||null;

  if(open){
    return <section className="load-folder-detail-v10969">
      <button type="button" className="load-folder-back-v10969" onClick={()=>setOpenLoadNo('')}>‹ All load folders</button>
      <header className={`load-folder-detail-head-v10969 ${open.status}`}>
        <div><span>LOAD {open.loadNo}</span><h2>{open.title}</h2><p>{open.broker||'Broker not confirmed'}</p></div>
        <strong>{open.percent}%<small>{open.status==='complete'?'COMPLETE':'READY SCORE'}</small></strong>
      </header>
      {open.missing.length?<div className="load-folder-alert-v10969"><i>!</i><div><b>{open.missing.length} item{open.missing.length===1?'':'s'} need attention</b><span>{open.missing.map(item=>item.label).join(' · ')}</span></div><button type="button" onClick={onScan}>Add</button></div>:<div className="load-folder-complete-v10969"><i>✓</i><div><b>This load is complete</b><span>Required documents, logbook evidence and mileage are present.</span></div></div>}
      <div className="load-folder-checklist-v10969">{open.checklist.map(item=><article key={item.id} className={item.complete?'done':item.required?'missing':'optional'}><i>{item.complete?'✓':item.required?'!':'○'}</i><div><b>{item.label}</b><span>{item.detail}</span></div>{!item.complete&&item.required?<button type="button" onClick={item.id==='logbook'?onOpenLog:onScan}>{item.id==='logbook'?'Open':'Add'}</button>:null}</article>)}</div>
      {open.stops.length?<><div className="load-folder-section-title-v10969"><span>DELIVERY PROOF</span><b>{open.pods.length} of {open.stops.length} PODs matched</b></div><div className="load-folder-stops-v10969">{open.stops.map(stop=>{ const matched=open.pods.find(doc=>Number(doc.stopSequence||doc.stop_sequence||doc.extracted?.stopSequence||0)===Number(stop.sequence)); return <article key={stop.sequence} className={matched?'done':'missing'}><i>{matched?'✓':'!'}</i><div><span>STOP {stop.sequence}</span><b>{stop.company||[stop.city,stop.state].filter(Boolean).join(', ')||`Delivery stop ${stop.sequence}`}</b><em>{[stop.city,stop.state].filter(Boolean).join(', ')}{stop.appointment?` · ${stop.appointment}`:''}</em></div>{matched?<button type="button" onClick={()=>openVaultDocumentV102(matched)}>Open POD</button>:<button type="button" onClick={onScan}>Add POD</button>}</article>; })}</div></>:null}
      <div className="load-folder-section-title-v10969"><span>FOLDER DOCUMENTS</span><b>{open.documents.length} original file{open.documents.length===1?'':'s'}</b></div>
      <div className="load-folder-docs-v10969">{open.documents.map(document=><article key={document.local_id||document.id}><div className="owner-os-doc-icon-v102">{vaultDocumentTypeV102(document).slice(0,3).toUpperCase()}</div><div><span>{vaultDocumentLabelV102(document)}</span><b>{document.title||document.original_file_name}</b><em>{dateLabel(document.vaultDate||document.documentDate||document.created_at)}</em></div><button type="button" onClick={()=>openVaultDocumentV102(document)}>Open</button></article>)}</div>
      <div className="load-folder-actions-v10969"><button type="button" onClick={onOpenLog}>Open supporting logbook</button><button type="button" onClick={onScan}>Scan / add document</button><button type="button" className="primary" disabled={open.status!=='complete'} onClick={()=>onContinueBilling?.(open.loadNo)}>Continue to billing</button></div>
    </section>;
  }

  return <>
    <div className="owner-os-section-head-v102"><div><span>LOAD FOLDERS</span><b>{folders.length} organized load folder{folders.length===1?'':'s'}</b></div><button type="button" onClick={onScan}>+ Add document</button></div>
    <div className="load-folder-summary-v10969"><div><b>{folders.filter(folder=>folder.status==='complete').length}</b><span>Complete</span></div><div className="attention"><b>{folders.filter(folder=>folder.status==='needs_attention').length}</b><span>Need attention</span></div><div><b>{documents.length}</b><span>Original files</span></div></div>
    <div className="load-folder-search-v10969"><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search load, route, broker or date…"/></div>
    {loading?<div className="owner-os-loading-v102">Building smart load folders…</div>:filtered.length?<div className="load-folder-grid-v10969">{filtered.map(folder=><button type="button" className={`load-folder-card-v10969 ${folder.status}`} key={folder.loadNo} onClick={()=>setOpenLoadNo(folder.loadNo)}>
      <header><div><span>LOAD FOLDER</span><b>Load {folder.loadNo}</b></div><i>{folder.status==='complete'?'✓':'!'}</i></header>
      <h3>{folder.title}</h3>
      <p>{folder.broker||'Broker not confirmed'}{folder.days.length?` · ${folder.days[0]}${folder.days.length>1?`–${folder.days.at(-1)}`:''}`:''}</p>
      <div className="load-folder-progress-v10969"><span><i style={{width:`${folder.percent}%`}}/></span><b>{folder.percent}%</b></div>
      <div className="load-folder-counts-v10969"><span>{folder.counts.stops} stops</span><span>{folder.counts.bols} BOL</span><span className={folder.counts.pods<folder.counts.stops?'missing':''}>{folder.counts.pods}/{folder.counts.stops||folder.counts.pods} POD</span><span>{folder.counts.documents} files</span></div>
      {folder.missing.length?<footer><b>{folder.missing.length} item{folder.missing.length===1?'':'s'} missing</b><em>{folder.missing.slice(0,2).map(item=>item.label).join(' · ')}</em></footer>:<footer className="ready"><b>Load complete</b><em>Documents and evidence are organized</em></footer>}
    </button>)}</div>:<div className="owner-os-empty-v102"><i>+</i><b>No load folders yet</b><p>Scan a Rate Confirmation to create a load folder. BOLs, PODs, logbook days and receipts will organize automatically.</p><button type="button" onClick={onScan}>Scan Rate Confirmation</button></div>}
  </>;
}
