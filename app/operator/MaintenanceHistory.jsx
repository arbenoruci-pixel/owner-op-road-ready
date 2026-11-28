'use client';
import React,{useEffect,useRef,useState} from 'react';
import {rpc,money} from './Step3Workspace.jsx';
import css from './maintenance.module.css';

const categories={PM:'Preventive maintenance',service:'Service / repair',warranty:'Warranty',defect:'Defect / safety concern'};
const mileage = value => Number(value).toLocaleString('en-US')+' mi';
function assetLabel(record) {
  const unit = record.unit?.trim();
  const type = {truck:'Truck',trailer:'Trailer'}[record.receipt?.assetType];
  if (!unit) return type || '';
  if (/^(truck|trailer|unit)\b/i.test(unit)) return unit;
  return (type || 'Unit')+' '+unit;
}
function dateLabel(value) {
  const date = new Date(value+'T12:00:00');
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
}

function receiptDate(record) {
  const label = dateLabel(record.record_date);
  return record.receipt?.dateSource === 'recorded' ? 'Recorded ' + label : label;
}

function SavedOriginal({record,client}) {
  const [url,setUrl]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const mounted=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);},[url]);
  async function open() {
    setBusy(true);setError('');
    try {
      if(record.byte_size>3*1024*1024) {
        const {fetchRecordOriginal}=await import('./quarterExport.js');
        const blob=await fetchRecordOriginal(client,record);
        if(mounted.current)setUrl(URL.createObjectURL(blob));
        return;
      }
      const data=await rpc(client,'rr_lease_step3_maintenance_original',{p_record_id:record.id});
      const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
      if(bytes.length!==record.byte_size)throw Error('Original size differs from the saved record.');
      const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
      if(Array.from(digest,v=>v.toString(16).padStart(2,'0')).join('')!==record.sha256) throw Error('Original checksum mismatch.');
      if(mounted.current)setUrl(URL.createObjectURL(new Blob([bytes],{type:record.mime_type})));
    } catch(e) {setError(e.message || 'Could not open the original.');}
    finally {setBusy(false);}
  }
  return <div className={css.original}><div><strong>Original receipt</strong><small>{record.file_name}</small></div>
    {url ? <div><a href={url} target="_blank" rel="noreferrer">View original</a> · <a href={url} download={record.file_name}>Download</a></div>
      : <button type="button" onClick={open} disabled={busy}>{busy?'Opening…':'Open original'}</button>}
    {error&&<p role="alert">{error}</p>}</div>;
}

export function ServiceRecord({record:r,client,open}) {
  const receipt=r.receipt;
  return <details className={css.record} open={open}><summary>
    <span><strong>{r.description || categories[r.expense_category] || 'Maintenance'}</strong>
      <small>{[r.vendor,receiptDate(r),assetLabel(r)].filter(Boolean).join(' · ')}</small></span>
    <span aria-hidden="true" className={css.chevron}>⌄</span></summary>
    <div className={css.recordBody}><p>{[categories[r.expense_category]||r.expense_category,r.odometer!=null&&mileage(r.odometer)].filter(Boolean).join(' · ')}</p>
      {r.next_service_odometer!=null && <p>Next PM at {mileage(r.next_service_odometer)}</p>}
      {r.next_service_date && <p>Next service on {dateLabel(r.next_service_date)}</p>}
      {receipt?.invoiceNumber && <p>Invoice #{receipt.invoiceNumber}</p>}
      {receipt?.lines?.length>0 && <dl className={css.amounts}>{receipt.lines.map((line,index)=>
        <div key={index}><dt>{line.description}{(line.quantity!=null||line.unitPriceCents!=null)&&<small>
          {[line.quantity!=null?'Qty '+line.quantity:'',line.unitPriceCents!=null?money(line.unitPriceCents)+' each':''].filter(Boolean).join(' × ')}</small>}</dt>
          <dd>{money(line.amountCents)}</dd></div>)}</dl>}
      {r.amount_cents!=null && <dl className={css.amounts}>
        {receipt?.subtotalCents!=null&&<div><dt>Subtotal</dt><dd>{money(receipt.subtotalCents)}</dd></div>}
        {receipt?.taxCents!=null&&<div><dt>Tax</dt><dd>{money(receipt.taxCents)}</dd></div>}
        <div><dt>{receipt ? 'Invoice total' : 'Recorded cost'}
          {receipt?.totalSource && <small>{receipt.totalSource === 'reader' ? 'Read from receipt' : 'Confirmed by driver'}</small>}</dt><dd>{money(r.amount_cents)}</dd></div>
        {receipt?.paidCents!=null&&<div><dt>Amount paid</dt><dd>{money(receipt.paidCents)}</dd></div>}
        {receipt?.balanceDueCents!=null&&<div><dt>Balance due</dt><dd>{money(receipt.balanceDueCents)}</dd></div>}
        {receipt&&<div><dt>Payment source</dt><dd>{{driver:'Driver funds',carrier:'Carrier funds'}[receipt.payer]||'Unconfirmed'}</dd></div>}
      </dl>}
      {r.file_name && <SavedOriginal client={client} record={r}/>}</div></details>;
}

export default function MaintenanceHistory({records,client}) {
  const due=new Map(), lastMiles=new Map();
  // Older records can supply a reminder when a later service has none.
  for(const record of records) {
    const unit=record.unit?.trim() ? assetLabel(record).toLowerCase() : '';
    if(unit && record.odometer!=null && !lastMiles.has(unit))lastMiles.set(unit,Number(record.odometer));
    const key=unit || record.id;
    if((record.next_service_date||record.next_service_odometer!=null)&&!due.has(key))due.set(key,record);
  }
  const costs=records.filter(r=>r.amount_cents!=null);
  return <>
    <section className={css.box}><h3>Next service</h3>{due.size ? Array.from(due,([unit,r])=>{
      const remaining=lastMiles.has(unit)&&r.next_service_odometer!=null?Number(r.next_service_odometer)-lastMiles.get(unit):null;
      return <div key={unit} className={css.reminder}>
        <strong>{[assetLabel(r),r.next_service_odometer!=null&&mileage(r.next_service_odometer),r.next_service_date&&dateLabel(r.next_service_date)].filter(Boolean).join(' · ')}</strong>
        {remaining!=null && <small>{remaining===0?'Due at last recorded mileage':mileage(Math.abs(remaining))+(remaining>0?' to go':' past due')+' at last recorded mileage'}</small>}
      </div>}) : <p>No service reminder recorded.</p>}</section>
    <section><div className={css.sectionHead}><h3>Service history</h3><small>{records.length} {records.length===1?'record':'records'}</small></div>
      {records.length ? <div className={css.history}>{records.map(record=><ServiceRecord key={record.id} record={record} client={client}/>)}</div>
        : <p>No maintenance records yet.</p>}</section>
    <section><details className={css.record}><summary><strong>Expense register</strong><span className={css.chevron} aria-hidden="true">⌄</span></summary>
      <div className={css.recordBody}>{costs.length ? <dl className={css.amounts}>{costs.map(r=>
        <div key={r.id}><dt>{r.vendor||r.description}<small>{receiptDate(r)}{assetLabel(r)?' · '+assetLabel(r):''}</small></dt><dd>{money(r.amount_cents)}</dd></div>)}</dl>
        : <p>No service costs recorded.</p>}</div></details></section></>;
}
