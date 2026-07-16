export const OWNER_OPS_STORE_KEY_V102 = 'road-ready-owner-ops-v102';
export const OWNER_OPS_STORE_EVENT_V102 = 'road-ready-owner-ops-updated-v102';

const EMPTY_V102 = {
  version: 2,
  billingProfile: {
    carrierName:'', mcNumber:'', dotNumber:'', ein:'', address:'', cityStateZip:'',
    phone:'', email:'', invoicePrefix:'INV', paymentTerms:'Net 30',
    factoring:{ enabled:false, company:'', contact:'', email:'', phone:'', address:'', feePercent:0, noticeOfAssignment:'' },
  },
  mileageImports: [],
  tolls: [],
  fuelImports: [],
  invoices: [],
  connections: {},
  auditHistory: [],
  documentTags: {},
  updatedAt: 0,
};

function text(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function number(value = 0) {
  const parsed = Number(String(value ?? '').replace(/[$,%]/g, '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function recordId(prefix = 'row') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
function normalizeDate(value = '') {
  const raw = text(value);
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${String(match[1]).padStart(2,'0')}-${String(match[2]).padStart(2,'0')}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}-${String(parsed.getDate()).padStart(2,'0')}`;
}
function stateCode(value = '') {
  const raw = text(value).toUpperCase();
  const exact = raw.match(/\b([A-Z]{2})\b/);
  return exact?.[1] || '';
}
function normalizeRecord(row = {}, prefix = 'row') {
  return { ...row, id:text(row.id) || recordId(prefix), createdAt:number(row.createdAt) || Date.now(), updatedAt:number(row.updatedAt) || Date.now() };
}

export function emptyOwnerOpsStoreV102() {
  return JSON.parse(JSON.stringify(EMPTY_V102));
}

export function normalizeOwnerOpsStoreV102(value = {}) {
  const input = object(value);
  const profile = object(input.billingProfile);
  const factoring = object(profile.factoring);
  return {
    version:2,
    billingProfile:{
      ...EMPTY_V102.billingProfile,
      ...profile,
      factoring:{ ...EMPTY_V102.billingProfile.factoring, ...factoring, feePercent:number(factoring.feePercent) },
    },
    mileageImports:list(input.mileageImports).map(row => normalizeRecord(row, 'mileage')),
    tolls:list(input.tolls).map(row => normalizeRecord(row, 'toll')),
    fuelImports:list(input.fuelImports).map(row => normalizeRecord(row, 'fuel_import')),
    invoices:list(input.invoices).map(row => normalizeRecord(row, 'invoice')),
    connections:object(input.connections),
    auditHistory:list(input.auditHistory).map(row => normalizeRecord(row, 'audit')),
    documentTags:object(input.documentTags),
    updatedAt:number(input.updatedAt),
  };
}

export function readOwnerOpsStoreV102() {
  if (typeof window === 'undefined' || !window.localStorage) return emptyOwnerOpsStoreV102();
  try {
    const raw = window.localStorage.getItem(OWNER_OPS_STORE_KEY_V102);
    return raw ? normalizeOwnerOpsStoreV102(JSON.parse(raw)) : emptyOwnerOpsStoreV102();
  } catch {
    return emptyOwnerOpsStoreV102();
  }
}

export function writeOwnerOpsStoreV102(value = {}) {
  const next = normalizeOwnerOpsStoreV102({ ...value, updatedAt:Date.now() });
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(OWNER_OPS_STORE_KEY_V102, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(OWNER_OPS_STORE_EVENT_V102, { detail:next }));
  }
  return next;
}

export function updateOwnerOpsProfileV102(store, patch = {}) {
  const current = normalizeOwnerOpsStoreV102(store);
  return writeOwnerOpsStoreV102({
    ...current,
    billingProfile:{
      ...current.billingProfile,
      ...patch,
      factoring:{ ...current.billingProfile.factoring, ...object(patch.factoring) },
    },
  });
}

export function appendOwnerOpsRowsV102(store, bucket, rows = [], connectionPatch = null) {
  const current = normalizeOwnerOpsStoreV102(store);
  if (!['mileageImports','tolls','fuelImports','invoices','auditHistory'].includes(bucket)) return current;
  const normalized = list(rows).map(row => normalizeRecord(row, bucket));
  const seen = new Set();
  const merged = [...normalized, ...current[bucket]].filter(row => {
    const key = text(row.externalId || row.transactionId || row.invoiceNo || `${row.date}|${row.state}|${row.amount || row.total || row.miles}|${row.source}|${row.plaza || row.merchant || ''}`).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return writeOwnerOpsStoreV102({
    ...current,
    [bucket]:merged,
    connections:connectionPatch ? { ...current.connections, ...connectionPatch } : current.connections,
  });
}

export function tagOwnerDocumentV102(store, documentId = '', patch = {}) {
  const current = normalizeOwnerOpsStoreV102(store);
  if (!documentId) return current;
  return writeOwnerOpsStoreV102({
    ...current,
    documentTags:{
      ...current.documentTags,
      [documentId]:{ ...object(current.documentTags[documentId]), ...patch, updatedAt:Date.now() },
    },
  });
}

export function parseCsvV102(source = '') {
  const input = String(source || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) { row.push(cell); cell = ''; continue; }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some(value => text(value))) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.some(value => text(value))) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map(value => text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
  return rows.slice(1).map(values => {
    const out = {};
    headers.forEach((header, index) => { if (header) out[header] = text(values[index]); });
    return out;
  }).filter(rowValue => Object.values(rowValue).some(Boolean));
}

function pick(row = {}, candidates = []) {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const wanted = candidate.toLowerCase();
    const exact = keys.find(key => key === wanted);
    if (exact && text(row[exact])) return row[exact];
    const fuzzy = keys.find(key => key.includes(wanted));
    if (fuzzy && text(row[fuzzy])) return row[fuzzy];
  }
  return '';
}

function sourceName(fileName = '', fallback = 'CSV import') {
  const lower = text(fileName).toLowerCase();
  if (/motive|keeptruckin/.test(lower)) return 'Motive / KeepTruckin';
  if (/mudflap/.test(lower)) return 'Mudflap';
  if (/illinois|ipass|i-pass|tollway/.test(lower)) return 'Illinois Tollway';
  if (/ezpass|e-zpass/.test(lower)) return 'E-ZPass';
  if (/samsara/.test(lower)) return 'Samsara';
  if (/geotab/.test(lower)) return 'Geotab';
  return fallback;
}

export function importMileageCsvV102(csvText = '', fileName = '', options = {}) {
  const provider = sourceName(fileName, options.provider || 'ELD / mileage CSV');
  const importedAt = Date.now();
  return parseCsvV102(csvText).map((row, index) => {
    const miles = number(pick(row, ['ifta distance','jurisdiction miles','taxable miles','distance miles','distance','miles']));
    const state = stateCode(pick(row, ['jurisdiction','state province','state','region']));
    const date = normalizeDate(pick(row, ['trip date','date','start date','day']));
    const truck = text(pick(row, ['vehicle number','vehicle','unit number','unit','truck']));
    const loadNo = text(pick(row, ['load number','load no','order number','trip number'])).toUpperCase();
    if (!miles || !state) return null;
    return normalizeRecord({
      externalId:text(pick(row, ['id','trip id','record id'])) || `${provider}_${date}_${state}_${truck}_${index}`,
      date, state, miles, taxableMiles:number(pick(row, ['taxable miles','ifta taxable miles'])) || miles,
      truck, loadNo:loadNo || text(options.activeLoadNo).toUpperCase(), provider, source:'mileage_csv_v102', importedAt, fileName:text(fileName), raw:row,
    }, 'mileage');
  }).filter(Boolean);
}

export function importTollCsvV102(csvText = '', fileName = '', options = {}) {
  const provider = sourceName(fileName, options.provider || 'Toll statement');
  const importedAt = Date.now();
  return parseCsvV102(csvText).map((row, index) => {
    const amount = number(pick(row, ['transaction amount','toll amount','amount','charge','debit']));
    const date = normalizeDate(pick(row, ['transaction date','posting date','date','trip date']));
    const plaza = text(pick(row, ['toll plaza','plaza','facility','location','roadway','entry plaza']));
    const state = stateCode(pick(row, ['state','jurisdiction'])) || stateCode(plaza);
    const plate = text(pick(row, ['license plate','plate number','plate','vehicle'])).toUpperCase();
    const transactionId = text(pick(row, ['transaction id','reference number','reference','id']));
    const loadNo = text(pick(row, ['load number','load no'])).toUpperCase() || text(options.activeLoadNo).toUpperCase();
    if (!amount && !plaza) return null;
    return normalizeRecord({
      externalId:transactionId || `${provider}_${date}_${amount}_${plaza}_${index}`,
      transactionId, date, amount, plaza, state, plate, loadNo, provider, source:'toll_csv_v102', importedAt, fileName:text(fileName), linked:!!loadNo, raw:row,
    }, 'toll');
  }).filter(Boolean);
}

export function importFuelCsvV102(csvText = '', fileName = '', options = {}) {
  const provider = sourceName(fileName, options.provider || 'Fuel statement');
  const importedAt = Date.now();
  return parseCsvV102(csvText).map((row, index) => {
    const gallons = number(pick(row, ['net gallons','fuel gallons','gallons','quantity','qty']));
    const total = number(pick(row, ['net amount','transaction amount','total amount','total','amount']));
    const pricePerGallon = number(pick(row, ['price per gallon','unit price','ppu','price'])) || (gallons > 0 ? total / gallons : 0);
    const date = normalizeDate(pick(row, ['transaction date','date','purchase date']));
    const merchant = text(pick(row, ['merchant name','merchant','station','location name','truck stop'])) || provider;
    const city = text(pick(row, ['city','location city']));
    const state = stateCode(pick(row, ['state','location state','jurisdiction']));
    const transactionId = text(pick(row, ['transaction id','invoice number','reference','id']));
    const truck = text(pick(row, ['vehicle number','unit','truck']));
    const loadNo = text(pick(row, ['load number','load no'])).toUpperCase() || text(options.activeLoadNo).toUpperCase();
    if (!gallons && !total) return null;
    return normalizeRecord({
      externalId:transactionId || `${provider}_${date}_${total}_${index}`,
      transactionId, date, merchant, cityState:[city,state].filter(Boolean).join(', '), state, gallons, total,
      pricePerGallon, discount:number(pick(row, ['discount','savings','mudflap savings'])), truck, loadNo,
      provider, source:'fuel_csv_v102', importedAt, fileName:text(fileName), raw:row,
    }, 'fuel_import');
  }).filter(Boolean);
}

export function quarterKeyV102(dateInput = new Date()) {
  const date = dateInput instanceof Date ? dateInput : new Date(`${normalizeDate(dateInput) || dateInput}T12:00:00`);
  const valid = Number.isNaN(date.getTime()) ? new Date() : date;
  return `${valid.getFullYear()}-Q${Math.floor(valid.getMonth() / 3) + 1}`;
}

export function iftaSummaryV102(ownerStore = {}, businessStore = {}, quarter = quarterKeyV102()) {
  const owner = normalizeOwnerOpsStoreV102(ownerStore);
  const fuelRows = [
    ...owner.fuelImports,
    ...list(businessStore?.fuel).map(row => ({
      ...row,
      state:stateCode(row.state || row.cityState),
      gallons:number(row.gallons),
      total:number(row.total),
      provider:row.source || row.merchant || 'Road Ready fuel',
    })),
  ];
  const withinQuarter = row => quarterKeyV102(row.date || row.createdAt) === quarter;
  const states = new Map();
  const ensure = state => {
    const key = stateCode(state) || 'UNK';
    if (!states.has(key)) states.set(key, { state:key, miles:0, taxableMiles:0, gallons:0, fuelTotal:0, mileageRows:0, fuelRows:0, sources:new Set() });
    return states.get(key);
  };
  owner.mileageImports.filter(withinQuarter).forEach(row => {
    const target = ensure(row.state);
    target.miles += number(row.miles);
    target.taxableMiles += number(row.taxableMiles || row.miles);
    target.mileageRows += 1;
    if (row.provider) target.sources.add(row.provider);
  });
  fuelRows.filter(withinQuarter).forEach(row => {
    const target = ensure(row.state || row.cityState);
    target.gallons += number(row.gallons);
    target.fuelTotal += number(row.total);
    target.fuelRows += 1;
    if (row.provider || row.merchant) target.sources.add(row.provider || row.merchant);
  });
  const rows = [...states.values()].map(row => ({
    ...row,
    sources:[...row.sources],
    mpg:row.gallons > 0 ? row.miles / row.gallons : 0,
    status:row.miles > 0 && row.gallons > 0 ? 'complete' : row.miles > 0 ? 'missing_fuel' : 'fuel_only',
  })).sort((a,b) => a.state.localeCompare(b.state));
  return {
    quarter,
    rows,
    totalMiles:rows.reduce((sum,row)=>sum+row.miles,0),
    taxableMiles:rows.reduce((sum,row)=>sum+row.taxableMiles,0),
    gallons:rows.reduce((sum,row)=>sum+row.gallons,0),
    fuelTotal:rows.reduce((sum,row)=>sum+row.fuelTotal,0),
    missingFuelStates:rows.filter(row=>row.status==='missing_fuel').map(row=>row.state),
    unknownRows:rows.filter(row=>row.state==='UNK').length,
  };
}

function documentType(document = {}) {
  return text(document.type || document.extracted?.type || document.classification?.selectedType || document.label).toLowerCase();
}
function documentLoadNo(document = {}) {
  return text(document.load_no || document.loadNo || document.extracted?.loadNo || document.extracted?.orderNo || document.extracted?.bolNo).toUpperCase();
}
export function documentsForLoadV102(documents = [], loadNo = '') {
  const key = text(loadNo).toUpperCase();
  if (!key) return [];
  return list(documents).filter(document => documentLoadNo(document) === key);
}

export function billingReadinessV102(load = {}, documents = [], businessStore = {}) {
  const loadNo = text(load.loadNo || load.orderNo).toUpperCase();
  const docs = documentsForLoadV102(documents, loadNo);
  const types = new Set(docs.map(documentType));
  const delivered = ['delivered','invoice_ready','invoiced','submitted','paid'].includes(text(load.status).toLowerCase())
    || Boolean(load.deliveryDate || load.deliveredDate || load.completedAt);
  const hasRate = types.has('rate_confirmation') || types.has('rate confirmation') || Boolean(load.documentId || load.rateConDocumentId);
  const hasBol = types.has('bol') || types.has('bill of lading');
  const hasPod = types.has('pod') || types.has('proof of delivery');
  const accessorials = list(businessStore?.expenses).filter(row => text(row.loadNo).toUpperCase() === loadNo && /lumper|detention|scale/i.test(text(row.category)));
  const missingAccessorialProof = accessorials.filter(row => !row.receiptAttached).length;
  const checklist = [
    { id:'rate', label:'Rate Confirmation', required:true, complete:hasRate },
    { id:'bol', label:'Pickup BOL', required:true, complete:hasBol },
    { id:'pod', label:'Final signed POD', required:true, complete:hasPod },
    { id:'delivery', label:'Delivery completed', required:true, complete:delivered },
    { id:'accessorials', label:'Accessorial proof', required:accessorials.length > 0, complete:missingAccessorialProof === 0 },
  ];
  const required = checklist.filter(item=>item.required);
  const complete = required.filter(item=>item.complete).length;
  const percent = required.length ? Math.round((complete / required.length) * 100) : 0;
  return {
    loadNo, docs, checklist, requiredCount:required.length, completeCount:complete, percent,
    ready:required.length > 0 && complete === required.length,
    missing:required.filter(item=>!item.complete),
    accessorials,
  };
}

export function ownerOpsActionCenterV102({ state = {}, businessStore = {}, ownerStore = {}, documents = [], unsignedCount = 0 } = {}) {
  const actions = [];
  const loads = list(businessStore.loads);
  if (unsignedCount > 0) actions.push({ id:'unsigned', severity:'high', title:`${unsignedCount} log${unsignedCount===1?'':'s'} need signing`, detail:'Review and certify completed log days.', section:'logbook' });
  loads.forEach(load => {
    const readiness = billingReadinessV102(load, documents, businessStore);
    if (['delivered','invoice_ready'].includes(text(load.status).toLowerCase()) && !readiness.ready) {
      actions.push({ id:`billing_${load.id}`, severity:'high', title:`Load ${load.loadNo || ''} missing billing paperwork`, detail:readiness.missing.map(item=>item.label).join(' · '), section:'billing', loadNo:load.loadNo });
    } else if (readiness.ready && !['invoiced','submitted','paid'].includes(text(load.status).toLowerCase())) {
      actions.push({ id:`invoice_${load.id}`, severity:'medium', title:`Load ${load.loadNo || ''} ready to invoice`, detail:'Generate the invoice and billing packet.', section:'billing', loadNo:load.loadNo });
    }
  });
  const ifta = iftaSummaryV102(ownerStore, businessStore);
  if (ifta.missingFuelStates.length) actions.push({ id:'ifta_missing_fuel', severity:'medium', title:`IFTA fuel proof missing in ${ifta.missingFuelStates.join(', ')}`, detail:'Import Mudflap or fuel-card receipts for the current quarter.', section:'ifta' });
  const unlinkedTolls = normalizeOwnerOpsStoreV102(ownerStore).tolls.filter(row => !row.loadNo).length;
  if (unlinkedTolls) actions.push({ id:'tolls_unlinked', severity:'low', title:`${unlinkedTolls} toll transaction${unlinkedTolls===1?'':'s'} need a load`, detail:'Review imported tolls and link them to a trip.', section:'tolls' });
  const reviewDocs = list(documents).filter(document => Number(document.classification?.confidence || document.confidence || 0) < .78).length;
  if (reviewDocs) actions.push({ id:'documents_review', severity:'medium', title:`${reviewDocs} document${reviewDocs===1?'':'s'} need review`, detail:'Confirm type, load number and critical fields.', section:'documents' });
  return actions.slice(0, 12);
}

export function ownerOpsCsvV102(rows = [], columns = []) {
  const escape = value => {
    const raw = String(value ?? '');
    return /[",\n]/.test(raw) ? `"${raw.replace(/"/g,'""')}"` : raw;
  };
  const defs = columns.length ? columns : Object.keys(rows[0] || {}).map(key => [key,key]);
  return [defs.map(([,label])=>escape(label)).join(','), ...rows.map(row => defs.map(([key])=>escape(row[key])).join(','))].join('\n');
}

export function downloadTextV102(content = '', fileName = 'road-ready-export.txt', type = 'text/plain') {
  if (typeof window === 'undefined') return false;
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  return true;
}
