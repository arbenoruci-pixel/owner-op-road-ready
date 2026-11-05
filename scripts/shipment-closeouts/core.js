// Explicit owner confirmations are operational metadata, never a signed log edit
// or evidence of a delivery date, receiver signature, payment or broker identity.
const list=value=>Array.isArray(value)?value:[];
const ref=value=>String(value??'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
export function shipmentCompletionReview(state,event,day,driverId){
 const driver=driverId||state.activeDriverId||state.teamDrivers?.[0]?.id||'driver_primary';
 const refs=[event?.loadNo,event?.shippingDocs,event?.bol,event?.pickedUpLoadNo].map(ref).filter(Boolean);
 if(!event?.id||!day||!refs.length)return null;
 const rows=list(state.shipmentCompletionReviewsV1).filter(row=>row.driver_id===driver&&row.pickup_event_id===event.id&&row.pickup_day===day&&
  refs.includes(ref(row.shipment_reference))&&row.basis==='user_confirmed'&&['completed','open'].includes(row.status)&&Number.isFinite(Date.parse(row.confirmed_at)));
 rows.sort((a,b)=>Date.parse(b.confirmed_at)-Date.parse(a.confirmed_at)||String(b.id).localeCompare(String(a.id)));
 return rows[0]?.status==='completed'?rows[0]:null;
}
