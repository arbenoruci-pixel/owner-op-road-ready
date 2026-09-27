// One read-only evidence model shared by Documents, IFTA, Tax and Audit.
// New requirements are data. Readers keep ownership of source extraction.
export const EVIDENCE_VERSION = 1;
export const text = value => String(value ?? '').trim();
export const list = value => Array.isArray(value) ? value : [];
export const clone = value => JSON.parse(JSON.stringify(value));
export const idOf = doc => text(doc.client_document_id || doc.clientDocumentId || doc.local_id || doc.localDocumentId || doc.id);
export const loadOf = row => text(row.load_no || row.loadNo || row.canonicalLoadNo || row.extracted?.canonicalLoadNo || row.extracted?.loadNo).toUpperCase();
export function day(value) {
  const s = text(value).slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s+'T12:00:00Z')) && new Date(s+'T12:00:00Z').toISOString().slice(0,10) === s ? s : '';
}
export function localToday() { const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function amount(value) {
  if(typeof value==='boolean'||value==null||text(value)==='')return null;
  const s=text(value).replace(/[$,]/g,'');
  return /^-?\d+(\.\d+)?$/.test(s) && Number.isFinite(Number(s)) ? Number(s) : null;
}
export const REGIONS = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC AB BC MB NB NL NS NT NU ON PE QC SK YT'.split(' '));
export function kindOf(doc) {
  const k=text(doc.document_type || doc.type || doc.extracted?.type || 'other').toLowerCase().replace(/[ -]+/g,'_');
  return ({ratecon:'rate_confirmation',rate_con:'rate_confirmation',bill_of_lading:'bol',proof_of_delivery:'pod',delivery_receipt:'pod',load_invoice:'invoice',carrier_settlement:'settlement',receipt:'expense_receipt',other_expense:'expense_receipt',repair_invoice:'maintenance',maintenance_invoice:'maintenance',tire_receipt:'maintenance',roadside_service:'maintenance',parts_receipt:'maintenance',fuel:'fuel_receipt',toll:'toll_receipt',toll_parking_receipt:'toll_receipt'})[k] || k;
}
export const FIELD_LABELS = Object.freeze({date:'Document / transaction date',loadNo:'Broker load number',merchant:'Vendor / broker',sellerAddress:'Seller address',total:'Total (USD)',currency:'Currency',quantity:'Fuel volume',volumeUnit:'Volume unit',fuelType:'Fuel type',state:'Purchase state / province',vehicle:'Truck / unit',purchaser:'Purchaser',reference:'Receipt / invoice reference',purpose:'Business purpose',payment:'Payment evidence',origin:'Pickup location',destination:'Delivery location',pickupDate:'Pickup date',deliveryDate:'Delivery date',podSigned:'Receiver signature / stamp checked',taxPaid:'Tax-paid motor fuel checked',qualifiedVehicle:'Fueled the qualified truck',driver:'Driver / linked unit',time:'Transaction time',location:'Transaction location',notes:'Notes'});
export const CATALOG = {
  rate_confirmation:{label:'Rate confirmation',uses:['load','tax','audit'],fields:['date','loadNo','merchant','origin','destination','pickupDate','deliveryDate','total']},
  bol:{label:'Bill of lading',uses:['load','audit'],fields:['date','loadNo','reference','origin','destination']},
  pod:{label:'Signed delivery proof',uses:['load','audit'],fields:['date','loadNo','reference','podSigned']},
  invoice:{readerType:'load_invoice',label:'Invoice',uses:['load','tax','audit'],fields:['date','loadNo','merchant','reference','total','currency']},
  fuel_receipt:{label:'Fuel receipt',uses:['ifta','tax','audit'],fields:['date','merchant','sellerAddress','state','quantity','volumeUnit','fuelType','total','currency','vehicle','purchaser','reference','taxPaid','qualifiedVehicle']},
  expense_receipt:{readerType:'other_expense',label:'Expense receipt',uses:['tax','audit'],fields:['date','merchant','total','currency','purpose','payment','reference']},
  toll_receipt:{readerType:'toll_parking_receipt',label:'Toll receipt',uses:['tax','audit'],fields:['date','merchant','total','currency','vehicle','reference']},
  maintenance:{readerType:'repair_invoice',label:'Repair / service bill',uses:['tax','audit'],fields:['date','merchant','total','currency','vehicle','purpose','reference']},
  settlement:{readerType:'carrier_settlement',label:'Settlement',uses:['tax','audit'],fields:['date','loadNo','merchant','total','currency','reference']},
  supporting_packet:{readerType:'auto',label:'Document packet',uses:['load','tax','audit'],fields:['date','loadNo','notes']},
  registration:{label:'Registration / cab card',uses:['audit'],fields:['date','vehicle','reference']},
  insurance:{label:'Insurance document',uses:['audit'],fields:['date','merchant','reference']},
  permit:{label:'Permit',uses:['audit'],fields:['date','vehicle','reference']},
  inspection:{readerType:'annual_inspection',label:'Inspection',uses:['audit'],fields:['date','vehicle','reference']},
  other:{label:'Other document',uses:['audit'],fields:['date','notes']},
};
// Registered readers add their own document families to the same evidence UI.
// Unknown specialized fields remain in the original reader result for review.
export function registerEvidenceTypes(types=[]) {
  const fieldMap={broker:'merchant',vendor:'merchant',shipper:'origin',consignee:'destination',gallons:'quantity',truckNo:'vehicle',invoiceNo:'reference',receiptNo:'reference',bolNo:'reference'};
  for(const type of types){
    if(!type?.id||CATALOG[type.id])continue;
    const stacks=list(type.stacks),uses=['audit'];
    if(stacks.includes('load_folder'))uses.unshift('load');
    if(stacks.includes('ifta'))uses.push('ifta');
    if(stacks.some(s=>['expenses','tax','billing','factoring'].includes(s)))uses.push('tax');
    const fields=['date',...(uses.includes('load')?['loadNo']:[]),...list(type.required).map(k=>fieldMap[k]||k).filter(k=>Object.hasOwn(FIELD_LABELS,k)),'notes'];
    CATALOG[type.id]={label:type.label||type.id,uses:[...new Set(uses)],fields:[...new Set(fields)],readerType:type.id};
  }
}
export const LOAD_RULES = Object.freeze([
  {id:'rate_confirmation',label:'Rate confirmation',kinds:['rate_confirmation','tonu'],stage:'booked'},
  {id:'bol',label:'Pickup BOL',kinds:['bol','pod'],stage:'pickup'},
  {id:'pod',label:'Signed delivery proof',kinds:['pod'],stage:'delivery'},
  {id:'invoice',label:'Invoice',kinds:['invoice'],stage:'delivery'},
]);
const aliases={date:['documentDate','document_date','transactionDate','date'],merchant:['merchant','vendor','broker','seller'],sellerAddress:['sellerAddress','merchantAddress','address'],quantity:['quantity','gallons','fuelGallons','volume'],volumeUnit:['volumeUnit','fuelUnit'],total:['total','gross','amount','revenue'],vehicle:['vehicle','truckNo','unitNumber','truckUnit','unit'],purchaser:['purchaser','carrierName'],reference:['reference','receiptNo','invoiceNo','transactionId','bolNo','bolNumber'],origin:['origin','shipper'],destination:['destination','consignee'],fuelType:['fuelType'],state:['state'],currency:['currency'],purpose:['purpose','serviceDescription'],payment:['payment'],podSigned:['podSigned','receiverSignaturePresent'],driver:['driver','driverName'],time:['transactionTime','time'],location:['location','cityState'],pickupDate:['pickupDate'],deliveryDate:['deliveryDate'],notes:['notes']};
export function documentFacts(doc={}) {
  const saved=doc.extracted?.evidenceFactsV1, fields={};
  for(const [key,names] of Object.entries(aliases)) {
    const values=names.flatMap(name=>[doc.extracted?.[name],doc[name]]);
    const v=values.find(v=>v!==undefined&&v!==null&&text(v)!=='');if(v!==undefined)fields[key]=v;
  }
  fields.loadNo=loadOf(doc);
  if(!fields.volumeUnit && (doc.extracted?.gallons!=null||doc.extracted?.fuelGallons!=null))fields.volumeUnit='gal';
  // These are proposals until the source has been explicitly reviewed.
  return {...fields,...(saved?.version===1?saved.fields:{})};
}
export function isReviewed(doc) {
  const review=doc?.extracted?.evidenceFactsV1,hashes=sourceHashes(doc);
  return review?.version===1 && !!review.reviewedAt && hashes.length>0 && hashes.every(hash=>/^[a-f0-9]{64}$/.test(hash)&&review.sourceSha256===hash);
}
export const sourceHashes=doc=>[...new Set([doc?.sha256,doc?.content_hash,doc?.contentHash].map(v=>text(v).toLowerCase()).filter(Boolean))];
export function assertSourceHash(doc,hash){if(sourceHashes(doc).some(saved=>saved!==hash))throw new Error('The original does not match its saved checksum.');}
export function evidenceLoadResolver(businessStore={}) {
  const aliases=new Map(list(businessStore.evidenceAliases).map(a=>[text(a.from).toUpperCase(),text(a.to).toUpperCase()]));
  return value=>{const initial=text(value).toUpperCase(),seen=new Set();let result=initial;while(aliases.has(result)){if(seen.has(result))return initial;seen.add(result);result=aliases.get(result);}return result||initial;};
}
export function uniqueDocuments(documents=[]) {
  const map=new Map();
  for(const doc of documents) {
    const id=idOf(doc);if(!id)continue;
    const old=map.get(id), oldReview=old?.extracted?.evidenceFactsV1, review=doc.extracted?.evidenceFactsV1;
    if(!old || review && (!oldReview || text(review.reviewedAt)>=text(oldReview.reviewedAt)))map.set(id,doc);
  }
  return [...map.values()];
}
export function usable(value,key) {
  if(['date','pickupDate','deliveryDate'].includes(key))return !!day(value);
  if(['total','quantity'].includes(key))return amount(value)>0;
  if(['podSigned','taxPaid','qualifiedVehicle'].includes(key))return value===true;
  if(key==='state')return REGIONS.has(text(value).toUpperCase());
  if(key==='volumeUnit')return ['gal','L'].includes(value);
  return !!text(value) && !/^(unknown|not set|undefined|null|n\/a|to be not exceeding:|pro #:|time:)$/i.test(text(value));
}
export function validateFacts(kind,input={}) {
  if(!CATALOG[kind])throw new Error('Choose a supported document type.');
  const fields={};
  for(const key of Object.keys(FIELD_LABELS))if(input[key]!==undefined){
    const value=input[key];
    if(['podSigned','taxPaid','qualifiedVehicle'].includes(key))fields[key]=value===true;
    else if(['total','quantity'].includes(key)){if(text(value)!=='' && !(amount(value)>0))throw new Error(`${FIELD_LABELS[key]} must be greater than zero.`);fields[key]=text(value)===''?'':amount(value);}
    else {if(typeof value!=='string'&&typeof value!=='number')throw new Error('Invalid reviewed field.');fields[key]=text(value).slice(0,1600);}
  }
  for(const key of ['date','pickupDate','deliveryDate'])if(fields[key]&&!day(fields[key]))throw new Error('Choose a valid calendar date.');
  if(fields.state){fields.state=fields.state.toUpperCase();if(!REGIONS.has(fields.state))throw new Error('Use a valid state or province abbreviation.');}
  fields.loadNo=text(fields.loadNo).toUpperCase();
  if(fields.loadNo&&!/^[A-Z0-9][A-Z0-9._/-]{0,79}$/.test(fields.loadNo))throw new Error('Check the broker load number.');
  if(fields.currency)fields.currency=fields.currency.toUpperCase();
  if(fields.volumeUnit&&!['gal','L'].includes(fields.volumeUnit))throw new Error('Choose gallons or liters.');
  return fields;
}
export function componentsOf(doc) {
  const review=doc.extracted?.evidenceFactsV1;
  if(review?.version===1 && Array.isArray(review.components) && review.components.length)return review.components.map(c=>({...c,reviewed:isReviewed(doc)&&c.reviewed===true}));
  return [{kind:kindOf(doc),fields:documentFacts(doc),reviewed:isReviewed(doc)}];
}
function coverage(doc,kind,loadNo,resolve=text) {
  return componentsOf(doc).some(component=>{
    const fields={...documentFacts(doc),...component.fields};
    return isReviewed(doc) && component.kind===kind && resolve(fields.loadNo)===loadNo && (CATALOG[kind]?.fields||[]).filter(k=>k!=='notes').every(k=>usable(fields[k],k)) && component.reviewed===true;
  });
}
export function rangeContains(value,range={}) { const d=day(value);return !!d&&(!range.from||d>=range.from)&&(!range.to||d<=range.to); }
export function buildEvidence({documents=[],loads=[],businessStore={},ownerStore={},range={},loadNo='',area='load',today=localToday()}={}) {
  const resolve=evidenceLoadResolver(businessStore),refOf=row=>resolve(loadOf(row));
  const all=uniqueDocuments(documents), target=resolve(loadNo);
  const scopedLoads=[...new Map(loads.filter(l=>target?refOf(l)===target:!range.from&&!range.to||[l.pickupDate,l.deliveryDate,...list(l.documentTransferDays),...list(l.days)].some(d=>rangeContains(d,range))).map(l=>[refOf(l),l])).values()];
  const refs=new Set(scopedLoads.map(refOf));
  const inPeriod=d=>!range.from&&!range.to||rangeContains(documentFacts(d).date,range)||componentsOf(d).some(c=>rangeContains(c.fields?.date,range));
  const docs=all.filter(d=>(!target||refOf(d)===target)&&(area==='load'?(target||refs.has(refOf(d))||inPeriod(d)||!refOf(d)&&!day(documentFacts(d).date)):inPeriod(d)));
  const issues=[],checks=[];
  const issue=(id,label,detail,area,document=null,extra={})=>issues.push({id,label,detail,area,document,status:'review',...extra});
  if(area!=='load')for(const doc of all.filter(d=>(!target||refOf(d)===target)&&!docs.includes(d)&&!day(documentFacts(d).date)&&!componentsOf(d).some(c=>day(c.fields?.date))))issue(idOf(doc)+':period-date','Undated source needs review','Not included in this period. Check the original to establish its transaction or service date.','audit',doc,{outsidePeriod:true});
  for(const load of scopedLoads){
    const ref=refOf(load),stage=load.documentWorkflowStage||load.serviceStatus||load.status;
    const tonu=stage==='tonu', cancelled=stage==='cancelled';
    for(const rule of LOAD_RULES) {
      if((tonu||cancelled)&&['bol','pod'].includes(rule.id))continue;
      const matching=docs.filter(d=>refOf(d)===ref&&rule.kinds.some(kind=>componentsOf(d).some(c=>c.kind===kind)));
      const verified=matching.some(d=>rule.kinds.some(kind=>coverage(d,kind,ref,resolve)));
      const due=day(rule.stage==='pickup'?load.pickupDate:rule.stage==='delivery'?load.deliveryDate:'');
      const later=!matching.length&&due&&due>today&&!['delivered','tonu','invoiced','submitted','paid'].includes(stage);
      checks.push({id:ref+':'+rule.id,label:rule.label,loadNo:ref,kind:rule.id,status:verified?'ready':matching.length?'review':later?'not_due':'missing',detail:later?`Expected ${due}`:verified?'Reviewed source on file':matching.length?'Check the saved original and confirm its details':'Add or choose a saved file',document:matching[0]||null,area:'load'});
    }
  }
  const hashes=new Map();
  for(const doc of docs){
    const id=idOf(doc), f=documentFacts(doc), kind=kindOf(doc), review=doc.extracted?.evidenceFactsV1;
    const rawRefs=new Set([doc.load_no,doc.loadNo,doc.canonicalLoadNo,doc.extracted?.loadNo,doc.extracted?.canonicalLoadNo].map(resolve).filter(Boolean));
    if(rawRefs.size>1&&!doc.repairOverlayApplied)issue(id+':identity','Load references disagree','Compare the broker load number with the BOL / pickup references.','load',doc);
    if(CATALOG[kind]?.uses.includes('load')&&!loadOf(doc))issue(id+':unassigned','Document has no load','Choose its broker load number. A BOL number can be a separate reference.','load',doc);
    if(!day(f.date))issue(id+':date','Document date needs review','The upload date does not establish the service or transaction date.','audit',doc);
    const hash=text(doc.sha256||doc.content_hash);if(hash){if(hashes.has(hash)&&idOf(hashes.get(hash))!==id&&(kindOf(hashes.get(hash))!==kind||loadOf(hashes.get(hash))!==loadOf(doc)))issue(id+':duplicate','Same original has different filing details','Review both records before choosing their load and document type.','load',doc);else hashes.set(hash,doc);}
    if(!isReviewed(doc))issue(id+':facts','Source details need review','Read again or confirm the fields against the original.','audit',doc);
    if(kind==='fuel_receipt'){
      const required=['date','merchant','sellerAddress','state','quantity','volumeUnit','fuelType','vehicle','purchaser','total'];
      const missing=required.filter(k=>!usable(f[k],k));
      if(missing.length)issue(id+':fuel','Fuel evidence incomplete',missing.map(k=>FIELD_LABELS[k]).join(', '),'ifta',doc);
      if(/def|reefer/i.test(text(f.fuelType)))issue(id+':nonmotor','Separate non-propulsion purchase','Keep the expense record; this item is excluded from the reviewed truck-fuel credit.','ifta',doc,{status:'info'});
      else if(f.taxPaid!==true||f.qualifiedVehicle!==true)issue(id+':fuelcredit','Fuel credit needs confirmation','Confirm tax-paid fuel and the qualified truck from the source.','ifta',doc);
    }
    if(CATALOG[kind]?.uses.includes('tax')&&['fuel_receipt','expense_receipt','toll_receipt','maintenance'].includes(kind)){
      const missing=['date','merchant','total','currency'].filter(k=>!usable(f[k],k));
      if(missing.length)issue(id+':tax','Expense details incomplete',missing.map(k=>FIELD_LABELS[k]).join(', '),'tax',doc);
    }
  }
  for(const row of list(businessStore.evidenceExpectations)) {
    if(target?resolve(row.loadNo)!==target:row.date&&!rangeContains(row.date,range))continue;
    const candidates=docs.filter(d=>(!row.loadNo||refOf(d)===resolve(row.loadNo))&&componentsOf(d).some(c=>c.kind===row.kind&&(!row.date||day(c.fields?.date||documentFacts(d).date)===row.date)));
    const valid=d=>isReviewed(d)&&componentsOf(d).some(c=>c.kind===row.kind&&c.reviewed===true&&(!row.loadNo||resolve(c.fields?.loadNo||documentFacts(d).loadNo)===resolve(row.loadNo))&&(!row.date||day(c.fields?.date||documentFacts(d).date)===row.date)&&(CATALOG[row.kind]?.fields||[]).filter(k=>k!=='notes'&&k!=='loadNo').every(k=>usable(({...documentFacts(d),...c.fields})[k],k)));
    const matching=candidates.find(valid)||candidates[0],complete=matching&&valid(matching);
    checks.push({id:row.id,label:row.label,loadNo:row.loadNo,kind:row.kind,area:row.area||'load',status:complete?'ready':matching?'review':'missing',document:matching||null,detail:complete?'Reviewed source on file':matching?'Source available for review':'Expected document not on file'});
  }
  const mileage=list(ownerStore.mileageImports).filter(r=>rangeContains(r.date,range));
  if(!mileage.length)issue('jurisdiction-mileage','State mileage is not on file','Import actual miles by jurisdiction, including empty travel. Ratecon miles are estimates.','ifta',null,{action:'mileage'});
  if(!docs.some(d=>kindOf(d)==='fuel_receipt')&&!list(businessStore.fuel).some(r=>rangeContains(r.date,range))&&!list(ownerStore.fuelImports).some(r=>rangeContains(r.date,range)))issue('fuel-coverage','Fuel purchases have not been reconciled','Add receipts or a fuel statement, or verify that no purchases occurred.','ifta',null,{kind:'fuel_receipt'});
  for(const bucket of ['fuel','expenses','maintenance'])for(const row of list(businessStore[bucket]).filter(r=>(!target||refOf(r)===target)&&(area==='load'&&target||rangeContains(r.date,range)))){
    const source=text(row.sourceDocumentId||row.documentId||row.clientDocumentId);
    if(!source||!all.some(d=>[idOf(d),d.local_id,d.id].includes(source)))issue(bucket+':'+row.id,'Book entry needs its source',`${bucket}: ${row.merchant||row.vendor||row.date||row.id}`,'tax',null,{kind:bucket==='fuel'?'fuel_receipt':bucket==='maintenance'?'maintenance':'expense_receipt'});
  }
  return {version:EVIDENCE_VERSION,range,docs,loads:scopedLoads,issues,checks,counts:{missing:checks.filter(x=>x.status==='missing').length,review:checks.filter(x=>x.status==='review').length+issues.filter(x=>x.status==='review').length,ready:checks.filter(x=>x.status==='ready').length,notDue:checks.filter(x=>x.status==='not_due').length}};
}
export function makeBookEntry(doc,fields) {
  const kind=kindOf(doc),bucket=kind==='fuel_receipt'?'fuel':kind==='maintenance'?'maintenance':['expense_receipt','toll_receipt'].includes(kind)?'expenses':'';
  if(!bucket)throw new Error('This document stays as source evidence. Use Billing for invoices and settlements.');
  for(const key of ['date','merchant','total','currency'])if(!usable(fields[key],key))throw new Error(`Complete ${FIELD_LABELS[key]} before adding a book entry.`);
  if(fields.currency!=='USD')throw new Error('Keep this currency as source evidence and enter the reviewed USD conversion in Expenses.');
  const id=idOf(doc);if(!id)throw new Error('Save the original document first.');
  const row={id:`evidence-${id}`,date:fields.date,merchant:fields.merchant,total:amount(fields.total),amount:amount(fields.total),currency:'USD',loadNo:fields.loadNo,purpose:fields.purpose||'',sourceDocumentId:id,sourceDocumentHash:doc.sha256||'',source:'reviewed_document',evidenceVersion:1,reviewedAt:new Date().toISOString()};
  if(bucket==='fuel'){
    for(const k of ['quantity','volumeUnit','fuelType'])if(!usable(fields[k],k))throw new Error(`Complete ${FIELD_LABELS[k]}.`);
    Object.assign(row,{state:fields.state||'',gallons:fields.volumeUnit==='L'?amount(fields.quantity)/3.785411784:amount(fields.quantity),volume:amount(fields.quantity),volumeUnit:fields.volumeUnit,fuelType:fields.fuelType,vehicle:fields.vehicle||'',purchaser:fields.purchaser||'',sellerAddress:fields.sellerAddress||'',transactionId:fields.reference||'',taxPaid:fields.taxPaid===true,
      iftaEligible:fields.taxPaid===true&&fields.qualifiedVehicle===true&&REGIONS.has(fields.state)&&!!fields.vehicle&&!!fields.purchaser&&!!fields.sellerAddress&&/^(diesel|gasoline|biodiesel|propane|cng|lng)$/i.test(fields.fuelType)});
  }
  if(bucket==='expenses')row.category=kind==='toll_receipt'?'tolls':'other';
  return {bucket,row};
}
export function possibleFuelDuplicate(left={},right={}) {
  if(!day(left.date)||day(left.date)!==day(right.date))return false;
  const a=text(left.transactionId||left.reference),b=text(right.transactionId||right.reference);
  if(a&&b&&a.toUpperCase()===b.toUpperCase())return true;
  return amount(left.total)>0&&amount(right.total)>0&&amount(left.gallons)>0&&amount(right.gallons)>0
    && Math.abs(amount(left.total)-amount(right.total))<.005 && Math.abs(amount(left.gallons)-amount(right.gallons))<.005
    && !!text(left.state)&&text(left.state).toUpperCase()===text(right.state).toUpperCase();
}
