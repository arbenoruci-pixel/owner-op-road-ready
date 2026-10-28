import {projectReviewedCopies} from './sourceCopiesV110419.js';
// Read-only identity and proof checks. Never rewrite original files or duty events.
const text=v=>String(v??'').trim();
const list=v=>Array.isArray(v)?v:[];
const ref=v=>text(v).toUpperCase();
const hash=d=>text(d.sha256||d.content_hash||d.contentHash).toLowerCase();
const load=d=>ref(d.load_no||d.loadNo||d.canonicalLoadNo);
export function reviewedReferenceAliases(store={},documents=[],base={}) {
  const unresolved=new Set(list(store.evidenceAliases).map(a=>ref(a.from)).filter(from=>!base[from]));
  const owners=new Map(),primary=new Set(list(store.loads).map(load));
  const add=(from,to)=>{from=ref(from);to=ref(to);if(!/^[A-Z0-9][A-Z0-9._/-]{0,79}$/.test(from)||!primary.has(to)||from===to)return;if(!owners.has(from))owners.set(from,new Set());owners.get(from).add(to);};
  for(const [from,to] of Object.entries(base))add(from,to);
  for(const row of list(store.loads))for(const a of list(row.aliases))add(typeof a==='string'?a:a?.value,load(row));
  for(const doc of projectReviewedCopies([...list(store.documents),...list(documents)],value=>base[ref(value)]||ref(value))) {
    const review=doc.extracted?.evidenceFactsV1,sha=hash(doc),target=base[load(doc)]||load(doc);
    if(doc.sourceCopyConflictV110419||review?.version!==1||!['driver_review','source_recovery'].includes(review.source)||!review.reviewedAt||!/^[a-f0-9]{64}$/.test(sha)||review.sourceSha256!==sha||[doc.sha256,doc.content_hash,doc.contentHash].filter(Boolean).some(h=>text(h).toLowerCase()!==sha))continue;
    const parts=Array.isArray(review.components)&&review.components.length?review.components:[{kind:doc.document_type||doc.type,fields:review.fields,reviewed:true}];
    for(const c of parts) {
      if(!c.reviewed||!['rate_confirmation','bol','pod'].includes(c.kind))continue;
      const f={...review.fields,...c.fields};
      if((base[ref(f.loadNo)]||ref(f.loadNo))!==target)continue;
      for(const k of ['poNumber','po','bolNumber','bolNo','pickupNumber'])add(f[k],target);
      if(['bol','pod'].includes(c.kind))add(f.reference,target);
    }
  }
  const out={...base};
  for(const [from,targets] of owners) {
    if(Object.hasOwn(base,from))continue; // Explicit reviewed folder renames remain authoritative.
    // A primary load number, or a reference shared by contracts, is never an alias.
    if(unresolved.has(from)||primary.has(from)||targets.size!==1){delete out[from];continue;}
    out[from]=[...targets][0];
  }
  return out;
}
export function deliveryStopCoverage(load={},parts=[]) {
  const stops=list(load.stops).filter(s=>/^(delivery|drop|dropoff)$/i.test(s.type||s.kind));
  const declared=Math.max(Number(load.repairDeliveryStops||0),Number(load.deliveryStopCount||0),stops.length);
  const multiple=declared>1||/\s\/\s|;|\b(?:multi[ -]?stop|\d+\s+(?:delivery\s+)?stops)\b/i.test(text(load.destination));
  if(!multiple)return {required:false,complete:parts.length>0};
  if(stops.length<2||declared>stops.length)return {required:true,complete:false,detail:'Review the delivery stops and match proof to each receiver.'};
  const key=s=>text(s.id||s.stopId)||String(s.stopSequence||s.sequence||'');
  const keys=stops.map(key);
  if(keys.some(k=>!k)||new Set(keys).size!==keys.length)return {required:true,complete:false,detail:'Review the delivery stop identities before completing proof.'};
  const covered=new Set();
  for(const part of parts){
    const f=part.fields||{};
    const matches=stops.filter(s=>f.stopId?text(f.stopId)===text(s.id||s.stopId):f.stopSequence&&Number(f.stopSequence)===Number(s.stopSequence||s.sequence));
    if(matches.length===1)covered.add(key(matches[0]));
  }
  const complete=covered.size===stops.length;
  return {required:true,complete,covered:covered.size,total:stops.length,detail:complete?'Reviewed delivery proof for every stop':`${covered.size} of ${stops.length} delivery stops have matched proof. Review the remaining receivers.`};
}
export function uniqueLoadRecordIds(store={}) {
  const counts=new Map(),used=new Set(list(store.loads).map(l=>text(l.id)));
  for(const row of list(store.loads))counts.set(text(row.id),(counts.get(text(row.id))||0)+1);
  let changed=false;
  const loads=list(store.loads).map(row=>{
    if(counts.get(text(row.id))===1&&row.id)return row;
    const base=`${row.id||'load'}:identity:${encodeURIComponent(load(row)||'unassigned')}`;
    let id=base,n=1;while(used.has(id))id=base+':'+(++n);used.add(id);changed=true;
    return {...row,id,recordIdentityRepairV1:{previousId:row.id||'',loadNo:load(row),reason:'duplicate_record_id'}};
  });
  return changed?{...store,loads}:store;
}
export function assertUniqueBusinessTarget(store,bucket,id) {
  if(!Array.isArray(store[bucket])||store[bucket].filter(r=>r.id===id).length!==1)throw Error('This record has an ambiguous or stale ID. Reopen the list and select its load and original.');
}
export function safeDocumentAssignment(doc,assignment,documents,idOf,loadOf) {
  if(!assignment)return null;
  const peers=documents.filter(d=>idOf(d)===idOf(doc));
  const contexts=new Set(peers.map(d=>[loadOf(d),hash(d)].join('|')));
  if(contexts.size>1)return null;
  return assignment;
}
// Optional reference/stop fields are editable without making them universal requirements.
export function reviewFieldNames(kind,required=[]) {
  const extra={rate_confirmation:['poNumber','bolNumber','pickupNumber'],bol:['poNumber','bolNumber','pickupNumber'],pod:['stopId','stopSequence'],delivery_evidence:['stopId','stopSequence']};
  return [...new Set([...required,...(extra[kind]||[])])];
}
export function componentsAfterReview(components,kind,fields) {
  if(components.length===1&&components[0].kind===kind)return [{...components[0],fields:{...components[0].fields,...fields}}];
  // Multi-document packet page facts need their own review; a header edit cannot overwrite them.
  return components;
}
