import { classifyDocument, documentTypeMeta, extractDocumentFields } from './smartScan.js';
import { analyzeDocumentFileProV990 } from './smartScanProV990.js';
import { isPdfFileV100, readPdfTextV100 } from './pdfTextV100.js';

const US_STATES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']);
const STREET_SUFFIX = '(?:Road|Rd\\.?|Avenue|Ave\\.?|Street|St\\.?|Drive|Dr\\.?|Lane|Ln\\.?|Boulevard|Blvd\\.?|Highway|Hwy\\.?|Parkway|Pkwy\\.?|Court|Ct\\.?|Circle|Cir\\.?|Way|Route|Rte\\.?)';

function clean(value = '') {
  return String(value || '').replace(/[\u0000-\u001f]+/g, ' ').replace(/[|¦]/g, 'I').replace(/[“”„]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
}

function lines(value = '') {
  return String(value || '').split(/\r?\n/).map(clean).filter(Boolean);
}

function numberValue(value = '') {
  const normalized = String(value || '').replace(/[OoQqDd]/g, '0').replace(/[Il|!]/g, '1').replace(/,/g, '').replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function digits(value = '') {
  return String(value || '').replace(/[OoQqDd]/g, '0').replace(/[Il|!]/g, '1').replace(/[^0-9]/g, '');
}

function firstMatch(value = '', patterns = []) {
  for (const pattern of patterns) {
    const match = String(value || '').match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return '';
}

function fieldSection(text = '', name = '') {
  const marker = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(text || '').match(new RegExp(`\\[\\[FIELD:${marker}\\]\\]\\s*([\\s\\S]*?)(?=\\n\\[\\[FIELD:|Detected barcode values:|$)`, 'i'));
  return String(match?.[1] || '').trim();
}

function validDate(value = '', now = new Date()) {
  const match = String(value || '').match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
  if (!match) return '';
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  const date = new Date(year, month - 1, day, 12);
  if (Number.isNaN(date.getTime()) || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  if (date.getTime() > now.getTime() + 86400000) return '';
  if (year < now.getFullYear() - 6) return '';
  return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
}

function documentDate(text = '', now = new Date()) {
  const focused = fieldSection(text, 'DATE');
  const labeled = firstMatch(`${focused}\n${String(text).slice(0, 1800)}`, [
    /(?:document\s+date|bill\s+date|date)\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /\[\[FIELD:DATE\]\]\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
  ]);
  return validDate(labeled || focused, now);
}

function parseCityStateZip(value = '') {
  const source = clean(value).replace(/\bUnited States\b/i, '').trim();
  const match = source.match(/([A-Za-z][A-Za-z .'-]{1,45})[, ]+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/i);
  if (!match) return null;
  const state = match[2].toUpperCase();
  if (!US_STATES.has(state)) return null;
  let city = clean(match[1]);
  const suffixIndex = city.search(new RegExp(`\\b${STREET_SUFFIX}\\b`, 'i'));
  if (suffixIndex >= 0) {
    const after = city.slice(suffixIndex).replace(new RegExp(`^${STREET_SUFFIX}\\s*`, 'i'), '').trim();
    if (after.length >= 2) city = after;
  }
  return { city, state, zip:match[3], cityState:`${city}, ${state}` };
}

function parseAddressBlock(value = '') {
  const rawLines = lines(value).filter(line => !/^(?:ship\s+from|ship\s+to|pickup|delivery|origin|destination|consignee|shipper|page\s+\d|bill\s+of\s+lading)/i.test(line));
  const joined = clean(rawLines.join(' | '));
  const city = parseCityStateZip(joined) || rawLines.map(parseCityStateZip).find(Boolean) || null;
  const streetRegex = new RegExp(`\\b(\\d{1,6}\\s+[A-Za-z0-9][A-Za-z0-9 .#'/-]{1,55}?\\s+${STREET_SUFFIX})\\b`, 'i');
  const streetMatch = joined.match(streetRegex) || rawLines.map(line => line.match(streetRegex)).find(Boolean) || null;
  const street = clean(streetMatch?.[1] || '');
  const streetPosition = joined.toLowerCase().indexOf(street.toLowerCase());
  const beforeStreet = streetPosition >= 0 ? joined.slice(0, streetPosition) : rawLines.slice(0, Math.max(1, rawLines.length - 2)).join(' | ');
  const candidates = beforeStreet.split(/[|,;]+/).map(clean).filter(Boolean).filter(item => {
    if (item.length < 3 || item.length > 80) return false;
    if (/^(?:page|date|number|account|carrier|customer|ship|bill|not negotiable)/i.test(item)) return false;
    if (/^\d+$/.test(item)) return false;
    return (item.match(/[A-Za-z]{2,}/g) || []).length >= 1;
  });
  let company = candidates.at(-1) || '';
  const suffixCandidate = candidates.slice().reverse().find(item => /\b(?:inc\.?|llc|ltd\.?|corp\.?|company|co\.?|dc|distribution|warehouse|logistics|foods?|market)\b/i.test(item));
  if (suffixCandidate) company = suffixCandidate;
  company = company.replace(/^.*?\b(?=([A-Z][A-Za-z]+\s+){1,6}(?:Inc\.?|LLC|Ltd\.?|Corp\.?|DC)\b)/, '').replace(/^[^A-Za-z]+/, '').trim();
  const country = /\bUnited States\b/i.test(value) ? 'United States' : '';
  const valid = Boolean(street && city && company);
  if (!valid) return { details:'', cityState:'', company:'', street:'', confidence:0 };
  return {
    details:[company, street, `${city.city}, ${city.state} ${city.zip}`, country].filter(Boolean).join(', '),
    cityState:city.cityState,
    company,
    street,
    confidence:country ? .96 : .88,
  };
}

function normalizeBol(value = '') {
  const compact = String(value || '').toUpperCase().replace(/\b(?:BOL|BL|NO|NUMBER|NUM8ER)\b/g, '').replace(/[^A-Z0-9-]/g, '');
  const match = compact.match(/^([A-Z]{1,6})-?(\d{3,14})$/);
  return match ? `${match[1]}${match[2]}` : '';
}

function barcodeValues(text = '') {
  const section = String(text || '').split(/Detected barcode values:/i)[1] || '';
  return lines(section).map(normalizeBol).filter(Boolean);
}

function parseBol(text = '', baseFields = {}, now = new Date()) {
  const bolSource = `${fieldSection(text, 'BOL_VALUE')}\n${fieldSection(text, 'BOL_BAR_TEXT')}\n${String(text).slice(0, 1800)}`;
  const labeledBol = firstMatch(bolSource, [
    /bill\s+of\s+lading\s*(?:number|num8er|no\.?|#)?\s*[:#-]?\s*([A-Z]{1,6}\s*-?\s*\d{3,14})/i,
    /\b(?:BOL|B\/L)\s*(?:number|num8er|no\.?|#)?\s*[:#-]?\s*([A-Z]{1,6}\s*-?\s*\d{3,14})/i,
    /\[\[FIELD:BOL_(?:VALUE|BAR_TEXT)\]\]\s*([A-Z]{1,6}\s*-?\s*\d{3,14})/i,
  ]);
  const labeledValue = normalizeBol(labeledBol);
  const barcodes = barcodeValues(text);
  const bolNo = barcodes.find(value => value === labeledValue) || labeledValue || (barcodes.length === 1 ? barcodes[0] : '');
  const poRaw = firstMatch(`${fieldSection(text, 'CUSTOMER_PO')}\n${String(text).slice(0, 2200)}`, [
    /customer\s+p\.?\s*o\.?\s*(?:number|num8er|no\.?|#)?\s*[:#-]?\s*([0-9 OQDI|]{7,18})/i,
    /\[\[FIELD:CUSTOMER_PO\]\]\s*([0-9 OQDI|]{7,18})/i,
  ]);
  let poNumber = digits(poRaw);
  if (poNumber.length > 14) poNumber = '';
  const sealRaw = firstMatch(`${fieldSection(text, 'SEAL')}\n${String(text).slice(0, 2400)}`, [
    /seal\s*(?:number|num8er|no\.?|#)?\s*[:#-]?\s*([0-9 OQDI|]{4,12})/i,
    /\[\[FIELD:SEAL\]\]\s*([0-9 OQDI|]{4,12})/i,
  ]);
  const seal = digits(sealRaw);
  const trailerNo = clean(firstMatch(`${fieldSection(text, 'TRAILER')}\n${String(text).slice(0, 2400)}`, [
    /trailer\s*(?:number|num8er|no\.?|#)?\s*[:#-]?\s*([A-Z0-9-]{3,18})/i,
    /\[\[FIELD:TRAILER\]\]\s*([A-Z0-9-]{3,18})/i,
  ])).toUpperCase();
  const piecesRaw = firstMatch(`${fieldSection(text, 'PIECES')}\n${text}`, [
    /total\s+(?:qty|quantity)\s+pieces?\s*[:#-]?\s*([0-9 OQDI|]{1,8})/i,
    /total\s+pieces?\s*[:#-]?\s*([0-9 OQDI|]{1,8})/i,
    /\[\[FIELD:PIECES\]\]\s*([0-9 OQDI|]{1,8})/i,
  ]);
  const totalPieces = Number(digits(piecesRaw)) || 0;
  const weightRaw = firstMatch(`${fieldSection(text, 'WEIGHT')}\n${text}`, [
    /total\s+weight\s*[:#-]?\s*([0-9 OQDI|,.]{3,15})\s*(?:lb|lbs)?/i,
    /\[\[FIELD:WEIGHT\]\]\s*([0-9 OQDI|,.]{3,15})/i,
  ]);
  const weight = numberValue(weightRaw);
  const from = parseAddressBlock(fieldSection(text, 'SHIP_FROM'));
  const to = parseAddressBlock(fieldSection(text, 'SHIP_TO'));
  const stop = fieldSection(text, 'STOP_TIMES');
  const checkIn = firstMatch(stop, [/check\s*in(?:\s*\(guard\))?\s*[:#-]?\s*(\d{1,2}(?::|\.)\d{2}\s*(?:[ap]\.?m\.?)?)/i]).replace('.', ':');
  const appointmentTime = firstMatch(stop, [/appointment(?:\s*time)?\s*[:#-]?\s*(\d{1,2}(?::|\.)\d{2}\s*(?:[ap]\.?m\.?)?|\d{1,2}\s*(?:[ap]\.?m\.?))/i]).replace('.', ':');
  const checkOut = firstMatch(stop, [/(?:unloaded\s*&?\s*signed\s*out|check\s*out|signed\s*out)\s*[:#-]?\s*(\d{1,2}(?::|\.)\d{2}\s*(?:[ap]\.?m\.?)?)/i]).replace('.', ':');
  const commoditySource = fieldSection(text, 'COMMODITY');
  const commodity = clean(firstMatch(commoditySource, [/(\b[A-Z]{2,}(?:-[A-Z0-9]{2,}){1,}\b[^\n]{0,180})/i]));
  const date = documentDate(text, now);
  const critical = [date, bolNo, from.details, to.details];
  const secondary = [poNumber, seal, totalPieces, weight];
  const criticalCoverage = critical.filter(Boolean).length / critical.length;
  const secondaryCoverage = secondary.filter(Boolean).length / secondary.length;
  const evidence = criticalCoverage * .72 + secondaryCoverage * .28;
  return {
    ...baseFields,
    date,
    loadNo:bolNo,
    bolNo,
    poNumber:poNumber.length >= 7 && poNumber.length <= 14 ? poNumber : '',
    trailerNo:/\d/.test(trailerNo) ? trailerNo : '',
    seal:seal.length >= 4 && seal.length <= 10 ? seal : '',
    origin:from.cityState,
    destination:to.cityState,
    shipFromDetails:from.details,
    shipToDetails:to.details,
    shipper:from.company,
    consignee:to.company,
    weight:weight >= 100 && weight <= 200000 ? weight : 0,
    totalPieces:totalPieces > 0 && totalPieces <= 1000000 ? totalPieces : 0,
    commodity,
    checkIn,
    appointmentTime,
    checkOut,
    documentEvidence:evidence,
    needsFieldReview:criticalCoverage < 1 || secondaryCoverage < .5,
  };
}

function labeledMoney(text = '', labels = []) {
  for (const label of labels) {
    const match = String(text || '').match(new RegExp(`${label}[^$\\d-]{0,35}\\$?\\s*([\\d,]+(?:\\.\\d{2})?)`, 'i'));
    const value = numberValue(match?.[1] || '');
    if (value > 0 && value < 10000000) return value;
  }
  return 0;
}

function labeledLocation(text = '', labels = []) {
  const sourceLines = lines(text);
  for (let index = 0; index < sourceLines.length; index += 1) {
    if (!labels.some(label => label.test(sourceLines[index]))) continue;
    const block = sourceLines.slice(index, index + 7).join(' | ');
    const city = parseCityStateZip(block);
    if (city) return city.cityState;
    const same = sourceLines[index].replace(labels.find(label => label.test(sourceLines[index])), '').replace(/^\s*[:#-]\s*/, '');
    if (same && /[A-Za-z]/.test(same)) return clean(same).slice(0, 100);
  }
  return '';
}

function parseRateConfirmation(text = '', baseFields = {}, now = new Date()) {
  const loadNo = clean(firstMatch(text, [
    /(?:load|order|trip|confirmation)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9_-]{3,24})/i,
    /\bPO\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9_-]{3,24})/i,
  ])).toUpperCase();
  const total = labeledMoney(text, ['total\\s+carrier\\s+pay', 'all[- ]?in\\s+rate', 'agreed\\s+rate', 'carrier\\s+pay', 'total\\s+rate', '\\brate\\b']);
  const linehaul = labeledMoney(text, ['line\\s*haul', 'linehaul']);
  const fuelSurcharge = labeledMoney(text, ['fuel\\s+surcharge', '\\bfsc\\b']);
  const broker = firstMatch(text, [/(?:broker|customer|bill\s+to)\s*[:#-]\s*([^\n]{3,80})/i]);
  const origin = labeledLocation(text, [/^(?:pickup|pick\s*up|origin|shipper)\b/i]);
  const destination = labeledLocation(text, [/^(?:delivery|deliver\s*to|destination|consignee)\b/i]);
  const pickupDate = validDate(firstMatch(text, [/(?:pickup|pick\s*up)(?:\s+date)?\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i]), now);
  const deliveryDate = validDate(firstMatch(text, [/(?:delivery|deliver)(?:\s+date)?\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i]), now);
  const equipment = firstMatch(text, [/(?:equipment|trailer\s+type)\s*[:#-]?\s*([^\n]{2,60})/i]);
  const date = pickupDate || documentDate(text, now);
  const coverage = [loadNo, total, origin, destination, date].filter(Boolean).length / 5;
  return {
    ...baseFields,
    date,
    loadNo,
    broker,
    origin,
    destination,
    total,
    grossPay:total,
    linehaul,
    fuelSurcharge,
    pickupDate,
    deliveryDate,
    equipment,
    documentEvidence:coverage,
    needsFieldReview:coverage < .8,
  };
}

function merchantFromFuel(text = '') {
  const labeled = firstMatch(text, [/(?:fueling\s+location|merchant|truck\s+stop|location)\s*[:#-]\s*([^\n]{3,90})/i]);
  if (labeled) return labeled;
  const candidates = lines(text).filter(line => /mudflap|pilot|flying\s+j|love'?s|petro|ta\b|travel\s+centers|speedway|kwik\s+trip|casey'?s|circle\s+k/i.test(line));
  return candidates.find(line => !/receipt|discount|app|support/i.test(line)) || (candidates[0] || '');
}

function parseFuelReceipt(text = '', baseFields = {}, now = new Date()) {
  const date = validDate(firstMatch(text, [/(?:transaction\s+date|purchase\s+date|date)\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i, /\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/]), now);
  const gallons = numberValue(firstMatch(text, [/(?:gallons|quantity|qty)\s*[:#-]?\s*(\d{1,4}(?:\.\d{1,3})?)/i, /(\d{1,4}(?:\.\d{1,3})?)\s*(?:gal|gallons)\b/i]));
  const pricePerGallon = numberValue(firstMatch(text, [/(?:price\s*\/\s*gal|price\s+per\s+gallon|pump\s+price|unit\s+price)\s*[:#-]?\s*\$?\s*(\d{1,2}(?:\.\d{2,4})?)/i, /\$?\s*(\d{1,2}\.\d{2,4})\s*(?:\/\s*gal|per\s+gallon)/i]));
  const total = labeledMoney(text, ['amount\\s+paid', 'total\\s+paid', 'fuel\\s+total', 'transaction\\s+total', 'total']);
  const discount = labeledMoney(text, ['mudflap\\s+savings', 'discount', 'savings']);
  const merchant = merchantFromFuel(text);
  const cityState = labeledLocation(text, [/^(?:fueling\s+location|merchant|location|address)\b/i]) || firstMatch(text, [/([A-Za-z][A-Za-z .'-]{2,40},\s*[A-Z]{2})\b/]);
  const transactionId = firstMatch(text, [/(?:transaction|receipt|authorization|auth)\s*(?:id|number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9-]{4,30})/i]);
  const truckNumber = firstMatch(text, [/(?:truck|unit)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9-]{2,20})/i]);
  const mudflap = /\bmudflap\b/i.test(text);
  const coverage = [date, merchant, gallons, total, cityState].filter(Boolean).length / 5;
  return {
    ...baseFields,
    date,
    merchant,
    cityState,
    gallons:gallons > 0 && gallons < 1000 ? gallons : 0,
    pricePerGallon:pricePerGallon > 0 && pricePerGallon < 20 ? pricePerGallon : (gallons > 0 && total > 0 ? total / gallons : 0),
    total,
    discount,
    transactionId,
    truckNumber,
    fuelProvider:mudflap ? 'Mudflap' : merchant,
    documentEvidence:coverage,
    needsFieldReview:coverage < .8,
  };
}

function mergeMeaningful(...sources) {
  const out = {};
  for (const source of sources) for (const [key, value] of Object.entries(source || {})) {
    if (value !== '' && value !== 0 && value != null) out[key] = value;
  }
  return out;
}

function selectedType(preferredType = 'auto', classification = {}) {
  if (preferredType && preferredType !== 'auto') return documentTypeMeta(preferredType);
  return classification.type || documentTypeMeta('other');
}

export async function analyzeSmartDocumentV100(file, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const preferredType = options.preferredType || 'auto';
  const now = options.now instanceof Date ? options.now : new Date();
  let base = null;
  let pdf = null;

  if (isPdfFileV100(file)) {
    pdf = await readPdfTextV100(file, { onProgress:(value, text) => onProgress(.02 + value * .62, text) });
    const text = String(pdf?.text || '');
    const classification = classifyDocument(text, file?.name || '');
    const type = selectedType(preferredType, classification);
    const standard = extractDocumentFields(text, type.id);
    let fields = standard;
    if (['bol','pod'].includes(type.id)) fields = parseBol(text, standard, now);
    else if (type.id === 'rate_confirmation') fields = parseRateConfirmation(text, standard, now);
    else if (type.id === 'fuel_receipt') fields = parseFuelReceipt(text, standard, now);
    const evidence = Number(fields.documentEvidence || 0);
    const confidence = text ? Math.min(.96, .44 + evidence * .5) : .22;
    onProgress(1, text ? 'PDF ready to review' : 'PDF imported; text review required');
    return {
      type,
      detectedType:classification.type,
      confidence,
      alternatives:classification.alternatives || [],
      text,
      method:pdf?.method || 'pdf-import-no-text',
      fields,
      pageCount:pdf?.pageCount,
      preferredType,
      needsReview:!text || fields.needsFieldReview === true || confidence < .82,
    };
  }

  base = await analyzeDocumentFileProV990(file, {
    ...options,
    onProgress:(value, text) => onProgress(value * .82, text),
  });
  const type = selectedType(preferredType, base || {});
  const text = String(base?.text || '');
  let fields = { ...(base?.fields || {}) };
  if (['bol','pod'].includes(type.id)) fields = parseBol(text, fields, now);
  else if (type.id === 'rate_confirmation') fields = parseRateConfirmation(text, fields, now);
  else if (type.id === 'fuel_receipt') fields = parseFuelReceipt(text, fields, now);
  const evidence = Number(fields.documentEvidence || base?.fieldCoverage || 0);
  const confidence = Math.min(Number(base?.confidence || .3), .38 + evidence * .58);
  onProgress(1, 'Pro document reader ready');
  return {
    ...base,
    type,
    fields:mergeMeaningful(base?.fields, fields),
    confidence,
    method:`pro-reader-v100:${base?.method || 'ocr'}`,
    needsReview:fields.needsFieldReview === true || confidence < .82,
  };
}

export const analyzeDocumentFilePro = analyzeSmartDocumentV100;
