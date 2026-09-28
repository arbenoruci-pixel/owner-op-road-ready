'use client';
import {loadView} from './driverDocumentsV110415.js';
import {openSource,prepareLoadFiles} from './documentActionsV110415.js';
import {CATALOG} from './evidenceCoreV110413.js';
import RecoveryPanel from './RecoveryPanelV110413.jsx';
import EvidenceCenter from './EvidenceCenterV110413.jsx';
import TransferPanel from './TransferPanelV110412.jsx';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {reconcileLoadFoldersV10974} from './loadFolderReconciliationV10974.js';
import {archiveWeeks,projectArchiveState} from './archiveEvidenceV1103.js';
import {exportRoadReadyAuditPackageV10973} from './auditExportV10973.js';
import {sharePreparedBackupFile} from '../../../../lib/local-db/backupFile.js';
import RepairImportPanelV10975 from './RepairImportPanelV10975.jsx';
import {applyRepairPlanV10975,undoLastRepairV10975} from './repairImportV10975.js';
import FuelEvidenceRepairV1103 from './FuelEvidenceRepairV1103.jsx';
import SavedDocumentFilesV110344 from './SavedDocumentFilesV110344.jsx';
import WeeklyEvidenceV1103 from './WeeklyEvidenceV1103.jsx';
import {historicalLogbookDatesV10981,openAllHistoricalLogbooksPdfV10981,openCurrentMilesPdfV1103} from './historicalLogbookV10981.js';
import {markTrailerReturnedV10976,undoTrailerReturnedV10976} from './loadEvidenceV10976.js';
import {documentGroups,documentCount,documentDescription,documentId,documentLoad,documentKind,documentDate,documentStop,documentTypeOptions,visibleWeeks,savedExport,uniqueDocumentFiles} from './documentBrowserV110404.js';
import './documentsBrowserV110404.css';
import './driverDocumentsV110415.css';

const text=value=>String(value??'').trim();
function weekLabel(start) {
  if(!start || start==='undated')return 'Date not set';
  const first=new Date(start+'T12:00:00'),last=new Date(first);last.setDate(last.getDate()+6);
  return `${first.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${last.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;
}
function DocumentList({documents,openDocument,onOrganize,snapshots=false}) {
  const groups=useMemo(()=>documentGroups(documents,snapshots),[documents,snapshots]);
  if(!groups.length)return <p className="rr-docs-empty">No documents saved here yet.</p>;
  return <div className="rr-docs-groups">{groups.map(group=><section key={group.id} aria-label={group.label}>
    <h3>{group.label}<span>{group.documents.length}</span></h3>
    <ul>{group.documents.map((doc,index)=><li key={documentId(doc)||index}>
      <button className="rr-docs-file" type="button" onClick={()=>openDocument(doc)} aria-label={`Open ${group.badge}${documentDescription(doc)?' · '+documentDescription(doc):''} · ${text(doc.title||doc.original_file_name||doc.fileName)||'Document'}`}>
        <span className={`rr-docs-badge ${group.id}`} aria-hidden="true">{group.badge}</span>
        <span className="rr-docs-file-copy"><strong>{group.badge}{documentStop(doc)?` · Stop ${documentStop(doc)}`:''}</strong>
          {documentDescription(doc)?<span>{documentDescription(doc)}</span>:null}
          <small>{text(doc.title||doc.original_file_name||doc.fileName)||'Saved document'}</small>
        </span><span className="rr-docs-chevron" aria-hidden="true">›</span>
      </button>
      {onOrganize?<button type="button" className="rr-docs-organize" onClick={()=>onOrganize(doc)} aria-label={`Organize ${text(doc.title||doc.original_file_name||doc.fileName)||'document'}`}>Organize</button>:null}
    </li>)}</ul>
  </section>)}</div>;
}

export default function LoadFoldersV10969({loads=[],documents=[],state={},businessStore={},loading=false,ownerStore={},onImportMileage,onScan,onOpenLog,onContinueBilling}) {
  const [revision,setRevision]=useState(0),[weekId,setWeekId]=useState(''),[loadNo,setLoadNo]=useState(''),[query,setQuery]=useState(''),[library,setLibrary]=useState(false);
  const [auditBusy,setAuditBusy]=useState(false),[auditPackage,setAuditPackage]=useState(null),[auditSharing,setAuditSharing]=useState(false),[message,setMessage]=useState(''),[fileError,setFileError]=useState('');
  const [editing,setEditing]=useState(null),[editError,setEditError]=useState(''),[canUndo,setCanUndo]=useState(false);
  const [moreOpen,setMoreOpen]=useState(false),[attentionOnly,setAttentionOnly]=useState(false),[sourceChoice,setSourceChoice]=useState(null),[shareReady,setShareReady]=useState(null),[shareBusy,setShareBusy]=useState(false);
  const heading=useRef(null),editorHeading=useRef(null),shareGeneration=useRef(0),sourcePanel=useRef(null),sharePanel=useRef(null);
  useEffect(()=>()=>{shareGeneration.current++;},[]);
  useEffect(()=>{if(sourceChoice){sourcePanel.current?.focus({preventScroll:true});sourcePanel.current?.scrollIntoView({block:'center'});}},[sourceChoice]);
  useEffect(()=>{if(shareReady){sharePanel.current?.focus({preventScroll:true});sharePanel.current?.scrollIntoView({block:'center'});}},[shareReady]);
  useEffect(()=>()=>{shareReady?.forEach(item=>URL.revokeObjectURL(item.url));},[shareReady]);
  useEffect(()=>{const refresh=()=>{setRevision(v=>v+1);setCanUndo(false);};window.addEventListener('road-ready-repair-applied',refresh);window.addEventListener('road-ready-trailer-return-changed',refresh);return()=>{window.removeEventListener('road-ready-repair-applied',refresh);window.removeEventListener('road-ready-trailer-return-changed',refresh);};},[]);
  useEffect(()=>{if(editing){editorHeading.current?.focus({preventScroll:true});editorHeading.current?.scrollIntoView({block:'start'});}},[editing?.doc]);
  useEffect(()=>()=>{if(auditPackage?.url)URL.revokeObjectURL(auditPackage.url);},[auditPackage]);
  const model=useMemo(()=>reconcileLoadFoldersV10974({loads,documents,state,businessStore}),[loads,documents,state,businessStore,revision]);
  const {folders,reviewItems,allDocuments}=model;
  const savedFiles=useMemo(()=>uniqueDocumentFiles(allDocuments),[allDocuments]);
  const weeks=useMemo(()=>visibleWeeks(archiveWeeks(folders,projectArchiveState(state),{...businessStore,documents:allDocuments})).map(week=>({...week,id:week.start||'undated'})),[folders,state,businessStore,allDocuments]);
  const week=weeks.find(w=>w.id===weekId),folder=folders.find(f=>f.loadNo===loadNo);
  const views=useMemo(()=>new Map((folder?[folder]:week?.items||[]).map(f=>[f.loadNo,loadView(f,allDocuments,businessStore)])),[folder,week,allDocuments,businessStore]);
  const current=folder?views.get(folder.loadNo):null;
  const filtered=(week?.items||[]).filter(f=>(!attentionOnly||views.get(f.loadNo)?.attention)&&(!query||[f.loadNo,f.title,f.broker].join(' ').toLowerCase().includes(query.trim().toLowerCase())));
  const weekIndex=weeks.findIndex(w=>w.id===weekId);
  const knownLoads=useMemo(()=>new Set(folders.map(f=>text(f.loadNo).toUpperCase())),[folders]);
  const loose=(week?.documents||[]).filter(d=>!knownLoads.has(documentLoad(d)));
  const unassigned=uniqueDocumentFiles(reviewItems.filter(d=>!savedExport(d)));
  useEffect(()=>{heading.current?.focus({preventScroll:true});heading.current?.scrollIntoView({block:'start'});},[weekId,loadNo,library]);
  function navigate(nextWeek='',nextLoad='',showLibrary=false){shareGeneration.current++;setShareBusy(false);setWeekId(nextWeek);setLoadNo(nextLoad);setLibrary(showLibrary);setFileError('');setEditing(null);setEditError('');setMoreOpen(false);setSourceChoice(null);setShareReady(null);setAttentionOnly(false);}
  function organize(doc){setEditError('');setEditing({doc,loadNo:knownLoads.has(documentLoad(doc))?documentLoad(doc):'',documentType:documentKind(doc),documentDate:documentDate(doc),stopSequence:documentStop(doc)||'',ignore:false});}
  function saveOrganization(event){event.preventDefault();if(!editing)return;try{
    if(!editing.ignore&&!knownLoads.has(editing.loadNo))throw new Error('Choose the load this document belongs to.');
    const stop=Number(editing.stopSequence||0);if(!Number.isInteger(stop)||stop<0)throw new Error('Enter a whole stop number.');
    if(!editing.ignore&&documentStop(editing.doc)>0&&!stop)throw new Error('Enter the correct stop number for this document.');
    const id=documentId(editing.doc);if(!id)throw new Error('This document has no saved ID. Open its original and import it again.');
    applyRepairPlanV10975({source:'document_organizer',documentAssignments:[{documentId:id,loadNo:editing.loadNo||documentLoad(editing.doc),documentType:editing.documentType,documentDate:editing.documentDate,stopSequence:stop,ignore:editing.ignore}]});
    setEditing(null);setCanUndo(true);setMessage(editing.ignore?'Document hidden from folders. The original is kept.':`Document saved under Load ${editing.loadNo}.`);
  }catch(error){setEditError(error?.message||String(error));}}
  function undoOrganization(){if(undoLastRepairV10975()){setMessage('Last document change undone.');setCanUndo(false);}}
  async function openDocument(doc,pages=[]){setFileError('');try{await openSource(doc,pages);}catch(error){setFileError('This original could not be opened. '+(error.message||'Try again.'));}}
  function scan(kind='auto'){onScan?.({kind:CATALOG[kind]?.readerType||kind,loadNo:folder?.loadNo||'',date:week?.start||''});}
  function openRow(row){if(!row.sources.length){scan(row.kind);return;}if(row.sources.length===1){openDocument(row.sources[0].doc,row.sources[0].pages);return;}setSourceChoice(row);}
  async function prepareShare(){if(shareBusy)return;const generation=++shareGeneration.current;setShareBusy(true);setFileError('');try{const files=await prepareLoadFiles(current.files);if(generation===shareGeneration.current)setShareReady(files.map(file=>({file,url:URL.createObjectURL(file)})));}catch(error){if(generation===shareGeneration.current)setFileError(error.message);}finally{if(generation===shareGeneration.current)setShareBusy(false);}}
  async function shareFiles(){if(shareBusy||!shareReady)return;const generation=shareGeneration.current;setShareBusy(true);setFileError('');try{await navigator.share({files:shareReady.map(item=>item.file)});if(generation===shareGeneration.current)setMessage('Documents shared.');}catch(error){if(generation===shareGeneration.current&&error.name!=='AbortError')setFileError('Could not share. Download the files below.');}finally{if(generation===shareGeneration.current)setShareBusy(false);}}
  let canShare=false;try{canShare=!!shareReady&&!!navigator.canShare?.({files:shareReady.map(item=>item.file)});}catch{}
  async function exportAudit(){if(auditBusy)return;setAuditBusy(true);setMessage('Preparing documents…');try{const result=await exportRoadReadyAuditPackageV10973({folders,documents:allDocuments,state,businessStore,onProgress:({completed,total})=>setMessage(`Preparing documents ${completed}/${total}…`)});setAuditPackage({...result,url:URL.createObjectURL(result.file)});setMessage('Your document export is ready.');}catch(error){setMessage(`Could not prepare export: ${error?.message||error}`);}finally{setAuditBusy(false);}}
  async function saveAudit(){if(!auditPackage||auditSharing)return;setAuditSharing(true);try{const result=await sharePreparedBackupFile(auditPackage.file);setMessage(result.mode==='shared'?'Documents shared.':result.mode==='cancelled'?'Sharing cancelled. Your export is still ready.':'Tap Download documents to save the export.');}catch(error){setMessage(`Could not share: ${error?.message||error}`);}finally{setAuditSharing(false);}}
  const tools=<details className="rr-docs-options"><summary>More options</summary><div className="rr-docs-tool-buttons"><RepairImportPanelV10975 onApplied={()=>setRevision(v=>v+1)}/><FuelEvidenceRepairV1103 onApplied={()=>setRevision(v=>v+1)}/><button type="button" disabled={auditBusy} onClick={exportAudit}>{auditBusy?'Preparing…':'Export documents'}</button></div></details>;
  const notices=<>{fileError?<p className="rr-docs-error" role="alert">{fileError}</p>:null}{message?<p className="rr-docs-message" role="status">{message}</p>:null}{auditPackage?<div className="rr-docs-export"><p>{auditPackage.originals} originals ready{auditPackage.missingOriginals?` · ${auditPackage.missingOriginals} unavailable`:''}</p><button type="button" disabled={auditSharing} onClick={saveAudit}>Save / Share</button><a href={auditPackage.url} download={auditPackage.file.name}>Download documents</a></div>:null}</>;
  return <section className="rr-docs-browser rr-driver-documents" aria-label="Documents">
    <header className="rr-driver-toolbar">
      {weekId||library?<button type="button" className="rr-driver-back" aria-label={folder?'Back to loads':'Back to weeks'} onClick={()=>navigate(folder?weekId:'')}>‹</button>:null}
      <h2 ref={heading} tabIndex={-1}>{folder?`Load #${folder.loadNo}`:library?'All saved files':'Documents'}</h2>
      <button type="button" className="rr-driver-more" aria-label="More document options" aria-expanded={moreOpen} onClick={()=>setMoreOpen(v=>!v)}>⋯</button>
    </header>
    {moreOpen?<section className="rr-driver-tools" aria-label="More document options"><div className="rr-docs-section-title"><h3>More options</h3><button type="button" onClick={()=>setMoreOpen(false)}>Close</button></div>
      {!library?<><TransferPanel folder={folder} week={week} folders={folders} documents={documents} allDocuments={allDocuments} businessStore={businessStore} onImported={()=>setRevision(v=>v+1)}/><RecoveryPanel/>
      <EvidenceCenter hideRecovery documents={allDocuments} businessStore={businessStore} ownerStore={ownerStore} loads={folders} folder={folder} week={week} onScan={onScan} onImportMileage={onImportMileage} onOpenLog={onOpenLog}/></>:null}
      {tools}
    </section>:null}
    {current?<><div className="rr-driver-route"><h3>{current.origin}<span>→ {current.destination}</span></h3><p>{folder.isAmazon?'Amazon Relay':folder.broker||'Broker not set'}</p></div>
      <div className="rr-driver-meta"><span>{current.service}</span>{current.amount>0?<span>{new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:2}).format(current.amount)} agreed</span>:null}</div>
      {current.routeNote?<details className="rr-driver-route-note"><summary>! Check route <span>View note ›</span></summary><p>{current.routeNote}</p></details>:null}
      <EvidenceCenter compact hideRecovery documents={allDocuments} businessStore={businessStore} ownerStore={ownerStore} loads={[current.load]} folder={folder} week={week} onScan={onScan} onImportMileage={onImportMileage} onOpenLog={onOpenLog}/>
    </>:week?<><nav className="rr-driver-week" aria-label="Choose week"><button type="button" aria-label="Previous saved week" disabled={weekIndex>=weeks.length-1} onClick={()=>{navigate(weeks[weekIndex+1].id);setQuery('');}}>‹</button><strong>{weekLabel(week.id)}</strong><button type="button" aria-label="Next saved week" disabled={weekIndex<=0} onClick={()=>{navigate(weeks[weekIndex-1].id);setQuery('');}}>›</button></nav>
      <div className="rr-driver-filter" role="group" aria-label="Load filter"><button type="button" aria-pressed={!attentionOnly} onClick={()=>setAttentionOnly(false)}>All {week.items.length}</button><button type="button" aria-pressed={attentionOnly} onClick={()=>setAttentionOnly(true)}>Needs attention</button></div></>:null}
    {notices}
    {canUndo?<button className="rr-docs-back" type="button" onClick={undoOrganization}>Undo last document change</button>:null}
    {editing?<form className="rr-docs-editor" aria-label="Organize document" onSubmit={saveOrganization}>
      <h3 ref={editorHeading} tabIndex={-1}>Organize document</h3><p>{text(editing.doc.title||editing.doc.original_file_name||editing.doc.fileName)}</p>
      <label>Load<select aria-label="Load" value={editing.loadNo} onChange={e=>setEditing({...editing,loadNo:e.target.value})}><option value="">Choose a load</option>{folders.map(f=><option key={f.loadNo} value={f.loadNo}>{f.loadNo} · {f.title}</option>)}</select></label>
      <label>Document type<select aria-label="Document type" value={editing.documentType} onChange={e=>setEditing({...editing,documentType:e.target.value})}>{!documentTypeOptions.some(o=>o.value===editing.documentType)?<option value={editing.documentType}>{editing.documentType}</option>:null}{documentTypeOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      <label>Stop number (optional)<input type="number" min="0" step="1" value={editing.stopSequence} onChange={e=>setEditing({...editing,stopSequence:e.target.value})}/></label>
      <label className="rr-docs-checkbox"><input type="checkbox" checked={editing.ignore} onChange={e=>setEditing({...editing,ignore:e.target.checked})}/>Hide duplicate or test file from folders</label>
      {editError?<p role="alert" className="rr-docs-error">{editError}</p>:null}
      <div className="rr-docs-tool-buttons"><button type="submit">Save document details</button><button type="button" onClick={()=>{setEditing(null);setEditError('');}}>Cancel</button></div>
    </form>:null}
    {folder?<>
      <div className="rr-docs-section-title"><h3>Documents</h3><span>{current.onFile} of {current.rows.length} on file</span></div>
      <ul className="rr-driver-document-rows" aria-label="Load documents">{current.rows.map(row=><li key={row.id}><button type="button" onClick={()=>openRow(row)} aria-label={`${row.sources.length?'Open':'Add'} ${row.label}`}><span className="rr-driver-document-icon" aria-hidden="true">▤</span><span><strong>{row.label}</strong><small className={row.status==='ready'?'saved':row.status==='not_due'?'neutral':'warning'}>{row.status==='ready'?'✓ Saved':row.status==='review'?'! Check details':row.status==='not_due'?row.detail.replace('Expected ','Due '):'+ Add document'}{row.sources.length>1?` · ${row.sources.length} files`:''}</small></span><span className="rr-docs-chevron" aria-hidden="true">›</span></button></li>)}</ul>
      {sourceChoice?<section ref={sourcePanel} tabIndex={-1} className="rr-driver-sources" aria-label="Choose original"><div className="rr-docs-section-title"><h3>{sourceChoice.label}</h3><button type="button" onClick={()=>setSourceChoice(null)}>Close</button></div>{sourceChoice.sources.map(({doc,pages},index)=><button key={documentId(doc)||index} type="button" onClick={()=>openDocument(doc,pages)}>{text(doc.original_file_name||doc.fileName||doc.title)||'Original'}{pages.length?` · ${pages.length===1?'Page':'Pages'} ${pages.join(', ')}`:''} ›</button>)}</section>:null}
      <details className="rr-driver-originals"><summary><span>Stored in {current.files.length} original {current.files.length===1?'file':'files'}</span><b>View originals ›</b></summary><DocumentList documents={current.files} openDocument={openDocument}/></details>
      <details className="rr-docs-options"><summary>Load details</summary>
        <dl><dt>Pickup</dt><dd>{folder.origin||'Not set'}</dd><dt>Delivery</dt><dd>{folder.destination||'Not set'}</dd><dt>Notes</dt><dd>{current.load.notes||'None'}</dd><dt>Load</dt><dd>{folder.loadNo}</dd><dt>Broker</dt><dd>{folder.isAmazon?'Amazon Relay':folder.broker||'Not set'}</dd><dt>Trailer</dt><dd>{folder.trailerId||'Not set'}</dd></dl>
        <div className="rr-docs-tool-buttons">{historicalLogbookDatesV10981(folder).length?<button type="button" onClick={()=>openAllHistoricalLogbooksPdfV10981({state,folder})}>Open logbooks</button>:null}<button type="button" onClick={()=>openCurrentMilesPdfV1103({state:projectArchiveState(state),folder})}>Open mileage</button>{onContinueBilling?<button type="button" onClick={()=>onContinueBilling(folder.loadNo)}>Open billing</button>:null}{folder.trailerReturn?.required?<button type="button" onClick={()=>folder.trailerReturn.returned?undoTrailerReturnedV10976(folder.loadNo):markTrailerReturnedV10976(folder.loadNo,folder.trailerId)}>{folder.trailerReturn.returned?'Undo trailer return':'Mark trailer returned'}</button>:null}</div>
        {documentGroups(folder.documents,true).length?<details><summary>Saved logbook &amp; mileage files</summary><DocumentList documents={folder.documents||[]} snapshots openDocument={openDocument}/></details>:null}
      </details>
    </>:library?<><SavedDocumentFilesV110344 documents={savedFiles} loading={loading}/></>:week?<>
      {week.items.length>4?<label className="rr-docs-search">Find a load<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Load number, route or broker"/></label>:null}
      <div className="rr-docs-cards">{filtered.map(f=><button type="button" className="rr-docs-card" key={f.loadNo} onClick={()=>navigate(week.id,f.loadNo)}><span className="rr-docs-card-copy"><strong>{views.get(f.loadNo).origin} → {views.get(f.loadNo).destination}</strong><small>{f.isAmazon?'Amazon Relay':f.broker||'Broker not set'} · Load {f.loadNo}</small><span className="rr-driver-card-bottom"><span className={'rr-driver-status '+views.get(f.loadNo).status.tone}>{views.get(f.loadNo).status.tone==='warning'?'! ':''}{views.get(f.loadNo).status.label}</span><span>{views.get(f.loadNo).files.length} {views.get(f.loadNo).files.length===1?'file':'files'}</span></span></span><span className="rr-docs-chevron" aria-hidden="true">›</span></button>)}</div>
      {!filtered.length?<p className="rr-docs-empty">{query?'No loads match your search.':attentionOnly?'No open document checks for these loads.':'No loads saved for this week.'}</p>:null}
      {loose.length?<details className="rr-docs-options"><summary>Other documents this week ({loose.length})</summary><DocumentList documents={loose} openDocument={openDocument}/></details>:null}
      <details className="rr-docs-options"><summary>Fuel &amp; expenses</summary><WeeklyEvidenceV1103 week={week} documents={allDocuments} state={state}/></details>
    </>:<>
      {loading?<p className="rr-docs-empty" role="status">Loading documents…</p>:weeks.length?<div className="rr-docs-cards">{weeks.map(w=><button type="button" className="rr-docs-card" key={w.id} onClick={()=>{navigate(w.id);setQuery('');}}><span className="rr-docs-card-copy"><strong>{weekLabel(w.id)}</strong><span>{w.items.length} {w.items.length===1?'load':'loads'} · {w.items.reduce((n,f)=>n+documentCount(f),0)+(w.documents||[]).filter(d=>!knownLoads.has(documentLoad(d))).length} documents</span></span><span className="rr-docs-chevron" aria-hidden="true">›</span></button>)}</div>:<p className="rr-docs-empty">Your load folders will appear here when you add documents.</p>}
      {unassigned.length?<details className="rr-docs-options"><summary>Documents to organize ({unassigned.length})</summary><p>Choose a load and document type for these files.</p><DocumentList documents={unassigned} openDocument={openDocument} onOrganize={organize}/></details>:null}
      <button className="rr-docs-back" type="button" onClick={()=>navigate('','',true)}>Browse all saved files</button>
    </>}
    {!library?<div className="rr-driver-bottom-actions"><button type="button" className="rr-docs-add" onClick={()=>scan()}>+ Add document</button>{folder?<button type="button" disabled={shareBusy||!current.files.length} onClick={prepareShare}>{shareBusy?'Preparing…':'Share documents'}</button>:null}</div>:null}
    {shareReady?<section ref={sharePanel} tabIndex={-1} className="rr-driver-sources" aria-label="Share load documents"><div className="rr-docs-section-title"><h3>{shareReady.length} {shareReady.length===1?'file':'files'} ready</h3><button type="button" onClick={()=>setShareReady(null)}>Close</button></div>{canShare?<button type="button" disabled={shareBusy} onClick={shareFiles}>Share files</button>:<p>Download the originals below.</p>}{shareReady.map(({file,url},i)=><a key={i} href={url} download={file.name}>Download {file.name}</a>)}</section>:null}
  </section>;
}
