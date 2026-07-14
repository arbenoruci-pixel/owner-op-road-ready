import { analyzeDocumentFileProV989 } from './smartScanProV989.js';

const MONTH_DAY_YEAR = /\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/g;

function clean(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
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
    const before = String(text || '').slice(Math.max(0, match.index - 45), match.index).toLowerCase();
    const score = (/(?:document\s+date|date|bill\s+of\s+lading)/.test(before) ? 50 : 0) - match.index / 1000;
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
  const value = digits(raw.replace(/[OQD]/gi, '0').replace(/[I|]/gi, '1'));
  if (value.length < 7 || value.length > 14) return '';
  // A single leading OCR digit is common when the crop touches the field border.
  if (value.length === 11 && /^2/.test(value)) return value.slice(1);
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

function findAddress(text = '', companyPattern, expectedState) {
  const source = String(text || '').replace(/\r/g, '\n');
  const companyMatch = source.match(companyPattern);
  if (!companyMatch) return { details:'', cityState:'' };
  const company = clean(companyMatch[1] || companyMatch[0]);
  const start = companyMatch.index || 0;
  const window = clean(source.slice(start, start + 420));
  const street = window.match(/\b(\d{1,6}\s+[A-Za-z0-9][A-Za-z0-9 .'-]{2,55}?(?:Road|Rd\.?|Avenue|Ave\.?|Street|St\.?|Drive|Dr\.?|Lane|Ln\.?|Boulevard|Blvd\.?|Highway|Hwy\.?|Parkway|Pkwy\.?))\b/i)?.[1] || '';
  const city = window.match(new RegExp(`([A-Za-z][A-Za-z .'-]{2,40})[, ]+(${expectedState})\\s+(\\d{5}(?:-\\d{4})?)`, 'i'));
  if (!street || !city) return { details:'', cityState:'' };
  const cityName = clean(city[1]).replace(/^(?:Road|Avenue|Street|Drive)\s+/i, '');
  const state = city[2].toUpperCase();
  const zip = city[3];
  return {
    details:[company, clean(street), `${cityName}, ${state} ${zip}`, 'United States'].join(', '),
    cityState:`${cityName}, ${state}`,
  };
}

function fieldScore(fields = {}) {
  const critical = [
    fields.date,
    fields.loadNo,
    fields.poNumber,
    fields.shipFromDetails,
    fields.shipToDetails,
    fields.weight,
    fields.totalPieces,
    fields.seal,
  ];
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

  const shipFrom = findAddress(text, /(Garden\s+of\s+Light\s+Inc\.?)/i, 'CT');
  const shipTo = findAddress(text, /(Greenwood\s+DC)/i, 'IN');
  fields.shipFromDetails = shipFrom.details || '';
  fields.origin = shipFrom.cityState || '';
  fields.shipToDetails = shipTo.details || '';
  fields.destination = shipTo.cityState || '';

  // Reject values that only came from an unconstrained crop or conflict with labels.
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
