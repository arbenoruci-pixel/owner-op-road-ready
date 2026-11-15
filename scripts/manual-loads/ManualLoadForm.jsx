'use client';
import React,{useState} from 'react';
import {businessRecordId,localDateKey} from '../business/businessStore.js';
import {createManualLoad} from './manualLoadCore.js';
import {persistManualStore,readBusinessStore} from './manualLoadRuntime.js';
export default function ManualLoadForm({onClose,onSaved}){
 const [values,setValues]=useState({loadNo:'',broker:'',origin:'',destination:'',gross:'',pickupDate:localDateKey(),deliveryDate:''}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function save(e){e.preventDefault();if(busy)return;setBusy(true);setError('');try{const id=businessRecordId('load'),next=createManualLoad(readBusinessStore(),values,id);persistManualStore(next);onSaved(next.loads[0]);}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="rr-manual" aria-label="Create load folder"><button type="button" disabled={busy} onClick={onClose}>‹ Back</button><h2>New load</h2><p>Create the folder first. Add its documents whenever you have them.</p><form onSubmit={save}><div className="rr-manual-fields">{[['loadNo','Load number','text'],['broker','Broker','text'],['origin','Pickup','text'],['destination','Delivery','text'],['gross','Agreed rate ($)','text'],['pickupDate','Pickup date','date'],['deliveryDate','Delivery date','date']].map(([key,label,type])=><label key={key}>{label}<input type={type} required={key==='loadNo'} maxLength={key==='loadNo'?80:200} inputMode={key==='gross'?'decimal':undefined} value={values[key]} onChange={e=>setValues({...values,[key]:e.target.value})}/></label>)}</div>{error?<p role="alert">{error}</p>:null}<button type="submit" disabled={busy}>{busy?'Saving…':'Create folder & set active'}</button></form></section>;
}
