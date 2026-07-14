import { analyzeDocumentFileProV989 } from './smartScanProV989.js';

const MONTH_DAY_YEAR = /\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/g;
const COMPANY_SUFFIX = /\b(?:Inc\.?|LLC|Ltd\.?|Corp\.?|Company|Co\.?|DC|Distribution|Warehouse|Logistics)\b/i;
const STREET_SUFFIX = /\b(?:Road|Rd\.?|Avenue|Ave\.?|Street|St\.?|Drive|Dr\.?|Lane|Ln\.?|Boulevard|Blvd\.?|Highway|Hwy\.?|Parkway|Pkwy\.?|Court|Ct\.?|Circle|Cir\.?)\b/i;
const STATES = 'AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC';

function clean(value = '') {
  return String(value || '').replace(/[|¦]/g, 'I').replace(/\s+/g, ' ').trim();
}

function validBol(value = '') {
  const compact = String(value || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!/^[A-Z]{1,5}-?\d{3,10}$/.test(compact)) return '';
  if (compact.length > 15) return '';
  return compact;
}

function digits(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function labeledValue(text = '', patterns = []) {
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return '';
}

function fieldBlock(text = '', name = '') {
  const source = String(text || '');
  const marker = `[[FIELD:${name}]]`;
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const bodyStart = start + marker.length;
  const next = source.indexOf('[[FIELD:', bodyStart);
  return source.slice(bodyStart, next < 0 ? source.length : next).trim();
}

function bestDocumentDate(text = '', now = new Date()) {
  const candidates = [];
  let match;
  MONTH_DAY_YEAR.lastIndex = 0;
  while ((match = MONTH_DAY_YEAR.exec(String(text || '')))) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (Number.isNaN(date.getTime()) || date.getMonth() !== month - 1 || date.getDate() !== day) continue;
    if (date.getTime() > now.getTime() + 86400000) continue;
    if (year < now.getFullYear() - 4) continue;
    const before = String(text || '').slice(Math.max(0, match.index - 55), match.index).toLowerCase();
    const after = String(text || '').slice(match.index, match.index + 70).toLowerCase();
    let score = -match.index / 1000;
    if (/(?:document\s+date|date|bill\s+of\s+lading)/.test(before)) score += 60;
    if (/lot\s+code|best\s+by|expiration|expire/.test(`${before} ${after}`)) score -= 80;
    candidates.push({ value:`${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`, score, index:match.index });
  }
  return candidates.sort((a, b) => b.score - a.score || a.index - b.index)[0]?.value || '';
}

function strictBol(text = '', barcodes = []) {
  for (const raw of barcodes || []) {
    const value = validBol(raw);
    if (value) return value;
  }
  const labeled = labeledValue(text, [
    /bill\s+of\s+lading\s*(?:number|num8er|no\.?|#)?\s*[:#-]?\s*([A-Z]{1,5}\s*-?\s*\d{3,10})/i,
    /\b(?:BOL|B\/L)\s*(?:number|num8er|no\.?|#)?\s*[:#-]?\s*([A-Z]{1,5}\s*-?\s*\d{3,10})/i,
    /\[\[FIELD:BOL_(?:VALUE|BAR_TEXT)\]\]\s*([A-Z]{1,5}\s*-?\s*\d{3,10})/i,
  ]);
  return validBol(labeled);
}

function strictPo(text = '') {
  const raw = labeledValue(text, [
    /customer\s+p\.?\s*o\.?\s*(?:number|num8er|no\.?|#)?\s*[:#-]?\s*([0-9 OQDI|]{7,18})/i,
    /\[\[FIELD:CUSTOMER_PO\]\]\s*([0-9 OQDI|]{7,18})/i,
  ]);
  let value = digits(raw.replace(/[OQD]/gi, '0').replace(/[I|]/gi, '1'));
  if (value.length < 7 || value.length > 14) return '';
  if (value.length === 11 && /^2/.test(value)) value = value.slice(1);
  return value;
}

function strictSeal(text = '') {
  const raw = labeledValue(text, [
    /seal\s*(?:number|num8er|no\.?|#)?\s*[:#-]?\s*([0-9 OQDI|]{5,12})/i,
  ]);
  const value = digits(raw.replace(/[OQD]/gi, '0').replace(/[I|]/gi, '1'));
  return value.length >= 5 && value.length <= 10 ? value : '';
}

function strictPieces(text = '') {
  const raw = labeledValue(text, [
    /total\s+(?:qty|quantity)\s+pieces?\s*[:#-]?\s*([0-9 OQDI|]{1,8})/i,
    /total\s+pieces?\s*[:#-]?\s*([0-9 OQDI|]{1,8})/i,
  ]);
  const value = Number(digits(raw.replace(/[OQD]/gi, '0').replace(/[I|]/gi, '1')));
  return Number.isFinite(value) && value > 0 && value <= 1000000 ? value : 0;
}

function strictWeight(text = '') {
  const raw = labeledValue(text, [
    /total\s+weight\s*[:#-]?\s*([0-9 OQDI|,.]{3,14})\s*(?:lb|lbs)?/i,
    /\[\[FIELD:WEIGHT\]\]\s*([0-9 OQDI|,.]{3,14})/i,
  ]);
  const normalized = raw.replace(/[OQD]/gi, '0').replace(/[I|]/gi, '1').replace(/,/g, '').replace(/[^0-9.]/g, '');
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 100 && value <= 200000 ? value : 0;
}

function companyName(block = '') {
  const source = clean(block);
  const match = source.match(new RegExp(`([A-Za-z0-9&.' -]{2,70}?${COMPANY_SUFFIX.source})`, 'i'));
  if (!match) return '';
  const words = clean(match[1]).split(/\s+/);
  while (words.length && (/^(?:page|of|the|a|an|ship|from|to|ss|heirs)$/i.test(words[0]) || /^[A-Z]$/i.test(words[0]) || /^\d+$/.test(words[0]))) words.shift();
  return clean(words.join(' '));
}

function addressFromField(text = '', name = '') {
  const block = fieldBlock(text, name);
  if (!block) return { details:'', cityState:'' };
  const source = clean(block.replace(/\bUnited States\b/ig, ' United States '));
  const company = companyName(source);
  const streetMatch = source.match(new RegExp(`\\b(\\d{1,6}\\s+[A-Za-z0-9][A-Za-z0-9 .'-]{2,60}?${STREET_SUFFIX.source})\\b`, 'i'));
  const cityMatch = source.match(new RegExp(`([A-Za-z][A-Za-z .'-]{2,40})[, ]+(${STATES})\\s+(\\d{5}(?:-\\d{4})?)`, 'i'));
  if (!company || !streetMatch || !cityMatch) return { details:'', cityState:'' };
  const street = clean(streetMatch[1]);
  const city = clean(cityMatch[1]).replace(/^(?:Road|Avenue|Street|Drive|Lane|Boulevard|Highway|Parkway)\s+/i, '');
  const state = cityMatch[2].toUpperCase();
  const zip = cityMatch[3];
  return {
    details:[company, street, `${city}, ${state} ${zip}`, 'United States'].join(', '),
    cityState:`${city}, ${state}`,
  };
}

function fieldScore(fields = {}) {
  const critical = [fields.date, fields.loadNo, fields.poNumber, fields.shipFromDetails, fields.shipToDetails, fields.weight, fields.totalPieces, fields.seal];
  return critical.filter(value => value !== '' && value !== 0 && value != null).length / critical.length;
}

export async function analyzeDocumentFileProV990(file, options = {}) {
  const result = await analyzeDocumentFileProV989(file, options);
  if (!['bol','pod'].includes(result?.type?.id)) return result;

  const text = String(result.text || '');
  const fields = { ...(result.fields || {}) };
  fields.date = bestDocumentDate(text);
  fields.bolNo = strictBol(text, result.barcodes || []);
  fields.loadNo = fields.bolNo;
  fields.poNumber = strictPo(text);
  fields.seal = strictSeal(text);
  fields.totalPieces = strictPieces(text);
  fields.weight = strictWeight(text) || Number(fields.weight || 0);

  const shipFrom = addressFromField(text, 'SHIP_FROM');
  const shipTo = addressFromField(text, 'SHIP_TO');
  fields.shipFromDetails = shipFrom.details;
  fields.origin = shipFrom.cityState;
  fields.shipToDetails = shipTo.details;
  fields.destination = shipTo.cityState;

  if (!fields.loadNo) fields.loadNo = '';
  if (!/^\d{7,14}$/.test(fields.poNumber || '')) fields.poNumber = '';
  if (!/^\d{5,10}$/.test(fields.seal || '')) fields.seal = '';
  if (!fields.totalPieces) fields.totalPieces = 0;

  const coverage = fieldScore(fields);
  const confidence = Math.min(Number(result.confidence || 0), .34 + coverage * .58);
  return {
    ...result,
    fields,
    confidence,
    fieldCoverage:coverage,
    method:'pro-ocr-v990',
    needsReview:coverage < .875 || confidence < .86,
  };
}

export const analyzeDocumentFilePro = analyzeDocumentFileProV990;
