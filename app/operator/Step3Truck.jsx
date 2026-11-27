'use client';
import React,{useEffect,useRef,useState} from 'react';
import {usePortalClient} from './PortalSession.jsx';
import {allRows} from './portalData.js';
import {submitMaintenance} from './step3Actions.js';
import {ReadState,useRead,rpc,money} from './Step3Workspace.jsx';
import css from './step3.module.css';
import truck from './truck.module.css';
import {PdfDialog} from './PilotRateconReview.jsx';
import {formatDay} from './financials.js';
const miles = value => Number(value).toLocaleString('en-US')+' mi';
function ServiceReceipt({record}) {
 const client=usePortalClient();
 const [file,setFile]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const button=useRef(null);
 useEffect(()=>()=>{if(file?.url)URL.revokeObjectURL(file.url)},[file]);
 async function view(){
   setBusy(true);setError('');
   try {
     const b64=await rpc(client,'rr_lease_step3_maintenance_original',{p_record_id:record.id});
     const bytes=Uint8Array.from(atob(b64),x=>x.charCodeAt(0));
     const sum=await crypto.subtle.digest('SHA-256',bytes);
     if(Array.from(new Uint8Array(sum),x=>x.toString(16).padStart(2,'0')).join('')!==record.sha256)throw Error('Original checksum mismatch');
     const blob=new Blob([bytes],{type:record.mime_type});
     setFile({blob,url:blob.type==='application/pdf'?null:URL.createObjectURL(blob)});
   }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 function close(){setFile(null);requestAnimationFrame(()=>button.current?.focus({preventScroll:true}));}
 return <div className={css.original}>
   <button type="button" ref={button} disabled={busy} onClick={view}>{busy?'Opening…':'View Receipt'}</button>
   {file && (file.blob.type==='application/pdf' ? <PdfDialog cachedBlob={file.blob} heading="Service receipt" onClose={close}/> :
     <div><img src={file.url} alt={record.file_name}/><button type="button" onClick={close}>Close</button></div>)}
   {error && <p role="alert">{error}</p>}
 </div>;
}
function ServiceRecord({record:r}){
 return <article className={css.panel}><div className={css.detail}>
   <small>{r.expense_category||'Maintenance'} · {formatDay(r.record_date)}</small><h3>{r.description}</h3>
   <p>{[r.unit,r.vendor,r.odometer!=null?miles(r.odometer):null].filter(Boolean).join(' · ')}</p>
   {r.amount_cents!=null&&<p>Recorded expense: {money(r.amount_cents)}</p>}
   {r.file_name&&<ServiceReceipt record={r}/>}
   {(r.next_service_date || r.next_service_odometer!=null)&&<small>Next service · {[r.next_service_odometer!=null?miles(r.next_service_odometer):null,r.next_service_date&&formatDay(r.next_service_date)].filter(Boolean).join(' · ')}</small>}
 </div></article>;
}
function MaintenanceSummary({records}){
 const plans=new Map();
 for(const r of records){
   const unit=r.unit || '';
   if(!plans.has(unit)) plans.set(unit,{mileage:null,date:null,odometer:null});
   const plan=plans.get(unit);
   // Records are newest first. Unassigned units can only pair readings from the same record.
   if(unit) plan.odometer ??= r.odometer;
   else if(plan.mileage==null && r.next_service_odometer!=null) plan.odometer=r.odometer;
   plan.mileage ??= r.next_service_odometer;
   plan.date ||= r.next_service_date;
 }
 if(!plans.size)plans.set('',{});
 return <section className={truck.summary} aria-label="Maintenance status"><h2>Maintenance status</h2>{[...plans].map(([unit,plan])=>
   <div key={unit} className={truck.unit}>{unit&&<small>{unit}</small>}<div className={truck.schedule}>
     <div><span>Next PM</span><b>{plan.mileage!=null?miles(plan.mileage):'Unscheduled'}</b></div>
     <div><span>Next Date</span><b>{plan.date?formatDay(plan.date):'Unscheduled'}</b></div>
   </div>
   {plan.odometer!=null && plan.mileage!=null && <div className={truck.mileage}>
     <div><span>Recorded mileage</span><strong>{plan.odometer.toLocaleString('en-US')} / {miles(plan.mileage)}</strong></div>
     {plan.mileage>0 && <progress aria-label={unit ? 'Mileage toward next PM for '+unit : 'Mileage toward next PM'}
       aria-valuetext={miles(plan.odometer)+' recorded, next PM at '+miles(plan.mileage)}
       value={Math.min(plan.odometer,plan.mileage)} max={plan.mileage}/>}
     {plan.odometer>=plan.mileage && <small>{plan.odometer===plan.mileage ? 'PM due at the recorded mileage' : 'PM overdue by '+miles(plan.odometer-plan.mileage)}</small>}
   </div>}</div>)}</section>;
}
export default function TruckTools({operator,refresh,done}){
 const c=usePortalClient(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[file,setFile]=useState(null),[message,setMessage]=useState(''),request=useRef(crypto.randomUUID()),lock=useRef(false);
 const state=useRead(()=>allRows(()=>c.from('rr_driver_tool_records').select('id,record_date,description,unit,vendor,amount_cents,odometer,next_service_odometer,next_service_date,expense_category,file_name,mime_type,byte_size,sha256').eq('operator_id',operator.id).eq('kind','maintenance').order('record_date',{ascending:false}).order('id')),[c,operator.id,refresh]);
 return <div className={css.stack}>
 <ReadState state={state}>{records=><><MaintenanceSummary records={records}/><h2>Latest service</h2>{records.length?<ServiceRecord record={records[0]}/>:<p>No maintenance records.</p>}</>}</ReadState>
 <details className={css.panel+' '+truck.serviceForm}><summary className={truck.addService}>+ Add Service</summary><div className={css.detail}><p>Enter your service details and attach a photo or PDF. OCR is not required.</p>
 <form className={css.form} onSubmit={async e=>{e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');const form=e.currentTarget,f=new FormData(form);try{
 await submitMaintenance(c,operator.id,request.current,f,file);request.current=crypto.randomUUID();form.reset();setFile(null);setMessage('Maintenance record saved');done?.();
 }catch(e){setError(e.message)}finally{lock.current=false;setBusy(false)}}}>
 <label>Record type<select name="category"><option value="PM">Preventive maintenance</option><option value="service">Service / repair</option><option value="warranty">Warranty</option><option value="defect">Defect / safety concern</option></select></label><label>Date<input name="date" type="date" required defaultValue={new Date().toISOString().slice(0,10)}/></label><label>Unit<input name="unit" maxLength={80}/></label><label>Description<textarea name="description" required maxLength={600}/></label><label>Odometer miles<input name="odometer" type="number" min="0" max="99999999" step="1"/></label><div className={css.grid}><label>Next PM at miles<input name="nextOdometer" type="number" min="0" max="99999999" step="1"/></label><label>Next service date<input name="nextDate" type="date"/></label></div><label>Shop / vendor<input name="vendor" maxLength={160}/></label><label>Cost (USD, optional)<input name="amount" inputMode="decimal"/></label><label>Original service receipt / photo<input type="file" accept="application/pdf,image/jpeg,image/png" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><button className={css.primary} disabled={busy}>{busy?'Saving…':'Save maintenance record'}</button>{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}</form>
 </div></details>
 {state.value?.length>1&&<details className={css.panel}><summary>Earlier service history ({state.value.length-1})</summary><div className={css.detail}>{state.value.slice(1).map(r=><ServiceRecord record={r} key={r.id}/>)}</div></details>}
 </div>;
}
