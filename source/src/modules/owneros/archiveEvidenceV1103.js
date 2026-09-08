// Pure, rebuildable archive evidence. Stored RODS and original documents are inputs.
const text = value => String(value ?? '').trim();
const day = value => /^\d{4}-\d{2}-\d{2}$/.test(text(value).slice(0, 10)) ? text(value).slice(0, 10) : '';
const round = value => Math.round(value * 100) / 100;
const list = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values.filter(Boolean))];
export function canonicalArchiveLoad(value, aliases = {}) {
  let ref = text(value).toUpperCase();
  const seen = new Set();
  const mapping = { '178564':'424590-1', ...aliases };
  while (mapping[ref] && !seen.has(ref)) { seen.add(ref); ref = text(mapping[ref]).toUpperCase(); }
  return ref;
}
export function archiveRefs(row = {}, aliases = {}) {
  return unique(['loadNo','load_no','canonicalLoadNo','shippingDocs','shipping_documents','orderNo','order_no','pickedUpLoadNo','deliveredLoadNo']
    .map(key => canonicalArchiveLoad(row[key], aliases)));
}
function actualDay(row, fallback) {
  return [row?.logDate,row?.log_date,row?.eventDate,row?.event_date,row?.dutyDate,row?.duty_date,row?.serviceDate,row?.date,row?.day,fallback].map(day).find(Boolean) || '';
}
function distance(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  if (typeof value === 'object') {
    for (const key of ['miles','totalMiles','dailyMiles','manualMiles','distance','distanceMiles','total']) {
      const found = distance(value[key]); if (found !== null) return found;
    }
    return null;
  }
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function archiveEventIndex(state = {}) {
  const index = new Map();
  for (const [bucket, rows] of Object.entries(state.eventsByDay || {})) for (const event of list(rows)) {
    if (!event?.id || event.deleted || event.voided || event.displayOnly || event.syntheticCoverage) continue;
    const item = { ...event, day:actualDay(event, bucket) };
    const old = index.get(event.id);
    // Ambiguous duplicated IDs cannot silently choose a day.
    index.set(event.id, old ? { ambiguous:true, id:event.id } : item);
  }
  return index;
}
export function projectArchiveState(state = {}, aliases = {}) {
  const index = archiveEventIndex(state);
  const remap = row => Object.fromEntries(Object.entries(row).map(([key,value]) =>
    ['loadNo','load_no','canonicalLoadNo','shippingDocs','shipping_documents','orderNo','order_no','pickedUpLoadNo','deliveredLoadNo'].includes(key)
      ? [key,canonicalArchiveLoad(value, aliases)] : [key,value]));
  const eventsByDay = {};
  for (const bucket of Object.keys(state.eventsByDay || {})) if(day(bucket)) eventsByDay[bucket]=[];
  for (const [bucket,rows] of Object.entries(state.eventsByDay || {})) for (const event of list(rows)) {
    const date = actualDay(event,bucket); (eventsByDay[date] ||= []).push(remap(event));
  }
  const routeLegsByDay = {};
  for (const [bucket,rows] of Object.entries(state.routeLegsByDay || {})) for (const raw of list(rows)) {
    const pickup = index.get(raw.pickupEventId), delivery = index.get(raw.deliveryEventId);
    const row = remap(raw);
    if (pickup && !pickup.ambiguous) Object.assign(row,{day:pickup.day,pickupDay:pickup.day,pickupMin:pickup.startMin});
    if (delivery && !delivery.ambiguous) Object.assign(row,{deliveryDay:delivery.day,deliveryMin:delivery.startMin});
    const date = (pickup && !pickup.ambiguous ? pickup.day : actualDay(raw,bucket));
    (routeLegsByDay[date] ||= []).push(row);
  }
  return { ...state, eventsByDay, routeLegsByDay, archiveAliases:aliases };
}
function allLegs(state) { return Object.values(state.routeLegsByDay || {}).flatMap(list); }
function point(date, minute) { return Date.parse(date+'T00:00:00Z') / 60000 + Number(minute); }
function drivingOwnership(event, date, state, index) {
  if (event.noLoadDeclared === true || event.currentMoveKind === 'empty' || /empty|deadhead|reposition/.test(text(event.routeIntent))) return [];
  const direct = archiveRefs(event,state.archiveAliases);
  if (direct.length) return direct;
  const start = point(date,event.startMin), end = point(date,event.endMin);
  return unique(allLegs(state).flatMap(leg => {
    if (leg.kind === 'empty' || leg.noLoadDeclared === true) return [];
    const pickup = index.get(leg.pickupEventId), delivery = index.get(leg.deliveryEventId);
    if (!pickup || !delivery || pickup.ambiguous || delivery.ambiguous) return [];
    if (start >= point(pickup.day,pickup.endMin) && end <= point(delivery.day,delivery.startMin)) return archiveRefs(leg,state.archiveAliases);
    return [];
  }));
}
function directAllocations(state, date) {
  const out = new Map();
  for (const source of ['manualMilesByLoad','milesByLoad','dailyMilesByLoad','loadMiles']) {
    for (const [ref, values] of Object.entries(state[source] || {})) {
      const rows = Array.isArray(values) ? values.map(v => [actualDay(v),v]) : Object.entries(values || {});
      for (const [key,value] of rows) {
        if (actualDay(value,key) !== date) continue;
        const miles = distance(value), loadNo = canonicalArchiveLoad(ref,state.archiveAliases);
        if (miles === null || !loadNo) continue;
        const previous = out.get(loadNo);
        if (!previous) out.set(loadNo,{miles,source,conflict:false});
        else if (Math.abs(previous.miles-miles) > 0.01) previous.conflict = true;
      }
    }
  }
  return out;
}
export function archiveDayMileage(state = {}, date = '') {
  const index = archiveEventIndex(state);
  const events = [...index.values()].filter(e => !e.ambiguous && e.day === date && e.status === 'D');
  const candidates = [];
  function candidate(value, source) { const miles = distance(value); if (miles !== null) candidates.push({miles,source}); }
  for (const [key,value] of Object.entries(state.manualMilesByDay || {})) if (actualDay(value,key) === date) candidate(value,'manualMilesByDay');
  candidate(state.formByDay?.[date]?.distance,'formByDay.distance');
  candidate(state.formByDay?.[date]?.distanceMiles,'formByDay.distanceMiles');
  for (const [key,value] of Object.entries(state.dailyMilesByDay || {})) if (actualDay(value,key) === date) candidate(value,'dailyMilesByDay');
  candidate(state.days?.[date] || state.logDays?.[date] || state.dayDataByDate?.[date],'daily_record');
  const measured = events.map(event => ({event,miles:distance(event.manualMiles ?? event.drivingMiles ?? event.distanceMiles)})).filter(e => e.miles !== null);
  const segmentTotal = round(measured.reduce((sum,row) => sum+row.miles,0));
  const segmentComplete = events.length > 0 && measured.length === events.length;
  if (measured.length) candidates.push({miles:segmentTotal,source:'driving_events',partial:!segmentComplete});
  const selected = candidates[0] || null;
  const conflicts = selected ? candidates.filter(c => !c.partial && Math.abs(c.miles-selected.miles)>0.01) : [];
  const allocations = directAllocations(state,date);
  const eventAllocations = new Map();
  for (const {event,miles} of measured) {
    const refs = drivingOwnership(event,date,state,index);
    if (refs.length !== 1) continue;
    // A legacy day total stored in one short Driving event needs review.
    if (miles > (Number(event.endMin)-Number(event.startMin))*1.5) continue;
    eventAllocations.set(refs[0],round((eventAllocations.get(refs[0]) || 0)+miles));
  }
  for (const [ref,miles] of eventAllocations) if (!allocations.has(ref)) allocations.set(ref,{miles,source:'event_or_route_link',conflict:false});
  const allocationTotal = round([...allocations.values()].reduce((sum,row) => sum+row.miles,0));
  const total = selected?.miles ?? (allocations.size ? allocationTotal : null);
  const allocationConflict = (total !== null && allocationTotal > total+0.01) || [...allocations.values()].some(row => row.conflict);
  return { day:date, miles:total === null ? null : round(total), source:selected?.source || (allocations.size?'load_allocations':'missing'),
    candidates, conflicts, partial:!!selected?.partial, allocationConflict,
    allocations:Object.fromEntries(allocations), allocatedMiles:allocationTotal,
    unallocatedMiles:total === null ? null : round(Math.max(0,total-allocationTotal)),
    drivingEvents:events.length, measuredEvents:measured.length,
    status:conflicts.length || allocationConflict ? 'conflict' : total === null ? 'missing' : selected?.partial ? 'partial' : 'recorded' };
}
export function archiveLoadDays(state = {}, loadNo = '') {
  const target = canonicalArchiveLoad(loadNo,state.archiveAliases), dates = new Set();
  const index = archiveEventIndex(state);
  for (const event of index.values()) if (!event.ambiguous && archiveRefs(event,state.archiveAliases).includes(target)) dates.add(event.day);
  for (const [bucket,legs] of Object.entries(state.routeLegsByDay || {})) for (const leg of list(legs)) {
    if (!archiveRefs(leg,state.archiveAliases).includes(target)) continue;
    const pickup = index.get(leg.pickupEventId), delivery = index.get(leg.deliveryEventId);
    const from = pickup && !pickup.ambiguous ? pickup.day : actualDay(leg,bucket);
    const to = delivery && !delivery.ambiguous ? delivery.day : '';
    if (from) dates.add(from);
    if (to) dates.add(to);
    // Only actual endpoint events establish an interval across days.
    if (pickup && delivery && !pickup.ambiguous && !delivery.ambiguous && to >= from) {
      for (const date of Object.keys(state.eventsByDay || {})) if (date >= from && date <= to) dates.add(date);
    }
  }
  for (const source of ['manualMilesByLoad','milesByLoad','dailyMilesByLoad','loadMiles']) for (const [ref,values] of Object.entries(state[source] || {})) {
    if (canonicalArchiveLoad(ref,state.archiveAliases) !== target) continue;
    for (const [key,value] of Array.isArray(values) ? values.map(v => [actualDay(v),v]) : Object.entries(values || {})) { const date=actualDay(value,key); if (date) dates.add(date); }
  }
  return [...dates].filter(Boolean).sort();
}
export function archiveLoadMileage(state = {}, loadNo = '') {
  const target = canonicalArchiveLoad(loadNo,state.archiveAliases), linkedDays = archiveLoadDays(state,target);
  const dayEvidence = linkedDays.map(date => archiveDayMileage(state,date));
  const rows = dayEvidence.flatMap(row => row.allocations[target] ? [{day:row.day,...row.allocations[target]}] : []);
  const total = round(rows.reduce((sum,row) => sum+row.miles,0));
  const recordedTotal = round(dayEvidence.reduce((sum,row) => sum+(row.miles ?? 0),0));
  const pendingDays = dayEvidence.filter(row => row.drivingEvents && (row.status !== 'recorded' || row.unallocatedMiles > 0 || !row.allocations[target]));
  const hasRecordedMiles = dayEvidence.some(row => row.miles !== null);
  const complete = hasRecordedMiles && pendingDays.length === 0;
  return {complete,total,recordedTotal,hasRecordedMiles,rows,linkedDays,dayEvidence,pendingDays:pendingDays.map(row=>row.day),
    detail:!hasRecordedMiles ? 'Mileage has not been recorded on the linked days' : `${recordedTotal.toFixed(2)} mi recorded on linked days · ${total.toFixed(2)} mi assigned to this load${pendingDays.length ? ' · allocation/coverage needs review' : ''}`};
}
export function documentIdentity(doc = {}) { return text(doc.local_id || doc.localDocumentId || doc.id || doc.client_document_id || doc.clientDocumentId); }
export function archiveDocumentKey(doc = {}) {
  const hash=text(doc.sha256 || doc.content_hash || doc.contentHash || doc.metadata?.sha256);
  const scope=[canonicalArchiveLoad(doc.load_no || doc.loadNo || doc.canonicalLoadNo),text(doc.document_type || doc.type || doc.extracted?.type),Number(doc.stopSequence || doc.extracted?.stopSequence || 0)].join('|');
  return hash ? `hash:${hash}|${scope}` : documentIdentity(doc) ? `id:${documentIdentity(doc)}` : '';
}
export function deduplicateArchiveDocuments(documents = []) {
  const records=new Map(),others=[];
  const stamp=doc=>{const value=doc.updated_at || doc.updatedAt || doc.created_at || doc.createdAt;return typeof value==='number'?value:Date.parse(value)||0;};
  for(const doc of documents) {
    if(!doc)continue;
    const key=archiveDocumentKey(doc);if(!key){others.push(doc);continue;}
    const previous=records.get(key);
    if(!previous)records.set(key,doc);
    else {
      const next=stamp(doc)>=stamp(previous)?doc:previous,older=next===doc?previous:doc;
      records.set(key,{...older,...next,extracted:{...older.extracted,...next.extracted}});
    }
  }
  return [...records.values(),...others];
}
export function verifiedArchiveDocument(doc = {}) {
  const status=text(doc.reviewStatus || doc.review_status || doc.status).toLowerCase();
  if(/review|draft|reject|pending|invalid/.test(status) || doc.podSigned===false || doc.extracted?.podSigned===false) return false;
  return /verified|confirmed|approved/.test(status) || doc.userConfirmed===true || doc.extracted?.userConfirmed===true;
}
export function archiveDeliveryStops(load = {}, legs = []) {
  const direct=list(load.stops).filter(stop=>stop.type==='delivery');
  const source=direct.length?direct:legs.filter(leg=>Number(leg.stopSequence)>0 && leg.kind!=='empty' && !/empty return/i.test(text(leg.stopCompany)));
  const byId=new Map();
  for(const [i,stop] of source.entries()) {
    const sequence=Number(stop.deliverySequence || stop.stopSequence || stop.sequence || i+1);
    if(byId.has(sequence))continue;
    byId.set(sequence,{id:stop.id,sequence,company:text(stop.company || stop.facility || stop.stopCompany),city:text(stop.city || stop.toCity),state:text(stop.state || stop.toState),address:text(stop.address || stop.stopAddress),appointment:text(stop.appointment || stop.time)});
  }
  return [...byId.values()].sort((a,b)=>a.sequence-b.sequence);
}
export function assignArchivePods(pods = [], stops = []) {
  const assigned=new Map(),unassigned=[];
  for(const doc of pods) {
    const sequence=Number(doc.stopSequence || doc.stop_sequence || doc.extracted?.stopSequence || doc.metadata?.stopSequence || 0);
    if(!sequence || !stops.some(stop=>stop.sequence===sequence) || !verifiedArchiveDocument(doc)) {unassigned.push(doc);continue;}
    const previous=assigned.get(sequence);
    if(!previous)assigned.set(sequence,doc);
    // Multiple pages may support one stop. They never establish another stop.
  }
  const missingStops=stops.filter(stop=>!assigned.has(stop.sequence));
  return {assigned,unassigned,missingStops,podComplete:stops.length>0 && missingStops.length===0};
}
export function finalizeArchiveFolder(folder, state, load = {}) {
  const days=archiveLoadDays(state,folder.loadNo);
  const actualDays=days.length?days:unique(folder.documents.flatMap(doc=>doc.archiveEventDays || [])).sort();
  const started=folder.events.some(e=>/pickup|loading|pick up/i.test([e.note,e.description,...list(e.reasons)].join(' '))) || folder.events.some(e=>e.status==='D') || /transit|delivered|complete|paid/i.test(text(load.status));
  const delivered=folder.events.some(e=>e.deliveryCompleted===true) || /delivered|complete|paid/i.test(text(load.status));
  const checklist=folder.checklist.map(item=>{
    if(item.id==='miles')return {...item,complete:folder.mileage.complete,required:started,detail:folder.mileage.detail};
    if(item.id==='bol')return {...item,complete:folder.bols.some(verifiedArchiveDocument),required:started,detail:folder.bols.length?'Pickup documents saved; verification checked':'Awaiting pickup paperwork'};
    if(item.id==='rate')return {...item,complete:folder.rateCons.some(verifiedArchiveDocument),detail:folder.rateCons.length?'Rate Confirmation saved; verification checked':'Rate Confirmation needs review'};
    if(item.id==='pod')return {...item,required:delivered,detail:folder.stops.length?`${folder.podAssignments.size} of ${folder.stops.length} stops verified`:'Delivery stops need confirmation'};
    if(item.id==='delivery')return {...item,complete:delivered,required:started,detail:delivered?'Delivery activity recorded':'Awaiting delivery activity'};
    return item;
  });
  const missing=checklist.filter(i=>i.required&&!i.complete),required=checklist.filter(i=>i.required);
  return {...folder,days:actualDays,plannedDays:unique([load.pickupDate,load.deliveryDate].map(day)),checklist,missing,
    percent:required.length?Math.round(100*required.filter(i=>i.complete).length/required.length):0,
    status:folder.legacy?'legacy_review':missing.length?'needs_attention':started?'complete':'in_progress'};
}
export function resolveArchiveDocumentLink(doc = {}, state = {}) {
  const id = documentIdentity(doc), index = archiveEventIndex(state);
  const explicit = text(doc.linkedEventId || doc.eventId || doc.extracted?.linkEventId || doc.metadata?.eventId || state.logbookDocumentReferences?.[id]?.eventId);
  if (explicit) { const event=index.get(explicit); return event && !event.ambiguous ? {status:'event_linked',eventId:explicit,day:event.day} : {status:'needs_review',eventId:explicit,day:'',reason:'Linked event is missing or ambiguous'}; }
  const attached = [...index.values()].filter(event => !event.ambiguous && (list(event.documentIds).includes(id) || event.shippingDocumentId===id || event.rateConfirmationDocumentId===id));
  if (attached.length === 1) return {status:'event_linked',eventId:attached[0].id,day:attached[0].day};
  if (attached.length > 1) return {status:'multiple_events',eventIds:attached.map(e=>e.id),days:unique(attached.map(e=>e.day))};
  const requestedDay = day(doc.linkDay || doc.metadata?.logDate || doc.extracted?.linkDay);
  const refs = archiveRefs(doc,state.archiveAliases);
  const type = text(doc.document_type || doc.type || doc.extracted?.type);
  const stop = Number(doc.stopSequence || doc.extracted?.stopSequence || 0);
  const candidates = [...index.values()].filter(event => {
    if (event.ambiguous || event.status==='D' || requestedDay && event.day!==requestedDay) return false;
    if (!refs.some(ref=>archiveRefs(event,state.archiveAliases).includes(ref))) return false;
    const activity = [event.note,event.description,...list(event.reasons)].join(' ').toLowerCase();
    if (type==='pod') return event.deliveryCompleted===true && (!stop || Number(event.deliveryStopSequence)===stop);
    if (type==='bol') return /pickup|loading|pick up/.test(activity);
    if (type==='fuel_receipt') return /fuel/.test(activity);
    return false;
  });
  if (candidates.length===1) return {status:'event_linked',eventId:candidates[0].id,day:candidates[0].day,source:'unique_activity_match'};
  return {status:requestedDay?'day_linked':'unassigned',day:requestedDay,eventId:'',reason:candidates.length>1?'Multiple candidate events':''};
}
export function archiveDocument(doc, state) {
  const link = resolveArchiveDocumentLink(doc,state);
  return {...doc,archiveLink:link,linkedEventId:link.status==='event_linked'?link.eventId:doc.linkedEventId || '',archiveEventDay:link.day || '',
    archiveEventDays:link.days || (link.day?[link.day]:[])};
}
export function mondayForArchive(date) {
  if (!day(date)) return '';
  const d = new Date(date+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7); return d.toISOString().slice(0,10);
}
export function archiveWeeks(folders = [], state = {}, business = {}) {
  const weeks = new Map();
  function get(start) { if (!weeks.has(start)) weeks.set(start,{start,items:[],days:[],documents:[],fuel:[],expenses:[],fuelTotal:0,fuelGallons:0,expenseTotal:0,miles:0,allocatedMiles:0,unallocatedMiles:0,complete:0,attention:0,amazon:0,revenue:0}); return weeks.get(start); }
  for (const folder of folders) for (const start of unique((folder.days || []).map(mondayForArchive)).length ? unique(folder.days.map(mondayForArchive)) : ['']) get(start).items.push(folder);
  const dates = unique([...Object.keys(state.eventsByDay || {}),...Object.keys(state.signatureByDay || {}),...Object.keys(state.inspectionByDay || {}),...Object.keys(state.manualMilesByDay || {}),...Object.keys(state.formByDay || {}),...Object.keys(state.dailyMilesByDay || {})]);
  for (const date of dates.filter(day).sort()) {
    const week = get(mondayForArchive(date)), evidence = archiveDayMileage(state,date);
    week.days.push(evidence); week.miles=round(week.miles+(evidence.miles ?? 0));
    week.allocatedMiles=round(week.allocatedMiles+evidence.allocatedMiles); week.unallocatedMiles=round(week.unallocatedMiles+(evidence.unallocatedMiles ?? 0));
  }
  for(const row of list(business.fuel)) {
    const week=get(mondayForArchive(actualDay(row)));
    week.fuel.push(row);week.fuelTotal=round(week.fuelTotal+Number(row.total || 0));
    week.fuelGallons=Math.round((week.fuelGallons+Number(row.gallons || 0))*1000)/1000;
  }
  for(const row of list(business.expenses)) {
    const week=get(mondayForArchive(actualDay(row)));
    week.expenses.push(row);week.expenseTotal=round(week.expenseTotal+Number(row.total ?? row.amount ?? 0));
  }
  for(const raw of deduplicateArchiveDocuments(list(business.documents))) {
    const doc=archiveDocument(raw,state),dates=doc.archiveEventDays.length?doc.archiveEventDays:[day(doc.documentDate || doc.document_date || doc.vaultDate || doc.extracted?.documentDate || doc.extracted?.date)];
    const starts=[...new Set(dates.map(mondayForArchive))];
    for(const start of starts)get(start).documents.push(doc);
  }
  for (const week of weeks.values()) {
    week.complete=week.items.filter(f=>f.status==='complete').length; week.attention=week.items.length-week.complete; week.amazon=week.items.filter(f=>f.isAmazon).length;
    // Revenue is shown once, on the final actual activity date. Payment has its own date.
    week.revenue=week.items.filter(f=>mondayForArchive(f.days?.at(-1))===week.start).reduce((s,f)=>s+Number(f.revenue || 0),0);
  }
  return [...weeks.values()].sort((a,b)=>b.start.localeCompare(a.start));
}
