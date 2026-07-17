import { analyzeSmartDocumentV1030 } from './smartDocumentReaderV1030.js';
import {
  TRUCK_DOCUMENT_TYPES_V1040,
  backendDocumentTypeV1040,
  documentStacksV1040,
  truckDocumentStackMetaV1040,
  truckDocumentTypeMetaV1040,
} from './truckDocumentCatalogV1040.js';

const KNOWN_BASE_TYPES = new Set([
  'rate_confirmation','carrier_settlement','bol','pod','fuel_receipt','repair_invoice',
  'lumper_receipt','scale_ticket','toll_parking_receipt','insurance','registration',
  'annual_inspection','form_2290','permit','other_expense','other',
]);

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function meaningful(value) {
  if (value == null || value === '') return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return String(value).trim() !== '';
}

function cleanText(value = '') {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function plainText(value = '') {
  return cleanText(value)
    .replace(/\[\[(?:BASE READER|OCR VERIFY|PAGE \d+)\]\]/gi, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanValue(value = '') {
  return String(value || '')
    .replace(/^[\s:#\-–—|]+|[\s|]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function numberValue(value = 0) {
  const normalized = String(value ?? '')
    .replace(/[OoQqDd]/g, '0')
    .replace(/[Il|!]/g, '1')
    .replace(/[$,\s]/g, '')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyValue(value = '') {
  const number = numberValue(value);
  return number ? Math.round(number * 100) / 100 : 0;
}

function normalizeToken(value = '') {
  return String(value || '')
    .toUpperCase()
    .replace(/[OoQqDd](?=\d)|(\d)[OoQqDd]/g, match => match.replace(/[OoQqDd]/g, '0'))
    .replace(/[Il|!](?=\d)|(\d)[Il|!]/g, match => match.replace(/[Il|!]/g, '1'))
    .replace(/[^A-Z0-9]/g, '');
}

function unique(values = []) {
  return [...new Set(values.filter(meaningful).map(value => String(value).trim()))];
}

function firstCapture(text, patterns = [], group = 1) {
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    if (match?.[group]) return cleanValue(match[group]);
  }
  return '';
}

function snippetAround(text, value, radius = 80) {
  const source = String(text || '');
  const needle = String(value || '').trim();
  if (!source || !needle) return '';
  const index = source.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return '';
  return cleanText(source.slice(Math.max(0, index - radius), Math.min(source.length, index + needle.length + radius))).slice(0, 260);
}

function dateCapture(text, labels = '') {
  const prefix = labels ? `(?:${labels})\\s*(?:date)?\\s*[:#-]?\\s*` : '';
  return firstCapture(text, [
    new RegExp(`${prefix}(\\d{1,2}[\\/-]\\d{1,2}[\\/-](?:\\d{2}|\\d{4}))`, 'i'),
    new RegExp(`${prefix}((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\s+\\d{1,2},?\\s+\\d{4})`, 'i'),
  ]);
}

function moneyCapture(text, labels = '') {
  const prefix = labels ? `(?:${labels})\\s*(?:amount)?\\s*[:#-]?\\s*` : '';
  const raw = firstCapture(text, [
    new RegExp(`${prefix}\\$\\s*([0-9OoQqDdIl|!,]+(?:\\.\\d{2,3})?)`, 'i'),
    new RegExp(`${prefix}([0-9OoQqDdIl|!,]+\\.\\d{2})\\b`, 'i'),
  ]);
  return moneyValue(raw);
}

function firstCompanyLine(text = '') {
  const blocked = /^(?:rate confirmation|bill of lading|proof of delivery|invoice|receipt|statement|page \d+|date|total|ship to|ship from|driver|customer|account|form |certificate)/i;
  return String(text || '').split('\n')
    .map(cleanValue)
    .find(line => line.length >= 3 && line.length <= 80 && /[A-Za-z]/.test(line) && !blocked.test(line)) || '';
}

function mergeMeaningful(...sources) {
  const output = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source || {})) {
      if (meaningful(value)) output[key] = value;
    }
  }
  return output;
}

function matchScore(pattern, text) {
  try {
    pattern.lastIndex = 0;
    return pattern.test(text);
  } catch {
    return false;
  }
}

function contextFrom(options = {}, fields = {}) {
  const state = options.state || {};
  const profile = options.profile || {};
  const businessStore = options.businessStore || {};
  const loadInfo = state.loadInfo || state.activeLoad || options.activeLoad || {};
  const loadNo = String(
    loadInfo.shippingDocs || loadInfo.loadNo || loadInfo.load_number || loadInfo.bol ||
    loadInfo.po || loadInfo.poNumber || fields.loadNo || ''
  ).trim();
  const broker = String(loadInfo.broker || loadInfo.brokerName || fields.broker || '').trim();
  const origin = String(loadInfo.origin || loadInfo.pickup || fields.origin || '').trim();
  const destination = String(loadInfo.destination || loadInfo.delivery || fields.destination || '').trim();
  const rate = numberValue(loadInfo.rate || loadInfo.gross || fields.gross || fields.total);
  const driverName = String(profile.fullName || profile.driverName || state.driverName || '').trim();
  const truckNumber = String(
    profile.truckNumber || profile.unitNumber || state.truckNumber || state.vehicle?.unitNumber || ''
  ).trim();
  const trailerNumber = String(
    profile.trailerNumber || state.trailerNumber || state.trailer?.unitNumber || ''
  ).trim();
  return {
    state, profile, businessStore, loadInfo, loadNo, broker, origin, destination, rate,
    driverName, truckNumber, trailerNumber,
    documents:Array.isArray(businessStore.documents) ? businessStore.documents : [],
    loads:Array.isArray(businessStore.loads) ? businessStore.loads : [],
  };
}

function scoreType(meta, sourceText, fileName, baseTypeId, preferredType, context) {
  let score = 0;
  let typeEvidence = false;
  const evidence = [];
  for (const [pattern, weight] of meta.signals || []) {
    if (!matchScore(pattern, sourceText)) continue;
    score += Number(weight || 0);
    typeEvidence = true;
    evidence.push({ source:'text', pattern:String(pattern), weight:Number(weight || 0) });
  }
  for (const item of meta.fileSignals || []) {
    const pattern = Array.isArray(item) ? item[0] : item;
    const weight = Array.isArray(item) ? Number(item[1] || 24) : 24;
    if (!matchScore(pattern, fileName)) continue;
    score += weight;
    typeEvidence = true;
    evidence.push({ source:'filename', pattern:String(pattern), weight });
  }
  for (const item of meta.negativeSignals || []) {
    const pattern = Array.isArray(item) ? item[0] : item;
    const weight = Array.isArray(item) ? Number(item[1] || 20) : 20;
    if (!matchScore(pattern, sourceText)) continue;
    score -= weight;
    evidence.push({ source:'negative', pattern:String(pattern), weight:-weight });
  }
  if (baseTypeId && baseTypeId === meta.id) {
    score += 24;
    typeEvidence = true;
    evidence.push({ source:'base-reader', pattern:baseTypeId, weight:24 });
  }
  if (preferredType && preferredType !== 'auto' && preferredType === meta.id) {
    score += 140;
    typeEvidence = true;
    evidence.push({ source:'driver-hint', pattern:preferredType, weight:140 });
  }
  if (context.loadNo && ['load','billing','claims'].includes(meta.family)) {
    const wanted = normalizeToken(context.loadNo);
    if (wanted && normalizeToken(sourceText).includes(wanted)) {
      score += 46;
      evidence.push({ source:'active-load', pattern:context.loadNo, weight:46 });
    } else {
      score += 4;
    }
  }
  if (context.driverName && meta.family === 'driver') {
    const pieces = context.driverName.toUpperCase().split(/\s+/).filter(part => part.length >= 3);
    const hits = pieces.filter(part => sourceText.toUpperCase().includes(part)).length;
    if (hits) {
      score += Math.min(30, hits * 12);
      evidence.push({ source:'driver-context', pattern:context.driverName, weight:Math.min(30, hits * 12) });
    }
  }
  if ((context.truckNumber || context.trailerNumber) && ['equipment','maintenance'].includes(meta.family)) {
    for (const unit of [context.truckNumber, context.trailerNumber].filter(Boolean)) {
      if (normalizeToken(sourceText).includes(normalizeToken(unit))) {
        score += 24;
        evidence.push({ source:'equipment-context', pattern:unit, weight:24 });
      }
    }
  }
  if (typeEvidence) score += Number(meta.priority || 0);
  return { meta, score, evidence, typeEvidence };
}

export function classifyTruckDocumentTextV1040({
  text = '', fileName = '', baseTypeId = '', preferredType = 'auto', context = {},
} = {}) {
  const sourceText = plainText(text);
  const sourceFile = String(fileName || '').toLowerCase();
  const ranked = TRUCK_DOCUMENT_TYPES_V1040
    .filter(meta => meta.id !== 'other')
    .map(meta => scoreType(meta, sourceText, sourceFile, baseTypeId, preferredType, context))
    .sort((a, b) => b.score - a.score || Number(b.meta.priority || 0) - Number(a.meta.priority || 0));

  const top = ranked[0] || { meta:truckDocumentTypeMetaV1040('other'), score:0, evidence:[] };
  const second = ranked[1] || { score:0 };
  const minimum = Number(top.meta.minScore || 22);
  const winner = top.typeEvidence && top.score >= minimum ? top.meta : truckDocumentTypeMetaV1040('other');
  const margin = Math.max(0, top.score - Number(second.score || 0));
  const confidence = winner.id === 'other'
    ? clamp(.18 + Math.max(0, top.score) / 180, .12, .58)
    : clamp(.45 + Math.max(0, top.score - minimum) / 165 + margin / 230, .48, .995);

  return {
    type:winner,
    detectedType:top.meta,
    score:top.score,
    margin,
    confidence,
    evidence:top.evidence,
    alternatives:ranked.slice(0, 8).map(item => ({
      ...item.meta,
      score:item.score,
      confidence:clamp(.25 + Math.max(0, item.score) / 180, .1, .96),
    })),
    lowEvidence:winner.id === 'other' || top.score < minimum + 8 || margin < 8,
  };
}

function pageSections(text = '') {
  const source = String(text || '');
  const matches = [...source.matchAll(/\[\[PAGE\s+(\d+)\]\]\s*([\s\S]*?)(?=\[\[PAGE\s+\d+\]\]|$)/gi)];
  return matches.map(match => ({ page:Number(match[1]), text:cleanText(match[2]) })).filter(page => page.text);
}

export function classifyPacketPagesV1040(text = '', options = {}) {
  const sections = pageSections(text);
  if (!sections.length) return { isMixed:false, segments:[], pageCount:Number(options.pageCount || 1) };
  const pages = sections.map(section => ({
    ...section,
    classification:classifyTruckDocumentTextV1040({
      text:section.text,
      fileName:options.fileName || '',
      context:options.context || {},
    }),
  }));
  const segments = [];
  for (const page of pages) {
    const typeId = page.classification.type.id;
    const previous = segments[segments.length - 1];
    if (previous && previous.type.id === typeId && previous.endPage === page.page - 1) {
      previous.endPage = page.page;
      previous.pages.push(page.page);
      previous.confidence = Math.max(previous.confidence, page.classification.confidence);
      continue;
    }
    segments.push({
      startPage:page.page,
      endPage:page.page,
      pages:[page.page],
      type:page.classification.type,
      confidence:page.classification.confidence,
    });
  }
  const distinct = new Set(segments.filter(segment => segment.type.id !== 'other').map(segment => segment.type.id));
  return {
    isMixed:distinct.size > 1,
    pageCount:Math.max(Number(options.pageCount || 0), ...pages.map(page => page.page)),
    pages,
    segments,
  };
}

function extractCommonFields(text = '', baseFields = {}, typeId = 'other') {
  const source = plainText(text);
  const fields = mergeMeaningful(baseFields);

  const common = {
    loadNo:firstCapture(source, [
      /(?:load|order|confirmation|shipment|trip)\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{3,24})/i,
      /\bPRO\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{3,24})/i,
    ]),
    bolNo:firstCapture(source, [
      /(?:B\/?L|bill\s+of\s+lading)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{3,24})/i,
    ]),
    poNumber:firstCapture(source, [
      /(?:customer\s+)?P\.?O\.?\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{2,28})/i,
      /purchase\s+order\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{2,28})/i,
    ]),
    invoiceNo:firstCapture(source, [
      /invoice\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{2,28})/i,
    ]),
    receiptNo:firstCapture(source, [
      /receipt\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{2,28})/i,
      /transaction\s*(?:number|no\.?|#|id)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{2,28})/i,
    ]),
    date:dateCapture(source, 'document|invoice|receipt|transaction|service|delivery|pickup|date'),
    issuedDate:dateCapture(source, 'issued|issue|effective|valid\\s+from'),
    expirationDate:dateCapture(source, 'expires?|expiration|valid\\s+(?:thru|through|until)|exp'),
    effectiveDate:dateCapture(source, 'effective|lease\\s+start|agreement\\s+date'),
    deliveryDate:dateCapture(source, 'delivery|delivered'),
    pickupDate:dateCapture(source, 'pickup|ship'),
    total:moneyCapture(source, 'grand\\s+total|amount\\s+due|invoice\\s+total|receipt\\s+total|total\\s+pay|total'),
    merchant:firstCompanyLine(source),
    broker:firstCapture(source, [
      /(?:broker|customer)\s*(?:name)?\s*[:#-]\s*([^\n]{3,80})/i,
      /brokered\s+by\s*[:#-]?\s*([^\n]{3,80})/i,
    ]),
    mcNumber:firstCapture(source, [/\bMC[-\s:#]*(\d{4,9})\b/i]),
    dotNumber:firstCapture(source, [/\b(?:USDOT|DOT)[-\s:#]*(\d{5,9})\b/i]),
    vin:firstCapture(source, [/\bVIN\s*[:#-]?\s*([A-HJ-NPR-Z0-9]{17})\b/i, /\b([A-HJ-NPR-Z0-9]{17})\b/]),
    unitNumber:firstCapture(source, [/(?:unit|truck|tractor)\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9-]{1,16})/i]),
    truckNumber:firstCapture(source, [/(?:truck|tractor)\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9-]{1,16})/i]),
    trailerNo:firstCapture(source, [/(?:trailer)\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9-]{1,18})/i]),
    plate:firstCapture(source, [/(?:license\s+)?plate\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9-]{2,14})/i]),
    policyNumber:firstCapture(source, [/policy\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9-]{3,30})/i]),
    permitNumber:firstCapture(source, [/permit\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9-]{3,30})/i]),
    accountNumber:firstCapture(source, [/(?:account|license)\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9-]{3,30})/i]),
    caseNumber:firstCapture(source, [/case\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9-]{3,30})/i]),
    claimNo:firstCapture(source, [/claim\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9-]{3,30})/i]),
    approvalNo:firstCapture(source, [/(?:approval|authorization)\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9-]{2,30})/i]),
    licenseNumber:firstCapture(source, [/(?:license|CDL)\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9-]{3,30})/i]),
    driverName:firstCapture(source, [/(?:driver|name)\s*[:#-]\s*([A-Z][A-Za-z.' -]{3,60})/i]),
    ownerName:firstCapture(source, [/(?:owner|registered\s+owner)\s*[:#-]\s*([A-Z][A-Za-z0-9&.,' -]{3,80})/i]),
    businessName:firstCapture(source, [/(?:business|legal|company)\s+name\s*[:#-]\s*([^\n]{3,90})/i]),
    factorName:firstCapture(source, [/(?:factor|factoring\s+company|assigned\s+to)\s*[:#-]\s*([^\n]{3,90})/i]),
    remitTo:firstCapture(source, [/remit\s+(?:payment\s+)?to\s*[:#-]?\s*([^\n]{3,120})/i]),
    bankName:firstCapture(source, [/(?:bank|financial\s+institution)\s*(?:name)?\s*[:#-]\s*([^\n]{3,80})/i]),
    email:firstCapture(source, [/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i]),
    phone:firstCapture(source, [/\b(\+?1?[\s.-]?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})\b/]),
    cityState:firstCapture(source, [/\b([A-Z][A-Za-z.' -]{2,40},\s*[A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\b/]),
    state:firstCapture(source, [/\b[A-Z][A-Za-z.' -]{2,40},\s*([A-Z]{2})(?:\s+\d{5})?\b/]),
    gallons:numberValue(firstCapture(source, [/(?:gallons?|qty)\s*[:#-]?\s*([0-9OoQqDdIl|!,]+(?:\.\d{1,3})?)/i])),
    pricePerGallon:moneyValue(firstCapture(source, [/(?:price\s*(?:per|\/)\s*(?:gal|gallon)|unit\s+price)\s*[:#-]?\s*\$?\s*([0-9OoQqDdIl|!,]+(?:\.\d{2,4})?)/i])),
    odometer:numberValue(firstCapture(source, [/(?:odometer|mileage)\s*[:#-]?\s*([0-9OoQqDdIl|!,]{2,9})/i])),
    weight:numberValue(firstCapture(source, [/(?:gross\s+weight|weight)\s*[:#-]?\s*([0-9OoQqDdIl|!,]{3,9})/i])),
    totalPieces:numberValue(firstCapture(source, [/(?:total\s+pieces|pieces|pallets)\s*[:#-]?\s*([0-9OoQqDdIl|!,]{1,7})/i])),
    temperature:firstCapture(source, [/(?:set\s*point|temperature|temp)\s*[:#-]?\s*(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([FC])?/i]),
    labor:moneyCapture(source, 'labor'),
    parts:moneyCapture(source, 'parts'),
    hours:numberValue(firstCapture(source, [/(?:detention|layover|wait(?:ing)?)\s+hours?\s*[:#-]?\s*(\d+(?:\.\d+)?)/i])),
    quarter:firstCapture(source, [/\b(Q[1-4]|[1-4](?:st|nd|rd|th)\s+quarter)\b/i]),
    taxYear:firstCapture(source, [/\b(?:tax\s+year|calendar\s+year)\s*[:#-]?\s*(20\d{2})\b/i]),
    taxPeriod:firstCapture(source, [/(?:tax\s+period|period\s+ending)\s*[:#-]?\s*([^\n]{3,30})/i]),
    taxIdLast4:firstCapture(source, [/(?:EIN|TIN|SSN)\s*[:#-]?\s*(?:\*{2,}|X{2,}|[0-9-]{2,})?(\d{4})\b/i]),
    exceptionText:firstCapture(source, [/\b((?:damage|shortage|overage|refused|exception|OS&D)[^\n]{0,180})/i]),
    location:firstCapture(source, [/(?:location|accident\s+location|place\s+of\s+occurrence)\s*[:#-]\s*([^\n]{3,120})/i]),
  };

  const sourceUpper = source.toUpperCase();
  common.signaturePresent = /(?:receiver|consignee|customer)\s+signature|signed\s+by|received\s+by|signature\s+of\s+receiver/i.test(source);
  common.fuelType = /\bDEF\b/i.test(source) && !/\bdiesel\b/i.test(source) ? 'DEF' : /\bdiesel\b/i.test(source) ? 'Diesel' : '';
  common.cleanPod = typeId === 'pod' && common.signaturePresent && !/(?:damage|shortage|overage|refused|exception|OS&D)/i.test(source);
  common.serviceDescription = firstCapture(source, [/(?:work\s+performed|service\s+description|description\s+of\s+work)\s*[:#-]?\s*([^\n]{3,180})/i]);
  common.policyCarrier = firstCapture(source, [/(?:insurer|insurance\s+company|carrier)\s*[:#-]\s*([^\n]{3,90})/i]);
  common.origin = fields.origin || firstCapture(source, [/(?:ship\s+from|pickup|load\s+at|origin)\s*[:#-]?\s*([^\n]{3,130})/i]);
  common.destination = fields.destination || firstCapture(source, [/(?:ship\s+to|delivery|deliver\s+to|destination)\s*[:#-]?\s*([^\n]{3,130})/i]);
  common.broker = fields.broker || common.broker;
  common.total = fields.total || fields.gross || common.total;
  common.gross = fields.gross || common.total;
  common.loadNo = fields.loadNo || fields.orderNo || common.loadNo || common.bolNo || common.poNumber;
  common.date = fields.date || common.date || common.issuedDate;
  common.merchant = fields.merchant || fields.fuelProvider || common.merchant;
  common.gallons = fields.gallons || common.gallons;
  common.pricePerGallon = fields.pricePerGallon || common.pricePerGallon;
  common.weight = fields.weight || common.weight;
  common.totalPieces = fields.totalPieces || common.totalPieces;
  common.trailerNo = fields.trailerNo || common.trailerNo;
  common.driverName = fields.driverName || common.driverName;
  common.invoiceNo = fields.invoiceNo || common.invoiceNo;
  common.cityState = fields.cityState || common.cityState;
  common.state = fields.state || common.state || (common.cityState.match(/,\s*([A-Z]{2})\b/)?.[1] || '');
  common.policyNumber = fields.policyNumber || common.policyNumber;
  common.expirationDate = fields.expirationDate || fields.expiresOn || common.expirationDate;
  common.issuedDate = fields.issuedDate || common.issuedDate;
  common.unitNumber = fields.unitNumber || fields.truckNumber || common.unitNumber || common.truckNumber;
  common.vin = fields.vin || common.vin;
  common.email = fields.email || common.email;
  common.phone = fields.phone || common.phone;
  common.documentTextLength = sourceUpper.length;

  return mergeMeaningful(fields, common);
}

function dateToTime(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const direct = Date.parse(raw);
  if (Number.isFinite(direct)) return direct;
  const match = raw.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (!match) return 0;
  const year = match[3].length === 2 ? Number(`20${match[3]}`) : Number(match[3]);
  return new Date(year, Number(match[1]) - 1, Number(match[2]), 12).getTime();
}

function fieldEvidence(text, fields = {}, base = {}) {
  const confidence = { ...(base.fieldConfidence || base.fields?.fieldConfidence || {}) };
  const evidence = { ...(base.fieldEvidence || base.fields?.fieldEvidence || {}) };
  const details = {};
  for (const [field, value] of Object.entries(fields)) {
    if (!meaningful(value) || ['fieldConfidence','fieldEvidence','documentTextLength'].includes(field)) continue;
    const prior = Number(confidence[field] || 0);
    const snippet = typeof value === 'string' || typeof value === 'number' ? snippetAround(text, value) : '';
    const inferred = snippet ? .86 : prior || .66;
    confidence[field] = clamp(Math.max(prior, inferred), .3, .99);
    const sources = Array.isArray(evidence[field]) ? evidence[field] : [];
    evidence[field] = unique([...sources, snippet ? 'truck-document-engine-v1040' : 'base-reader']);
    details[field] = {
      field,
      value,
      confidence:confidence[field],
      status:confidence[field] >= .84 ? 'verified' : confidence[field] >= .65 ? 'review' : 'uncertain',
      evidence:snippet ? [{ source:'ocr-text', snippet }] : [{ source:'base-reader', snippet:'' }],
    };
  }
  return { confidence, evidence, details };
}

function validationFor(meta, fields = {}, baseValidation = {}, context = {}, fingerprint = '') {
  const checks = Array.isArray(baseValidation?.checks) ? [...baseValidation.checks] : [];
  const add = (id, ok, detail, severity = 'warning') => {
    if (checks.some(check => check.id === id)) return;
    checks.push({ id, ok:Boolean(ok), detail, severity });
  };
  const missing = (meta.required || []).filter(field => !meaningful(fields[field]));
  for (const field of missing) add(`required-${field}`, false, `${field} is required for ${meta.label}`, 'critical');

  if (fields.pickupDate && fields.deliveryDate) {
    const pickup = dateToTime(fields.pickupDate);
    const delivery = dateToTime(fields.deliveryDate);
    if (pickup && delivery) add('pickup-before-delivery', delivery >= pickup, 'Delivery must be on or after pickup', 'critical');
  }
  if (meta.id === 'fuel_receipt') {
    const gallons = numberValue(fields.gallons);
    const price = numberValue(fields.pricePerGallon);
    const total = numberValue(fields.total);
    if (gallons && price && total) add('fuel-math-v1040', Math.abs(gallons * price - total) <= Math.max(3, total * .04), 'Gallons × price agrees with fuel total', 'critical');
  }
  if (meta.id === 'rate_confirmation') {
    add('rate-positive-v1040', numberValue(fields.total || fields.gross) > 0, 'Carrier rate is present', 'critical');
  }
  if (['pod','delivery_receipt'].includes(meta.id)) {
    add('pod-signature-v1040', fields.signaturePresent === true, 'Receiver signature or received-by evidence is present', 'critical');
  }
  if (fields.expirationDate) {
    const expiration = dateToTime(fields.expirationDate);
    if (expiration) {
      const remaining = expiration - Date.now();
      add('not-expired-v1040', remaining >= 0, 'Document is not expired', 'critical');
      add('expiry-horizon-v1040', remaining > 45 * 86400000, 'More than 45 days remain before expiration', 'warning');
    }
  }
  if (fields.vin) add('vin-length-v1040', /^[A-HJ-NPR-Z0-9]{17}$/i.test(String(fields.vin)), 'VIN has 17 valid characters', 'critical');
  if (context.loadNo && ['load','billing','claims'].includes(meta.family) && fields.loadNo) {
    add('active-load-match-v1040', normalizeToken(fields.loadNo) === normalizeToken(context.loadNo), 'Document matches the active load number', 'warning');
  }
  const duplicate = context.documents.find(document => fingerprint && document?.fingerprint === fingerprint);
  if (duplicate) add('duplicate-document-v1040', false, `Possible duplicate of ${duplicate.label || duplicate.title || 'an existing document'}`, 'critical');

  const criticalFailures = checks.filter(check => !check.ok && check.severity === 'critical').length;
  const warningFailures = checks.filter(check => !check.ok && check.severity !== 'critical').length;
  return {
    checks,
    missingFields:missing,
    duplicate:duplicate || null,
    criticalFailures,
    warningFailures,
    valid:criticalFailures === 0,
    penalty:Math.min(.42, criticalFailures * .12 + warningFailures * .035),
  };
}

function fingerprintV1040(typeId, text, fields, file = {}) {
  const source = [
    typeId,
    normalizeToken(fields.loadNo || fields.invoiceNo || fields.receiptNo || fields.policyNumber || ''),
    normalizeToken(fields.date || fields.issuedDate || ''),
    numberValue(fields.total || fields.gross || fields.gallons || 0).toFixed(2),
    normalizeToken(fields.vin || fields.unitNumber || fields.merchant || fields.broker || ''),
    plainText(text).slice(0, 1800).toUpperCase().replace(/\s+/g, ' '),
    Number(file?.size || 0),
  ].join('|');
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `tdi1040_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function contextMatch(meta, fields, context) {
  let score = 0;
  const reasons = [];
  const add = (points, reason) => { score += points; reasons.push(reason); };
  if (context.loadNo && fields.loadNo && normalizeToken(context.loadNo) === normalizeToken(fields.loadNo)) add(45, `Load ${context.loadNo} matched`);
  if (context.broker && fields.broker && normalizeToken(context.broker).includes(normalizeToken(fields.broker).slice(0, 8))) add(18, 'Broker matched active load');
  if (context.origin && fields.origin && normalizeToken(context.origin).includes(normalizeToken(fields.origin).slice(0, 6))) add(10, 'Pickup matched');
  if (context.destination && fields.destination && normalizeToken(context.destination).includes(normalizeToken(fields.destination).slice(0, 6))) add(10, 'Delivery matched');
  if (context.rate && numberValue(fields.total || fields.gross) && Math.abs(context.rate - numberValue(fields.total || fields.gross)) <= Math.max(1, context.rate * .01)) add(8, 'Rate matched');
  if (context.driverName && fields.driverName && normalizeToken(context.driverName) === normalizeToken(fields.driverName)) add(32, 'Driver matched');
  if (context.truckNumber && fields.unitNumber && normalizeToken(context.truckNumber) === normalizeToken(fields.unitNumber)) add(32, 'Truck unit matched');
  if (context.trailerNumber && fields.trailerNo && normalizeToken(context.trailerNumber) === normalizeToken(fields.trailerNo)) add(28, 'Trailer matched');
  if (!reasons.length && ['load','billing','claims'].includes(meta.family) && context.loadNo) add(6, 'Active load context available');
  return { score:clamp(score / 100), points:score, reasons };
}

function buildRouting(meta, confidence, match, validation, context, packet) {
  const low = meta.id === 'other' || confidence < .66;
  const stackIds = low ? ['smart_inbox', ...meta.stacks] : [...meta.stacks];
  const distinct = [...new Set(stackIds)];
  const routeConfidence = clamp(confidence * .72 + (match.score || .45) * .28 - validation.penalty * .55);
  const stacks = distinct.map((id, index) => {
    const stack = truckDocumentStackMetaV1040(id);
    const loadEntity = id === 'load_folder' && context.loadNo ? context.loadNo : '';
    return {
      ...stack,
      primary:index === 0,
      confidence:id === 'smart_inbox' ? 1 : routeConfidence,
      automatic:!low && routeConfidence >= .82 && validation.valid,
      entityId:loadEntity,
      entityLabel:loadEntity ? `Load ${loadEntity}` : '',
      reason:id === 'load_folder' && loadEntity
        ? `Matched to active load ${loadEntity}`
        : id === 'smart_inbox'
          ? 'Held for review because classification evidence is incomplete'
          : `Required stack for ${meta.label}`,
    };
  });
  const autoFile = !low && confidence >= .86 && routeConfidence >= .82 && validation.valid;
  return {
    primary:stacks[0] || truckDocumentStackMetaV1040('smart_inbox'),
    stacks,
    autoFile,
    routeConfidence,
    reviewRequired:!autoFile,
    packetRoutes:packet?.isMixed ? packet.segments.map(segment => ({
      pages:segment.pages,
      type:segment.type,
      stacks:documentStacksV1040(segment.type.id),
    })) : [],
  };
}

function actionsFor(meta, fields, routing, validation) {
  const actions = [];
  const add = (id, label, stack, detail, requiresConfirmation = true) => actions.push({ id, label, stack, detail, requiresConfirmation, mode:'suggestion' });
  if (meta.stacks.includes('load_folder')) add('attach-load', 'Attach to matched load', 'load_folder', fields.loadNo ? `Load ${fields.loadNo}` : 'Choose a load');
  if (meta.stacks.includes('billing')) add('billing-check', 'Update Billing Ready checklist', 'billing', meta.id === 'pod' && fields.signaturePresent ? 'Signed POD evidence found' : `${meta.label} received`);
  if (meta.stacks.includes('factoring')) add('factoring-packet', 'Add to factoring packet', 'factoring', `${meta.label} belongs in the payment packet`);
  if (meta.stacks.includes('ifta')) add('ifta-entry', 'Prepare IFTA record', 'ifta', fields.state ? `${fields.state} jurisdiction evidence` : 'Confirm jurisdiction');
  if (meta.stacks.includes('maintenance')) add('maintenance-event', 'Create maintenance history event', 'maintenance', fields.unitNumber ? `Unit ${fields.unitNumber}` : 'Confirm truck or trailer');
  if (meta.stacks.includes('driver_wallet')) add('driver-wallet', 'Update driver compliance wallet', 'driver_wallet', fields.expirationDate ? `Expiration ${fields.expirationDate}` : 'Confirm expiration');
  if (meta.stacks.includes('truck_wallet')) add('truck-wallet', 'Update equipment wallet', 'truck_wallet', fields.vin || fields.unitNumber || 'Confirm equipment');
  if (meta.stacks.includes('broker_profile')) add('broker-profile', 'Update broker profile', 'broker_profile', fields.broker || fields.businessName || 'Confirm company');
  if (meta.stacks.includes('claims')) add('claim-timeline', 'Add to claim evidence timeline', 'claims', fields.claimNo || fields.loadNo || 'Confirm incident');
  if (meta.stacks.includes('logbook')) add('logbook-support', 'Suggest as Logbook supporting document', 'logbook', 'No duty status or certified log is changed automatically');
  if (!validation.valid) add('review-fields', 'Review highlighted fields', 'smart_inbox', `${validation.criticalFailures} critical check(s) need confirmation`);
  return actions;
}

function packetWithRoutes(packet, context) {
  if (!packet?.segments?.length) return packet;
  return {
    ...packet,
    segments:packet.segments.map(segment => ({
      ...segment,
      stacks:documentStacksV1040(segment.type.id),
      matchedLoad:segment.type.stacks.includes('load_folder') ? context.loadNo || '' : '',
    })),
  };
}

function decorateAnalysis(base = {}, file = {}, options = {}, forcedType = '') {
  const text = plainText(base.text || '');
  const seedContext = contextFrom(options, base.fields || {});
  const classification = classifyTruckDocumentTextV1040({
    text,
    fileName:file?.name || base.originalFileName || '',
    baseTypeId:base.type?.id || base.detectedType?.id || '',
    preferredType:forcedType || options.preferredType || 'auto',
    context:seedContext,
  });
  const meta = forcedType ? truckDocumentTypeMetaV1040(forcedType) : classification.type;
  const fields = extractCommonFields(text, base.fields || {}, meta.id);
  const context = contextFrom(options, fields);
  const packet = packetWithRoutes(classifyPacketPagesV1040(base.text || '', {
    fileName:file?.name || '',
    pageCount:base.pageCount || 1,
    context,
  }), context);
  const fingerprint = fingerprintV1040(meta.id, text, fields, file);
  const evidence = fieldEvidence(text, fields, base);
  const match = contextMatch(meta, fields, context);
  const validation = validationFor(meta, fields, base.validation || {}, context, fingerprint);
  const finalConfidence = clamp(
    classification.confidence * .54
    + Number(base.confidence || 0) * .24
    + match.score * .14
    + (validation.valid ? .08 : 0)
    - validation.penalty,
    .12,
    .995,
  );
  const routing = buildRouting(meta, finalConfidence, match, validation, context, packet);
  const actions = actionsFor(meta, fields, routing, validation);
  const needsReview = !routing.autoFile || validation.criticalFailures > 0 || finalConfidence < .84 || base.needsReview === true;

  return {
    ...base,
    type:meta,
    detectedType:classification.detectedType,
    genericDetectedType:base.type || base.detectedType || null,
    alternatives:classification.alternatives,
    confidence:finalConfidence,
    fields:{
      ...fields,
      fieldConfidence:evidence.confidence,
      fieldEvidence:evidence.evidence,
      needsFieldReview:needsReview,
    },
    fieldConfidence:evidence.confidence,
    fieldEvidence:evidence.evidence,
    fieldDetails:evidence.details,
    classification:{
      family:meta.family,
      score:classification.score,
      margin:classification.margin,
      evidence:classification.evidence,
      lowEvidence:classification.lowEvidence,
    },
    validation,
    routing,
    matchedEntities:{
      load:context.loadNo && match.reasons.some(reason => /load/i.test(reason)) ? { id:context.loadNo, label:`Load ${context.loadNo}`, confidence:match.score } : null,
      driver:fields.driverName ? { id:normalizeToken(fields.driverName), label:fields.driverName, confidence:context.driverName ? match.score : .55 } : null,
      equipment:fields.unitNumber || fields.vin ? { id:fields.vin || fields.unitNumber, label:fields.unitNumber ? `Unit ${fields.unitNumber}` : fields.vin, confidence:context.truckNumber ? match.score : .55 } : null,
      broker:fields.broker ? { id:normalizeToken(fields.broker), label:fields.broker, confidence:context.broker ? match.score : .58 } : null,
    },
    contextMatch:match,
    packet,
    actions,
    fingerprint,
    backendDocumentType:backendDocumentTypeV1040(meta.id),
    intelligenceVersion:'104.0.0',
    method:`truck-document-intelligence-v1040:${base.method || 'reader'}`,
    needsReview,
    originalFileName:file?.name || base.originalFileName || '',
  };
}

export async function analyzeTruckDocumentV1040(file, options = {}) {
  const preferred = options.preferredType || 'auto';
  const basePreferred = KNOWN_BASE_TYPES.has(preferred) ? preferred : 'auto';
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  onProgress(.01, 'Starting Truck Document Brain…');
  const base = await analyzeSmartDocumentV1030(file, {
    ...options,
    preferredType:basePreferred,
    onProgress:(value, text) => onProgress(Number(value || 0) * .88, text),
  });
  onProgress(.9, 'Classifying, matching and building filing stacks…');
  const result = decorateAnalysis(base, file, options, preferred !== 'auto' ? preferred : '');
  onProgress(1, result.routing.autoFile ? 'Document understood and filing plan ready' : 'Document ready — verify highlighted details');
  return result;
}

export function reanalyzeTruckDocumentTypeV1040(analysis = {}, typeId = 'other', options = {}) {
  return decorateAnalysis(
    { ...analysis, type:truckDocumentTypeMetaV1040(typeId), detectedType:truckDocumentTypeMetaV1040(typeId) },
    { name:analysis.originalFileName || 'document' },
    { ...options, preferredType:typeId },
    typeId,
  );
}

export function documentIntelligencePayloadV1040(analysis = {}) {
  return {
    version:'104.0.0',
    family:analysis.type?.family || 'other',
    type:analysis.type?.id || 'other',
    backendDocumentType:analysis.backendDocumentType || backendDocumentTypeV1040(analysis.type?.id),
    confidence:Number(analysis.confidence || 0),
    fingerprint:analysis.fingerprint || '',
    routing:analysis.routing || null,
    matchedEntities:analysis.matchedEntities || null,
    validation:analysis.validation || null,
    actions:analysis.actions || [],
    packet:analysis.packet || null,
    fieldConfidence:analysis.fieldConfidence || {},
    fieldEvidence:analysis.fieldEvidence || {},
    fields:analysis.fields || {},
    method:analysis.method || '',
  };
}
