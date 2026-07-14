function clean(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function lines(value = '') {
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

function cityStateFromLine(value = '') {
  const text = clean(value).replace(/\bUnited States\b/i, '').trim();
  const comma = text.match(/([A-Za-z][A-Za-z .'-]{1,48}),\s*([A-Z]{2})\b(?:\s+\d{5}(?:-\d{4})?)?/);
  if (comma) return `${clean(comma[1])}, ${comma[2].toUpperCase()}`;
  const zip = text.match(/([A-Za-z][A-Za-z .'-]{1,48})\s+([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/);
  if (zip) return `${clean(zip[1])}, ${zip[2].toUpperCase()}`;
  return '';
}

const SECTION_HEADING = /^(?:ship\s+from|ship\s+to|third\s+party|freight\s+charges|delivery\s+instructions|notes?|handling\s+unit|commodity\s+description|carrier\s+name|customer\s+p\.?o\.?|pro\s+number|bill\s+of\s+lading|received|shipper\s+signature|carrier\s+signature|check\s*in|appointment|unloaded)/i;

function blockAfterLabel(text = '', labelPattern, maxLines = 7) {
  const source = lines(text);
  for (let index = 0; index < source.length; index += 1) {
    if (!labelPattern.test(source[index])) continue;
    const out = [];
    const remainder = source[index].replace(labelPattern, '').replace(/^\s*[:#-]\s*/, '').trim();
    if (remainder) out.push(remainder);
    for (let cursor = index + 1; cursor < source.length && out.length < maxLines; cursor += 1) {
      const line = source[cursor];
      if (SECTION_HEADING.test(line) && out.length) break;
      out.push(line);
    }
    return out;
  }
  return [];
}

function locationFromLabel(text = '', labelPattern) {
  const block = blockAfterLabel(text, labelPattern, 7);
  for (const line of block) {
    const parsed = cityStateFromLine(line);
    if (parsed) return parsed;
  }
  return '';
}

function longValueAfterLabel(text = '', labelPattern) {
  const block = blockAfterLabel(text, labelPattern, 4);
  return block.find(value => value.length >= 5 && /[A-Za-z]/.test(value)) || '';
}

function timeMatch(text = '', labels = []) {
  const joined = labels.join('|');
  return firstMatch(text, [
    new RegExp(`(?:${joined})\\s*(?:time)?\\s*[:#-]?\\s*(\\d{1,2}[:.]\\d{2}\\s*(?:[ap]\\.?m\\.?)?)`, 'i'),
    new RegExp(`(?:${joined})[^\\n]{0,28}?(\\d{1,2}\\s*(?:[ap]\\.?m\\.?))`, 'i'),
  ]).replace('.', ':');
}

function titleCaseLoose(value = '') {
  return clean(value)
    .toLowerCase()
    .replace(/\b([a-z])/g, match => match.toUpperCase());
}

export function extractProDocumentFields(text = '', typeId = 'other') {
  const raw = String(text || '');
  const bolNo = firstMatch(raw, [
    /bill\s+of\s+lading\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{2,})/i,
    /bill\s+of\s+lading\s*[:#]\s*([A-Z0-9][A-Z0-9-]{2,})/i,
    /\bb\/?l\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{2,})/i,
    /\bbol\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{2,})/i,
  ]).toUpperCase();
  const genericLoadNo = firstMatch(raw, [
    /(?:load|order|trip|confirmation|pro)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9_-]{3,})/i,
  ]).toUpperCase();
  const poNumber = firstMatch(raw, [
    /customer\s+p\.?\s*o\.?\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9_-]{3,})/i,
    /purchase\s+order\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9_-]{3,})/i,
  ]).toUpperCase();
  const trailerNo = firstMatch(raw, [
    /trailer\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{2,})/i,
  ]).toUpperCase();
  const seal = firstMatch(raw, [
    /seal\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{2,})/i,
  ]).toUpperCase();
  const carrierName = firstMatch(raw, [
    /carrier\s+name\s*[:#-]?\s*([^\n]{3,70})/i,
  ]);
  const weight = numericMatch(raw, [
    /total\s+weight\s*[:#-]?\s*([\d,]+(?:\.\d+)?)\s*(?:lb|lbs|pounds)?/i,
    /gross\s+weight\s*[:#-]?\s*([\d,]+(?:\.\d+)?)\s*(?:lb|lbs|pounds)?/i,
    /net\s+weight\s*[:#-]?\s*([\d,]+(?:\.\d+)?)\s*(?:lb|lbs|pounds)?/i,
  ]);
  const totalPieces = numericMatch(raw, [
    /total\s+(?:qty|quantity|pieces?)\s*[:#-]?\s*([\d,]+)/i,
  ]);
  const origin = locationFromLabel(raw, /^(?:ship\s+from|pickup|pick\s*up|origin)\b/i);
  const destination = locationFromLabel(raw, /^(?:ship\s+to|delivery|deliver\s+to|destination|consignee)\b/i);
  const commodity = longValueAfterLabel(raw, /^(?:commodity\s+description|description\s+of\s+articles)\b/i);
  const checkIn = timeMatch(raw, ['check\\s*in', 'checked\\s*in']);
  const appointmentTime = timeMatch(raw, ['appointment']);
  const checkOut = timeMatch(raw, ['unloaded\\s*&?\\s*signed\\s*out', 'check\\s*out', 'checked\\s*out', 'signed\\s*out']);
  const receiver = firstMatch(raw, [
    /(?:received\s+by|receiver\s+name|signed\s+by)\s*[:#-]?\s*([^\n]{3,60})/i,
  ]);
  const invoiceNo = firstMatch(raw, [
    /(?:invoice|repair\s+order|receipt)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9_-]{2,})/i,
  ]).toUpperCase();
  const loadNo = ['bol','pod'].includes(typeId) ? (bolNo || genericLoadNo || poNumber) : (genericLoadNo || bolNo || poNumber);

  return {
    loadNo,
    bolNo,
    poNumber,
    trailerNo,
    seal,
    carrierName:titleCaseLoose(carrierName),
    origin,
    destination,
    weight,
    totalPieces,
    commodity,
    checkIn,
    appointmentTime,
    checkOut,
    receiver:titleCaseLoose(receiver),
    invoiceNo,
    signed:Boolean(/(?:shipper|carrier|driver|receiver)\s+signature|signed\s+(?:out|by)/i.test(raw)),
  };
}
