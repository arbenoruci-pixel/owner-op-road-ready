import { classifyDocument, documentTypeMeta } from './smartScan.js';

export const SMART_DOCUMENT_ENGINE_VERSION_V1040 = '104.0.0';

const STACKS = {
  smart_inbox:{ id:'smart_inbox', label:'Smart Document Inbox', path:'Documents / Smart Inbox' },
  load_folder:{ id:'load_folder', label:'Load Folder', path:'Loads / {loadNo}' },
  billing_packet:{ id:'billing_packet', label:'Billing Packet', path:'Loads / {loadNo} / Billing' },
  factoring:{ id:'factoring', label:'Factoring Packet', path:'Factoring / {loadNo}' },
  broker_profile:{ id:'broker_profile', label:'Broker Profile', path:'Brokers / {broker}' },
  logbook:{ id:'logbook', label:'Logbook Supporting Docs', path:'Logbook / {date}' },
  fuel:{ id:'fuel', label:'Fuel Records', path:'Business / Fuel' },
  ifta:{ id:'ifta', label:'IFTA Quarter', path:'IFTA / {quarter}' },
  expenses:{ id:'expenses', label:'Business Expenses', path:'Business / Expenses' },
  maintenance:{ id:'maintenance', label:'Maintenance', path:'Truck / {unit} / Maintenance' },
  truck_wallet:{ id:'truck_wallet', label:'Truck Wallet', path:'Truck / {unit} / Documents' },
  driver_wallet:{ id:'driver_wallet', label:'Driver Wallet', path:'Driver / {driver} / Documents' },
  company_wallet:{ id:'company_wallet', label:'Company Wallet', path:'Company / Documents' },
  compliance:{ id:'compliance', label:'Compliance', path:'Compliance / Expirations' },
  claims:{ id:'claims', label:'Claims & Incidents', path:'Claims / {loadNo}' },
  settlements:{ id:'settlements', label:'Settlements', path:'Business / Settlements' },
  taxes:{ id:'taxes', label:'Taxes & Accounting', path:'Business / Taxes' },
};

const TYPE_DEFINITIONS = [
  { id:'rate_confirmation', label:'Rate Confirmation', family:'load', phrases:['rate confirmation','carrier rate confirmation','total carrier pay','agreed rate','load confirmation'], strong:['rate confirmation','total carrier pay'], stacks:['load_folder','broker_profile','billing_packet'], required:[['loadNo','orderNo'],['broker'],['grossPay','gross','total'],['origin'],['destination']] },
  { id:'load_tender', label:'Load Tender', family:'load', phrases:['load tender','tendered load','accept tender','shipment tender'], strong:['load tender'], stacks:['load_folder','broker_profile'], required:[['loadNo','orderNo'],['origin'],['destination']] },
  { id:'bol', label:'Bill of Lading', family:'load', phrases:['bill of lading','straight bill of lading','shipper','consignee','freight charges'], strong:['bill of lading','straight bill of lading'], stacks:['load_folder','billing_packet','logbook'], required:[['loadNo','bolNo'],['origin','shipFromDetails'],['destination','shipToDetails']] },
  { id:'pod', label:'Proof of Delivery', family:'load', phrases:['proof of delivery','delivery receipt','received by','receiver signature','consignee signature','signed by'], strong:['proof of delivery','receiver signature','received by'], stacks:['load_folder','billing_packet','factoring','logbook'], required:[['loadNo','bolNo'],['date','deliveryDate'],['receiver','signaturePresent']] },
  { id:'lumper_receipt', label:'Lumper Receipt', family:'load_expense', phrases:['lumper','unloading fee','capstone logistics','express code','warehouse services'], strong:['lumper','capstone logistics'], stacks:['load_folder','expenses','billing_packet','factoring'], required:[['total'],['date'],['loadNo','poNumber']] },
  { id:'detention_approval', label:'Detention Approval', family:'accessorial', phrases:['detention approved','detention approval','detention pay','detention amount'], strong:['detention approved','detention approval'], stacks:['load_folder','billing_packet','factoring'], required:[['loadNo'],['total','approvedAmount']] },
  { id:'layover_approval', label:'Layover Approval', family:'accessorial', phrases:['layover approved','layover pay','layover approval'], strong:['layover approved','layover approval'], stacks:['load_folder','billing_packet','factoring'], required:[['loadNo'],['total','approvedAmount']] },
  { id:'tonu', label:'Truck Ordered Not Used', family:'accessorial', phrases:['truck ordered not used','tonu','cancellation fee'], strong:['truck ordered not used','tonu'], stacks:['load_folder','billing_packet','factoring'], required:[['loadNo'],['total','approvedAmount']] },
  { id:'osd_report', label:'OS&D / Damage Report', family:'claim', phrases:['over short and damaged','os&d','osd report','damage report','shortage','freight damage'], strong:['os&d','over short and damaged'], stacks:['load_folder','claims','billing_packet'], required:[['loadNo','bolNo'],['date']] },
  { id:'scale_ticket', label:'Scale Ticket', family:'load_expense', phrases:['cat scale','certified scale','steer axle','drive axle','trailer axle','gross weight','reweigh'], strong:['cat scale','certified scale'], stacks:['load_folder','expenses','logbook'], required:[['date'],['weight','grossWeight']] },
  { id:'reefer_temperature', label:'Reefer Temperature Record', family:'load', phrases:['reefer temperature','temperature record','set point','return air','supply air','temperature log'], strong:['temperature record','reefer temperature'], stacks:['load_folder','logbook','claims'], required:[['loadNo'],['temperature','setPoint']] },
  { id:'load_invoice', label:'Load Invoice', family:'billing', phrases:['freight invoice','carrier invoice','invoice to broker','amount due','remit to'], strong:['freight invoice','carrier invoice'], stacks:['load_folder','billing_packet','factoring'], required:[['invoiceNo'],['loadNo'],['total']] },
  { id:'carrier_settlement', label:'Carrier Settlement', family:'settlement', phrases:['settlement statement','driver settlement','settlement period','gross pay','net pay','deductions'], strong:['settlement statement','driver settlement'], stacks:['settlements','taxes'], required:[['date'],['netPay','total']] },
  { id:'fuel_receipt', label:'Fuel Receipt', family:'fuel', phrases:['diesel','gallons','price per gallon','fuel total','pump','mudflap','pilot','flying j',"love's",'petro'], strong:['gallons','price per gallon','fuel total'], stacks:['fuel','ifta','expenses','logbook'], required:[['date'],['gallons'],['total'],['merchant','fuelProvider'],['cityState']] },
  { id:'fuel_card_statement', label:'Fuel Card Statement', family:'fuel', phrases:['fuel card statement','transaction detail','fuel purchases','cardholder statement','fleet card'], strong:['fuel card statement'], stacks:['fuel','ifta','expenses','taxes'], required:[['date'],['total']] },
  { id:'toll_parking_receipt', label:'Toll / Parking Receipt', family:'expense', phrases:['toll receipt','toll plaza','parking receipt','truck parking','ez-pass','e-zpass','prepass'], strong:['toll receipt','parking receipt'], stacks:['expenses','logbook'], required:[['date'],['total']] },
  { id:'washout_receipt', label:'Trailer Washout Receipt', family:'expense', phrases:['trailer washout','washout receipt','trailer wash','wash bay'], strong:['trailer washout','washout receipt'], stacks:['expenses','load_folder','logbook'], required:[['date'],['total']] },
  { id:'trip_permit', label:'Trip / Fuel Permit', family:'compliance', phrases:['trip permit','fuel permit','temporary permit','single trip permit'], strong:['trip permit','fuel permit'], stacks:['truck_wallet','compliance','expenses'], required:[['date','issuedOn'],['expiresOn','expirationDate']] },
  { id:'repair_invoice', label:'Repair / Service Invoice', family:'maintenance', phrases:['repair order','service invoice','labor','parts','work performed','mechanic','roadside service','vehicle repair'], strong:['repair order','service invoice'], stacks:['maintenance','expenses','truck_wallet'], required:[['date'],['merchant','vendor'],['total']] },
  { id:'tire_receipt', label:'Tire Receipt', family:'maintenance', phrases:['tire invoice','tire service','tire size','new tire','retread','road service tire'], strong:['tire invoice','tire service'], stacks:['maintenance','expenses','truck_wallet'], required:[['date'],['total']] },
  { id:'preventive_maintenance', label:'Preventive Maintenance Record', family:'maintenance', phrases:['preventive maintenance','pm service','oil change','lube service','next service due'], strong:['preventive maintenance','pm service'], stacks:['maintenance','truck_wallet','compliance'], required:[['date'],['odometer']] },
  { id:'driver_license', label:'Commercial Driver License', family:'driver', phrases:['commercial driver license','driver license','class a','cdl','endorsements'], strong:['commercial driver license','class a'], stacks:['driver_wallet','compliance'], required:[['driverName','name'],['licenseNumber'],['expiresOn','expirationDate']] },
  { id:'medical_card', label:'Medical Examiner Certificate', family:'driver', phrases:['medical examiner certificate','medical card','medical examiner','federal motor carrier safety regulations'], strong:['medical examiner certificate'], stacks:['driver_wallet','compliance'], required:[['driverName','name'],['expiresOn','expirationDate']] },
  { id:'twic_card', label:'TWIC Card', family:'driver', phrases:['transportation worker identification credential','twic'], strong:['transportation worker identification credential','twic'], stacks:['driver_wallet','compliance'], required:[['driverName','name'],['expiresOn','expirationDate']] },
  { id:'mvr', label:'Motor Vehicle Record', family:'driver', phrases:['motor vehicle record','driving record','driver abstract','mvr'], strong:['motor vehicle record'], stacks:['driver_wallet','compliance'], required:[['driverName','name'],['date']] },
  { id:'drug_alcohol', label:'Drug & Alcohol Compliance', family:'driver', phrases:['drug and alcohol','consortium','random testing','clearinghouse','controlled substances'], strong:['drug and alcohol','clearinghouse'], stacks:['driver_wallet','compliance'], required:[['driverName','name'],['date']] },
  { id:'training_certificate', label:'Training Certificate', family:'driver', phrases:['certificate of completion','training certificate','hazmat training','safety training'], strong:['certificate of completion','training certificate'], stacks:['driver_wallet','compliance'], required:[['driverName','name'],['date']] },
  { id:'registration', label:'Vehicle Registration', family:'truck', phrases:['vehicle registration','registration card','license plate','registered owner'], strong:['vehicle registration','registration card'], stacks:['truck_wallet','compliance'], required:[['vin'],['plate','licensePlate'],['expiresOn','expirationDate']] },
  { id:'irp_cab_card', label:'IRP Cab Card', family:'truck', phrases:['irp cab card','apportioned cab card','international registration plan','apportioned'], strong:['irp cab card','international registration plan'], stacks:['truck_wallet','compliance'], required:[['vin'],['unit','truckNumber'],['expiresOn','expirationDate']] },
  { id:'ifta_license', label:'IFTA License', family:'truck', phrases:['international fuel tax agreement','ifta license','ifta decal'], strong:['international fuel tax agreement','ifta license'], stacks:['truck_wallet','ifta','compliance'], required:[['licenseNumber'],['expiresOn','expirationDate']] },
  { id:'insurance', label:'Insurance / COI', family:'company', phrases:['certificate of insurance','insurance policy','policy number','certificate holder','liability insurance'], strong:['certificate of insurance'], stacks:['company_wallet','truck_wallet','compliance'], required:[['policyNumber'],['expiresOn','expirationDate']] },
  { id:'annual_inspection', label:'Annual Inspection', family:'truck', phrases:['annual inspection','periodic inspection','vehicle inspection report','qualified inspector','49 cfr 396'], strong:['annual inspection','periodic inspection'], stacks:['truck_wallet','maintenance','compliance'], required:[['vin'],['date'],['expiresOn','expirationDate']] },
  { id:'form_2290', label:'Form 2290 / Schedule 1', family:'tax', phrases:['form 2290','schedule 1','heavy highway vehicle use tax','taxable gross weight'], strong:['form 2290','heavy highway vehicle use tax'], stacks:['company_wallet','taxes','truck_wallet'], required:[['vin'],['taxPeriod','date']] },
  { id:'permit', label:'Operating / Oversize Permit', family:'compliance', phrases:['operating authority','motor carrier permit','oversize permit','overweight permit','authority document'], strong:['operating authority','oversize permit'], stacks:['company_wallet','truck_wallet','compliance'], required:[['permitNumber','licenseNumber'],['expiresOn','expirationDate']] },
  { id:'title', label:'Vehicle Title', family:'truck', phrases:['certificate of title','vehicle title','title number','legal owner'], strong:['certificate of title'], stacks:['truck_wallet','company_wallet'], required:[['vin'],['titleNumber']] },
  { id:'lease_agreement', label:'Truck / Trailer Lease Agreement', family:'company', phrases:['lease agreement','equipment lease','vehicle lease','lessor','lessee'], strong:['lease agreement','equipment lease'], stacks:['company_wallet','truck_wallet','taxes'], required:[['date'],['unit','vin']] },
  { id:'broker_packet', label:'Broker Setup Packet', family:'broker', phrases:['broker packet','carrier setup packet','new carrier packet','carrier onboarding'], strong:['carrier setup packet','broker packet'], stacks:['broker_profile','company_wallet'], required:[['broker'],['mcNumber','mc']] },
  { id:'carrier_agreement', label:'Broker-Carrier Agreement', family:'broker', phrases:['broker carrier agreement','carrier agreement','transportation agreement','broker-carrier'], strong:['broker carrier agreement'], stacks:['broker_profile','company_wallet'], required:[['broker'],['date']] },
  { id:'w9', label:'W-9', family:'company', phrases:['request for taxpayer identification number','form w-9','taxpayer identification number','employer identification number'], strong:['form w-9','request for taxpayer identification number'], stacks:['company_wallet','taxes','broker_profile'], required:[['companyName','name'],['ein','taxId']] },
  { id:'notice_of_assignment', label:'Notice of Assignment', family:'factoring', phrases:['notice of assignment','all payments should be made','assigned to factoring'], strong:['notice of assignment'], stacks:['company_wallet','factoring','broker_profile'], required:[['factoringCompany'],['date']] },
  { id:'factoring_agreement', label:'Factoring Agreement', family:'factoring', phrases:['factoring agreement','purchase of accounts receivable','factor fee','recourse factoring'], strong:['factoring agreement'], stacks:['company_wallet','factoring','taxes'], required:[['factoringCompany'],['date']] },
  { id:'ach_form', label:'ACH / Direct Deposit Form', family:'company', phrases:['ach authorization','direct deposit form','bank routing number','account number'], strong:['ach authorization','direct deposit form'], stacks:['company_wallet','broker_profile'], required:[['routingNumber'],['accountNumber']] },
  { id:'claim_notice', label:'Freight Claim Notice', family:'claim', phrases:['freight claim','claim notice','notice of claim','claim amount'], strong:['freight claim','notice of claim'], stacks:['claims','load_folder','company_wallet'], required:[['loadNo','bolNo'],['date']] },
  { id:'accident_report', label:'Accident / Incident Report', family:'claim', phrases:['accident report','incident report','police report','crash report'], strong:['accident report','police report'], stacks:['claims','driver_wallet','truck_wallet','company_wallet'], required:[['date'],['driverName','name']] },
  { id:'logbook_supporting', label:'Logbook Supporting Document', family:'logbook', phrases:['supporting document','dispatch record','trip sheet','expense record'], strong:['supporting document'], stacks:['logbook','smart_inbox'], required:[['date']] },
  { id:'other_expense', label:'Other Business Receipt', family:'expense', phrases:['receipt','amount paid','subtotal','sales tax','total'], strong:[], stacks:['expenses','taxes'], required:[['date'],['total']] },
  { id:'other', label:'Other Document', family:'other', phrases:[], strong:[], stacks:['smart_inbox'], required:[] },
];

const TYPE_MAP = new Map(TYPE_DEFINITIONS.map(item => [item.id, item]));

function clean(value = '') { return String(value || '').replace(/\s+/g, ' ').trim(); }
function lower(value = '') { return clean(value).toLowerCase(); }
function valuePresent(value) {
  if (value == null || value === '') return false;
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return clean(value) !== '';
}
function occurrenceCount(text = '', phrase = '') {
  if (!text || !phrase) return 0;
  let count = 0; let from = 0;
  while (from < text.length) { const index = text.indexOf(phrase, from); if (index < 0) break; count += 1; from = index + phrase.length; }
  return count;
}
function firstValue(object = {}, keys = []) { for (const key of keys) if (valuePresent(object?.[key])) return object[key]; return ''; }
function normalizeIdentity(value = '') { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function tokenSet(value = '') { return new Set(String(value || '').toUpperCase().match(/[A-Z0-9]{2,}/g) || []); }
function tokenAgreement(a = '', b = '') {
  const left = tokenSet(a); const right = tokenSet(b); if (!left.size || !right.size) return 0;
  let hits = 0; for (const token of left) if (right.has(token)) hits += 1;
  return hits / Math.max(1, Math.min(left.size, right.size));
}
function dateFromFields(fields = {}) { return clean(firstValue(fields, ['deliveryDate','pickupDate','date','issuedOn','transactionDate'])); }
function quarterFromDate(value = '') {
  const match = String(value || '').match(/(20\d{2})[-\/]?(\d{1,2})?/);
  let year = Number(match?.[1] || new Date().getFullYear()); let month = Number(match?.[2] || 0);
  if (!month) { const alternate = String(value || '').match(/^(\d{1,2})[\/-]\d{1,2}[\/-](20\d{2})$/); month = Number(alternate?.[1] || new Date().getMonth() + 1); year = Number(alternate?.[2] || year); }
  return `${year} Q${Math.max(1, Math.min(4, Math.ceil(month / 3)))}`;
}
function typeScore(definition, text = '', fileName = '', broadType = '') {
  const haystack = lower(`${fileName} ${text}`);
  let score = broadType !== 'other' && definition.id === broadType ? 18 : 0;
  for (const phrase of definition.phrases || []) score += occurrenceCount(haystack, phrase) * (definition.strong?.includes(phrase) ? 16 : 5);
  const file = lower(fileName).replace(/[_-]+/g, ' ');
  if (definition.phrases?.some(phrase => phrase.length >= 4 && file.includes(phrase))) score += 12;
  if (definition.id === 'pod' && /signed|received by|receiver|delivered/.test(haystack)) score += 14;
  if (definition.id === 'bol' && /proof of delivery|receiver signature|signed by/.test(haystack)) score -= 14;
  if (definition.id === 'rate_confirmation' && /terms and conditions/.test(haystack) && /load|order|total pay/.test(haystack)) score += 7;
  if (definition.id === 'fuel_receipt' && /gallons/.test(haystack) && /\$|total|amount paid/.test(haystack)) score += 12;
  if (definition.id === 'repair_invoice' && /labor/.test(haystack) && /parts/.test(haystack)) score += 12;
  return score;
}

export function inferExactDocumentTypeV1040(analysis = {}, options = {}) {
  const text = String(analysis?.text || ''); const fileName = options.fileName || '';
  const broadType = analysis?.type?.id || analysis?.detectedType?.id || 'other';
  const generic = classifyDocument(text, fileName);
  const ranked = TYPE_DEFINITIONS.map(definition => ({ definition, score:typeScore(definition, text, fileName, broadType) })).sort((a, b) => b.score - a.score);
  const top = ranked[0] || { definition:TYPE_MAP.get('other'), score:0 }; const second = ranked[1] || { score:0 };
  const hasEvidence = top.score >= 8;
  const confidence = hasEvidence ? Math.min(.995, .48 + Math.min(.32, top.score * .012) + Math.min(.17, Math.max(0, top.score - second.score) * .018)) : Math.max(.22, Number(generic?.confidence || 0) * .65);
  const exact = hasEvidence ? top.definition : (TYPE_MAP.get(broadType) || TYPE_MAP.get(generic?.type?.id) || TYPE_MAP.get('other'));
  return { id:exact.id, label:exact.label, family:exact.family, confidence, score:top.score, broadType, alternatives:ranked.slice(0, 5).map(item => ({ id:item.definition.id, label:item.definition.label, score:item.score })), autoCorrected:exact.id !== broadType && confidence >= .82 };
}

function pagesFromAnalysis(analysis = {}) {
  const direct = (Array.isArray(analysis.pages) ? analysis.pages : []).map((page, index) => ({ page:Number(page?.page || page?.pageNumber || index + 1), text:String(page?.text || page?.rawText || page?.textContent || page?.content || '') })).filter(page => clean(page.text));
  if (direct.length) return direct;
  const source = String(analysis.text || ''); const marked = []; const regex = /\[\[PAGE\s+(\d+)\]\]\s*([\s\S]*?)(?=\n\[\[PAGE\s+\d+\]\]|$)/gi; let match;
  while ((match = regex.exec(source))) marked.push({ page:Number(match[1]), text:String(match[2] || '').trim() });
  if (marked.length) return marked;
  return source ? [{ page:1, text:source }] : [];
}
function pageHasStrongHeader(text = '', typeId = '') { const definition = TYPE_MAP.get(typeId); const first = lower(String(text || '').slice(0, 1100)); return Boolean(definition?.strong?.some(phrase => first.includes(phrase))); }
export function splitSmartPacketV1040(analysis = {}, options = {}) {
  const pages = pagesFromAnalysis(analysis); if (!pages.length) return { isPacket:false, pageCount:0, documentCount:0, documents:[] };
  const classified = pages.map(page => ({ ...page, type:inferExactDocumentTypeV1040({ ...analysis, text:page.text, pages:[], type:analysis.type }, options) }));
  const documents = [];
  for (const page of classified) {
    const previous = documents.at(-1); const sameType = previous?.type?.id === page.type.id; const sameFamily = previous?.type?.family === page.type.family;
    const clearNewDocument = pageHasStrongHeader(page.text, page.type.id) && !sameType; const continuation = /page\s+\d+\s+(?:of|\/+)\s*\d+|terms and conditions|continued/i.test(page.text.slice(0, 900));
    if (!previous || clearNewDocument || (!sameType && !sameFamily && !continuation)) documents.push({ id:`packet-doc-${documents.length + 1}`, type:page.type, pages:[page.page], text:page.text });
    else { previous.pages.push(page.page); previous.text = `${previous.text}\n\n${page.text}`; if (!sameType && page.type.confidence > previous.type.confidence + .08) previous.type = page.type; }
  }
  return { isPacket:documents.length > 1, pageCount:pages.length, documentCount:documents.length, documents:documents.map(document => ({ id:document.id, type:document.type, pages:document.pages, pageRange:document.pages.length === 1 ? `Page ${document.pages[0]}` : `Pages ${document.pages[0]}–${document.pages.at(-1)}`, preview:clean(document.text).slice(0, 180) })) };
}

function buildContext(state = {}, profile = {}, fields = {}) {
  const loadInfo = state?.loadInfo || state?.activeLoad || state?.currentLoad || {}; const activeLoad = state?.activeLoad || loadInfo;
  const loadNo = clean(firstValue(fields, ['loadNo','bolNo','poNumber']) || firstValue(activeLoad, ['loadNo','loadNumber','shippingDocs','bol','po','orderNo']));
  const broker = clean(firstValue(fields, ['broker']) || firstValue(activeLoad, ['broker','brokerName','customer']));
  const origin = clean(firstValue(fields, ['origin','shipFromDetails']) || firstValue(activeLoad, ['origin','pickup','pickupLocation']));
  const destination = clean(firstValue(fields, ['destination','shipToDetails']) || firstValue(activeLoad, ['destination','delivery','deliveryLocation']));
  return { loadNo, activeLoadNo:clean(firstValue(activeLoad, ['loadNo','loadNumber','shippingDocs','bol','po','orderNo'])), broker, activeBroker:clean(firstValue(activeLoad, ['broker','brokerName','customer'])), origin, activeOrigin:clean(firstValue(activeLoad, ['origin','pickup','pickupLocation'])), destination, activeDestination:clean(firstValue(activeLoad, ['destination','delivery','deliveryLocation'])), date:dateFromFields(fields), driver:clean(profile?.fullName || profile?.name || state?.driver?.name || 'Driver'), unit:clean(profile?.truckNumber || profile?.unitNumber || state?.truck?.unit || state?.vehicle?.unit || 'Truck'), trailer:clean(profile?.trailerNumber || state?.trailer?.unit || '') };
}
export function scoreActiveLoadMatchV1040(fields = {}, context = {}) {
  let score = 0; const reasons = []; const docLoad = normalizeIdentity(firstValue(fields, ['loadNo','bolNo','poNumber'])); const activeLoad = normalizeIdentity(context.activeLoadNo);
  if (docLoad && activeLoad && docLoad === activeLoad) { score += 58; reasons.push('Exact load/BOL/PO match'); }
  else if (docLoad && activeLoad && (docLoad.includes(activeLoad) || activeLoad.includes(docLoad))) { score += 38; reasons.push('Partial load reference match'); }
  const brokerAgreement = tokenAgreement(firstValue(fields, ['broker']), context.activeBroker); if (brokerAgreement >= .6) { score += 16; reasons.push('Broker match'); }
  const originAgreement = tokenAgreement(firstValue(fields, ['origin','shipFromDetails']), context.activeOrigin); if (originAgreement >= .45) { score += 10; reasons.push('Pickup match'); }
  const destinationAgreement = tokenAgreement(firstValue(fields, ['destination','shipToDetails']), context.activeDestination); if (destinationAgreement >= .45) { score += 10; reasons.push('Delivery match'); }
  const date = dateFromFields(fields); if (date && context.date && normalizeIdentity(date) === normalizeIdentity(context.date)) { score += 6; reasons.push('Document date match'); }
  return { score:Math.min(100, score), confidence:Math.min(.99, score / 100), matched:score >= 60, automatic:score >= 85, reasons, loadNo:docLoad ? firstValue(fields, ['loadNo','bolNo','poNumber']) : context.activeLoadNo };
}
function fillPath(path = '', context = {}) { return String(path || '').replace('{loadNo}', context.loadNo || 'Unmatched').replace('{broker}', context.broker || 'Unmatched').replace('{date}', context.date || 'Unscheduled').replace('{quarter}', quarterFromDate(context.date)).replace('{unit}', context.unit || 'Truck').replace('{driver}', context.driver || 'Driver'); }
export function routeSmartDocumentV1040(typeId = 'other', fields = {}, context = {}, match = {}) {
  const definition = TYPE_MAP.get(typeId) || TYPE_MAP.get('other'); const resolvedContext = { ...context, loadNo:clean(firstValue(fields, ['loadNo','bolNo','poNumber']) || match.loadNo || context.loadNo), broker:clean(firstValue(fields, ['broker']) || context.broker), date:dateFromFields(fields) || context.date };
  const stackIds = [...new Set([...(definition.stacks || []), 'smart_inbox'])];
  const stacks = stackIds.map(id => { const stack = STACKS[id] || STACKS.smart_inbox; return { ...stack, path:fillPath(stack.path, resolvedContext), primary:id === definition.stacks?.[0] }; });
  const actions = [];
  if (['pod','bol','rate_confirmation','load_invoice'].includes(typeId)) actions.push({ id:'billing-readiness', label:'Update billing readiness' });
  if (typeId === 'pod') actions.push({ id:'signature-check', label:'Verify receiver signature and exceptions' });
  if (['fuel_receipt','fuel_card_statement'].includes(typeId)) actions.push({ id:'ifta-post', label:`Post to ${quarterFromDate(resolvedContext.date)} IFTA` });
  if (['registration','irp_cab_card','ifta_license','insurance','annual_inspection','medical_card','driver_license','twic_card','permit'].includes(typeId)) actions.push({ id:'expiration', label:'Track expiration and reminders' });
  if (definition.family === 'maintenance') actions.push({ id:'maintenance-event', label:'Create truck maintenance record' });
  if (definition.family === 'claim') actions.push({ id:'claim-timeline', label:'Add to claim evidence timeline' });
  return { primary:stacks.find(stack => stack.primary) || stacks[0], stacks, actions, context:resolvedContext };
}
function requiredReview(definition, fields = {}, fieldConfidence = {}) {
  const review = [];
  for (const group of definition.required || []) { const key = group.find(name => valuePresent(fields?.[name])); if (!key) { review.push({ field:group[0], reason:'Missing required field', severity:'critical' }); continue; } const confidence = Number(fieldConfidence?.[key] || 0); if (confidence > 0 && confidence < .72) review.push({ field:key, reason:`Low confidence ${Math.round(confidence * 100)}%`, severity:'review' }); }
  return review;
}
function numeric(value) { const parsed = Number(String(value ?? '').replace(/[$, ]/g, '').replace(/[^0-9.-]/g, '')); return Number.isFinite(parsed) ? parsed : 0; }
function validationFor(typeId, fields = {}, analysis = {}) {
  const definition = TYPE_MAP.get(typeId) || TYPE_MAP.get('other'); const review = requiredReview(definition, fields, analysis.fieldConfidence || fields.fieldConfidence || {}); const checks = Array.isArray(analysis?.validation?.checks) ? [...analysis.validation.checks] : []; const text = lower(analysis?.text || '');
  if (typeId === 'pod') { const signed = /receiver signature|received by|signed by|consignee signature/.test(text) || Boolean(fields.signaturePresent || fields.receiver); checks.push({ id:'pod-signature', ok:signed, detail:'Receiver signature evidence', severity:'critical' }); if (!signed) review.push({ field:'signature', reason:'Receiver signature not verified', severity:'critical' }); }
  if (typeId === 'fuel_receipt') { const gallons = numeric(fields.gallons); const price = numeric(fields.pricePerGallon); const total = numeric(fields.total); if (gallons && price && total) { const tolerance = Math.max(2.5, total * .04); const ok = Math.abs(gallons * price - total) <= tolerance; checks.push({ id:'fuel-math-v1040', ok, detail:'Gallons × price agrees with total', severity:'critical' }); if (!ok) review.push({ field:'total', reason:'Fuel math does not reconcile', severity:'critical' }); } }
  const criticalFailures = checks.filter(check => check?.ok === false && check?.severity === 'critical').length + review.filter(item => item.severity === 'critical').length;
  return { checks, review, valid:criticalFailures === 0, criticalFailures };
}
function fingerprint(typeId = 'other', fields = {}, text = '') {
  const key = [typeId, firstValue(fields, ['loadNo','bolNo','poNumber','invoiceNo','transactionId','licenseNumber','vin']), dateFromFields(fields), numeric(firstValue(fields, ['total','gross','netPay'])), clean(text).slice(0, 160)].join('|').toUpperCase();
  let hash = 2166136261; for (let index = 0; index < key.length; index += 1) { hash ^= key.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `doc-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
export function buildSmartDocumentPlanV1040(analysis = {}, options = {}) {
  const fields = analysis?.fields || {}; const exactType = inferExactDocumentTypeV1040(analysis, options); const context = buildContext(options.state || {}, options.profile || {}, fields); const match = scoreActiveLoadMatchV1040(fields, context); const packet = splitSmartPacketV1040(analysis, options); const routing = routeSmartDocumentV1040(exactType.id, fields, context, match); const validation = validationFor(exactType.id, fields, analysis);
  const canAutoFile = exactType.confidence >= .86 && validation.valid && (!['load','load_expense','accessorial','billing','claim'].includes(exactType.family) || match.score >= 60 || !context.activeLoadNo);
  const searchKeys = [...new Set([exactType.label, exactType.family, ...routing.stacks.flatMap(stack => [stack.label, stack.path]), firstValue(fields, ['loadNo','bolNo','poNumber']), firstValue(fields, ['broker','merchant','vendor']), context.unit, context.driver, dateFromFields(fields)].map(clean).filter(Boolean))];
  return { version:SMART_DOCUMENT_ENGINE_VERSION_V1040, exactType, broadType:analysis?.type || documentTypeMeta(exactType.id), packet, routing, match, validation, canAutoFile, requiresReview:!canAutoFile || validation.review.length > 0, reviewFields:validation.review, fingerprint:fingerprint(exactType.id, fields, analysis?.text || ''), searchKeys, summary:packet.isPacket ? `${packet.documentCount} documents detected across ${packet.pageCount} pages` : `${exactType.label} → ${routing.primary?.label || 'Smart Inbox'}` };
}
export function smartDocumentCloudNoteV1040(note = '', plan = {}) {
  const userNote = clean(note); const smart = plan?.routing?.stacks?.length ? `SMART_FILE_V1040 | ${plan.exactType?.label || 'Document'} | ${plan.routing.stacks.map(stack => stack.path).join(' | ')}` : '';
  return [userNote, smart].filter(Boolean).join('\n').slice(0, 4000);
}
export { TYPE_DEFINITIONS as SMART_TRUCK_DOCUMENT_TYPES_V1040, STACKS as SMART_DOCUMENT_STACKS_V1040 };
