'use client';

import React,{useRef,useState} from 'react';
import {inspectRepairImportV10975,applyRepairPlanV10975,undoLastRepairV10975,repairSummaryV10975} from './repairImportV10975.js';
import './repairImportV10975.css';

export default function RepairImportPanelV10975({onApplied}){
  const inputRef=useRef(null); const [open,setOpen]=useState(false); const [busy,setBusy]=useState(false); const [inspection,setInspection]=useState(null); const [error,setError]=useState(''); const [message,setMessage]=useState('');
  async function choose(event){const file=event.target.files?.[0];if(!file)return;setBusy(true);setError('');setMessage('Reading repair package…');try{const result=await inspectRepairImportV10975(file);setInspection(result);setMessage('');}catch(e){setError(String(e?.message||e));setInspection(null);setMessage('');}finally{setBusy(false);event.target.value='';}}
  function apply(){if(!inspection?.plan)return;try{const summary=repairSummaryV10975(inspection.plan);applyRepairPlanV10975(inspection.plan);setMessage(`Applied ${summary.documents} document fixes and ${summary.loads} load fixes. Originals were not changed.`);setInspection(null);onApplied?.();}catch(e){setError(String(e?.message||e));}}
  function undo(){if(undoLastRepairV10975()){setMessage('Last repair was undone.');setInspection(null);onApplied?.();}else setMessage('No repair history is available.');}
  const summary=inspection?.plan?repairSummaryV10975(inspection.plan):null;
  return <>
    <button type="button" className="repair-import-open-v10975" onClick={()=>setOpen(true)}>Import repair</button>
    {open?<div className="repair-import-backdrop-v10975" role="dialog" aria-modal="true"><section className="repair-import-sheet-v10975">
      <header><div><span>SAFE DATA REPAIR</span><h2>Import and finish incomplete loads</h2></div><button type="button" onClick={()=>setOpen(false)}>Close</button></header>
      <p className="repair-import-intro-v10975">Import a Road Ready audit package or repair-plan JSON. The app previews every correction first. Original PDFs, photos and Logbook events are never overwritten.</p>
      <input ref={inputRef} hidden type="file" accept=".json,.tar.gz,.tgz,application/json,application/gzip" onChange={choose}/>
      <div className="repair-import-actions-v10975"><button type="button" className="primary" disabled={busy} onClick={()=>inputRef.current?.click()}>{busy?'Reading…':'Choose audit / repair file'}</button><button type="button" onClick={undo}>Undo last repair</button></div>
      {error?<div className="repair-import-error-v10975">{error}</div>:null}{message?<div className="repair-import-message-v10975">{message}</div>:null}
      {inspection?.kind==='audit'&&!inspection.plan?<div className="repair-import-audit-v10975"><b>Audit package opened safely</b><span>{inspection.fileCount} package files · {inspection.originalCount} originals detected</span><p>This package contains the evidence, but no approved repair plan. Export or create a <code>repair-plan.json</code> after analysis, then import it here. Nothing was changed.</p></div>:null}
      {summary?<div className="repair-import-preview-v10975"><div className="repair-import-preview-title-v10975"><div><span>PREVIEW ONLY</span><b>{inspection.fileName||'Repair plan'}</b></div><i>✓</i></div><div className="repair-import-stats-v10975"><div><b>{summary.documents}</b><span>Document links</span></div><div><b>{summary.loads}</b><span>Load corrections</span></div><div><b>{summary.stopCorrections}</b><span>Stop counts</span></div><div><b>{summary.legacyLoads}</b><span>Legacy loads</span></div></div>
        {inspection.plan.notes?.length?<div className="repair-import-notes-v10975">{inspection.plan.notes.map((note,index)=><p key={index}>{note}</p>)}</div>:null}
        <div className="repair-import-change-list-v10975">{inspection.plan.loadCorrections.slice(0,12).map((item,index)=><article key={`l${index}`}><i>L</i><div><b>{item.aliasFrom?`${item.aliasFrom} → ${item.loadNo}`:`Load ${item.loadNo}`}</b><span>{[item.origin&&`Origin: ${item.origin}`,item.destination&&`Destination: ${item.destination}`,item.deliveryStops&&`${item.deliveryStops} delivery stops`,item.legacy&&'Legacy review',item.ignore&&'Hide false load'].filter(Boolean).join(' · ')||'Metadata reconciliation'}</span></div></article>)}{inspection.plan.documentAssignments.slice(0,12).map((item,index)=><article key={`d${index}`}><i>D</i><div><b>{item.documentId}</b><span>{[item.loadNo&&`Load ${item.loadNo}`,item.documentType,item.stopSequence&&`Stop ${item.stopSequence}`,item.ignore&&'Ignore false record'].filter(Boolean).join(' · ')}</span></div></article>)}</div>
        <div className="repair-import-confirm-v10975"><p><b>No destructive changes.</b> A rollback snapshot is saved before applying.</p><button type="button" onClick={apply}>Apply reviewed repair</button></div></div>:null}
    </section></div>:null}
  </>;
}
