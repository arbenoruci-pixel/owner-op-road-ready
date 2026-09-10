// Read-only projection: evidence may complete a guide step, never create a RODS row.
import { instructionBrokerKeyV110311 as brokerKey } from './instructionAuthorityV110311.js';

const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
const list = value => Array.isArray(value) ? value.filter(Boolean) : [];
const rows = value => Object.values(value || {}).flatMap(list);
const ref = value => text(value).toUpperCase().replace(/^(?:(?:LOAD|BOL|PO|ORDER)(?:\s*(?:NO|NUMBER))?\s*[#:\-]?\s*)(?=\d)/, '').replace(/[^A-Z0-9]/g, '');
const tokens = value => text(value).split(/[·,;|\n]/).map(ref).filter(Boolean);
const refs = value => [...new Set([
  ...['canonicalLoadNo','loadNo','shippingDocs','orderNo','legNo','bol','bolNo','bolNumber','po','poNumber','pickupNumber','deliveryNo','pickedUpLoadNo','deliveredLoadNo'].flatMap(k => tokens(value?.[k])),
  ...list(value?.poNumbers).flatMap(tokens),
  ...[...list(value?.aliases), ...list(value?.references)].flatMap(a => typeof a === 'object'
    ? /^(load_number|order_number|leg_number|bol_number|po_number|pickup_number|sales_order|delivery_number)$/.test(a.kind) ? tokens(a.value) : [] : tokens(a)),
])];
const canonical = value => ref(value?.canonicalLoadNo ?? value?.loadNo ?? value?.orderNo);
const hidden = value => value?.deleted === true || value?.deletedAt || value?.archivedAt || /^(archived|deleted|cancelled|canceled|dismissed|superseded|void)$/.test(text(value?.status).toLowerCase());
const usableDoc = value => !hidden(value) && value?.loadAssignmentStatusV11037 !== 'unassigned' && ![value?.status,value?.reviewStatus].some(v => /^(needs_review|unassigned|pending)$/.test(text(v)));
const docIds = value => ['id','documentId','localDocumentId','local_id','clientDocumentId','client_document_id'].map(k => text(value?.[k])).filter(Boolean);
const kind = value => text(value?.type || value?.classification?.selectedType || value?.extracted?.type).toLowerCase().replace(/[ -]+/g, '_');
const isBol = value => ['bol','bill_of_lading'].includes(kind(value));
const isPod = value => ['pod','proof_of_delivery','delivery_receipt'].includes(kind(value));
const signed = value => (value.podSigned ?? value.extracted?.podSigned) === true;
const isoDay = value => /^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? text(value) : '';
const time = (day, minute = 0) => isoDay(day) ? Date.parse(day + 'T00:00:00Z') / 60000 + Number(minute) : NaN;
const cityKey = value => text(value).toLowerCase().replace(/\bsaint\b/g, 'st').replace(/[^a-z0-9]+/g, ' ').trim();
function place(value = {}) {
  const location = value.location || value.stopLocation || value.cityState || '';
  const match = typeof location === 'string' && location.match(/^(.+?),\s*([A-Z]{2})\b/i);
  return {city:cityKey(value.city || location?.city || match?.[1]), state:text(value.state || location?.state || match?.[2]).toUpperCase()};
}
function samePlace(a, b) {
  const x = place(a), y = place(b);
  return !!x.city && !!y.city && x.city === y.city && (!y.state || x.state === y.state);
}
function activity(event) {
  const values = [...list(event.reasons), ...list(event.activities), ...list(event.activityCodes), event.reason,event.note,event.description,event.operation,event.action,event.trailerAction,event.activity];
  return values.map(v => typeof v === 'object' ? text(v.label || v.name || v.code || v.id) : text(v)).join(' ').toLowerCase();
}
const pretrip = event => /\bpti\b|\bpre[\s\u2010-\u2015-]*trip\b/.test(activity(event));
const pickup = event => /\bpick\s*up\b|\bpickup\b|\bloading\b|\bhook(?:ed)?\b/.test(activity(event));
const delivery = event => /\bdelivery\b|\bunloading\b|\bdelivered\b|\bdrop\s*off\b/.test(activity(event));
const trailerReturn = event => /\btrailer\s*(?:drop|return)\b|\breturn(?:ed)?\s*(?:empty\s*)?trailer\b/.test(activity(event));

function documents(state, store) {
  // A loaded Vault collection is authoritative, including records removed entirely.
  // Logbook document rows are reference summaries, not a second live Vault.
  if (Array.isArray(store.documents)) return list(store.documents);
  return rows(state.documentsByDay);
}
function nowOnLogClock(state, now) {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:state.homeTerminalTimeZone || 'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).map(p => [p.type,p.value]));
    return time(`${parts.year}-${parts.month}-${parts.day}`, Number(parts.hour)*60+Number(parts.minute));
  } catch { return now / 60000; }
}
function eventEntries(state, now) {
  const clock = nowOnLogClock(state, now);
  return Object.entries(state.eventsByDay || {}).flatMap(([day, events]) => list(events).filter(e => !hidden(e) && e.isDeleted !== true && e.source !== 'document_reference').map(event => ({event, day, at:time(day,event.startMin)})))
    .filter(e => Number.isFinite(e.at) && e.at <= clock).sort((a,b) => a.at-b.at).map((entry,index,all) => {
      const rawEnd = entry.event.endMin == null ? NaN : time(entry.day,entry.event.endMin);
      const next = all[index+1]?.at;
      const end = Math.min(Number.isFinite(rawEnd) ? rawEnd : Infinity, next ?? Infinity);
      return {...entry, end, closed:Number.isFinite(end) && end > entry.at && end <= clock};
    });
}
function checklistItems(value) {
  const items = Array.isArray(value) ? value : value == null ? [] : [value];
  return items.map(item => {
    if (typeof item !== 'object' || !item) return text(item);
    if (text(item.text || item.label)) return text(item.text || item.label);
    const keys = Object.keys(item);
    if (keys.length && keys.every(k => /^\d+$/.test(k) && typeof item[k] === 'string')) return keys.sort((a,b)=>Number(a)-Number(b)).map(k=>item[k]).join('').trim();
    return 'Review saved checklist item';
  }).filter(Boolean);
}
const logEvidence = entry => entry && ({source:'logbook',eventId:text(entry.event.id),day:entry.day,label:`Logbook · ${entry.day} · ${String(Math.floor(Number(entry.event.startMin)/60)).padStart(2,'0')}:${String(Number(entry.event.startMin)%60).padStart(2,'0')}`});
const documentEvidence = doc => doc && ({source:'document',documentId:docIds(doc)[0] || '',day:isoDay(doc.documentDate || doc.date),label:signed(doc) ? 'Signed delivery document saved' : 'Load document saved'});

export function resolveChecklistEvidenceV110321(state = {}, guide = null, store = {}, {now = Date.now()} = {}) {
  if (!guide) return {guide:null,steps:[],completed:0,total:0,percent:0,currentStep:null,complete:false,pickupPresent:false,bol:null};
  guide = {...guide,steps:list(guide.steps).map(step=>({...step,checklist:checklistItems(step.checklist)}))};
  const stops = list(guide.stops), pickupStop = stops.find(s => s.type === 'pickup');
  const deliveries = stops.filter(s => s.type === 'delivery').map((s,i) => ({...s,deliverySequence:i+1}));
  const allDocs = documents(state,store);
  const core = canonical(guide);
  const brokerMatches = value => !value.broker || !guide.broker || brokerKey(value.broker) === brokerKey(guide.broker);
  const ownedLoads = list(store.loads).filter(l => canonical(l) === core && brokerMatches(l) && !hidden(l));
  const pointerIds = new Set([guide.sourceDocumentId,...Object.values(guide.documents || {}).flatMap(v => Array.isArray(v) ? v : [v])].filter(v => typeof v === 'string'));
  const ownedDocs = allDocs.filter(d => usableDoc(d) && brokerMatches(d) && (canonical(d) ? canonical(d) === core : docIds(d).some(id => pointerIds.has(id))));
  const aliases = new Set([core,...refs(guide),...stops.flatMap(refs),...ownedLoads.flatMap(refs),...ownedDocs.flatMap(d => [...refs(d),...refs(d.extracted)])].filter(Boolean));
  const others = [...Object.values(state.loadGuidesById || {}),...list(store.loads),...allDocs.filter(usableDoc)].filter(v => canonical(v) && (canonical(v) !== core || !brokerMatches(v)));
  const otherCanonical = new Set(others.map(canonical));
  const ambiguous = new Set(others.flatMap(v => [...refs(v),...refs(v.extracted),...list(v.stops).flatMap(refs)]));
  const matches = value => {
    if (hidden(value) || value.noLoadDeclared === true || !brokerMatches(value)) return false;
    const explicitGuide = text(value.guideId || value.loadGroupId);
    if (explicitGuide && explicitGuide !== text(guide.id)) return false;
    if (value.canonicalLoadNo && canonical(value) !== core) return false;
    const primary = ref(value.loadNo || value.orderNo);
    if (primary && primary !== core && otherCanonical.has(primary)) return false;
    const own = refs(value);
    if (own.length) return own.some(r => aliases.has(r) && !ambiguous.has(r));
    return !!explicitGuide && explicitGuide === text(guide.id);
  };
  const dates = [guide.pickupDate,...stops.map(s=>s.date),guide.deliveryDate].map(isoDay).filter(Boolean).sort();
  const lower = dates.length ? time(dates[0])-1440 : -Infinity;
  const upper = dates.length ? time(dates.at(-1))+3*1440 : Infinity;
  const all = eventEntries(state,now);
  const entries = all.filter(e => e.at >= lower && e.at < upper);
  const linked = entries.filter(e => matches(e.event));
  function stopFor(value, candidates, doc = false) {
    const id = text(value.deliveryStopId || value.stopId);
    const seq = Number(value.deliveryStopSequence || value.stopSequence || 0);
    const explicit = id ? candidates.find(s=>s.id===id) : seq ? candidates.find(s=>s.deliverySequence===seq) : null;
    if (id || seq) return explicit && (!place(value).city || samePlace(value,explicit)) ? explicit : null;
    const located = candidates.filter(s=>samePlace(value,s));
    if (located.length === 1) return located[0];
    if (located.length > 1) {
      const day = isoDay(value._day || value.documentDate || value.date);
      const dated = located.filter(s=>s.date === day);
      return dated.length === 1 ? dated[0] : null;
    }
    if (place(value).city) return null;
    // An exact load link can identify the only freight receiver, never a return stop.
    return candidates.length === 1 && candidates[0].role !== 'trailer_return' && (doc || matches(value)) ? candidates[0] : null;
  }
  function arrivalFor(stop, isPickup = false) {
    return entries.find(entry => {
      const e = entry.event;
      if (e.status !== 'ON' || !(isPickup ? pickup(e) : stop.role === 'trailer_return' ? trailerReturn(e) : delivery(e))) return false;
      if (!matches(e)) return false;
      if (isPickup) return !place(e).city || samePlace(e,stop);
      return stopFor({...e,_day:entry.day},deliveries)?.deliverySequence === stop.deliverySequence;
    });
  }
  const atPickup = pickupStop && arrivalFor(pickupStop,true);
  const arrivals = new Map(deliveries.map(s=>[s.deliverySequence,arrivalFor(s)]));
  let pti = linked.find(e=>e.event.status==='ON' && pretrip(e.event) && e.closed);
  if (!pti) {
    // PTI often has no load number. Reuse it only immediately before this load's
    // first linked work, on the same log day, with no intervening duty/load event.
    const anchor = linked.find(e=>e.event.status==='D' || e.event.status==='ON' && (pickup(e.event)||delivery(e.event)));
    const prior = anchor && all[all.indexOf(all.find(e=>e.event===anchor.event))-1];
    if (prior && prior.day===anchor.day && prior.closed && anchor.at-prior.end <= 60 && prior.event.status==='ON' && pretrip(prior.event) && !refs(prior.event).length && !prior.event.noLoadDeclared && !(prior.event.guideId || prior.event.loadGroupId)) pti=prior;
  }
  const bol = ownedDocs.find(isBol) || null;
  const freightStops = deliveries.filter(s=>s.role!=='trailer_return');
  const pods = new Map();
  for (const doc of ownedDocs.filter(d=>(isBol(d)||isPod(d)) && signed(d))) {
    const located = {...doc,location:doc.stopLocation || doc.extracted?.destination,city:doc.city || doc.extracted?.deliveryCity,state:doc.state || doc.extracted?.deliveryState};
    const stop = stopFor(located,freightStops,true);
    if (stop) pods.set(stop.deliverySequence,doc);
  }
  function departure(arrival, nextArrival) {
    if (!arrival?.closed) return null;
    return entries.find(entry => {
      if (entry.event.status !== 'D' || entry.at < arrival.end || entry.at >= (nextArrival?.at ?? Infinity)) return false;
      if (matches(entry.event)) return true;
      if (refs(entry.event).length || entry.event.noLoadDeclared) return false;
      const previous = all[all.findIndex(e=>e.event===entry.event)-1];
      return previous?.event === arrival.event && entry.at-arrival.end <= 5;
    });
  }
  const drivePickup = departure(atPickup,arrivals.get(1));
  const departures = new Map(deliveries.map(s=>[s.deliverySequence,departure(arrivals.get(s.deliverySequence),arrivals.get(s.deliverySequence+1))]));
  const evidence = new Map();
  const put = (ids,value) => { if(value) for(const id of ids) evidence.set(id,value); };
  put(['pretrip'],logEvidence(pti));
  put(['route_pickup','arrive_pickup'],logEvidence(atPickup));
  put(['pickup_bol'],documentEvidence(bol));
  put(['depart_pickup'],logEvidence(drivePickup));
  for (const stop of deliveries) {
    const n=stop.deliverySequence, arrival=arrivals.get(n), pod=pods.get(n), drive=departures.get(n);
    put([`route_delivery_${n}`,`arrive_delivery_${n}`],logEvidence(arrival));
    put([`route_delivery_${n}`],documentEvidence(pod));
    put([`depart_delivery_${n}`],logEvidence(drive));
    if (arrival?.closed && (drive || pod || arrival.event.deliveryCompleted === true)) put([`complete_stop_${n}`],logEvidence(arrival));
    if (pod) put([`complete_stop_${n}`],documentEvidence(pod));
    const paperStep=list(guide.steps).find(s=>s.id===`delivery_docs_${n}`);
    const remaining=list(paperStep?.checklist).filter(item=>!/^Collect signed POD$|^PO\s/i.test(text(item)));
    if (pod && !remaining.length) put([`delivery_docs_${n}`],documentEvidence(pod));
  }
  const finalPodStep=list(guide.steps).find(s=>s.id==='final_pod');
  const finalPod=pods.get(Number(finalPodStep?.stopSequence) || freightStops.at(-1)?.deliverySequence);
  put(['final_pod'],documentEvidence(finalPod));
  const ready=list(guide.steps).find(s=>s.id==='pickup_ready');
  if (atPickup && ready && list(ready.checklist).length && list(ready.checklist).every(s=>/^(Pickup #|Equipment:)/.test(text(s)))) put(['pickup_ready'],logEvidence(atPickup));
  const steps=list(guide.steps).map(step=>{
    const manual=!!guide.manualDone?.[step.id] || step.kind==='complete_stop' && list(guide.completedStopIds).map(String).includes(String(step.stopSequence));
    const proof=evidence.get(step.id);
    return {...step,complete:manual||!!proof,completedAt:manual ? guide.manualDone?.[step.id] || null : null,completionSource:proof?.source || (manual?'manual':''),completionEvidence:proof || null};
  });
  const completed=steps.filter(s=>s.complete).length,total=steps.length;
  const currentStep=steps.find(s=>!s.complete)||null;
  return {guide,steps,completed,total,percent:total?Math.round(completed/total*100):0,currentStep,complete:total>0&&completed===total,pickupPresent:!!atPickup,bol,completedStops:steps.filter(s=>s.kind==='complete_stop'&&s.complete).length,currentStopSequence:Number(currentStep?.stopSequence||0)};
}
