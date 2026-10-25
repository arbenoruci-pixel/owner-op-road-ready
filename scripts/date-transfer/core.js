import {canonical,hashValue} from './hash.js';
export const list=v=>Array.isArray(v)?v:[];
export const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
export const ref=v=>String(v||'').trim().toUpperCase();
export const loadNo=r=>ref(r?.brokerLoadNumber||r?.canonicalLoadNo||r?.load_no||r?.loadNo);
export function day(v){return /^\d{4}-\d{2}-\d{2}$/.test(v||'')&&Number.isFinite(Date.parse(v+'T12:00Z'))&&new Date(v+'T12:00Z').toISOString().slice(0,10)===v;}
export const within=(v,from,to)=>day(v)&&v>=from&&v<=to;
export const dayMap=(key,value)=>object(value)&&(/ByDay$|ByDate$/.test(key)||['certifyStatus','dailyLogs','logDays','days'].includes(key));
export const protectedMap=key=>/events|signature|inspection|certify|gps|form|miles|logbook|dutySafety|hos/i.test(key);
export function assertWindow(from,to){if(!day(from)||!day(to)||from>to)throw Error('Choose valid FROM and TO dates.');}
const rowDay=r=>String(r?.log_date||r?.date||r?.document_date||r?.documentDate||r?.pickupDate||r?.created_at||'').slice(0,10);
export function overlaps(r,from,to){const a=String(r?.pickupDate||r?.periodStart||r?.startDate||rowDay(r)).slice(0,10),b=String(r?.deliveryDate||r?.periodEnd||r?.endDate||a).slice(0,10);return day(a)&&day(b)&&a<=to&&b>=from;}
export function typedReferences(row={}){const f={...(row.extracted||{}),...row};return {brokerLoadNumber:loadNo(f),bolNumber:ref(f.bolNumber||f.bolNo||f.bol_no),poNumber:ref(f.poNumber||f.poNo||f.po_no),pickupNumber:ref(f.pickupNumber||f.pickupNo),shipperReference:ref(f.shipperReference||f.shipperRef),invoiceNumber:ref(f.invoiceNumber||f.invoiceNo)};}
export function identifyDocument(doc,loads){const r=typedReferences(doc),broker=ref(doc.broker||doc.brokerName||doc.extracted?.broker),compatible=l=>!broker||!ref(l.broker)||broker===ref(l.broker)||broker.includes(ref(l.broker))||ref(l.broker).includes(broker),matches=list(loads).filter(l=>compatible(l)&&loadNo(l)&&loadNo(l)===r.brokerLoadNumber);if(matches.length===1)return {loadNo:loadNo(matches[0]),basis:'broker_load_number'};
 const evidence=list(loads).filter(l=>{if(!compatible(l))return false;const x=typedReferences(l);return ['bolNumber','poNumber','pickupNumber','shipperReference','invoiceNumber'].some(k=>r[k]&&r[k]===x[k]||r.brokerLoadNumber&&r.brokerLoadNumber===x[k]);});
 if(evidence.length===1)return {loadNo:loadNo(evidence[0]),basis:'typed_reference'};
 return {loadNo:'',basis:'needs_review'};}
export function classifyDocument(doc){const text=String(doc.ocrText||doc.text||doc.extracted?.rawText||'');if(/\b(rate\s*(?:confirmation|agreement|con)|broker.carrier\s*(?:agreement|confirmation))\b/i.test(text))return 'rate_confirmation';if((doc.document_type||doc.type||doc.extracted?.type)==='pod')return 'pod';if(/\b(lumper|unloading)\b.{0,40}\b(receipt|payment)\b/i.test(text))return 'lumper_receipt';if(/\binvoice\s*(?:number|no\.?|#|date)/i.test(text))return 'invoice';if(/\b(proof of delivery|delivery receipt)\b/i.test(text))return 'pod';if(/\bbill of lading\b/i.test(text))return 'bol';const type=doc.document_type||doc.type||doc.extracted?.type;return ['rate_confirmation','bol','pod','invoice','lumper_receipt','fuel_receipt','receipt','inspection'].includes(type)?type:'other';}
export function selectRange(state,business,rows,from,to){
 assertWindow(from,to);const refs=new Set();const selectBook=book=>{const out={...book};for(const [k,v]of Object.entries(book||{}))if(dayMap(k,v))out[k]=Object.fromEntries(Object.entries(v).filter(([d])=>within(d,from,to)));return out;};
 const selected=selectBook(state);selected.teamLogbooksByDriverId=Object.fromEntries(Object.entries(state.teamLogbooksByDriverId||{}).map(([id,b])=>[id,selectBook(b)]));
 for(const book of [selected,...Object.values(selected.teamLogbooksByDriverId)])for(const [k,v]of Object.entries(book))if(dayMap(k,v))for(const records of Object.values(v))for(const r of list(records))if(loadNo(r))refs.add(loadNo(r));
 const loads=list(business.loads).filter(l=>overlaps(l,from,to)||refs.has(loadNo(l)));loads.forEach(l=>refs.add(loadNo(l)));
 const relevant=r=>overlaps(r,from,to)||refs.has(loadNo(r));
 for(const field of ['documentsByDay','fuelReceiptsByDay']){selected[field]={...(selected[field]||{})};for(const [d,items]of Object.entries(state[field]||{})){const extra=list(items).filter(r=>refs.has(loadNo(r)));if(extra.length&&!selected[field][d])selected[field][d]=extra;}}
 const nextBusiness={...business};for(const [k,v]of Object.entries(nextBusiness))if(Array.isArray(v))nextBusiness[k]=v.filter(relevant);nextBusiness.loads=loads;
 // Documents for an overlapping load remain included regardless of scan date.
 selected.loadGuidesById=Object.fromEntries(Object.entries(state.loadGuidesById||{}).filter(([,g])=>refs.has(loadNo(g))||relevant(g)));
 const docs=list(rows.documents_local).filter(relevant),ids=new Set();
 function collect(v){if(typeof v==='string')ids.add(v);else if(v&&typeof v==='object'&&!(v instanceof Blob))for(const x of Object.values(v))collect(x);}
 collect(docs);collect(selected);collect(nextBusiness);
 const chosen={documents_local:docs};
 // Traverse stable source/asset/link identities until the relationship closure is complete.
 const retained=new Map();let changed=true;while(changed){changed=false;for(const [table,records]of Object.entries(rows)){
 if(/^(app_snapshots|sync_meta|mutation_queue|account_receive_staging|duty_events_local|log_days_local|inspections_local)$/.test(table))continue;
 const set=retained.get(table)||new Set();retained.set(table,set);for(const r of records){if(set.has(r))continue;const linked=Object.entries(r).some(([k,v])=>typeof v==='string'&&/(id|key|ref)$/i.test(k)&&ids.has(v));if((table==='documents_local'?docs.includes(r)||linked:linked||relevant(r))){set.add(r);collect(r);changed=true;}}
 }}
 for(const [k,v]of retained)chosen[k]=[...v];
 for(const k of ['duty_events_local','log_days_local','inspections_local'])chosen[k]=list(rows[k]).filter(r=>within(rowDay(r),from,to));
 return {state:selected,businessStore:nextBusiness,rows:chosen,window:{from,to}};
}
export const recordId=r=>String(r?.local_id||r?.id||r?.eventId||r?.client_event_id||r?.localDocumentId||r?.clientDocumentId||hashValue(r));
export function mergeTransfer(current,incoming,business={},incomingBusiness={}){
 const conflicts=[],summary={recordsImported:0,documentsImported:0,duplicatesSkipped:0,conflicts:0,missingFiles:0};
 const conflict=(path,saved,value)=>{conflicts.push({id:hashValue([path,saved,value]),path,saved,incoming:value});};
 function mergeRows(a,b,path){const identity=r=>/documents/i.test(path)?String(r.client_document_id||r.clientDocumentId||r.localDocumentId||r.local_id||r.sha256||recordId(r)):recordId(r);const out=[...list(a)],byId=new Map(out.map(r=>[identity(r),r])),byHash=new Set(out.map(hashValue));for(const row of list(b)){const id=path==='business/loads'&&loadNo(row)?'load:'+loadNo(row):identity(row),old=path==='business/loads'?out.find(r=>loadNo(r)&&loadNo(r)===loadNo(row)):byId.get(id);if(path==='business/loads'&&!old){const evidence=identifyDocument(row,out);if(evidence.loadNo&&evidence.loadNo!==loadNo(row)){conflict(path+'/reference/'+loadNo(row),out.find(r=>loadNo(r)===evidence.loadNo),row);continue;}}if(byHash.has(hashValue(row))){summary.duplicatesSkipped++;continue;}if(old){conflict(path+'/'+id,old,row);continue;}out.push(row);byId.set(id,row);byHash.add(hashValue(row));summary.recordsImported++;}return out;}
 function mergeBook(a,b,path){const next={...a};const existingDays=new Set([...Object.keys(a.eventsByDay||{}).filter(d=>list(a.eventsByDay[d]).length),...Object.keys(a.signatureByDay||{}).filter(d=>a.signatureByDay[d]),...Object.keys(a.certifyStatus||{}).filter(d=>/certified|signed/i.test(a.certifyStatus[d])&&!/not certified/i.test(a.certifyStatus[d]))]);
 for(const [k,v]of Object.entries(b||{})){if(!dayMap(k,v))continue;const out={...(a[k]||{})};for(const [d,value]of Object.entries(v)){const old=out[d];if(canonical(old)===canonical(value)){summary.duplicatesSkipped++;continue;}
 // Duty days are indivisible evidence. A changed or extra event on an existing
 // day is retained for review, including unsigned days. Never merge intervals.
 if(protectedMap(k)&&existingDays.has(d)){conflict(path+'/'+k+'/'+d,old??null,value);continue;}
 if(old!==undefined&&protectedMap(k)){conflict(path+'/'+k+'/'+d,old,value);continue;}
 if(Array.isArray(value))out[d]=mergeRows(old,value,path+'/'+k+'/'+d);else if(old===undefined){out[d]=value;summary.recordsImported++;}else conflict(path+'/'+k+'/'+d,old,value);
 }next[k]=out;}return next;}
 const next={...current},active=current.activeDriverId||current.teamDrivers?.[0]?.id||'driver_primary',inActive=incoming.activeDriverId||incoming.teamDrivers?.[0]?.id||'driver_primary';
 const books={...(current.teamLogbooksByDriverId||{})};const inputBooks={...(incoming.teamLogbooksByDriverId||{}),[inActive]:incoming};
 for(const [id,book]of Object.entries(inputBooks)){const saved=id===active?current:books[id]||{};const merged=mergeBook(saved,book,'driver/'+id);if(id===active)Object.assign(next,merged);else books[id]=merged;}
 next.teamLogbooksByDriverId=books;next.teamDrivers=mergeRows(current.teamDrivers,incoming.teamDrivers,'drivers');
 for(const field of ['loadGuidesById']){next[field]={...(current[field]||{})};for(const [id,v]of Object.entries(incoming[field]||{})){if(!next[field][id]){next[field][id]=v;summary.recordsImported++;}else if(canonical(next[field][id])!==canonical(v))conflict(field+'/'+id,next[field][id],v);}}
 function missingTree(a,b,path){if(a===undefined||a===null||a===''){summary.recordsImported++;return b;}if(canonical(a)===canonical(b))return a;if(Array.isArray(a)&&Array.isArray(b))return mergeRows(a,b,path);if(object(a)&&object(b)){const out={...a};for(const [k,v]of Object.entries(b))out[k]=missingTree(a[k],v,path+'/'+k);return out;}conflict(path,a,b);return a;}
 for(const field of ['dotWallet','savedDocuments','documentHistory','driverSignature'])if(incoming[field])next[field]=missingTree(current[field],incoming[field],field);
 const store={...business};for(const [k,v]of Object.entries(incomingBusiness))if(Array.isArray(v))store[k]=mergeRows(business[k],v,'business/'+k);
 if(incoming.homeTerminalTimeZone&&incoming.homeTerminalTimeZone!==current.homeTerminalTimeZone)conflict('homeTerminalTimeZone',current.homeTerminalTimeZone||null,incoming.homeTerminalTimeZone);
 summary.conflicts=conflicts.length;return {state:next,businessStore:store,conflicts,summary};
}
