import React,{useState} from 'react';
import {shipmentIdentityConflicts} from '../../core/routes/shipmentIdentityV110378.js';
function clock(min){return `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`;}
function Review({issue,onConfirm}) {
  const [open,setOpen]=useState(false),[confirmed,setConfirmed]=useState(false);
  const [reference,setReference]=useState(issue.reference),[toCity,setToCity]=useState(issue.toCity),[toState,setToState]=useState(issue.toState);
  return <section className="rr-shipment-review" aria-label="Shipment identity review"><strong>Conflicting pickup details — review needed</strong>
    <p>The pickup description says <b>{issue.reference} · {issue.declaredDestination}</b>. Its saved fields say <b>{issue.storedReference} · {issue.storedDestination}</b>.</p>
    {issue.canReview?<><p>One recorded trailer {issue.trailer} pickup at {clock(issue.pickupMin)} and handoff at {clock(issue.dropMin)} may explain both route rows.</p>
      <button type="button" onClick={()=>setOpen(v=>!v)}>{open?'Close review':'Review this trailer move'}</button>
      {open?<form onSubmit={e=>{e.preventDefault();if(confirmed)onConfirm({confirmed:true,eventId:issue.id,day:issue.day,expected:issue.expected,reference,fromCity:issue.fromCity,fromState:issue.fromState,toCity,toState});}}>
        <p>Pickup: <b>{issue.fromCity}, {issue.fromState}</b> · Trailer <b>{issue.trailer}</b></p>
        <label>Load / shipping reference<input type="text" required aria-label="Confirmed shipment reference" value={reference} onChange={e=>{setReference(e.target.value);setConfirmed(false);}}/></label>
        <label>Destination city<input type="text" required aria-label="Confirmed destination city" value={toCity} onChange={e=>{setToCity(e.target.value);setConfirmed(false);}}/></label>
        <label>Destination state<input type="text" required maxLength={2} pattern="[A-Z]{2}" aria-label="Confirmed destination state" value={toState} onChange={e=>{setToState(e.target.value.toUpperCase());setConfirmed(false);}}/></label>
        <label className="rr-shipment-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I confirm these two route rows describe the same trailer move and the destination above is correct.</label>
        <p>The duplicate plan stays in history. Duty times, GPS locations, signatures and documents are preserved. This confirms a trailer handoff; it does not confirm freight paperwork or payment.</p>
        <button type="submit" disabled={!confirmed}>Confirm this trailer move</button>
      </form>:null}</>:<p>The records cannot be matched uniquely. Review the original document and the pickup event before changing the route.</p>}
  </section>;
}
export default function ShipmentReview({state,onConfirm}) {
  return shipmentIdentityConflicts(state,state.activeDay).map(issue=><Review key={issue.id+issue.expected} issue={issue} onConfirm={onConfirm}/>);
}
