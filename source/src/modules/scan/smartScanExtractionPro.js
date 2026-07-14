const LABEL_WORDS = new Set([
  'ACCOUNT','APPOINTMENT','BILL','BOL','CARRIER','CHECK','CUSTOMER','DATE','DELIVERY',
  'DESCRIPTION','FREIGHT','FROM','HANDLING','LOAD','LOADED','LOADES','NAME','NUMBER',
  'ORDER','ORIGIN','PIECES','PO','PRO','SEAL','SHIP','SHIPPER','TO','TOTAL','TRAILER',
  'UNITS','WEIGHT',
]);

const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS',
  'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV',
  'WI','WY','DC',
]);

function clean(value = '') {
  return String(value || '')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/[|¦]/g, 'I')
    .replace(/\s+/g, ' ')
    .trim();
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
  const normalized = String(value || '')
    .replace(/[Oo]/g, '0')
    .replace(/[, ]/g, '')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numericMatch(text = '', patterns = []) {
  return numeric(firstMatch(text, patterns));
}

function regionText(text = '', name = '') {
  const source = String(text || '');
  const marker = `[[REGION:${String(name || '').toUpperCase()}]]`;
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const after = source.slice(start + marker.length);
  const next = after.search(/\n\[\[REGION:[A-Z_]+\]\]/);
  return next >= 0 ? after.slice(0, next).trim() : after.trim();
}

function normalizeIdentifier(value = '') {
  return clean(value)
    .toUpperCase()
    .replace(/\b(?:NO|NUM8ER)\b\.?/g, '')
    .replace(/[^A-Z0-9_-]/g, '')
    .replace(/^[-_]+|[-_]+$/g, '');
}

function validIdentifier(value = '', options = {}) {
  const normalized = normalizeIdentifier(value);
  const minLength = Number(options.minLength || 3);
  const maxLength = Number(options.maxLength || 24);
  if (normalized.length < minLength || normalized.length > maxLength) return '';
  if (options.requireDigit !== false && !/\d/.test(normalized)) return '';
  if (LABEL_WORDS.has(normalized)) return '';
  if (/^(?:NUMBER|ACCOUNT|LOADES?|LOADED|TRAILER|CUSTOMER|CARRIER|SHIPPER|FREIGHT)$/i.test(normalized)) return '';
  if (/^(?:[A-Z])\1{2,}$/.test(normalized) || /^(?:\d)\1{4,}$/.test(normalized)) return '';
  return normalized;
}

function digitsIdentifier(value = '', minLength = 4, maxLength = 24) {
  const normalized = clean(value)
    .toUpperCase()
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[^A-Z0-9_-]/g, '');
  if (normalized.length < minLength || normalized.length > maxLength || !/\d/.test(normalized)) return '';
  if (LABEL_WORDS.has(normalized)) return '';
  return normalized;
}

const SECTION_HEADING = /^(?:ship\s+from|ship\s+to|third\s+party|freight\s+charges|delivery\s+instructions|notes?|handling\s+unit|pieces|commodity\s+description|carrier\s+name|customer\s+p\.?\s*o\.?|pro\s+number|bill\s+of\s+lading|received|shipper\s+signature|carrier\s+signature|trailer|seal|check\s*in|appointment|unloaded|total\s+(?:qty|quantity|weight|units|pieces))/i;

function sameOrNearbyValue(text = '', labelPatterns = [], options = {}) {
  const source = lines(text);
  const maxLookahead = Number(options.maxLookahead || 2);
  for (let index = 0; index < source.length; index += 1) {
    const line = source[index];
    const label = labelPatterns.find(pattern => pattern.test(line));
    if (!label) continue;
    label.lastIndex = 0;
    const same = clean(line.replace(label, '').replace(/^[\s:#=\-–—]+/, ''));
    const sameValue = options.validate ? options.validate(same) : same;
    if (sameValue) return sameValue;
    for (let offset = 1; offset <= maxLookahead && index + offset < source.length; offset += 1) {
      const candidate = source[index + offset];
      if (SECTION_HEADING.test(candidate)) break;
      const checked = options.validate ? options.validate(candidate) : clean(candidate);
      if (checked) return checked;
    }
  }
  return '';
}

function barcodeValues(text = '') {
  const marker = 'Detected barcode values:';
  const source = String(text || '');
  const index = source.indexOf(marker);
  if (index < 0) return [];
  return lines(source.slice(index + marker.length))
    .map(value => validIdentifier(value, { minLength:3, maxLength:30, requireDigit:true }))
    .filter(Boolean)
    .slice(0, 8);
}

function blockBetween(text = '', startPattern, endPatterns = [], maxLines = 8) {
  const source = lines(text);
  for (let index = 0; index < source.length; index += 1) {
    startPattern.lastIndex = 0;
    if (!startPattern.test(source[index])) continue;
    const output = [];
    const same = clean(source[index].replace(startPattern, '').replace(/^[\s:#=\-–—]+/, ''));
    if (same) output.push(same);
    for (let cursor = index + 1; cursor < source.length && output.length < maxLines; cursor += 1) {
      const candidate = source[cursor];
      if (endPatterns.some(pattern => {
        pattern.lastIndex = 0;
        return pattern.test(candidate);
      })) break;
      if (SECTION_HEADING.test(candidate) && output.length) break;
      output.push(candidate);
    }
    return output;
  }
  return [];
}

function isUsefulAddressLine(value = '') {
  const line = clean(value);
  if (!line || line.length < 2 || line.length > 100) return false;
  if (SECTION_HEADING.test(line)) return false;
  if (/^(?:page\s+\d|united\s+states)$/i.test(line)) return true;
  if (/^[A-Z]{1,2}$/.test(line) || /^(?:ACCOUNT|NUMBER|LOADES?|LOADED|CARRIER|CUSTOMER)$/i.test(line)) return false;
  if (/bill\s+of\s+lading|not\s+negotiable|customer\s+p\.?\s*o|carrier\s+name|seal|trailer/i.test(line)) return false;
  return /[A-Za-z]{2}/.test(line);
}

function cityStateFromLine(value = '') {
  const text = clean(value).replace(/\bUnited States\b/i, '').trim();
  const withZip = text.match(/([A-Za-z][A-Za-z .'-]{1,48})[,\s]+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/);
  if (withZip && US_STATES.has(withZip[2])) return `${clean(withZip[1])}, ${withZip[2]}`;
  const withoutZip = text.match(/([A-Za-z][A-Za-z .'-]{2,48}),\s*([A-Z]{2})\b/);
  if (withoutZip && US_STATES.has(withoutZip[2])) return `${clean(withoutZip[1])}, ${withoutZip[2]}`;
  return '';
}

function addressDisplay(block = []) {
  const useful = block.filter(isUsefulAddressLine);
  if (!useful.length) return '';
  const cityIndex = useful.findIndex(line => cityStateFromLine(line));
  const chosen = cityIndex >= 0 ? useful.slice(0, Math.min(useful.length, cityIndex + 2)) : useful.slice(0, 4);
  const display = clean(chosen.join(', ').replace(/,\s*United States\b/i, ', United States'));
  if (display.length < 4 || display.length > 220) return '';
  return display;
}

function extractRoute(raw = '') {
  const routeRegion = regionText(raw, 'ROUTE') || regionText(raw, 'TOP_LEFT') || raw;
  const fromBlock = blockBetween(
    routeRegion,
    /^(?:ship\s+from|pickup|pick\s*up|origin)\b/i,
    [/^(?:ship\s+to|delivery|deliver\s+to|destination|consignee)\b/i],
    7
  );
  const toBlock = blockBetween(
    routeRegion,
    /^(?:ship\s+to|delivery|deliver\s+to|destination|consignee)\b/i,
    [/^(?:third\s+party|freight\s+charges|delivery\s+instructions|notes?|handling\s+unit|commodity)\b/i],
    7
  );
  const shipFromDetails = addressDisplay(fromBlock);
  const shipToDetails = addressDisplay(toBlock);
  const origin = fromBlock.map(cityStateFromLine).find(Boolean) || shipFromDetails;
  const destination = toBlock.map(cityStateFromLine).find(Boolean) || shipToDetails;
  return {
    origin,
    destination,
    shipFromDetails,
    shipToDetails,
  };
}

function timeMatch(text = '', labels = []) {
  const joined = labels.join('|');
  const value = firstMatch(text, [
    new RegExp(`(?:${joined})[^\\n\\d]{0,42}(\\d{1,2}(?::|\\.)\\d{2}\\s*(?:[ap]\\.?m\\.?)?)`, 'i'),
    new RegExp(`(?:${joined})[^\\n\\d]{0,42}(\\d{1,2}\\s*(?:[ap]\\.?m\\.?))`, 'i'),
  ]);
  return value.replace('.', ':').replace(/\s+/g, ' ').trim();
}

function titleCaseLoose(value = '') {
  const normalized = clean(value);
  if (!normalized || /^(?:name|carrier|customer|account|number)$/i.test(normalized)) return '';
  return normalized
    .toLowerCase()
    .replace(/\b([a-z])/g, match => match.toUpperCase());
}

function extractDate(raw = '') {
  return firstMatch(raw, [
    /\b(?:document\s+date|date)\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/i,
    /\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})\b/,
  ]);
}

function extractBolNumber(raw = '') {
  const header = regionText(raw, 'HEADER') || regionText(raw, 'TOP_RIGHT') || raw;
  const value = sameOrNearbyValue(header, [
    /bill\s+of\s+lading\s*(?:number|num8er|no\.?|#)?/i,
    /\bb\/?l\s*(?:number|num8er|no\.?|#)/i,
    /\bbol\s*(?:number|num8er|no\.?|#)/i,
  ], {
    maxLookahead:2,
    validate:candidate => validIdentifier(candidate, { minLength:3, maxLength:20, requireDigit:true }),
  });
  if (value) return value;
  const direct = firstMatch(header, [
    /bill\s+of\s+lading\s*(?:number|num8er|no\.?|#)?\s*[:#-]?\s*([A-Z]{1,5}\s*[-_]?\s*\d{2,14})/i,
    /\b(?:BOL|B\/L)\s*[:#-]?\s*([A-Z]{1,5}\s*[-_]?\s*\d{2,14})/i,
  ]);
  const normalized = validIdentifier(direct, { minLength:3, maxLength:20, requireDigit:true });
  if (normalized) return normalized;
  return barcodeValues(raw).find(value => /[A-Z]/.test(value) && /\d/.test(value)) || '';
}

function extractPoNumber(raw = '') {
  const header = regionText(raw, 'HEADER') || regionText(raw, 'TOP_RIGHT') || raw;
  return sameOrNearbyValue(header, [
    /customer\s+p\.?\s*o\.?\s*(?:number|num8er|no\.?|#)?/i,
    /purchase\s+order\s*(?:number|num8er|no\.?|#)?/i,
  ], {
    maxLookahead:2,
    validate:candidate => {
      const value = digitsIdentifier(candidate, 5, 24);
      return value && /\d{5,}/.test(value.replace(/\D/g, '')) ? value : '';
    },
  });
}

function extractTrailer(raw = '') {
  const header = regionText(raw, 'HEADER') || raw;
  return sameOrNearbyValue(header, [/trailer\s*(?:number|num8er|no\.?|#)?/i], {
    maxLookahead:1,
    validate:candidate => validIdentifier(candidate, { minLength:3, maxLength:18, requireDigit:true }),
  });
}

function extractSeal(raw = '') {
  const header = regionText(raw, 'HEADER') || raw;
  return sameOrNearbyValue(header, [/seal\s*(?:number|num8er|no\.?|#)?/i], {
    maxLookahead:1,
    validate:candidate => validIdentifier(candidate, { minLength:3, maxLength:18, requireDigit:true }),
  });
}

function extractCarrier(raw = '') {
  const header = regionText(raw, 'HEADER') || raw;
  const value = sameOrNearbyValue(header, [/carrier\s+name/i], {
    maxLookahead:1,
    validate:candidate => {
      const normalized = clean(candidate);
      if (normalized.length < 3 || normalized.length > 70) return '';
      if (SECTION_HEADING.test(normalized) || /^(?:name|account|number|seal|trailer)$/i.test(normalized)) return '';
      return normalized;
    },
  });
  return titleCaseLoose(value);
}

function extractWeight(raw = '', typeId = 'other') {
  const totals = regionText(raw, 'TOTALS') || raw;
  const patterns = [
    /total\s+weight\s*[:#-]?\s*([\dOoIl|,\s]+(?:\.\d+)?)\s*(?:lb|lbs|pounds)?/i,
    /total\s+wt\.?\s*[:#-]?\s*([\dOoIl|,\s]+(?:\.\d+)?)\s*(?:lb|lbs|pounds)?/i,
    /gross\s+weight\s*[:#-]?\s*([\dOoIl|,\s]+(?:\.\d+)?)\s*(?:lb|lbs|pounds)?/i,
  ];
  if (!['bol','pod'].includes(typeId)) patterns.push(/net\s+weight\s*[:#-]?\s*([\dOoIl|,\s]+(?:\.\d+)?)\s*(?:lb|lbs|pounds)?/i);
  return numericMatch(totals, patterns);
}

function extractPieces(raw = '') {
  const totals = regionText(raw, 'TOTALS') || raw;
  return numericMatch(totals, [
    /total\s+(?:qty|quantity)\s+pieces?\s*[:#-]?\s*([\dOoIl|,\s]+)/i,
    /total\s+pieces?\s*[:#-]?\s*([\dOoIl|,\s]+)/i,
  ]);
}

function extractCommodity(raw = '') {
  const source = regionText(raw, 'TABLE') || raw;
  const block = blockBetween(
    source,
    /^(?:commodity\s+description|description\s+of\s+articles)\b/i,
    [/^(?:lot\s+code|nmfc|class|total\s+qty|total\s+weight)\b/i],
    4
  );
  return clean(block.find(value => value.length >= 8 && /[A-Za-z]{3}/.test(value)) || '');
}

export function extractProDocumentFields(text = '', typeId = 'other') {
  const raw = String(text || '');
  const bolNo = extractBolNumber(raw);
  const poNumber = extractPoNumber(raw);
  const genericLoadNo = validIdentifier(firstMatch(raw, [
    /(?:load|order|trip|confirmation|pro)\s*(?:number|num8er|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9_-]{3,})/i,
  ]), { minLength:4, maxLength:24, requireDigit:true });
  const trailerNo = extractTrailer(raw);
  const seal = extractSeal(raw);
  const carrierName = extractCarrier(raw);
  const weight = extractWeight(raw, typeId);
  const totalPieces = extractPieces(raw);
  const route = extractRoute(raw);
  const commodity = extractCommodity(raw);
  const footer = regionText(raw, 'FOOTER') || raw;
  const checkIn = timeMatch(footer, ['check\\s*in', 'checked\\s*in']);
  const appointmentTime = timeMatch(footer, ['appointment']);
  const checkOut = timeMatch(footer, ['unloaded\\s*&?\\s*signed\\s*out', 'check\\s*out', 'checked\\s*out', 'signed\\s*out']);
  const receiver = titleCaseLoose(firstMatch(raw, [
    /(?:received\s+by|receiver\s+name|signed\s+by)\s*[:#-]?\s*([^\n]{3,60})/i,
  ]));
  const invoiceNo = validIdentifier(firstMatch(raw, [
    /(?:invoice|repair\s+order|receipt)\s*(?:number|num8er|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9_-]{2,})/i,
  ]), { minLength:3, maxLength:24, requireDigit:true });
  const loadNo = ['bol','pod'].includes(typeId)
    ? bolNo
    : (genericLoadNo || bolNo || poNumber);

  return {
    date:extractDate(raw),
    loadNo,
    bolNo,
    poNumber,
    trailerNo,
    seal,
    carrierName,
    origin:route.origin,
    destination:route.destination,
    shipFromDetails:route.shipFromDetails,
    shipToDetails:route.shipToDetails,
    weight,
    totalPieces,
    commodity,
    checkIn,
    appointmentTime,
    checkOut,
    receiver,
    invoiceNo,
    signed:Boolean(/(?:shipper|carrier|driver|receiver)\s+signature|signed\s+(?:out|by)/i.test(raw)),
  };
}
