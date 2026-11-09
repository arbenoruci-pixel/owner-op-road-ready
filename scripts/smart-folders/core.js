// Read-only folder projection. Closing a trip changes its view, never its files.
// Owner-requested retirement of one orphaned 2021 test-scan folder. The PDF
// original stays in Files and immutable account history; no HOS data changes.
// A real/new load with the same number is never excluded.
export function isRetiredTestScanFolder(folder={}) {
 if(String(folder.reference||'').trim()!=='1741530'||folder.shipment)return false;
 if(String(folder.origin||'').trim()||String(folder.destination||'').trim())return false;
 if((folder.logs||[]).length!==0||(folder.documents||[]).length!==1)return false;
 const doc=folder.documents[0]||{};
 const date=String(doc.documentDate||doc.document_date||doc.date||doc.extracted?.pickupDate||'').slice(0,10);
 const name=String(doc.fileName||doc.original_file_name||doc.title||'').trim().toLowerCase();
 return date==='2021-10-23'&&name==='scanned-document.pdf';
}
const text=v=>String(v??'').trim();
const list=v=>Array.isArray(v)?v:[];
const ref=v=>text(v).toUpperCase();
const match=v=>ref(v).replace(/[^A-Z0-9]/g,'');
const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(text(v).slice(0,10))?text(v).slice(0,10):'';
export function savedTime(d={}){
 for(const v of [d.created_at,d.createdAt,d.savedAt,d.updated_at,d.updatedAt]){
  const n=typeof v==='number'?v:/^\d{12,}$/.test(text(v))?Number(v):Date.parse(v);
  if(Number.isFinite(n)&&n>0)return n;
 }return 0;
}
export const documentIdentity=d=>text(d.client_document_id||d.clientDocumentId||d.local_id||d.localDocumentId||d.id);
export function documentType(d={}){
 const t=text(d.document_type||d.type||d.extracted?.type).toLowerCase();
 return ({proof_of_delivery:'pod',delivery_receipt:'pod',bill_of_lading:'bol',ratecon:'rate_confirmation',rate_con:'rate_confirmation',fuel:'fuel_receipt',load_invoice:'invoice'})[t]||t;
}
export function documentLabel(d={}){
 const labels={rate_confirmation:'Ratecon',bol:'Pickup BOL',pod:'POD',fuel_receipt:'Fuel receipt',invoice:'Invoice'};
 const identity=ref(d.canonicalLoadNo||d.load_no||d.loadNo)||ref(d.shipmentReference);
 const title=labels[documentType(d)]||text(d.title||d.original_file_name||d.fileName)||'Document';
 return title+(identity?' · '+identity:'');
}
export function originalSyncLabel(d={}){
 const state=text(d.sync_state||d.syncState||d.cloud?.status).toLowerCase();
 return ['signed_out','local_only','pending','pending_upload','queued','error','failed'].includes(state)?'Original sync pending':'';
}
function unique(docs){
 const hashOf=d=>text(d.sha256||d.content_hash).toLowerCase(),hashesByIdentity=new Map();
 // Local and business projections can carry the same stable ID while only one
 // carries its checksum. Resolve that link before deduping so order cannot split
 // one original into two. Conflicting known checksums stay separate for review.
 for(const d of docs){const id=documentIdentity(d),hash=hashOf(d);if(!id||!hash)continue;const hashes=hashesByIdentity.get(id)||new Set();hashes.add(hash);hashesByIdentity.set(id,hashes);}
 const saved=new Map();
 for(const d of docs){
  const id=documentIdentity(d),hash=hashOf(d),known=hashesByIdentity.get(id);
  const resolvedHash=hash||(known?.size===1?[...known][0]:'');
  const key=resolvedHash?'hash:'+resolvedHash:id?'id:'+id:'';if(!key)continue;
  const previous=saved.get(key);
  if(!previous){saved.set(key,d);continue;}
  // Keep checksum-bearing metadata authoritative. Do not combine unrelated
  // records just because they contain identical bytes.
  if(id&&id===documentIdentity(previous))saved.set(key,hash?{...previous,...d}:{...d,...previous});
  else if(!hashOf(previous)&&hash)saved.set(key,d);
 }
 return [...saved.values()];
}
function closed(source={}){
 return Boolean(source.shipmentCompletionReview)||[source.operationalStatus,source.documentWorkflowStage,source.serviceStatus,source.status]
  .some(v=>/^(delivered|completed|closed|invoice_ready|invoiced|submitted|paid|cancelled|canceled|tonu|archived)$/i.test(text(v)));
}
function docLoad(d){return ref(d.workspaceFilingAppliedV110477&&!d.repairOverlayApplied?d.evidenceFilingV1?.loadNo:d.canonicalLoadNo||d.load_no||d.loadNo);}
export function buildSmartFolders({folders=[],candidates=[],documents=[],state={},businessStore={},reviewedAliases={}}={}){
 const map=new Map(),aliases=new Map();
 function addAlias(value,key){const normalized=match(value);if(!normalized)return;const keys=aliases.get(normalized)||new Set();keys.add(key);aliases.set(normalized,keys);}
 function add(source,shipment=false){
  const reference=ref(shipment?source.shipmentReference||source.loadNo:source.loadNo||source.canonicalLoadNo);if(!reference)return;
  const id=(shipment?'shipment:':'load:')+reference,old=map.get(id);
  const merged={...old?.source,...source};
  map.set(id,{...old,id,reference,shipment,loadNo:shipment?'':reference,source:merged,documents:[],origin:merged.origin||'',destination:merged.destination||'',broker:shipment?'':merged.broker||'',completed:closed(merged)});
  if(!shipment){addAlias(reference,id);for(const a of list(source.aliases))if(a.source!=='load_info')addAlias(a.value,id);}
 }
 for(const f of folders)add(f);
 for(const c of candidates.filter(c=>!c.shipmentFiling))add(c);
 for(const stored of list(businessStore.loads)){const id='load:'+ref(stored.loadNo||stored.canonicalLoadNo);if(map.has(id))add(stored);}
 // Reuse the reviewed identity resolver used by document reconciliation. Add
 // owners before joining shipments so conflicting references stay separate.
 for(const [from,to] of Object.entries(reviewedAliases)){
  const id='load:'+ref(to);if(map.has(id))addAlias(from,id);
 }
 for(const c of candidates.filter(c=>c.shipmentFiling)){
  const owners=aliases.get(match(c.shipmentReference));
  if(owners?.size===1){const f=map.get([...owners][0]);f.source={...c,...f.source};f.completed=f.completed||closed(c);addAlias(c.shipmentReference,f.id);}
  else add(c,true);
 }
 const unfiled=[];
 // Assign each saved association before deduplicating bytes within its folder.
 // A duplicate in another folder (or unfiled) must not hide an explicit link.
 for(const d of documents){
  const number=docLoad(d),shipment=ref(d.shipmentReference||d.extracted?.shipmentReference);
  let f;
  if(number){const owners=aliases.get(match(number));f=owners?.size===1?map.get([...owners][0]):map.get('load:'+number);}
  else if(shipment){
   const owners=aliases.get(match(shipment));f=owners?.size===1?map.get([...owners][0]):map.get('shipment:'+shipment);
   if(!f){add({shipmentReference:shipment,pickupDate:d.shipmentDay,origin:d.shipmentOrigin,destination:d.shipmentDestination,status:'unknown'},true);f=map.get('shipment:'+shipment);}
  }
  if(f)f.documents.push(d);else unfiled.push(d);
 }
 for(const f of map.values()){
  if(!f.shipment){
   const reviewed=Object.entries(reviewedAliases).filter(([from,to])=>ref(to)===f.reference&&aliases.get(match(from))?.size===1)
    .map(([value])=>({kind:'bol_number',value,source:'reviewed_folder_alias'}));
   if(reviewed.length)f.source={...f.source,aliases:[...list(f.source.aliases),...reviewed]};
  }
  f.documents=unique(f.documents).sort((a,b)=>savedTime(b)-savedTime(a));
  f.updatedAt=Math.max(Number(f.source.latestActivityAt)||0,Number(f.source.updatedAt)||0,Date.parse(f.source.deliveryDate||f.source.pickupDate)||0,...f.documents.map(savedTime));
  f.logs=linkedLogbooks(f,state);
 }
 return {folders:[...map.values()].sort((a,b)=>b.updatedAt-a.updatedAt||a.reference.localeCompare(b.reference)),unfiled:unique(unfiled).sort((a,b)=>savedTime(b)-savedTime(a))};
}
export function linkedLogbooks(folder,state={}){
 const source=folder.source,aliases=new Set([folder.reference,...list(source.aliases).filter(a=>a.source!=='load_info').map(a=>a.value)].map(match));
 const active=state.activeDriverId||state.teamDrivers?.[0]?.id||'driver_primary';
 const books={...(state.teamLogbooksByDriverId||{}),[active]:state};
 const out=[];
 for(const [driverId,book] of Object.entries(books)){
  const days=new Set();
  for(const [day,events]of Object.entries(book.eventsByDay||{}))if(list(events).some(e=>!e.deleted&&!e.deletedAt&&[e.loadNo,e.shippingDocs,e.bol,e.pickedUpLoadNo,e.deliveredLoadNo].some(v=>v&&aliases.has(match(v)))))days.add(day);
  for(const [day,form]of Object.entries(book.formByDay||{}))if([form.loadNo,form.shippingDocs,form.bol].some(v=>v&&aliases.has(match(v))))days.add(day);
  // Explicit linked days supplied by the existing archive belong to the active driver.
  if(driverId===active)for(const d of list(source.days))if(date(d))days.add(date(d));
  const ordered=[...days].sort(),first=ordered[0],last=ordered.at(-1);
  // Include the saved intermediate daily logs of this recorded trip. Never infer
  // a second driver's range or a planned trip from a rate confirmation alone.
  if(first&&last&&Date.parse(last)-Date.parse(first)<=31*86400000){
   for(let t=Date.parse(first+'T12:00:00Z');t<=Date.parse(last+'T12:00:00Z');t+=86400000)days.add(new Date(t).toISOString().slice(0,10));
  }
  for(const day of [...days].sort())out.push({day,driverId,driverName:state.teamDrivers?.find(d=>d.id===driverId)?.name||book.driverProfile?.name||'Driver',
   available:Boolean(book.eventsByDay?.[day]?.length||book.signatureByDay?.[day]||Object.hasOwn(book.formByDay||{},day)),signed:Boolean(book.signatureByDay?.[day]),canOpen:driverId===active});
 }
 return out;
}
function kinds(doc){return new Set([documentType(doc),...list(doc.extracted?.evidenceFactsV1?.components).map(c=>c.kind)]);}
export function folderChecklist(folder,existingRows=[]){
 const pickedUp=folder.logs.length>0||Boolean(folder.source.shipmentEventId)||/^(in_transit|picked_up|delivered|completed)$/i.test(text(folder.source.operationalStatus||folder.source.status));
 return [['rate_confirmation','Ratecon',true],['bol','Pickup BOL',pickedUp||folder.completed],['pod','POD',folder.completed]].map(([kind,label,due])=>{
  const existing=existingRows.filter(r=>r.kind===kind),files=folder.documents.filter(d=>kinds(d).has(kind)||(kind==='bol'&&kinds(d).has('pod')));
  const knownSources=existing.flatMap(r=>r.sources||[]);
  const sources=knownSources.length?knownSources:files.map(doc=>({doc,pages:[]}));
  const docs=unique(sources.map(s=>s.doc));
  const missing=existing.some(r=>r.status==='missing'),review=existing.some(r=>r.status==='review')||Boolean(folder.shipment&&existing.length===0);
  const status=!docs.length?(due?'missing':'later'):missing?'partial':review?'review':'saved';
  const syncPending=docs.some(d=>originalSyncLabel(d));
  return {kind,label,due,sources,files:docs,status,detail:status==='missing'?'Missing':status==='later'?(kind==='pod'?'Add after delivery':'Add at pickup'):status==='partial'?'More documents needed':status==='review'?'Saved · check details':syncPending?'Saved · original sync pending':`${docs.length===1?'Saved':docs.length+' files saved'}`};
 });
}
export function folderSummary(rows){
 const missing=rows.filter(r=>['missing','partial'].includes(r.status)).map(r=>r.label);
 return missing.length?'Missing: '+missing.join(', '):rows.some(r=>r.status==='review')?'Documents saved · details to check':rows.some(r=>r.status==='later')?'Ready for the next stop':'Load paperwork saved';
}
const evidenceScanTypes=new Set(['bol','pod','delivery_receipt','fuel_receipt','expense_receipt','other_expense','invoice','load_invoice','toll_receipt','toll_parking_receipt']);
// A folder explicitly opened by the driver may exist without a Ratecon. Keep
// that filing choice local to this evidence scan; never grant dispatch authority.
export function explicitFolderScanCandidates(context,type,candidates=[],businessStore={}){
 if(!context?.loadNo||context.shipmentReference||!evidenceScanTypes.has(type))return candidates;
 const wanted=match(context.loadNo);if(!wanted)return candidates;
 // Existing shipment/source-backed candidates retain their original identity.
 if(candidates.some(c=>match(c.loadNo)===wanted||list(c.aliases).some(a=>a?.source!=='load_info'&&match(typeof a==='string'?a:a?.value)===wanted)))return candidates;
 const matches=list(businessStore.loads).filter(l=>match(l.loadNo||l.canonicalLoadNo)===wanted);
 if(matches.length!==1)return candidates;
 const load=matches[0];
 if(load.deleted||load.deletedAt||/^(deleted|removed|superseded)$/i.test(text(load.status))||load.shipmentFiling||load.shipmentAmbiguous)return candidates;
 const loadNo=ref(load.loadNo||load.canonicalLoadNo);
 const candidate={id:text(load.id)||'saved-folder:'+loadNo,loadNo,
  ...Object.fromEntries(['broker','origin','destination','pickupDate','deliveryDate'].map(k=>[k,text(load[k])])),
  status:closed(load)?'completed':'open',active:false,stops:list(load.stops).map(stop=>({...stop})),
  sourceKinds:['explicit_saved_folder'],aliases:[{kind:'load_number',value:loadNo,source:'explicit_saved_folder'}],
  evidenceFolderOnly:true};
 return [...candidates,candidate];
}
export function requestedScanFolder(context,type,candidates=[]){
 if(!context?.loadNo||!evidenceScanTypes.has(type))return '';
 const matches=candidates.filter(c=>match(c.loadNo)===match(context.loadNo));
 const candidate=matches.length===1?matches[0]:null;
 if(!candidate||candidate.shipmentAmbiguous)return '';
 if(Boolean(context.shipmentReference)!==Boolean(candidate.shipmentFiling))return '';
 if(context.shipmentReference&&match(candidate.shipmentReference||candidate.loadNo)!==match(context.shipmentReference))return '';
 if(candidates.some(c=>c!==candidate&&list(c.aliases).some(a=>a?.source!=='load_info'&&match(typeof a==='string'?a:a?.value)===match(context.loadNo))))return '';
 return candidate.loadNo;
}
