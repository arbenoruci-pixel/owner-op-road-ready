// Presentation only. Never infer delivery, overwrite identity, or mutate saved records.
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const names = {
  rate_confirmation:['RateCon','Rate confirmation'], bol:['BOL','Bill of lading'], pod:['POD','Proof of delivery'],
  lumper_receipt:['Lumper','Lumper receipts'], fuel_receipt:['Fuel','Fuel receipts'], invoice:['Invoice','Invoices'],
  scale_ticket:['Scale','Scale tickets'], expense_receipt:['Receipt','Receipts'], supporting_packet:['Packet','Document packets'],
  logbook_snapshot:['Logbook','Saved logbooks'], miles_snapshot:['Miles','Saved mileage'], other:['File','Other documents'],
};
const aliases = {ratecon:'rate_confirmation',rate_con:'rate_confirmation',carrier_confirmation:'rate_confirmation',load_confirmation:'rate_confirmation',bill_of_lading:'bol',proof_of_delivery:'pod',delivery_receipt:'pod',signed_bol:'pod',fuel:'fuel_receipt',lumper:'lumper_receipt',mileage_snapshot:'miles_snapshot'};
const order = Object.keys(names);
export function documentKind(doc = {}) {
  const raw = clean(doc.document_type || doc.type || doc.classification?.selectedType || doc.extracted?.type || 'other').toLowerCase().replace(/[\s-]+/g,'_');
  return aliases[raw] || raw;
}
export function documentId(doc = {}) { return clean(doc.local_id || doc.id || doc.client_document_id || doc.localDocumentId || doc.clientDocumentId); }
export function documentLoad(doc = {}) { return clean(doc.load_no || doc.loadNo || doc.canonicalLoadNo || doc.extracted?.canonicalLoadNo || doc.extracted?.loadNo).toUpperCase(); }
export function documentDate(doc = {}) {
  const raw=clean(doc.document_date || doc.documentDate || doc.extracted?.documentDate || doc.extracted?.date || doc.vaultDate).slice(0,10);
  const date=new Date(raw+'T12:00:00Z');
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) && Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===raw ? raw : '';
}
export function savedExport(doc) { return /^(logbook|miles)_snapshot$/.test(documentKind(doc)); }
export function documentGroups(documents = [], snapshots = false) {
  const groups = new Map(), seen = new Set();
  documents.forEach((doc,index) => {
    if (!doc || savedExport(doc)!==snapshots) return;
    const id=documentId(doc); if(id && seen.has(id)) return; if(id)seen.add(id);
    const type=documentKind(doc), key=names[type]?type:'other';
    if(!groups.has(key))groups.set(key,{id:key,badge:names[key][0],label:names[key][1],documents:[]});
    groups.get(key).documents.push(doc);
  });
  return [...groups.values()].sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id)).map(group=>({...group,documents:group.documents.slice().sort((a,b)=>Number(a.stopSequence||a.extracted?.stopSequence||0)-Number(b.stopSequence||b.extracted?.stopSequence||0)||documentDate(a).localeCompare(documentDate(b)))}));
}
export function documentCount(folder = {}) { return documentGroups(folder.documents).reduce((n,g)=>n+g.documents.length,0); }
export function documentDescription(doc = {}) {
  const stop=Number(doc.stopSequence||doc.stop_sequence||doc.extracted?.stopSequence||0);
  const ref=clean(doc.extracted?.bolNo || doc.extracted?.podNo || doc.extracted?.receiptNo || doc.extracted?.invoiceNo || doc.extracted?.poNumber);
  return [stop>0?`Stop ${stop}`:'',ref?`Ref ${ref}`:'',documentDate(doc)].filter(Boolean).join(' · ');
}
export function visibleWeeks(weeks = []) {
  return weeks.map(week=>({...week,documents:(week.documents||[]).filter(d=>!savedExport(d))})).filter(week=>week.items.length || week.documents.length);
}
