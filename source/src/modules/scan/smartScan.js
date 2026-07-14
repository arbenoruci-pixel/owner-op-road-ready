export const SMART_DOCUMENT_TYPES = [
  { id:'rate_confirmation', label:'Rate Confirmation', short:'Rate Con', target:'loads', documentType:'other' },
  { id:'carrier_settlement', label:'Carrier Settlement', short:'Settlement', target:'settlements', documentType:'other' },
  { id:'bol', label:'Bill of Lading', short:'BOL', target:'documents', documentType:'bol' },
  { id:'pod', label:'Proof of Delivery', short:'POD', target:'documents', documentType:'pod' },
  { id:'fuel_receipt', label:'Fuel Receipt', short:'Fuel', target:'fuel', documentType:'fuel_receipt' },
  { id:'repair_invoice', label:'Repair / Service Invoice', short:'Repair', target:'maintenance', documentType:'other' },
  { id:'lumper_receipt', label:'Lumper Receipt', short:'Lumper', target:'expenses', documentType:'other' },
  { id:'scale_ticket', label:'Scale Ticket', short:'Scale', target:'expenses', documentType:'scale_ticket' },
  { id:'toll_parking_receipt', label:'Toll / Parking Receipt', short:'Toll', target:'expenses', documentType:'other' },
  { id:'insurance', label:'Insurance / COI', short:'Insurance', target:'documents', documentType:'insurance' },
  { id:'registration', label:'Registration / Cab Card', short:'Registration', target:'documents', documentType:'registration' },
  { id:'annual_inspection', label:'Annual Inspection', short:'Inspection', target:'documents', documentType:'annual_inspection' },
  { id:'form_2290', label:'Form 2290 / Schedule 1', short:'2290', target:'documents', documentType:'other' },
  { id:'permit', label:'Permit / Authority Document', short:'Permit', target:'documents', documentType:'other' },
  { id:'other_expense', label:'Other Business Receipt', short:'Expense', target:'expenses', documentType:'other' },
  { id:'other', label:'Other Document', short:'Other', target:'documents', documentType:'other' },
];

const RULES = {
  rate_confirmation:[
    ['rate confirmation',12],['carrier rate confirmation',14],['broker carrier agreement',9],['agreed rate',8],['line haul',5],['linehaul',5],['fuel surcharge',4],['pickup date',3],['delivery date',3],['carrier pay',5],['total rate',6],['load confirmation',8],
  ],
  carrier_settlement:[
    ['settlement statement',14],['driver settlement',12],['settlement period',9],['gross pay',6],['net pay',7],['deductions',7],['escrow',6],['driver pay',6],['chargeback',5],['fuel advance',4],['lease payment',5],
  ],
  bol:[
    ['bill of lading',15],['straight bill of lading',16],['shipper',4],['consignee',5],['freight charges',4],['bol number',8],['bol #',8],['seal number',4],['pieces',2],['commodity',3],['ship from',3],['ship to',3],
  ],
  pod:[
    ['proof of delivery',16],['delivery receipt',10],['received by',7],['receiver signature',8],['consignee signature',8],['delivered',3],['signed by',5],['delivery exception',5],
  ],
  fuel_receipt:[
    ['diesel',8],['gallons',7],['gallon',5],['price per gallon',8],['pump',4],['fuel total',7],['def',3],['pilot',3],['flying j',3],["love's",3],['loves',3],['travel centers of america',3],['petro',3],['mudflap',3],
  ],
  repair_invoice:[
    ['repair order',12],['service invoice',10],['labor',5],['parts',5],['mechanic',4],['work performed',7],['shop supplies',4],['tire service',5],['oil change',5],['roadside service',6],['vehicle repair',8],['vin',2],
  ],
  lumper_receipt:[
    ['lumper',14],['unloading fee',10],['capstone logistics',10],['warehouse services',4],['comcheck',3],['express code',3],
  ],
  scale_ticket:[
    ['cat scale',15],['certified scale',12],['steer axle',9],['drive axle',9],['trailer axle',9],['gross weight',7],['reweigh',5],
  ],
  toll_parking_receipt:[
    ['parking receipt',10],['truck parking',8],['toll receipt',10],['toll plaza',7],['ez-pass',6],['e-zpass',6],['prepass',4],
  ],
  insurance:[
    ['certificate of insurance',16],['insurance policy',10],['policy number',6],['certificate holder',7],['liability insurance',7],['physical damage',5],['effective date',3],['expiration date',3],
  ],
  registration:[
    ['vehicle registration',15],['cab card',14],['apportioned',8],['registration card',10],['license plate',5],['registered owner',5],['irP',4],
  ],
  annual_inspection:[
    ['annual inspection',15],['periodic inspection',12],['vehicle inspection report',10],['qualified inspector',7],['inspection date',5],['49 cfr 396',8],
  ],
  form_2290:[
    ['form 2290',16],['schedule 1',12],['heavy highway vehicle use tax',14],['taxable gross weight',7],['irs e-file watermark',7],
  ],
  permit:[
    ['motor carrier permit',10],['operating authority',10],['oversize permit',10],['trip permit',9],['fuel permit',8],['usdot',4],['mc number',4],
  ],
  other_expense:[
    ['receipt',2],['amount paid',3],['subtotal',2],['sales tax',2],['total',2],['invoice',2],
  ],
};

function normalizeText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function lower(value = '') {
  return normalizeText(value).toLowerCase();
}

function typeMeta(id = 'other') {
  return SMART_DOCUMENT_TYPES.find(type => type.id === id) || SMART_DOCUMENT_TYPES.at(-1);
}

function occurrenceCount(text, phrase) {
  if (!text || !phrase) return 0;
  let count = 0;
  let start = 0;
  while (start < text.length) {
    const index = text.indexOf(phrase, start);
    if (index === -1) break;
    count += 1;
    start = index + phrase.length;
  }
  return count;
}

function scoreType(text, id) {
  const rules = RULES[id] || [];
  return rules.reduce((score, [phrase, weight]) => score + (occurrenceCount(text, String(phrase).toLowerCase()) * weight), 0);
}

function filenameBoost(fileName = '', id = '') {
  const name = lower(fileName);
  const patterns = {
    rate_confirmation:/rate[-_ ]?con|confirmation|rateconfirmation/,
    carrier_settlement:/settlement|pay[-_ ]?statement/,
    bol:/\bbol\b|bill[-_ ]?of[-_ ]?lading/,
    pod:/\bpod\b|proof[-_ ]?of[-_ ]?delivery/,
    fuel_receipt:/fuel|diesel|pilot|flying[-_ ]?j|loves/,
    repair_invoice:/repair|service|maintenance|tire|oil[-_ ]?change/,
    lumper_receipt:/lumper|capstone/,
    scale_ticket:/scale|cat[-_ ]?scale/,
    toll_parking_receipt:/toll|parking/,
    insurance:/insurance|coi/,
    registration:/registration|cab[-_ ]?card|irp/,
    annual_inspection:/annual[-_ ]?inspection|dot[-_ ]?inspection/,
    form_2290:/2290|schedule[-_ ]?1/,
    permit:/permit|authority/,
  };
  return patterns[id]?.test(name) ? 8 : 0;
}

export function classifyDocument(text = '', fileName = '') {
  const haystack = lower(`${fileName} ${text}`);
  const ranked = Object.keys(RULES).map(id => ({ id, score:scoreType(haystack, id) + filenameBoost(fileName, id) }))
    .sort((a, b) => b.score - a.score);
  const top = ranked[0] || { id:'other', score:0 };
  const second = ranked[1] || { id:'other', score:0 };
  if (top.score <= 1) {
    return {
      type:typeMeta('other'),
      confidence:0.25,
      alternatives:SMART_DOCUMENT_TYPES.filter(type => ['rate_confirmation','bol','pod','fuel_receipt','repair_invoice','other'].includes(type.id)).slice(0, 5),
      scores:ranked,
    };
  }
  const gap = Math.max(0, top.score - second.score);
  const confidence = Math.min(0.98, 0.48 + Math.min(0.28, top.score * 0.018) + Math.min(0.2, gap * 0.025));
  return {
    type:typeMeta(top.id),
    confidence,
    alternatives:ranked.slice(0, 4).map(item => typeMeta(item.id)),
    scores:ranked,
  };
}

function moneyValues(text = '') {
  const values = [];
  const regex = /(?:\$|usd\s*)?\s*(-?\d{1,3}(?:,\d{3})*(?:\.\d{2}))/gi;
  let match;
  while ((match = regex.exec(text))) {
    const value = Number(String(match[1]).replace(/,/g, ''));
    if (Number.isFinite(value) && Math.abs(value) < 10_000_000) values.push(value);
  }
  return values;
}

function firstMatch(text = '', patterns = []) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return normalizeText(match[1]);
  }
  return '';
}

function numericMatch(text = '', patterns = []) {
  const value = firstMatch(text, patterns);
  const parsed = Number(String(value || '').replace(/[$,]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function locationAfterLabel(text = '', labelPattern) {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    if (!labelPattern.test(lines[index])) continue;
    const sameLine = lines[index].replace(labelPattern, '').replace(/^\s*[:#-]\s*/, '').trim();
    if (sameLine && /[A-Za-z]/.test(sameLine)) return sameLine.slice(0, 100);
    const next = lines[index + 1] || '';
    if (next && /[A-Za-z]/.test(next)) return next.slice(0, 100);
  }
  return '';
}

function merchantGuess(text = '') {
  const lines = String(text || '').split(/\r?\n/).map(line => normalizeText(line)).filter(Boolean);
  return (lines.find(line => /[A-Za-z]{3}/.test(line) && line.length <= 60 && !/receipt|invoice|statement|confirmation/i.test(line)) || '').slice(0, 60);
}

export function extractDocumentFields(text = '', typeId = 'other') {
  const normalized = String(text || '');
  const amounts = moneyValues(normalized);
  const largestAmount = amounts.length ? Math.max(...amounts.filter(value => value >= 0)) : 0;
  const date = firstMatch(normalized, [
    /(?:date|issued|transaction date|invoice date)\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/,
  ]);
  const loadNo = firstMatch(normalized, [
    /(?:load|order|trip|confirmation|bol|b\/l|po)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9_-]{3,})/i,
  ]).toUpperCase();
  const invoiceNo = firstMatch(normalized, [
    /(?:invoice|repair order|receipt)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9_-]{2,})/i,
  ]).toUpperCase();
  const gallons = numericMatch(normalized, [
    /(\d{1,4}(?:\.\d{1,3})?)\s*(?:gal|gallons)\b/i,
    /(?:gallons|qty)\s*[:#-]?\s*(\d{1,4}(?:\.\d{1,3})?)/i,
  ]);
  const pricePerGallon = numericMatch(normalized, [
    /(?:price\s*\/\s*gal|price per gallon|unit price|ppu)\s*[:#-]?\s*\$?\s*(\d{1,2}(?:\.\d{2,4})?)/i,
    /\$?\s*(\d{1,2}\.\d{2,4})\s*(?:\/\s*gal|per gallon)/i,
  ]);
  const odometer = numericMatch(normalized, [
    /(?:odometer|odometer reading|mileage)\s*[:#-]?\s*(\d{2,7})/i,
  ]);
  const grossPay = numericMatch(normalized, [
    /(?:gross pay|gross settlement|total gross|gross amount)\s*[:#-]?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i,
  ]);
  const netPay = numericMatch(normalized, [
    /(?:net pay|net settlement|amount paid|net amount)\s*[:#-]?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i,
  ]);
  const deductions = numericMatch(normalized, [
    /(?:total deductions|deductions total)\s*[:#-]?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i,
  ]);
  const total = typeId === 'carrier_settlement' ? (netPay || largestAmount) : largestAmount;
  const origin = locationAfterLabel(normalized, /^(?:pickup|pick up|ship from|origin)\b/i);
  const destination = locationAfterLabel(normalized, /^(?:delivery|deliver to|ship to|destination|consignee)\b/i);
  const seal = firstMatch(normalized, [/(?:seal|seal number|seal #)\s*[:#-]?\s*([A-Z0-9-]{3,})/i]).toUpperCase();
  const weight = numericMatch(normalized, [/(?:gross weight|weight|total weight)\s*[:#-]?\s*([\d,]{3,})\s*(?:lb|lbs|pounds)?/i]);

  return {
    date,
    merchant:merchantGuess(normalized),
    loadNo,
    invoiceNo,
    origin,
    destination,
    total,
    gallons,
    pricePerGallon:pricePerGallon || (gallons > 0 && total > 0 ? total / gallons : 0),
    odometer,
    grossPay,
    netPay,
    deductions,
    seal,
    weight,
  };
}

async function readWithNativeBridge(file) {
  if (typeof window === 'undefined') return null;
  const bridge = window.RoadReadyNative || window.roadReadyNative;
  if (!bridge || typeof bridge.analyzeDocument !== 'function') return null;
  try {
    const result = await bridge.analyzeDocument(file);
    if (!result) return null;
    return { text:String(result.text || ''), method:'native', nativeType:result.type || '', nativeFields:result.fields || {} };
  } catch {
    return null;
  }
}

async function readWithTextDetector(file) {
  if (typeof window === 'undefined' || typeof window.TextDetector !== 'function' || typeof createImageBitmap !== 'function') return null;
  if (!String(file?.type || '').startsWith('image/')) return null;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const detector = new window.TextDetector();
    const blocks = await detector.detect(bitmap);
    const text = (blocks || []).map(block => block.rawValue || block.text || '').filter(Boolean).join('\n');
    return text ? { text, method:'on-device' } : null;
  } catch {
    return null;
  } finally {
    try { bitmap?.close?.(); } catch {}
  }
}

async function readPlainText(file) {
  const type = String(file?.type || '');
  if (!type.startsWith('text/') && !/\.(txt|csv)$/i.test(file?.name || '')) return null;
  try {
    return { text:await file.text(), method:'text-file' };
  } catch {
    return null;
  }
}

export async function analyzeScanFile(file, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  onProgress(0.12, 'Preparing document…');
  const native = await readWithNativeBridge(file);
  onProgress(0.38, native ? 'Native text scan complete' : 'Checking on-device text recognition…');
  const detector = native || await readWithTextDetector(file);
  const plain = detector || await readPlainText(file);
  const text = normalizeText(plain?.text || '');
  onProgress(0.68, text ? 'Classifying document…' : 'Building smart review…');
  const classification = classifyDocument(text, file?.name || '');
  const nativeType = plain?.nativeType && SMART_DOCUMENT_TYPES.some(type => type.id === plain.nativeType) ? plain.nativeType : '';
  const selectedType = nativeType ? typeMeta(nativeType) : classification.type;
  const fields = {
    ...extractDocumentFields(plain?.text || '', selectedType.id),
    ...(plain?.nativeFields || {}),
  };
  onProgress(1, 'Ready to review');
  return {
    type:selectedType,
    confidence:nativeType ? 0.99 : classification.confidence,
    alternatives:classification.alternatives,
    text:plain?.text || '',
    method:plain?.method || 'smart-review',
    fields,
    needsReview:!plain?.text || classification.confidence < 0.78,
  };
}

export function documentTypeMeta(id = 'other') {
  return typeMeta(id);
}
