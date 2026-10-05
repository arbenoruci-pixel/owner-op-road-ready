'use client';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {CATEGORIES,PACKETS,catalog,filterRows,filingOf} from './evidenceWorkspaceCoreV110453.js';
import {readDocuments,addOriginal,saveFiling} from './evidenceWorkspaceStorageV110453.js';
import {preparePacket} from './evidenceWorkspacePacketV110453.js';
import {openSource} from './documentActionsV110415.js';
import './evidenceWorkspaceV110453.css';
const empty={category:'other',date:'',loadNo:'',unit:'',merchant:'',amount:'',notes:''};
const initialFilters={scenario:'all',from:'',to:'',loadNo:'',unit:'',includeUndated:true};
export default function EvidenceWorkspace({state,documents=[],onBack,loadsView,onScan,onOpenLog}){
 const [tab,setTab]=useState('files'),[docs,setDocs]=useState(documents),[query,setQuery]=useState(''),[category,setCategory]=useState(''),[review,setReview]=useState(false),[selected,setSelected]=useState(null),[draft,setDraft]=useState(empty),[incoming,setIncoming]=useState(null),[adding,setAdding]=useState(false),[filters,setFilters]=useState(initialFilters),[ready,setReady]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[limit,setLimit]=useState(50);
 const picker=useRef(),controller=useRef();
 useEffect(()=>{let live=true;const refresh=()=>readDocuments().then(rows=>{if(live)setDocs(rows);}).catch(e=>{if(live)setError(e.message);});refresh();window.addEventListener('road-ready-evidence-filed',refresh);return()=>{live=false;window.removeEventListener('road-ready-evidence-filed',refresh);controller.current?.abort();};},[]);
 useEffect(()=>{setDocs(documents);},[documents]);
 useEffect(()=>{setReady(null);},[docs,state,filters]);
 useEffect(()=>{if(!ready)return;return()=>URL.revokeObjectURL(ready.url);},[ready]);
 const rows=useMemo(()=>catalog(docs,state),[docs,state]);
 const visible=useMemo(()=>filterRows(rows,{query,category,review}),[rows,query,category,review]);
 const packetRows=useMemo(()=>filterRows(rows,filters),[rows,filters]);
 const undated=packetRows.filter(r=>!r.date).length;
 function edit(row){setSelected(row);setDraft(row.kind==='document'?{...filingOf(row.source)}:empty);setAdding(false);setError('');setMessage('');}
 async function save(e){e.preventDefault();setBusy(true);setError('');try{if(adding){if(!incoming)throw Error('Choose a photo or PDF.');const r=await addOriginal(incoming,draft);if(r.existing){edit({...catalog([r.doc],{})[0]});setMessage('This original is already saved. Its existing filing is shown below.');}else{setAdding(false);setIncoming(null);setMessage('Original saved and filed.');}}else{await saveFiling(selected.source,draft);setSelected(null);setMessage('Filing saved.');}setDocs(await readDocuments());}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function build(){setBusy(true);setError('');setReady(null);controller.current=new AbortController();try{if(filters.from&&filters.to&&filters.from>filters.to)throw Error('The end date must follow the start date.');const result=await preparePacket(packetRows,filters,{signal:controller.current.signal,onProgress:setMessage});setReady({...result,url:URL.createObjectURL(result.file)});setMessage(result.missing.length?'Packet prepared with unavailable originals listed.':'Packet prepared.');}catch(e){setError(e.name==='AbortError'?'Preparation cancelled.':e.message);}finally{setBusy(false);}}
 async function preview(row){try{setError('');await openSource(row.kind==='wallet'?{...row.source,dataUrl:row.source.attachmentDataUrl||row.source.dataUrl,original_file_name:row.name,sha256:row.source.sourceSha256}:row.source);}catch(e){setError(e.message);}}
 function field(name,label,type='text'){return <label>{label}<input type={type} value={draft[name]||''} onChange={e=>setDraft({...draft,[name]:e.target.value})} maxLength={name==='notes'?2000:180} step={type==='number'?'0.01':undefined} min={type==='number'?'0':undefined}/></label>;}
 const chooseTab=t=>{setTab(t);setSelected(null);setAdding(false);setMessage('');setError('');};
 return <section className="rr-files" aria-label="Records workspace">
  <header><button type="button" onClick={onBack} disabled={busy}>‹ Home</button><span>ROAD READY</span><button type="button" className="rr-files-add" disabled={busy} onClick={()=>{chooseTab('files');setAdding(true);setDraft(empty);setIncoming(null);}}>+ Add</button></header>
  <h1>Your records</h1><p className="rr-files-subtitle">Saved once. Ready to find.</p>
  <nav aria-label="Records views">{[['files','Files'],['loads','Loads'],['packets','Packets']].map(([id,label])=><button type="button" key={id} aria-pressed={tab===id} onClick={()=>chooseTab(id)} disabled={busy}>{label}</button>)}</nav>
  {error?<p role="alert" className="rr-files-error">{error}</p>:null}{message?<p role="status">{message}</p>:null}
  {tab==='loads'?loadsView:null}
  {tab==='files'&&!selected&&!adding?<>
   <label className="rr-files-search"><span className="rr-files-sr">Find a record</span><input type="search" placeholder="Load, receipt, truck or name" value={query} onChange={e=>{setQuery(e.target.value);setLimit(50);}}/></label>
   <div className="rr-files-filters"><label><span className="rr-files-sr">Category</span><select aria-label="Category" value={category} onChange={e=>{setCategory(e.target.value);setLimit(50);}}><option value="">All categories</option>{Object.entries(CATEGORIES).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><button type="button" aria-pressed={review} onClick={()=>{setReview(!review);setLimit(50);}}>To file</button></div>
   <div className="rr-files-count">{visible.length} records <span>{rows.filter(r=>r.kind==='document').length} saved files</span></div>
   <div className="rr-files-list">{visible.slice(0,limit).map(r=><button type="button" className="rr-files-row" key={r.id} onClick={()=>edit(r)}><span className="rr-files-icon">{r.kind==='log'?'◷':r.category==='repair'?'↗':'▤'}</span><span><strong>{r.merchant||r.name}</strong><small>{[CATEGORIES[r.category],r.date||'Undated',r.loadNo?'Load '+r.loadNo:'',r.unit?'Unit '+r.unit:''].filter(Boolean).join(' · ')}</small>{r.review?<em>{r.kind==='wallet'?'Check attachment':'To file'}</em>:null}</span><b>›</b></button>)}</div>
   {!visible.length?<div className="rr-files-empty"><h2>{rows.length?'No matching records':'Everything in one place'}</h2><p>{rows.length?'Try another search or category.':'Add a receipt, load document or truck record.'}</p></div>:null}
   {visible.length>limit?<button type="button" className="rr-files-secondary" onClick={()=>setLimit(limit+50)}>Show more</button>:null}
  </>:null}
  {tab==='files'&&(adding||selected)?<article className="rr-files-card">
   <button type="button" className="rr-files-back" disabled={busy} onClick={()=>{setSelected(null);setAdding(false);}}>‹ All files</button>
   <h2>{adding?'Add a record':selected.name}</h2>
   {adding?<><input ref={picker} type="file" accept="image/*,application/pdf" aria-label="Choose original" hidden onChange={e=>setIncoming(e.target.files?.[0]||null)}/><button type="button" className="rr-files-secondary" onClick={()=>picker.current.click()}>Choose photo or PDF</button>{incoming?<p>{incoming.name}</p>:null}</>:null}
   {selected&&(selected.kind==='document'||selected.kind==='wallet')?<button type="button" className="rr-files-secondary" onClick={()=>preview(selected)}>Open original</button>:null}
   {adding||selected?.kind==='document'?<form onSubmit={save}>
    <label>File under<select aria-label="File under" value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value})}>{Object.entries(CATEGORIES).filter(([id])=>id!=='logs').map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
    <div className="rr-files-grid">{field('date','Document date','date')}{field('amount','Amount (USD)','number')}</div>
    {field('merchant','Business / vendor')}<div className="rr-files-grid">{field('unit','Truck / trailer')}{field('loadNo','Load number')}</div>{field('notes','Notes')}
    <small>Filing details stay linked to this original.</small><button type="submit" className="rr-files-primary" disabled={busy}>{busy?'Saving…':'Save filing'}</button>
    {!adding?<details><summary>Filing history</summary>{(selected.source.evidenceFilingHistoryV1||[]).slice().reverse().map((v,i)=><p key={i}>{new Date(v.at).toLocaleString()} · {CATEGORIES[v.after?.category]||'Filed'} · {v.after?.loadNo||v.after?.merchant||''}</p>)}{!selected.source.evidenceFilingHistoryV1?.length?<p>No filing changes yet.</p>:null}</details>:null}
   </form>:<><p>{selected.notes||CATEGORIES[selected.category]}</p>{selected.kind==='log'?<><p>{selected.source.events.length} saved events</p><button type="button" onClick={onOpenLog}>Open current logbook</button></>:null}<button type="button" className="rr-files-primary" onClick={()=>{setFilters({...initialFilters,scenario:selected.kind==='log'?'inspection':'all',from:selected.date,to:selected.date,unit:selected.unit});chooseTab('packets');}}>Prepare packet</button></>}
  </article>:null}
  {tab==='packets'?<article className="rr-files-card"><h2>Gather what you need</h2><p className="rr-files-muted">Choose a purpose and a period.</p><label>Packet<select aria-label="Packet" value={filters.scenario} disabled={busy} onChange={e=>setFilters({...filters,scenario:e.target.value})}>{Object.entries(PACKETS).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
   <div className="rr-files-grid">{[['from','From'],['to','Through']].map(([key,label])=><label key={key}>{label}<input type="date" value={filters[key]} disabled={busy} onChange={e=>setFilters({...filters,[key]:e.target.value})}/></label>)}</div>
   <div className="rr-files-grid">{[['loadNo','Load number'],['unit','Truck / trailer']].map(([key,label])=><label key={key}>{label}<input value={filters[key]} disabled={busy} onChange={e=>setFilters({...filters,[key]:e.target.value})}/></label>)}</div>
   <label className="rr-files-check"><input type="checkbox" checked={filters.includeUndated} disabled={busy} onChange={e=>setFilters({...filters,includeUndated:e.target.checked})}/>Include undated records for review</label>
   <div className="rr-files-packet-count"><strong>{packetRows.length}</strong><span>records selected{undated?' · '+undated+' undated':''}</span></div>
   <details><summary>Review selected records</summary>{packetRows.map(r=><p key={r.id}>{r.name} · {r.date||'Undated'}</p>)}</details>
   <button type="button" className="rr-files-primary" disabled={busy||!packetRows.length} onClick={build}>{busy?'Preparing…':'Prepare ZIP'}</button>{busy?<button type="button" onClick={()=>controller.current?.abort()}>Cancel preparation</button>:null}
   {ready?<div className="rr-files-ready"><strong>{ready.originals} originals · {ready.records} records</strong><p>{ready.missing.length?ready.missing.length+' originals unavailable. See the included list.':'Includes original files, a readable index and CSV.'}</p><a className="rr-files-primary" href={ready.url} download={ready.file.name}>Save ZIP</a>{navigator.share&&navigator.canShare?.({files:[ready.file]})?<button type="button" className="rr-files-secondary" onClick={async()=>{try{await navigator.share({files:[ready.file]});}catch(e){if(e.name!=='AbortError')setError(e.message);}}}>Share ZIP</button>:null}</div>:null}
  </article>:null}
 </section>;
}
