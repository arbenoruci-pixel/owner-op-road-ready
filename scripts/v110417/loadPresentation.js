import {day,list,text,loadOf,evidenceLoadResolver} from './evidenceCoreV110413.js';

// Dates used to describe a service are distinct from linked logbook activity.
export function serviceStage(load={}) {
  const stage=text(load.documentWorkflowStage||load.serviceStatus||load.status).toLowerCase();
  return stage==='archived'?text(load.documentTransferEvidence?.originalStatus).toLowerCase():stage;
}
export function serviceLoad(folder,businessStore={}) {
  const resolve=evidenceLoadResolver(businessStore),ref=resolve(folder.loadNo);
  const stored=list(businessStore.loads).find(l=>loadOf(l)===ref)||list(businessStore.loads).find(l=>resolve(loadOf(l))===ref)||{};
  return {...folder,...stored,loadNo:ref,status:stored.status||(Array.isArray(folder.checklist)?'':folder.status)};
}
const label=d=>new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
export function serviceDates(load={}) {
  const stage=serviceStage(load),pickup=day(load.pickupDate||load.pickupDay);
  const actualDelivery=day(load.deliveredDate||load.completedDate||load.deliveredAt||load.completedAt);
  const delivered=!!actualDelivery||['delivered','invoiced','submitted','paid','complete','completed'].includes(stage);
  const delivery=actualDelivery||day(load.deliveryDate||load.deliveryDay);
  const cancelled=['tonu','cancelled'].includes(stage);
  const recorded=[...new Set(list(load.days).map(day).filter(Boolean))].sort();
  const sortDay=pickup||(delivered?delivery:'')||recorded[0]||'';
  let cardDate='Date not set';
  if(cancelled&&pickup)cardDate=label(pickup)+' · Cancelled';
  else if(delivered&&delivery)cardDate=(pickup&&pickup!==delivery?label(pickup)+' – ':'')+label(delivery)+' · Delivered';
  else if(pickup)cardDate=`${stage==='booked'?'Pickup planned':'Pickup'} ${label(pickup)}${delivery?' · Delivery '+label(delivery):''}`;
  else if(delivery)cardDate='Delivery '+label(delivery);
  else if(recorded.length)cardDate='Recorded '+label(recorded[0])+(recorded.at(-1)!==recorded[0]?' – '+label(recorded.at(-1)):'');
  // This fallback only files loads with no actual activity days. It never
  // reassigns existing logbook events or creates a week from a future delivery.
  const filingDays=[...new Set([pickup,delivered&&!cancelled?delivery:''].filter(Boolean))];
  return {pickup,delivery,delivered,stage,sortDay,cardDate,filingDays};
}
export function chronologicalLoads(folders,businessStore={}) {
  const dates=new Map(folders.map(f=>[f.loadNo,serviceDates(serviceLoad(f,businessStore))]));
  return [...folders].sort((a,b)=>dates.get(b.loadNo).sortDay.localeCompare(dates.get(a.loadNo).sortDay)||a.loadNo.localeCompare(b.loadNo,undefined,{numeric:true}));
}
