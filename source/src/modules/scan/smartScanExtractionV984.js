import { extractProDocumentFields as extractLegacyFields } from './smartScanExtractionPro.js';

const BAD_IDENTIFIER = /^(?:number|numbers|no|name|date|ship|from|to|customer|carrier|trailer|seal|page|total|qty|quantity|pieces|weight|bill|lading|not|negotiable|pro|barcode|value|values)$/i;
const STATE_LINE = /([A-Za-z][A-Za-z .'-]{1,48})[ ,]+([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/;

function clean(value = '') {
  return String(value || '')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function sourceLines(value = '') {
  return String(value || '')
    .split(/\r?\n/)
    .map(line => clean(line))
    .filter(Boolean);
}

function firstMatch(text = '', patterns = []) {
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return '';
}

function numeric(value = '') {
  const parsed = Number(String(value || '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function numericMatch(text = '', patterns = []) {
  return numeric(firstMatch(text, patterns));
}

function normalizeIdentifier(value = '') {
  const compact = clean(value)
    .toUpperCase()
    .replace(/\b(?:NUMBER|NO)\.?$/i, '')
    .replace(/[^A-Z0-9-]/g, '');
  if (compact.length < 3 || compact.length > 32) return '';
  if (BAD_IDENTIFIER.test(compact)) return '';
  if (!/\d/.test(compact)) return '';
  return compact;
}

function normalizeDate(value = '') {
  const match = clean(value).match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/);
  if (!match) return '';
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  const month = Number(match[1]);
  const day = Number(match[2]);
  const numericYear = Number(year);
  if (month < 1 || month > 12 || day < 1 || day > 31 || numericYear < 2000 || numericYear > 2100) return '';
  return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
}

function cityStateFromLine(value = '') {
  const text = clean(value).replace(/\bUnited States\b/i, '').trim();
  const comma = text.match(/([A-Za-z][A-Za-z .'-]{1,48}),\s*([A-Z]{2})\b(?:\s+\d{5}(?:-\d{4})?)?/);
  if (comma) return `${clean(comma[1])}, ${comma[2].toUpperCase()}`;
  const zip = text.match(STATE_LINE);
  if (zip) return `${clean(zip[1])}, ${zip[2].toUpperCase()}`;
  return '';
}

function blockAfterHeading(text = '', headingPattern, stopPattern, maxLines = 9) {
  const lines = sourceLines(text);
  for (let index = 0; index < lines.length; index += 1) {
    if (!headingPattern.test(lines[index])) continue;
    const block = [];
    const sameLine = lines[index].replace(headingPattern, '').replace(/^\s*[:#-]\s*/, '').trim();
    if (sameLine) block.push(sameLine);
    for (let cursor = index + 1; cursor < lines.length && block.length < maxLines; cursor += 1) {
      const line = lines[cursor];
      if (stopPattern.test(line) && block.length) break;
      block.push(line);
    }
    return block;
  }
  return [];
}

const SECTION_STOP = /^(?:ship\s*(?:from|to)|third\s+party|freight\s+charges|delivery\s+instructions|notes?|handling\s+unit|commodity\s+description|carrier\s+name|customer\s+p\.?\s*o\.?|pro\s+number|bill\s+of\s+lading|received|shipper\s+signature|carrier\s+signature|check\s*in|appointment|unloaded)/i;

function locationFromHeading(text = '', headingPattern) {
  const block = blockAfterHeading(text, headingPattern, SECTION_STOP, 9);
  for (const line of block) {
    const location = cityStateFromLine(line);
    if (location) return location;
  }
  return '';
}

function fallbackLocations(text = '') {
  const locations = [];
  for (const line of sourceLines(text)) {
    const value = cityStateFromLine(line);
    if (value && !locations.includes(value)) locations.push(value);
  }
  return locations;
}

function validLocation(value = '') {
  return /,\s*[A-Z]{2}$/.test(clean(value));
}

function timeMatch(text = '', labels = []) {
  const joined = labels.join('|');
  const value = firstMatch(text, [
    new RegExp(`(?:${joined})[^\\n\\d]{0,46}(\\d{1,2}(?::|\\.)\\d{2}\\s*(?:[ap]\\.?m\\.?)?)`, 'i'),
    new RegExp(`(?:${joined})[^\\n\\d]{0,46}(\\d{1,2}\\s*(?:[ap]\\.?m\\.?))`, 'i'),
  ]);
  return clean(value).replace(/^(\d{1,2})\.(\d{2})/, '$1:$2');
}

function titleCaseLoose(value = '') {
  return clean(value)
    .toLowerCase()
    .replace(/\b([a-z])/g, letter => letter.toUpperCase());
}

function dateFromTop(text = '') {
  const top = sourceLines(text).slice(0, 18).join('\n');
  return normalizeDate(firstMatch(top, [
    /(?:document\s+date|ship\s+date|pickup\s+date|delivery\s+date|date)\s*[:#-]?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i,
    /\b(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})\b/,
  ]));
}

function valueAfterLabel(text = '', patterns = []) {
  return normalizeIdentifier(firstMatch(text, patterns));
}

export function extractProDocumentFieldsV984(text = '', typeId = 'other') {
  const raw = String(text || '');
  const legacy = extractLegacyFields(raw, typeId) || {};
  const locations = fallbackLocations(raw);

  const bolNo = valueAfterLabel(raw, [
    /bill\s+(?:of\s+)?lading\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\s-]{2,32})/i,
    /\bb\s*\/?\s*l\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\s-]{2,32})/i,
    /\bbol\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\s-]{2,32})/i,
  ]) || normalizeIdentifier(legacy.bolNo);

  const genericLoadNo = valueAfterLabel(raw, [
    /(?:load|order|trip|confirmation|pro)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9\s_-]{2,32})/i,
  ]);

  const poNumber = valueAfterLabel(raw, [
    /customer\s+p\.?\s*o\.?\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9\s_-]{2,32})/i,
    /purchase\s+order\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9\s_-]{2,32})/i,
  ]) || normalizeIdentifier(legacy.poNumber);

  const trailerNo = valueAfterLabel(raw, [
    /trailer\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\s-]{2,24})/i,
  ]) || normalizeIdentifier(legacy.trailerNo);

  const seal = valueAfterLabel(raw, [
    /seal\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\s-]{2,24})/i,
  ]) || normalizeIdentifier(legacy.seal);

  const carrierName = firstMatch(raw, [
    /carrier\s+name\s*[:#-]?\s*([^\n]{3,70})/i,
  ]);

  const origin = locationFromHeading(raw, /^(?:ship\s*(?:from|frorn)|pickup|pick\s*up|origin)\b/i)
    || (validLocation(legacy.origin) ? clean(legacy.origin) : '')
    || locations[0]
    || '';

  const destination = locationFromHeading(raw, /^(?:ship\s*(?:to|t0)|delivery|deliver\s+to|destination|consignee)\b/i)
    || (validLocation(legacy.destination) ? clean(legacy.destination) : '')
    || locations.find(value => value !== origin)
    || '';

  const weight = numericMatch(raw, [
    /total\s+weight\s*[:#-]?\s*([\d,]+(?:\.\d+)?)\s*(?:lb|lbs|pounds)?/i,
    /gross\s+weight\s*[:#-]?\s*([\d,]+(?:\.\d+)?)\s*(?:lb|lbs|pounds)?/i,
    /net\s+weight\s*[:#-]?\s*([\d,]+(?:\.\d+)?)\s*(?:lb|lbs|pounds)?/i,
  ]) || numeric(legacy.weight);

  const totalPieces = numericMatch(raw, [
    /total\s+(?:qty|quantity)\s+pieces?\s*[:#-]?\s*([\d,]+)/i,
    /total\s+pieces?\s*[:#-]?\s*([\d,]+)/i,
    /total\s+(?:qty|quantity)\s*[:#-]?\s*([\d,]+)/i,
  ]) || numeric(legacy.totalPieces);

  const checkIn = timeMatch(raw, ['check\\s*in', 'checked\\s*in']) || clean(legacy.checkIn);
  const appointmentTime = timeMatch(raw, ['appointment']) || clean(legacy.appointmentTime);
  const checkOut = timeMatch(raw, ['unloaded\\s*&?\\s*signed\\s*out', 'check\\s*out', 'checked\\s*out', 'signed\\s*out']) || clean(legacy.checkOut);
  const date = dateFromTop(raw);
  const loadNo = ['bol','pod'].includes(typeId)
    ? (bolNo || genericLoadNo || poNumber)
    : (genericLoadNo || bolNo || poNumber);

  return {
    ...legacy,
    date,
    loadNo,
    bolNo,
    poNumber,
    trailerNo,
    seal,
    carrierName:titleCaseLoose(carrierName || legacy.carrierName),
    origin,
    destination,
    weight,
    totalPieces,
    checkIn,
    appointmentTime,
    checkOut,
  };
}

export function sanitizeExtractedFieldsV984(fields = {}, typeId = 'other') {
  const next = { ...(fields || {}) };
  for (const key of ['loadNo','bolNo','poNumber','trailerNo','seal','invoiceNo']) {
    if (next[key] != null && next[key] !== '') next[key] = normalizeIdentifier(next[key]);
  }
  if (['bol','pod'].includes(typeId)) {
    if (!next.loadNo) next.loadNo = next.bolNo || next.poNumber || '';
    if (!validLocation(next.origin)) next.origin = '';
    if (!validLocation(next.destination)) next.destination = '';
  }
  if (next.date) next.date = normalizeDate(next.date);
  if (next.weight) next.weight = numeric(next.weight);
  if (next.totalPieces) next.totalPieces = numeric(next.totalPieces);
  return next;
}

export function scoreExtractedFieldsV984(typeId = 'other', fields = {}) {
  const present = value => value != null && value !== '' && value !== 0;
  let checks;
  if (['bol','pod'].includes(typeId)) {
    checks = [
      ['date', 1.1, present(fields.date)],
      ['load number', 1.5, present(fields.loadNo || fields.bolNo)],
      ['ship from', 1.2, present(fields.origin)],
      ['ship to', 1.2, present(fields.destination)],
      ['customer PO', .8, present(fields.poNumber)],
      ['trailer or seal', .7, present(fields.trailerNo || fields.seal)],
      ['weight', .5, present(fields.weight)],
      ['pieces', .5, present(fields.totalPieces)],
      ['stop times', .5, present(fields.checkIn || fields.appointmentTime || fields.checkOut)],
    ];
  } else {
    checks = [
      ['date', 1, present(fields.date)],
      ['reference number', 1, present(fields.loadNo || fields.invoiceNo)],
      ['amount', 1, present(fields.total || fields.netPay || fields.grossPay)],
      ['merchant', .7, present(fields.merchant || fields.carrierName)],
    ];
  }
  const totalWeight = checks.reduce((sum, item) => sum + item[1], 0);
  const foundWeight = checks.reduce((sum, item) => sum + (item[2] ? item[1] : 0), 0);
  const found = checks.filter(item => item[2]).length;
  const total = checks.length;
  const criticalMissing = ['bol','pod'].includes(typeId)
    ? checks.filter(item => ['date','load number','ship from','ship to'].includes(item[0]) && !item[2]).map(item => item[0])
    : [];
  return {
    coverage:totalWeight ? foundWeight / totalWeight : 0,
    found,
    total,
    criticalMissing,
  };
}
