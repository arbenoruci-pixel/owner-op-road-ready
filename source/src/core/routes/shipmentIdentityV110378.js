// Explicit shipment identity boundary. A selected document/guide cannot rewrite
// the identity of a recorded pickup. Repair suggestions are read-only until the
// driver confirms the exact event, route and handoff shown in the Form.
const t=v=>String(v??'').trim();
const key=v=>t(v).replace(/\s+/g,' ').toUpperCase();
const clone=v=>structuredClone(v);
const real=e=>e&&!e.voided&&!e.deleted&&!e.deletedAt&&!e.synthetic&&!e.syntheticCoverage&&!e.displayOnly&&!e.carriedFromPreviousDay&&!e.continuityGenerated&&!['timeline_continuity','carryover','display','display_timeline'].includes(e.source);
const ended=l=>/^(cancelled|canceled|superseded|archived|dismissed)$/i.test(t(l?.status));
const body=e=>[e?.note,e?.description,...(Array.isArray(e?.reasons)?e.reasons:[])].filter(Boolean).join(' · ');
const pickup=e=>real(e)&&e.status==='ON'&&/\b(?:pickup|pick up|loading)\b/i.test(body(e))&&!/^pre[- ]?trip inspection$/i.test(body(e));
const time=e=>Number(e?.startMin);
const validMinute=n=>Number.isInteger(n)&&n>=0&&n<1440;
const equipment=v=>/^(?:no (?:trailer|equipment)|none|n\/?a)$/i.test(t(v))?'':key(t(v).replace(/^Trailer\s+/i,''));
export function isRoutePlaceHeading(value) {
  const words=t(value).toLowerCase().replace(/[^a-z]+/g,' ').trim().split(/\s+/);
  return words.some(w=>/^(date|dates|time|hours|appointment|appointments)$/.test(w))&&words.every(w=>/^(date|dates|time|hours|appointment|appointments|pickup|delivery)$/.test(w));
}
export function descriptionShipment(event={}) {
  const ref=t(event.description).match(/(?:^|[·|])\s*(?:Load|BOL)\s+([^·|]+?)(?=\s*[·|]|$)/i)?.[1];
  const place=t(event.description).match(/(?:^|[·|])\s*To\s+(.+?),\s*([A-Z]{2})\s*(?:[·|]|$)/i);
  return {reference:t(ref),toCity:t(place?.[1]),toState:key(place?.[2])};
}
export function guideOwnsRecordedPickup(event,guide) {
  if(!pickup(event))return false;
  const accepted=new Set([guide?.loadNo,guide?.orderNo].map(key).filter(Boolean));
  const primary=t(event.loadNo||event.shippingDocs||event.pickedUpLoadNo);
  const declared=descriptionShipment(event).reference;
  // BOL, PO and load numbers have distinct meanings; do not use a coincidental
  // secondary BOL or a reused sourceEventId as permission to adopt another load.
  const refs=[event.loadNo,event.shippingDocs,event.pickedUpLoadNo,primary,declared].map(key).filter(Boolean);
  return accepted.size>0&&refs.length>0&&refs.every(r=>accepted.has(r));
}
export function matchingManualPickupPlan(routes,day,details) {
  const ref=key(details.shippingDocs||details.loadNo);
  if(!ref)return null;
  const matches=Object.values(routes||{}).flatMap(x=>Array.isArray(x)?x:[]).filter(l=>
    l&&l.source==='manual_form'&&!ended(l)&&!l.pickupEventId&&!l.deliveryEventId&&
    (l.pickupDay||l.day)===day&&key(l.shippingDocs||l.loadNo)===ref&&
    ['fromCity','fromState','toCity','toState'].every(k=>key(l[k])&&key(l[k])===key(details[k])));
  return matches.length===1?matches[0]:null;
}
function place(city,state){return [t(city),key(state)].filter(Boolean).join(', ');}
function snapshot(state,day){
  return JSON.stringify({day,events:state.eventsByDay?.[day]||[],routes:state.routeLegsByDay||{},
    legacyRoutes:state.loadInfo?.routeLegsByDay||null,removals:state.logbookRouteRemovalsV110370||null});
}
export function shipmentIdentityConflicts(state={},day=state.activeDay) {
  const rows=(state.eventsByDay?.[day]||[]).filter(real).slice().sort((a,b)=>time(a)-time(b));
  const entries=Object.entries(state.routeLegsByDay||{}).flatMap(([bucket,list])=>(Array.isArray(list)?list:[]).map(leg=>({bucket,leg})));
  const out=[];
  for(const event of rows){
    if(!pickup(event)||!validMinute(time(event)))continue;
    const declared=descriptionShipment(event);
    const reference=key(event.loadNo||event.shippingDocs);
    const destination=place(event.destination,event.destinationState);
    const destinationKey=key(event.destination).replace(/,\s*[A-Z]{2}$/,'');
    const disagreement=declared.reference&&reference&&key(declared.reference)!==reference;
    const wrongPlace=declared.toCity&&destinationKey&&key(declared.toCity)!==destinationKey;
    if(!disagreement&&!wrongPlace)continue;
    const attached=entries.filter(({bucket,leg})=>bucket===day&&!ended(leg)&&leg.pickupEventId===event.id&&(leg.pickupDay||leg.day)===day);
    // A repair proposal needs an independent manual route declaration. Other
    // combinations are displayed as a conflict with no automatic resolution.
    const manual=entries.filter(({bucket,leg})=>bucket===day&&leg.source==='manual_form'&&!ended(leg)&&!leg.pickupEventId&&!leg.deliveryEventId&&
      (leg.pickupDay||leg.day)===day&&key(leg.loadNo||leg.shippingDocs)===key(declared.reference));
    const trailer=equipment(event.hookedTrailer);
    const nextPickup=rows.find(e=>time(e)>time(event)&&pickup(e));
    const handoffs=rows.filter(e=>e.status==='ON'&&validMinute(time(e))&&time(e)>time(event)&&
      (!nextPickup||time(e)<time(nextPickup))&&trailer&&equipment(e.droppedTrailer)===trailer&&
      /drop\s+(?:load\s*\/\s*)?trailer|drop off/i.test(body(e))&&t(e.city)&&/^[A-Z]{2}$/.test(key(e.state)));
    const canReview=manual.length===1&&attached.length===1&&handoffs.length===1&&
      rows.filter(e=>e.id===event.id).length===1&&rows.filter(e=>e.id===handoffs[0]?.id).length===1&&
      [attached[0]?.leg?.id,manual[0]?.leg?.id].every(id=>id&&entries.filter(x=>x.leg.id===id).length===1)&&
      [attached[0]?.leg,manual[0]?.leg].every(l=>l&&!l.logbookExcludedDaysV110352?.includes(day)&&!(state.logbookRouteRemovalsV110370?.deletedIds||[]).includes(l.id)&&!(state.logbookRouteRemovalsV110370?.excludedByDay?.[day]||[]).includes(l.id))&&
      !entries.some(({leg})=>!ended(leg)&&leg.deliveryEventId===handoffs[0]?.id&&leg.pickupEventId&&leg.pickupEventId!==event.id);
    const drop=canReview?handoffs[0]:null;
    out.push({id:event.id,day,reference:declared.reference,storedReference:t(event.loadNo||event.shippingDocs),
      storedDestination:destination,declaredDestination:place(declared.toCity,declared.toState),
      fromCity:t(event.city),fromState:key(event.state),toCity:t(drop?.city||declared.toCity),toState:key(drop?.state||declared.toState),
      trailer:t(event.hookedTrailer),pickupMin:time(event),dropMin:drop?time(drop):null,dropEventId:drop?.id||'',
      routeId:attached[0]?.leg?.id||'',manualRouteId:manual[0]?.leg?.id||'',
      affectedRouteIds:[...attached,...manual].map(x=>x.leg.id),canReview,
      expected:snapshot(state,day)});
  }
  return out;
}
const validText=v=>typeof v==='string'&&v.trim().length>0&&v.length<=160&&!/[\u0000-\u001f]/.test(v);
export function confirmShipmentIdentity(state,request={}) {
  if(request.confirmed!==true||request.day!==state.activeDay)throw new Error('Open the correct log day and confirm the shipment details.');
  if(request.expected!==snapshot(state,request.day))throw new Error('The log or routes changed. Reopen the shipment review before saving.');
  const issue=shipmentIdentityConflicts(state,request.day).find(x=>x.id===request.eventId);
  if(!issue?.canReview)throw new Error('This shipment cannot be matched uniquely. The existing records have been kept.');
  if(!validText(request.reference)||!validText(request.toCity)||!validText(request.fromCity)||
    !/^[A-Z]{2}$/.test(key(request.fromState))||!/^[A-Z]{2}$/.test(key(request.toState))||
    isRoutePlaceHeading(request.toCity)||isRoutePlaceHeading(request.fromCity))throw new Error('Confirm a reference and valid pickup/destination City, ST.');
  const beforeEvent=state.eventsByDay[request.day].find(e=>e.id===issue.id);
  const beforeRoutes=clone(state.routeLegsByDay[request.day]);
  const now=Date.now();
  const reference=t(request.reference);
  const nextEvent={...beforeEvent,shippingDocs:reference,loadNo:reference,pickedUpLoadNo:reference,
    destination:t(request.toCity),destinationState:key(request.toState),loadDetailsExplicit:true,
    description:`Load ${reference} · To ${place(request.toCity,request.toState)}`,
    transitionLoadNos:[reference],transitionSummary:`Picked up ${reference}`,displayShippingDocs:`Load ${reference}`,
    shipmentIdentityConfirmedV110378:{at:now,source:'driver_review',reference,previous:{loadNo:beforeEvent.loadNo||'',shippingDocs:beforeEvent.shippingDocs||'',destination:beforeEvent.destination||'',destinationState:beforeEvent.destinationState||'',description:beforeEvent.description||''}}};
  // Secondary identifiers (BOL/PO), event location, all time fields, note and
  // activity are left as recorded. The driver is correcting this shipment's
  // primary reference and endpoint, not rewriting a duty event or moving GPS.
  const routes=Object.fromEntries(Object.entries(state.routeLegsByDay||{}).map(([day,legs])=>[day,day!==request.day?legs:legs.map(leg=>{
    if(leg.id===issue.manualRouteId)return {...leg,status:'superseded',supersededByRouteId:issue.routeId,updatedAt:now};
    if(leg.id!==issue.routeId)return leg;
    return {...leg,shippingDocs:reference,loadNo:reference,pickedUpLoadNo:reference,transitionLoadNos:[reference],
      fromCity:t(request.fromCity),fromState:key(request.fromState),toCity:t(request.toCity),toState:key(request.toState),
      pickupDay:request.day,pickupEventId:issue.id,pickupMin:issue.pickupMin,
      deliveryDay:request.day,deliveryEventId:issue.dropEventId,deliveryMin:issue.dropMin,
      status:'closed',completionKind:'trailer_handoff',freightDeliveryConfirmed:false,
      source:'pickup_event',reviewStatus:'confirmed',excludedFromActiveLoad:false,
      shipmentIdentityConfirmedV110378:{at:now,source:'driver_review',reference,previous:{loadNo:leg.loadNo||'',shippingDocs:leg.shippingDocs||'',toCity:leg.toCity||'',toState:leg.toState||'',status:leg.status||''}},updatedAt:now};
  })]));
  const entry={kind:'confirmed_shipment_identity',at:now,day:request.day,eventId:issue.id,
    routeId:issue.routeId,supersededRouteId:issue.manualRouteId,handoffEventId:issue.dropEventId,
    reason:'Driver confirmed these records describe one trailer move.',beforeEvent:clone(beforeEvent),
    beforeRoutes,afterEvent:clone(nextEvent),reference,from:place(request.fromCity,request.fromState),to:place(request.toCity,request.toState)};
  return {...state,eventsByDay:{...state.eventsByDay,[request.day]:state.eventsByDay[request.day].map(e=>e.id===issue.id?nextEvent:e)},
    routeLegsByDay:routes,shipmentCorrectionHistoryByDay:{...state.shipmentCorrectionHistoryByDay,
      [request.day]:[...(state.shipmentCorrectionHistoryByDay?.[request.day]||[]),entry]}};
}
