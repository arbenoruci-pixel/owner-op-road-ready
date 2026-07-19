import { truckDocumentTypeMetaV1040 } from './truckDocumentCatalogV1040.js';

const VERSION = '105.2.0';
const clean = value => String(value || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
const line = value => String(value || '').replace(/^[\s:#\-–—|]+|[\s|]+$/g, '').replace(/\s{2,}/g, ' ').trim();
const test = (pattern, text) => { try { pattern.lastIndex = 0; return pattern.test(text); } catch { return false; } };
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value || 0)));

function first(text, patterns = [], group = 1) {
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    if (match?.[group]) return line(match[group]);
  }
  return '';
}

function labeled(text, labels = []) {
  for (const label of labels) {
    const match = String(text || '').match(new RegExp(`(?:^|\\n)\\s*(?:${label})\\s*[:#-]?\\s*([^\\n]{1,150})`, 'i'));
    if (match?.[1]) return line(match[1]);
  }
  return '';
}

function operationalId(value = '') {
  const normalized = String(value || '').toUpperCase().replace(/[^A-Z0-9._/-]/g, '');
  return normalized.length >= 2 && normalized.length <= 48 && /\d/.test(normalized) ? normalized : '';
}

function scoreGatePass(text = '', fileName = '') {
  const source = clean(`${fileName}\n${text}`);
  let score = 0;
  const evidence = [];
  const negative = [];
  const add = (pattern, points, name) => {
    if (!test(pattern, source)) return;
    score += points;
    evidence.push(name);
  };
  const subtract = (pattern, points, name) => {
    if (!test(pattern, source)) return;
    score -= points;
    negative.push(name);
  };

  add(/\bgate\s+pass\b/i, 105, 'Gate Pass title');
  add(/\bdrop\s+load\b/i, 92, 'Drop Load operation');
  add(/dock\s+assignment/i, 58, 'Dock assignment');
  add(/appointment\s+window/i, 30, 'Appointment window');
  add(/arrival\s+time/i, 30, 'Arrival time');
  add(/assigned\s+by/i, 18, 'Assigned by');
  add(/\bcarrier\s*:/i, 14, 'Carrier');
  add(/trailer\s*(?:number|no\.?|#)\s*:/i, 18, 'Trailer number');
  add(/\bshipper\s*:/i, 14, 'Shipper');
  add(/\bP\.?O\.?\s*(?:number|no\.?|#)\s*:/i, 18, 'PO number');
  add(/\blot\s*(?:number|no\.?|#)\s*:/i, 14, 'Lot number');
  add(/guard\s+house|yard\s+entrance|drop\s+load\s*\/\s*parking/i, 22, 'Facility yard instructions');
  add(/anthony\s+marano(?:\s+company|\s+co\.?)?/i, 36, 'Anthony Marano facility');

  subtract(/carrier\s+rate\s+confirmation|total\s+carrier\s+pay|line\s*haul|fuel\s+surcharge/i, 110, 'Rate confirmation structure');
  subtract(/bill\s+of\s+lading|\bB\/?L\s*(?:NO|NUMBER|#)|product\s+code[\s\S]{0,120}(?:qty|quantity)/i, 90, 'BOL structure');
  subtract(/\bgallons?\b|price\s*(?:per|\/)\s*(?:gal|gallon)|\bdiesel\b/i, 85, 'Fuel receipt structure');
  subtract(/base\s+charge|total\s+cost|lumper|unloading\s+fee/i, 70, 'Lumper receipt structure');

  const structureCount = evidence.filter(item => !['Gate Pass title','Drop Load operation','Anthony Marano facility'].includes(item)).length;
  const hasIdentity = evidence.includes('Gate Pass title') || evidence.includes('Drop Load operation');
  const hasOperationalStructure = evidence.includes('Dock assignment') && (evidence.includes('Arrival time') || evidence.includes('Appointment window'));
  if (hasIdentity && hasOperationalStructure && structureCount >= 4) score += 42;

  const threshold = 108;
  const strong = score >= threshold && hasIdentity && hasOperationalStructure;
  return {
    id:'facility-gate-pass-drop-load',
    typeId:'gate_pass',
    score,
    threshold,
    strong,
    confidence:clamp(.5 + Math.max(0, score - threshold) / 175 + evidence.length * .018, .5, .995),
    evidence,
    negative,
    data:{ structureCount, operation:test(/\bdrop\s+load\b/i, source) ? 'drop_load' : 'gate_pass' },
    version:VERSION,
  };
}

export function inspectGatePassV1052({ text = '', fileName = '' } = {}) {
  return scoreGatePass(text, fileName);
}

export function arbitrateGatePassV1052(classification = {}, options = {}) {
  const profile = inspectGatePassV1052({ text:options.text || '', fileName:options.fileName || '' });
  const preferred = String(options.preferredType || 'auto');
  const currentId = classification?.type?.id || 'other';
  if (preferred !== 'auto' || !profile.strong) {
    return { ...classification, gatePassProfileV1052:profile };
  }

  const generic = ['other','other_expense','packing_list','load_tender','rate_confirmation'].includes(currentId);
  const protectedType = ['pod','bol','delivery_receipt','osd_report','claim_notice','driver_license','medical_card','registration','insurance','annual_inspection'].includes(currentId);
  const exactGatePass = profile.score >= profile.threshold + 65;
  if (!generic && (protectedType || !exactGatePass)) {
    return { ...classification, gatePassProfileV1052:profile };
  }

  const type = truckDocumentTypeMetaV1040('gate_pass');
  const alternatives = [type, classification.type, ...(classification.alternatives || [])]
    .filter(Boolean)
    .filter((item, index, rows) => rows.findIndex(candidate => candidate.id === item.id) === index)
    .slice(0, 8);
  return {
    ...classification,
    type,
    confidence:Math.max(Number(classification.confidence || 0), profile.confidence),
    alternatives,
    lowEvidence:false,
    autoCorrected:true,
    gatePassProfileV1052:profile,
    gatePassArbitrationV1052:{
      version:VERSION,
      from:currentId,
      to:'gate_pass',
      reason:'Gate Pass, Drop Load, dock-assignment, appointment and arrival structure identified a facility gate pass.',
    },
  };
}

function safeDriverName(value = '') {
  const text = line(value).replace(/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}.*/g, '').trim();
  if (!text || /^(?:truck|driver|unknown|n\/?a)$/i.test(text) || !/[A-Za-z]{2}/.test(text)) return '';
  return text;
}

export function sanitizeGatePassFieldsV1052(typeId = 'other', text = '', fields = {}) {
  if (typeId !== 'gate_pass') return fields;
  const source = clean(text);
  const arrivalDateTime = first(source, [
    /arrival\s+time\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-](?:\d{2}|\d{4})\s+\d{1,2}:\d{2}\s*(?:am|pm)?)/i,
  ]);
  const printedAt = first(source, [
    /printed\s+(\d{1,2}[\/-]\d{1,2}[\/-](?:\d{2}|\d{4})\s+\d{1,2}:\d{2}\s*(?:am|pm)?)/i,
  ]);
  const appointmentWindow = first(source, [
    /appointment\s+window\s*[:#-]?\s*([^\n]{5,80})/i,
  ]);
  const documentDate = first(arrivalDateTime || printedAt || appointmentWindow, [/(\d{1,2}[\/-]\d{1,2}[\/-](?:\d{2}|\d{4}))/i]);
  const dockAssignment = operationalId(first(source, [
    /dock\s+assignment[\s\S]{0,35}?\bdock\s*([A-Z]?-?\d{1,4})\b/i,
    /dock\s+assignment\s*[:#-]?\s*([A-Z]?-?\d{1,4})\b/i,
    /\bdock\s*([A-Z]?-?\d{1,4})\b/i,
  ]));
  const poNumber = operationalId(first(source, [
    /\bP\.?O\.?\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{2,30})/i,
  ]));
  const lotNumber = operationalId(first(source, [
    /\blot\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{1,30})/i,
  ]));
  const trailerNo = operationalId(first(source, [
    /trailer\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{1,18})/i,
  ])) || operationalId(fields.trailerNo);
  const explicitLoadNo = operationalId(first(source, [
    /(?:load|shipment)\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{2,30})/i,
  ]));
  const driverLine = labeled(source, ["driver'?s?\s+name", 'driver']);
  const driverPhone = first(driverLine || source, [/\b(\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})\b/]);
  const guardHousePhone = first(source, [/guard\s+house[^\n]{0,80}?\b(\d{3}[\s.-]\d{3}[\s.-]\d{4})\b/i]);
  const facilityName = test(/anthony\s+marano(?:\s+company|\s+co\.?)?/i, source)
    ? 'Anthony Marano Company'
    : labeled(source, ['facility','warehouse','location']) || fields.facilityName || '';
  const operationType = test(/\bdrop\s+load\b/i, source) ? 'Drop Load' : 'Gate Pass';

  return {
    ...fields,
    type:'gate_pass',
    title:operationType === 'Drop Load' ? 'Gate Pass — Drop Load' : 'Facility Gate Pass',
    documentDate:documentDate || fields.documentDate || fields.date || '',
    date:documentDate || fields.date || '',
    printedAt:printedAt || fields.printedAt || '',
    arrivalDateTime:arrivalDateTime || fields.arrivalDateTime || '',
    arrivalTime:arrivalDateTime || fields.arrivalTime || '',
    appointmentWindow:appointmentWindow || fields.appointmentWindow || '',
    facilityName,
    location:facilityName || fields.location || '',
    operationType,
    gatePassType:operationType === 'Drop Load' ? 'drop_load' : 'gate_pass',
    dockAssignment:dockAssignment || fields.dockAssignment || fields.dock || '',
    dock:dockAssignment || fields.dock || '',
    assignedBy:labeled(source, ['assigned\s+by']) || fields.assignedBy || '',
    driverName:safeDriverName(driverLine) || safeDriverName(fields.driverName),
    driverPhone:driverPhone || fields.driverPhone || '',
    carrierName:labeled(source, ['carrier']) || fields.carrierName || '',
    trailerNo,
    shipper:labeled(source, ['shipper']) || fields.shipper || '',
    poNumber,
    purchaseOrder:poNumber,
    lotNumber,
    guardHousePhone:guardHousePhone || fields.guardHousePhone || '',
    loadNo:explicitLoadNo,
    orderNo:explicitLoadNo,
    merchant:'',
    total:'',
    gross:'',
    broker:'',
    origin:'',
    destination:'',
    suggestedDutyStatus:'ON',
    suggestedLogActivity:operationType === 'Drop Load' ? 'Drop Load / Trailer' : 'Waiting',
    suggestedStopStatus:operationType === 'Drop Load' ? 'arrived_at_dock_drop_load' : 'arrived_at_gate',
    logbookSuggestionReason:'Gate pass is arrival, dock and yard-operation evidence. Driver confirmation is required before creating an ON DUTY event.',
    gatePassIntelligenceVersion:VERSION,
  };
}

export const GATE_PASS_INTELLIGENCE_V1052 = Object.freeze({
  version:VERSION,
  typeId:'gate_pass',
  labels:['Gate Pass','Drop Load','Dock Assignment'],
  suggestedLogActivities:['Drop Load / Trailer','Hook / Pickup Trailer','Drop & Hook'],
});
