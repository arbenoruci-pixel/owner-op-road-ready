// Filing choices only. This never changes a load's operational status or assigns
// the scanned document based on list order.
const text=value=>String(value??'').trim();
const no=value=>text(value).toUpperCase();
const closed=value=>/^(?:completed?|delivered|closed|paid|submitted|invoiced|archived|cancelled|canceled|tonu)$/i.test(text(value));
const hidden=value=>/^(?:deleted|removed)$/i.test(text(value));
const date=value=>/^\d{4}-\d{2}-\d{2}$/.test(text(value))?text(value):'';
const at=value=>{const n=typeof value==='number'?value:Date.parse(value);return Number.isFinite(n)?n:0;};
const array=value=>Array.isArray(value)?value:[];
const fields=['broker','carrierName','origin','destination','pickupDate','deliveryDate'];
export function loadPickerCandidates(base=[],state={},store={}){
 const rows=new Map();
 for(const candidate of base){if(candidate?.loadNo&&!hidden(candidate.status))rows.set(no(candidate.loadNo),{...candidate,loadNo:no(candidate.loadNo)});}
 const add=(record,source)=>{
  const loadNo=no(record.canonicalLoadNo||record.loadNo);
  if(!loadNo||hidden(record.status))return;
  const previous=rows.get(loadNo);
  // A document can enrich an existing association; it cannot create work.
  if(!previous&&source==='document')return;
  const next={...(previous||record),loadNo};
  for(const key of fields)if(!text(next[key])&&text(record[key]))next[key]=text(record[key]);
  if(!text(next.displayCompany))next.displayCompany=text(record.carrier);
  next.updatedAt=Math.max(at(next.updatedAt),at(record.updatedAt||record.createdAt));
  if(!previous){next.status=closed(record.operationalStatus||record.status)?'completed':'open';next.active=record.active===true;}
  rows.set(loadNo,next);
 };
 for(const load of array(store.loads))add(load,'load');
 for(const doc of array(store.documents))add({...doc,...doc.fields,...doc.extracted,canonicalLoadNo:doc.canonicalLoadNo||doc.loadNo||doc.extracted?.canonicalLoadNo||doc.extracted?.loadNo},'document');
 const activeNo=no(state.loadInfo?.loadNo||state.loadInfo?.shippingDocs);
 const activeGuide=state.loadGuidesById?.[state.activeLoadGuideId];
 return [...rows.values()].map(candidate=>{
  const complete=closed(candidate.operationalStatus)||closed(candidate.status);
  const active=!complete&&(candidate.active===true||candidate.loadNo===activeNo||candidate.loadNo===no(activeGuide?.loadNo));
  return {...candidate,status:complete?'completed':'open',active,
   company:text(candidate.broker)||text(candidate.carrierName)||text(candidate.displayCompany),
   recentAt:Math.max(at(candidate.latestPickupAt),at(candidate.latestActivityAt),at(date(candidate.deliveryDate)),at(date(candidate.pickupDate)))||at(candidate.updatedAt),
  };
 }).sort((a,b)=>Number(b.active)-Number(a.active)||Number(a.status==='completed')-Number(b.status==='completed')||b.recentAt-a.recentAt||a.loadNo.localeCompare(b.loadNo));
}

export function podReadingMessage(type,snapshot){
 if(type!=='pod')return '';
 const groups=array(snapshot?.groups);
 const pod=groups.find(group=>group.kind==='pod');
 if(pod)return 'Delivery evidence was found. Check the receiver signature and delivery date before saving.';
 if(groups.some(group=>group.kind==='bol'))return 'You selected POD. The reader found a bill of lading; it could not verify a receiver signature or delivery date. Check the signed original before saving as POD.';
 return 'You selected POD. The reader could not verify delivery evidence. Check the receiver signature and delivery date on the original.';
}
