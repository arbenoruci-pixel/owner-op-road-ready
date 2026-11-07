// Read-only folder projection. Closing a trip changes its view, never its files.
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
function unique(docs){const seen=new Set();return docs.filter(d=>{const k=text(d.sha256||d.content_hash)||documentIdentity(d);if(!k||seen.has(k))return false;seen.add(k);return true;});}
function closed(source={}){
 return Boolean(source.shipmentCompletionReview)||[source.operationalStatus,source.documentWorkflowStage,source.serviceStatus,source.status]
  .some(v=>/^(delivered|completed|closed|invoice_ready|invoiced|submitted|paid|cancelled|canceled|tonu|archived)$/i.test(text(v)));
}
function docLoad(d){return ref(d.workspaceFilingAppliedV110477&&!d.repairOverlayApplied?d.evidenceFilingV1?.loadNo:d.canonicalLoadNo||d.load_no||d.loadNo);}
export function buildSmartFolders({folders=[],candidates=[],documents=[],state={},businessStore={}}={}){
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
export function requestedScanFolder(context,type,candidates=[]){
 if(!context?.loadNo||!['bol','pod','delivery_receipt','fuel_receipt','expense_receipt','other_expense','invoice','load_invoice','toll_receipt','toll_parking_receipt'].includes(type))return '';
 const candidate=candidates.find(c=>match(c.loadNo)===match(context.loadNo));
 return candidate&&!candidate.shipmentAmbiguous?candidate.loadNo:'';
}
