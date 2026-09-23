'use client';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {reconcileLoadFoldersV10974} from './loadFolderReconciliationV10974.js';
import {archiveWeeks,projectArchiveState} from './archiveEvidenceV1103.js';
import {openVaultDocumentV102} from './documentVaultV102.js';
import {exportRoadReadyAuditPackageV10973} from './auditExportV10973.js';
import {sharePreparedBackupFile} from '../../../../lib/local-db/backupFile.js';
import RepairImportPanelV10975 from './RepairImportPanelV10975.jsx';
import FuelEvidenceRepairV1103 from './FuelEvidenceRepairV1103.jsx';
import SavedDocumentFilesV110344 from './SavedDocumentFilesV110344.jsx';
import WeeklyEvidenceV1103 from './WeeklyEvidenceV1103.jsx';
import {historicalLogbookDatesV10981,openAllHistoricalLogbooksPdfV10981,openCurrentMilesPdfV1103} from './historicalLogbookV10981.js';
import {markTrailerReturnedV10976,undoTrailerReturnedV10976} from './loadEvidenceV10976.js';
import {documentGroups,documentCount,documentDescription,documentId,documentLoad,visibleWeeks,savedExport} from './documentBrowserV110404.js';
import './documentsBrowserV110404.css';

const text=value=>String(value??'').trim();
function weekLabel(start) {
  if(!start || start==='undated')return 'Date not set';
  const first=new Date(start+'T12:00:00'),last=new Date(first);last.setDate(last.getDate()+6);
  return `${first.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${last.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;
}
function DocumentList({documents,openDocument,snapshots=false}) {
  const groups=useMemo(()=>documentGroups(documents,snapshots),[documents,snapshots]);
  if(!groups.length)return <p className="rr-docs-empty">No documents saved here yet.</p>;
  return <div className="rr-docs-groups">{groups.map(group=><section key={group.id} aria-label={group.label}>
    <h3>{group.label}<span>{group.documents.length}</span></h3>
    <ul>{group.documents.map((doc,index)=><li key={documentId(doc)||index}>
      <button className="rr-docs-file" type="button" onClick={()=>openDocument(doc)} aria-label={`Open ${group.badge}${documentDescription(doc)?' · '+documentDescription(doc):''} · ${text(doc.title||doc.original_file_name||doc.fileName)||'Document'}`}>
        <span className={`rr-docs-badge ${group.id}`} aria-hidden="true">{group.badge}</span>
        <span className="rr-docs-file-copy"><strong>{group.badge}{Number(doc.stopSequence||doc.extracted?.stopSequence||0)>0?` · Stop ${Number(doc.stopSequence||doc.extracted?.stopSequence)}`:''}</strong>
          {documentDescription(doc)?<span>{documentDescription(doc)}</span>:null}
          <small>{text(doc.title||doc.original_file_name||doc.fileName)||'Saved document'}</small>
        </span><span className="rr-docs-chevron" aria-hidden="true">›</span>
      </button>
    </li>)}</ul>
  </section>)}</div>;
}

export default function LoadFoldersV10969({loads=[],documents=[],state={},businessStore={},loading=false,onScan,onOpenLog,onContinueBilling}) {
  const [revision,setRevision]=useState(0),[weekId,setWeekId]=useState(''),[loadNo,setLoadNo]=useState(''),[query,setQuery]=useState(''),[library,setLibrary]=useState(false);
  const [auditBusy,setAuditBusy]=useState(false),[auditPackage,setAuditPackage]=useState(null),[auditSharing,setAuditSharing]=useState(false),[message,setMessage]=useState(''),[fileError,setFileError]=useState('');
  const heading=useRef(null);
  useEffect(()=>{const refresh=()=>setRevision(v=>v+1);window.addEventListener('road-ready-repair-applied',refresh);window.addEventListener('road-ready-trailer-return-changed',refresh);return()=>{window.removeEventListener('road-ready-repair-applied',refresh);window.removeEventListener('road-ready-trailer-return-changed',refresh);};},[]);
  useEffect(()=>()=>{if(auditPackage?.url)URL.revokeObjectURL(auditPackage.url);},[auditPackage]);
  const model=useMemo(()=>reconcileLoadFoldersV10974({loads,documents,state,businessStore}),[loads,documents,state,businessStore,revision]);
  const {folders,reviewItems,allDocuments}=model;
  const weeks=useMemo(()=>visibleWeeks(archiveWeeks(folders,projectArchiveState(state),{...businessStore,documents:allDocuments})).map(week=>({...week,id:week.start||'undated'})),[folders,state,businessStore,allDocuments]);
  const week=weeks.find(w=>w.id===weekId),folder=folders.find(f=>f.loadNo===loadNo);
  const filtered=(week?.items||[]).filter(f=>!query||[f.loadNo,f.title,f.broker].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const knownLoads=useMemo(()=>new Set(folders.map(f=>text(f.loadNo).toUpperCase())),[folders]);
  const loose=(week?.documents||[]).filter(d=>!knownLoads.has(documentLoad(d)));
  const unassigned=reviewItems.filter(d=>!savedExport(d));
  useEffect(()=>{heading.current?.focus({preventScroll:true});heading.current?.scrollIntoView({block:'start'});},[weekId,loadNo,library]);
  function navigate(nextWeek='',nextLoad='',showLibrary=false){setWeekId(nextWeek);setLoadNo(nextLoad);setLibrary(showLibrary);setFileError('');}
  async function openDocument(doc){setFileError('');const result=await openVaultDocumentV102(doc);if(!result?.ok)setFileError('This original could not be opened. Check your connection or open it on the device where it was saved.');}
  async function exportAudit(){if(auditBusy)return;setAuditBusy(true);setMessage('Preparing documents…');try{const result=await exportRoadReadyAuditPackageV10973({folders,documents:allDocuments,state,businessStore,onProgress:({completed,total})=>setMessage(`Preparing documents ${completed}/${total}…`)});setAuditPackage({...result,url:URL.createObjectURL(result.file)});setMessage('Your document export is ready.');}catch(error){setMessage(`Could not prepare export: ${error?.message||error}`);}finally{setAuditBusy(false);}}
  async function saveAudit(){if(!auditPackage||auditSharing)return;setAuditSharing(true);try{const result=await sharePreparedBackupFile(auditPackage.file);setMessage(result.mode==='shared'?'Documents shared.':result.mode==='cancelled'?'Sharing cancelled. Your export is still ready.':'Tap Download documents to save the export.');}catch(error){setMessage(`Could not share: ${error?.message||error}`);}finally{setAuditSharing(false);}}
  const tools=<details className="rr-docs-options"><summary>More options</summary><div className="rr-docs-tool-buttons"><RepairImportPanelV10975 onApplied={()=>setRevision(v=>v+1)}/><FuelEvidenceRepairV1103 onApplied={()=>setRevision(v=>v+1)}/><button type="button" disabled={auditBusy} onClick={exportAudit}>{auditBusy?'Preparing…':'Export documents'}</button></div></details>;
  const notices=<>{fileError?<p className="rr-docs-error" role="alert">{fileError}</p>:null}{message?<p className="rr-docs-message" role="status">{message}</p>:null}{auditPackage?<div className="rr-docs-export"><p>{auditPackage.originals} originals ready{auditPackage.missingOriginals?` · ${auditPackage.missingOriginals} unavailable`:''}</p><button type="button" disabled={auditSharing} onClick={saveAudit}>Save / Share</button><a href={auditPackage.url} download={auditPackage.file.name}>Download documents</a></div>:null}</>;
  return <section className="rr-docs-browser" aria-label="Documents">
    <nav className="rr-docs-breadcrumb" aria-label="Document navigation"><button type="button" onClick={()=>{navigate();setQuery('');}} aria-current={!weekId&&!library?'page':undefined}>Weeks</button>{weekId?<><span aria-hidden="true">/</span><button type="button" onClick={()=>navigate(weekId)} aria-current={!folder?'page':undefined}>{weekLabel(weekId)}</button></>:null}{folder?<><span aria-hidden="true">/</span><span>Load {folder.loadNo}</span></>:null}{library?<><span aria-hidden="true">/</span><span>All saved files</span></>:null}</nav>
    <header className="rr-docs-heading"><div><h2 ref={heading} tabIndex={-1}>{folder?`Load ${folder.loadNo}`:library?'All saved files':week?weekLabel(week.id):'Documents'}</h2>{folder?<><p className="rr-docs-route">{folder.title}</p><p>{folder.isAmazon?'Amazon Relay':folder.broker||'Broker not set'}</p></>:<p>{library?'Search your original files.':week?`${week.items.length} loads`:'Choose a week to see your loads.'}</p>}</div><button type="button" className="rr-docs-add" onClick={onScan}>Add scan</button></header>
    {notices}
    {folder?<>
      <div className="rr-docs-section-title"><h3>Documents</h3><span>{documentCount(folder)} saved</span></div>
      <DocumentList documents={folder.documents||[]} openDocument={openDocument}/>
      <details className="rr-docs-options"><summary>Load details &amp; other records</summary>
        <dl><dt>Load</dt><dd>{folder.loadNo}</dd><dt>Broker</dt><dd>{folder.isAmazon?'Amazon Relay':folder.broker||'Not set'}</dd><dt>Trailer</dt><dd>{folder.trailerId||'Not set'}</dd></dl>
        <div className="rr-docs-tool-buttons">{historicalLogbookDatesV10981(folder).length?<button type="button" onClick={()=>openAllHistoricalLogbooksPdfV10981({state,folder})}>Open logbooks</button>:null}<button type="button" onClick={()=>openCurrentMilesPdfV1103({state:projectArchiveState(state),folder})}>Open mileage</button>{onContinueBilling?<button type="button" onClick={()=>onContinueBilling(folder.loadNo)}>Open billing</button>:null}{folder.trailerReturn?.required?<button type="button" onClick={()=>folder.trailerReturn.returned?undoTrailerReturnedV10976(folder.loadNo):markTrailerReturnedV10976(folder.loadNo,folder.trailerId)}>{folder.trailerReturn.returned?'Undo trailer return':'Mark trailer returned'}</button>:null}</div>
        {documentGroups(folder.documents,true).length?<details><summary>Saved logbook &amp; mileage files</summary><DocumentList documents={folder.documents||[]} snapshots openDocument={openDocument}/></details>:null}
      </details>
      <button type="button" className="rr-docs-back" onClick={()=>navigate(weekId)}>‹ Back to loads</button>
    </>:library?<><SavedDocumentFilesV110344 documents={allDocuments} loading={loading}/><button type="button" className="rr-docs-back" onClick={()=>navigate()}>‹ Back to weeks</button></>:week?<>
      {week.items.length>4?<label className="rr-docs-search">Find a load<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Load number, route or broker"/></label>:null}
      <div className="rr-docs-cards">{filtered.map(f=><button type="button" className="rr-docs-card" key={f.loadNo} onClick={()=>navigate(week.id,f.loadNo)}><span className="rr-docs-card-copy"><strong>Load {f.loadNo}</strong><span>{f.title}</span><small>{f.isAmazon?'Amazon Relay':f.broker||'Broker not set'}</small><em>{documentCount(f)} documents{f.stops?.length?` · ${f.stops.length} delivery ${f.stops.length===1?'stop':'stops'}`:''}</em></span><span className="rr-docs-chevron" aria-hidden="true">›</span></button>)}</div>
      {!filtered.length?<p className="rr-docs-empty">{query?'No loads match your search.':'No loads saved for this week.'}</p>:null}
      {loose.length?<details className="rr-docs-options"><summary>Other documents this week ({loose.length})</summary><DocumentList documents={loose} openDocument={openDocument}/></details>:null}
      <details className="rr-docs-options"><summary>Fuel, expenses &amp; weekly records</summary><WeeklyEvidenceV1103 week={week} documents={allDocuments} state={state}/></details>
      <button type="button" className="rr-docs-back" onClick={()=>{navigate();setQuery('');}}>‹ Back to weeks</button>
    </>:<>
      {loading?<p className="rr-docs-empty" role="status">Loading documents…</p>:weeks.length?<div className="rr-docs-cards">{weeks.map(w=><button type="button" className="rr-docs-card" key={w.id} onClick={()=>{navigate(w.id);setQuery('');}}><span className="rr-docs-card-copy"><strong>{weekLabel(w.id)}</strong><span>{w.items.length} {w.items.length===1?'load':'loads'} · {w.items.reduce((n,f)=>n+documentCount(f),0)+(w.documents||[]).filter(d=>!knownLoads.has(documentLoad(d))).length} documents</span></span><span className="rr-docs-chevron" aria-hidden="true">›</span></button>)}</div>:<p className="rr-docs-empty">Your load folders will appear here when you add documents.</p>}
      {unassigned.length?<details className="rr-docs-options"><summary>Documents to organize ({unassigned.length})</summary><p>These files need a confirmed load or date.</p><DocumentList documents={unassigned} openDocument={openDocument}/></details>:null}
      <button className="rr-docs-back" type="button" onClick={()=>navigate('','',true)}>Browse all saved files</button>
      {tools}
    </>}
  </section>;
}
