// Filing projection only: a recorded pickup survives midnight without becoming
// a broker load. Volatile current-load form fields are never identity evidence.
import {collectLoadCandidatesV105,normalizeCanonicalLoadNoV105 as number} from '../documents/documentFoundationV105.js';
import {libraryScanCandidates} from '../owneros/libraryScanV110434.js';
const text=v=>String(v??'').trim();
const key=v=>text(v).toUpperCase().replace(/[^A-Z0-9]/g,'');
const list=v=>Array.isArray(v)?v:[];
const hidden=e=>e.deleted===true||e.deletedAt||/^(deleted|removed|cancelled|canceled|superseded)$/i.test(text(e.status));
const activity=e=>[e.note,e.description,...list(e.reasons)].join(' ');
const refs=e=>[e.loadNo,e.shippingDocs,e.bol,e.pickedUpLoadNo,e.deliveredLoadNo].map(number).filter(Boolean);
const own=(candidate,ref)=>key(candidate.loadNo)===key(ref)||list(candidate.aliases).some(a=>key(a.value)===key(ref)&&a.source!=='load_info');
export function collectShipmentScanCandidates(state={},store={}){
 const clean={...state,loadInfo:{}};
 const rows=libraryScanCandidates(collectLoadCandidatesV105(clean,store),store)
  .filter(c=>list(c.sourceKinds).some(s=>s!=='live_duty_event'));
 const entries=Object.entries(state.eventsByDay||{}).flatMap(([day,events])=>list(events).filter(e=>e&&!hidden(e)).map(event=>({day,event})))
  .sort((a,b)=>a.day.localeCompare(b.day)||Number(a.event.startMin)-Number(b.event.startMin));
 const routes=Object.values(state.routeLegsByDay||{}).flatMap(list).filter(e=>e&&!hidden(e));
 const shipments=new Map();
 for(const {day,event}of entries){
  if(event.status!=='ON'||!event.id||!/\b(pickup|pick up|loading|hooked?)\b/i.test(activity(event))||/\bunloading\b/i.test(activity(event)))continue;
  const ref=refs(event)[0];if(!ref||rows.some(c=>refs(event).some(r=>own(c,r))))continue;
  const leg=routes.find(l=>l.pickupEventId===event.id&&refs(l).some(r=>key(r)===key(ref)));
  const deliveries=entries.filter(e=>(e.day>day||e.day===day&&Number(e.event.startMin)>Number(event.startMin))&&e.event.status==='ON'&&
   /\b(delivery|unloading|delivered)\b/i.test(activity(e.event))&&refs(e.event).some(r=>key(r)===key(ref)));
  const completed=deliveries.length>0||/^(completed|delivered|closed)$/i.test(text(leg?.status));
  const origin=[event.city,event.state].filter(Boolean).join(', '),destination=text(event.destination)||[leg?.toCity,leg?.toState].filter(Boolean).join(', ');
  const previous=shipments.get(ref),ambiguous=Boolean(previous&&previous.shipmentEventId!==event.id);
  shipments.set(ref,{id:'shipment_'+ref,loadNo:ref,broker:'',carrierName:'',origin,destination,pickupDate:day,deliveryDate:deliveries.at(-1)?.day||'',
   status:completed?'completed':'open',active:!completed,referenceOnly:true,shipmentFiling:true,shipmentReference:ref,shipmentEventId:event.id,shipmentDay:day,
   sourceKinds:['recorded_pickup'],aliases:[{kind:'bol_number',value:ref,source:'recorded_pickup'}],stops:[],routeLegs:[],
   latestPickupAt:Date.parse(day+'T12:00:00Z'),latestActivityAt:Date.parse((deliveries.at(-1)?.day||day)+'T12:00:00Z'),updatedAt:Number(event.shippingDocsUpdatedAt)||0,
   ...(ambiguous?{shipmentAmbiguous:true,shipmentEventId:'',shipmentDay:''}:{})});
 }
 return [...rows,...shipments.values()];
}

// Receiver display is taken only from the document with the same printed BOL.
// A consignee is not relabeled as the broker.
export function shipmentPickerDetails(candidates=[],analysis={}){
 const fields=analysis.fields||{},raw=text(analysis.text||analysis.rawText);
 const bol=number(fields.bolNo||fields.billOfLadingNo);
 const receiver=text(fields.shipTo||fields.receiver||fields.consignee||fields.destinationCompany);
 const supported=receiver&&raw.toLowerCase().includes(receiver.toLowerCase());
 return candidates.map(c=>c.shipmentFiling&&key(c.shipmentReference)===key(bol)&&supported?{...c,company:receiver,displayCompany:receiver}:c);
}

export function shipmentFilingFields(candidate){
 if(!candidate?.shipmentFiling)return {};
 return {documentScope:'shipment',shipmentReference:candidate.shipmentReference,shipmentEventId:candidate.shipmentEventId,shipmentDay:candidate.shipmentDay,
  shipmentDestination:candidate.destination,canonicalLoadNo:'',loadNo:'',loadAssignmentStatusV11037:'shipment_reference'};
}
