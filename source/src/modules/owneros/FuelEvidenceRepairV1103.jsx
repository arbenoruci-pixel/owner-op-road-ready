'use client';
import React,{useRef,useState} from 'react';
import { verifyFuelEvidenceRepair, applyFuelEvidenceRepair } from './fuelEvidenceRepairV1103.js';

export default function FuelEvidenceRepairV1103({onApplied}) {
  const input=useRef(null),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[plan,setPlan]=useState(null),[preview,setPreview]=useState(null),[message,setMessage]=useState('');
  async function choose(event) {
    const file=event.target.files?.[0];if(!file)return;
    setBusy(true);setMessage('');setPreview(null);setPlan(null);
    try {if(file.size>2*1024*1024)throw new Error('Choose the small fuel repair JSON');const parsed=JSON.parse(await file.text());const checked=await verifyFuelEvidenceRepair(parsed);setPlan(parsed);setPreview(checked);}
    catch(error){setMessage(error.message);}finally{setBusy(false);event.target.value='';}
  }
  async function apply() {
    setBusy(true);setMessage('');
    try {const result=await applyFuelEvidenceRepair(plan);setMessage(result.alreadyApplied?'This fuel repair has already been applied.':`${result.transactionCount} fuel transactions restored to their purchase dates. Total $${result.total.toFixed(2)}. Original statement preserved.`);setPlan(null);setPreview(null);onApplied?.();}
    catch(error){setMessage(error.message);}finally{setBusy(false);}
  }
  return <><button type="button" onClick={()=>setOpen(true)}>Fuel repair</button>{open?<div className="repair-import-backdrop-v10975" role="dialog" aria-modal="true" aria-label="Verified fuel repair"><section className="repair-import-sheet-v10975">
    <header><h2>Restore fuel transactions</h2><button type="button" disabled={busy} onClick={()=>setOpen(false)}>Close</button></header>
    <p>Check the original statement and preview each purchase before applying the repair.</p>
    <input type="file" ref={input} hidden accept=".json,application/json" onChange={choose}/><button type="button" disabled={busy} onClick={()=>input.current?.click()}>{busy?'Checking…':'Choose fuel repair JSON'}</button>
    {message?<p role="status">{message}</p>:null}
    {preview?<><p><b>{preview.transactionCount} transactions · {preview.gallons} gallons · ${preview.total.toFixed(2)}</b><br/>{preview.periodStart} – {preview.periodEnd}</p><div style={{maxHeight:'45vh',overflow:'auto'}}><table><thead><tr><th>Date</th><th>Station</th><th>Gallons</th><th>Paid</th></tr></thead><tbody>{preview.statement.transactions.map(row=><tr key={row.transactionId}><td>{row.date}</td><td>{row.merchant}</td><td>{row.gallons}</td><td>${row.total.toFixed(2)}</td></tr>)}</tbody></table></div><button type="button" disabled={busy||!plan} onClick={apply}>Apply verified fuel repair</button></>:null}
  </section></div>:null}</>;
}
