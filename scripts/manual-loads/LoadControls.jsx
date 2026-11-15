'use client';
import React,{useState} from 'react';
import {localDateKey} from '../business/businessStore.js';
import {closedLoad,setManualActive,markManualDelivered} from './manualLoadCore.js';
import {readBusinessStore,persistManualStore} from './manualLoadRuntime.js';
export default function LoadControls({load,onChange}){
 const [error,setError]=useState(''),[closing,setClosing]=useState(false),[day,setDay]=useState(localDateKey());
 const run=fn=>{setError('');try{persistManualStore(fn(readBusinessStore()));onChange();setClosing(false);}catch(e){setError(e.message);}};
 return <section className="rr-manual-controls" aria-label="Manage this load">{!closedLoad(load)?<><button type="button" onClick={()=>run(s=>setManualActive(s,load.id,load.loadNo||load.canonicalLoadNo))}>{load.manualActive?'Active on Home':'Set as active'}</button><button type="button" onClick={()=>setClosing(v=>!v)}>Mark delivered</button></>:null}{closing?<div><p>Finish this trip. Missing paperwork will stay marked as missing.</p><label>Actual delivery date<input type="date" value={day} onChange={e=>setDay(e.target.value)}/></label><button type="button" onClick={()=>run(s=>markManualDelivered(s,load.id,load.loadNo||load.canonicalLoadNo,day))}>Confirm delivered</button></div>:null}{error?<p role="alert">{error}</p>:null}</section>;
}
