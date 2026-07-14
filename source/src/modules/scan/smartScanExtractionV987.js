const LABEL_WORDS = new Set([
  'ACCOUNT','APPOINTMENT','BILL','BOL','CARRIER','CHECK','CUSTOMER','DATE','DELIVERY',
  'DESCRIPTION','FREIGHT','FROM','HANDLING','LOAD','LOADED','LOADES','NAME','NUMBER',
  'ORDER','ORIGIN','PIECES','PO','PRO','SEAL','SHIP','SHIPPER','TO','TOTAL','TRAILER',
  'UNITS','WEIGHT','PACKAGE','PACKAGES',
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
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function lines(value = '') {
  return String(value || '')
    .split(/\r?\n/)
    .map(line => clean(line))
    .filter(Boolean);
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function regionText(text = '', names = []) {
  const wanted = Array.isArray(names) ? names : [names];
  const source = String(text || '');
  const output = [];
  for (const name of wanted.filter(Boolean)) {
    const marker = escapeRegExp(String(name).toUpperCase());
    const expression = new RegExp(`\\[\\[REGION:${marker}\\]\\]\\s*([\\s\\S]*?)(?=\\n\\[\\[REGION:|$)`, 'g');
    let match;
    while ((match = expression.exec(source))) {
      const value = String(match[1] || '').trim();
      if (value && !output.includes(value)) output.push(value);
    }
  }
  return output.join('\n');
}

function firstMatch(text = '', patterns = []) {
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return '';
}

function normalizeDigits(value = '') {
  return String(value || '')
    .toUpperCase()
    .replace(/[OoQqDd]/g, '0')
    .replace(/[Il|!]/g, '1')
    .replace(/[Zz]/g, '2')
    .replace(/[Ss]/g, '5')
    .replace(/[Gg]/g, '6')
    .replace(/[Bb]/g, '8')
    .replace(/[^0-9]/g, '');
}

function numeric(value = '') {
  const normalized = String(value || '')
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[, ]/g, '')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numericMatch(text = '', patterns = []) {
  return numeric(firstMatch(text, patterns));
}

function normalizeIdentifier(value = '') {
  return clean(value)
    .toUpperCase()
    .replace(/\b(?:NO|NUM8ER|NUMBER)\b\.?/g, '')
    .replace(/[^A-Z0-9_-]/g, '')
    .replace(/^[-_]+|[-_]+$/g, '');
}

function normalizeBolCandidate(value = '') {
  let normalized = normalizeIdentifier(value);
  if (!normalized) return '';
  const firstDigit = normalized.search(/\d/);
  if (firstDigit > 0) {
    const prefix = normalized.slice(0, firstDigit);
    const suffix = normalized.slice(firstDigit)
      .replace(/[OQD]/g, '0')
      .replace(/[IL]/g, '1')
      .replace(/Z/g, '2')
      .replace(/S/g, '5')
      .replace(/G/g, '6')
      .replace(/B/g, '8');
    normalized = `${prefix}${suffix}`;
  }
  return normalized;
}

function validBolCandidate(value = '') {
  const normalized = normalizeBolCandidate(value);
  if (normalized.length < 4 || normalized.length > 20) return '';
  if (!/[A-Z]/.test(normalized) || !/\d/.test(normalized)) return '';
  if (!/\d{3,}/.test(normalized)) return '';
  if ((normalized.match(/[A-Z]/g) || []).length > 7) return '';
  if (LABEL_WORDS.has(normalized)) return '';
  if (/^(?:ACCOUNT|NUMBER|LOADES?|LOADED|TRAILER|CUSTOMER|CARRIER|SHIPPER|FREIGHT)/.test(normalized)) return '';
  return normalized;
}

function validGenericIdentifier(value = '', options = {}) {
  const normalized = normalizeIdentifier(value);
  const min = Number(options.min || 3);
  const max = Number(options.max || 24);
  if (normalized.length < min || normalized.length > max) return '';
  if (options.requireDigit !== false && !/\d/.test(normalized)) return '';
  if (LABEL_WORDS.has(normalized)) return '';
  if (/^(?:ACCOUNT|NUMBER|LOADES?|LOADED|TRAILER|CUSTOMER|CARRIER|SHIPPER|FREIGHT)$/i.test(normalized)) return '';
  return normalized;
}

function scoreCandidates(candidates = []) {
  const grouped = new Map();
  for (const candidate of candidates) {
    if (!candidate?.value) continue;
    const key = candidate.value;
    const current = grouped.get(key) || { value:key, score:0, count:0 };
    current.score += Number(candidate.score || 0);
    current.count += 1;
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .map(item => ({ ...item, score:item.score + Math.min(10, (item.count - 1) * 3) }))
    .sort((a, b) => b.score - a.score || b.count - a.count || b.value.length - a.value.length)[0]?.value || '';
}

function collectBolCandidates(source = '', baseScore = 0) {
  const candidates = [];
  const text = String(source || '');
  const directPatterns = [
    /bill\s+of\s+lading\s*(?:number|num8er|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9 _-]{2,24})/gi,
    /\b(?:BOL|B\/L)\s*(?:number|num8er|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9 _-]{2,24})/gi,
  ];
  for (const pattern of directPatterns) {
    let match;
    while ((match = pattern.exec(text))) {
      const token = String(match[1] || '').split(/\s{2,}|\n|customer|carrier|seal|trailer/i)[0];
      const value = validBolCandidate(token);
      if (value) candidates.push({ value, score:baseScore + 18 });
    }
  }
  const tokenPattern = /\b[A-Z]{1,7}[ _-]?\d{3,14}\b/gi;
  let tokenMatch;
  while ((tokenMatch = tokenPattern.exec(text))) {
    const value = validBolCandidate(tokenMatch[0]);
    if (value) candidates.push({ value, score:baseScore + 8 + (/^[A-Z]{1,4}\d{3,}$/.test(value) ? 4 : 0) });
  }
  return candidates;
}

function barcodeValues(text = '') {
  const marker = 'Detected barcode values:';
  const source = String(text || '');
  const index = source.indexOf(marker);
  if (index < 0) return [];
  return lines(source.slice(index + marker.length))
    .map(validBolCandidate)
    .filter(Boolean)
    .slice(0, 8);
}

function extractBolNumber(raw = '') {
  const candidates = [];
  const headerRight = regionText(raw, ['BOL_NUMBER','HEADER_RIGHT','HEADER_RIGHT_PRINT','HEADER']);
  candidates.push(...collectBolCandidates(headerRight, 16));
  candidates.push(...collectBolCandidates(raw, 3));
  for (const value of barcodeValues(raw)) candidates.push({ value, score:30 });
  return scoreCandidates(candidates);
}

function collectPoCandidates(source = '', baseScore = 0) {
  const candidates = [];
  const text = String(source || '');
  const patterns = [
    /customer\s+p\.?\s*o\.?\s*(?:number|num8er|no\.?|#)?\s*[:#-]?\s*([^\n]{3,40})/gi,
    /purchase\s+order\s*(?:number|num8er|no\.?|#)?\s*[:#-]?\s*([^\n]{3,40})/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) {
      const rawValue = String(match[1] || '').split(/carrier|seal|trailer|ship/i)[0];
      const digitRuns = rawValue.match(/\d{6,18}/g) || [];
      for (const run of digitRuns) {
        if (run.length >= 7 && run.length <= 16) candidates.push({ value:run, score:baseScore + 22 + Math.min(5, run.length - 7) });
      }
      const normalized = normalizeDigits(rawValue);
      const polluted = /[A-Za-z]{3,}/.test(rawValue.replace(/(?:number|no)/ig, ''));
      if (normalized.length >= (polluted ? 8 : 7) && normalized.length <= 16) {
        candidates.push({ value:normalized, score:baseScore + (polluted ? 10 : 18) });
      }
    }
  }
  return candidates;
}

function extractPoNumber(raw = '') {
  const candidates = [];
  const focused = regionText(raw, ['CUSTOMER_PO','HEADER_RIGHT','HEADER_RIGHT_PRINT','HEADER']);
  candidates.push(...collectPoCandidates(focused, 15));
  candidates.push(...collectPoCandidates(raw, 2));
  return scoreCandidates(candidates);
}

function collectLabeledNumeric(source = '', labelPattern, baseScore = 0, min = 4, max = 14) {
  const candidates = [];
  const text = String(source || '');
  const pattern = new RegExp(`${labelPattern.source}\\s*[:#-]?\\s*([^\\n]{1,30})`, labelPattern.flags.includes('i') ? 'gi' : 'g');
  let match;
  while ((match = pattern.exec(text))) {
    const rawValue = String(match[1] || '');
    const directRuns = rawValue.match(/\d{3,18}/g) || [];
    for (const run of directRuns) {
      if (run.length >= min && run.length <= max) candidates.push({ value:run, score:baseScore + 18 });
    }
    const normalized = normalizeDigits(rawValue);
    if (normalized.length >= min && normalized.length <= max) candidates.push({ value:normalized, score:baseScore + 12 });
  }
  return candidates;
}

function extractSeal(raw = '') {
  const candidates = [];
  const focused = regionText(raw, ['SEAL_TRAILER','HEADER_RIGHT','HEADER_RIGHT_PRINT','HEADER']);
  candidates.push(...collectLabeledNumeric(focused, /seal\s*(?:number|num8er|no\.?|#)?/i, 16, 4, 12));
  candidates.push(...collectLabeledNumeric(raw, /seal\s*(?:number|num8er|no\.?|#)?/i, 1, 4, 12));
  return scoreCandidates(candidates);
}

function extractTrailer(raw = '') {
  const focused = regionText(raw, ['SEAL_TRAILER','HEADER_RIGHT','HEADER_RIGHT_PRINT','HEADER']);
  const text = focused || raw;
  const patterns = [
    /trailer\s*(?:number|num8er|no\.?|#)?\s*[:#-]?\s*([A-Z0-9_-]{3,20})/gi,
  ];
  const candidates = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) {
      const value = validGenericIdentifier(match[1], { min:3, max:18, requireDigit:true });
      if (value) candidates.push({ value, score:15 });
    }
  }
  return scoreCandidates(candidates);
}

function extractCarrier(raw = '') {
  const focused = regionText(raw, ['SEAL_TRAILER','HEADER_RIGHT','HEADER_RIGHT_PRINT','HEADER']);
  const value = firstMatch(focused || raw, [
    /carrier\s+name\s*[:#-]?\s*([^\n]{3,70})/i,
  ]);
  const normalized = clean(value).replace(/\b(?:seal|trailer)\b.*$/i, '').trim();
  if (normalized.length < 3 || normalized.length > 70) return '';
  if (/^(?:name|account|number|seal|trailer|optional)$/i.test(normalized)) return '';
  return normalized;
}

const SECTION_HEADING = /^(?:ship\s+from|ship\s+to|third\s+party|freight\s+charges|delivery\s+instructions|notes?|handling\s+unit|pieces|commodity\s+description|carrier\s+name|customer\s+p\.?\s*o\.?|pro\s+number|bill\s+of\s+lading|received|shipper\s+signature|carrier\s+signature|trailer|seal|check\s*in|appointment|unloaded|total\s+(?:qty|quantity|weight|units|pieces))/i;

function cityStateFromLine(value = '') {
  const text = clean(value).replace(/\bUnited States\b/i, '').trim();
  const withZip = text.match(/([A-Za-z][A-Za-z .'-]{1,48})[,\s]+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/);
  if (withZip && US_STATES.has(withZip[2])) return `${clean(withZip[1])}, ${withZip[2]}`;
  const withoutZip = text.match(/([A-Za-z][A-Za-z .'-]{2,48}),\s*([A-Z]{2})\b/);
  if (withoutZip && US_STATES.has(withoutZip[2])) return `${clean(withoutZip[1])}, ${withoutZip[2]}`;
  return '';
}

function punctuationRatio(value = '') {
  const text = String(value || '');
  if (!text.length) return 1;
  const punctuation = (text.match(/[^A-Za-z0-9\s.'#-]/g) || []).length;
  return punctuation / text.length;
}

function routeAnchor(value = '') {
  const text = clean(value);
  return /\b(?:inc\.?|llc|ltd\.?|corp\.?|company|distribution|warehouse|logistics|dc)\b/i.test(text)
    || /^\d{1,6}\s+[A-Za-z]/.test(text)
    || Boolean(cityStateFromLine(text));
}

function usefulRouteSegment(value = '') {
  const text = clean(value).replace(/^[\s'"`.,:;_\-–—]+|[\s'"`.,:;_\-–—]+$/g, '');
  if (!text || text.length < 3 || text.length > 100) return '';
  if (SECTION_HEADING.test(text)) return '';
  if (/^(?:page\s+\d|bill\s+of\s+lading|not\s+negotiable|account|number|optional)$/i.test(text)) return '';
  if (/^[A-Za-z]{1,2}$/.test(text)) return '';
  if (punctuationRatio(text) > .24) return '';
  const alphanumeric = (text.match(/[A-Za-z0-9]/g) || []).length;
  if (alphanumeric / Math.max(1, text.length) < .55) return '';
  return text;
}

function cleanRouteLines(values = []) {
  const segments = [];
  for (const rawLine of values) {
    const line = clean(rawLine).replace(/^(?:I\s+)+(?=[A-Za-z0-9])/g, '');
    for (const part of line.split(/\s*,\s*/)) {
      const segment = usefulRouteSegment(part);
      if (segment) segments.push(segment);
    }
  }
  const anchor = segments.findIndex(routeAnchor);
  const selected = anchor >= 0 ? segments.slice(anchor) : segments;
  const output = [];
  for (const segment of selected) {
    if (!output.some(existing => existing.toLowerCase() === segment.toLowerCase())) output.push(segment);
    if (output.length >= 5) break;
  }
  return output;
}

function blockAfterLabel(source = '', labelPattern, stopPatterns = [], maxLines = 7) {
  const sourceLines = lines(source);
  for (let index = 0; index < sourceLines.length; index += 1) {
    labelPattern.lastIndex = 0;
    if (!labelPattern.test(sourceLines[index])) continue;
    const output = [];
    const same = clean(sourceLines[index].replace(labelPattern, '').replace(/^[\s:#=\-–—]+/, ''));
    if (same) output.push(same);
    for (let cursor = index + 1; cursor < sourceLines.length && output.length < maxLines; cursor += 1) {
      const candidate = sourceLines[cursor];
      if (stopPatterns.some(pattern => {
        pattern.lastIndex = 0;
        return pattern.test(candidate);
      })) break;
      output.push(candidate);
    }
    return output;
  }
  return [];
}

function extractRoute(raw = '') {
  const fromRegion = regionText(raw, ['SHIP_FROM','ROUTE_PRINT','ROUTE']);
  const toRegion = regionText(raw, ['SHIP_TO','ROUTE_PRINT','ROUTE']);
  const generalRoute = regionText(raw, ['ROUTE_PRINT','ROUTE']) || raw;

  let fromLines = blockAfterLabel(fromRegion || generalRoute, /ship\s+from|pickup|pick\s*up|origin/i, [/ship\s+to|delivery|destination|consignee/i], 7);
  let toLines = blockAfterLabel(toRegion || generalRoute, /ship\s+to|delivery|deliver\s+to|destination|consignee/i, [/third\s+party|freight\s+charges|delivery\s+instructions|notes?|handling\s+unit|commodity/i], 7);
  if (!fromLines.length && fromRegion) fromLines = lines(fromRegion);
  if (!toLines.length && toRegion) toLines = lines(toRegion);

  const fromClean = cleanRouteLines(fromLines);
  const toClean = cleanRouteLines(toLines);
  const shipFromDetails = clean(fromClean.join(', '));
  const shipToDetails = clean(toClean.join(', '));
  const origin = fromClean.map(cityStateFromLine).find(Boolean)
    || lines(fromRegion || generalRoute).map(cityStateFromLine).find(Boolean)
    || shipFromDetails;
  const destination = toClean.map(cityStateFromLine).find(Boolean)
    || lines(toRegion || generalRoute).map(cityStateFromLine).find(Boolean)
    || shipToDetails;

  return { origin, destination, shipFromDetails, shipToDetails };
}

function extractDate(raw = '') {
  const top = regionText(raw, ['HEADER_LEFT','HEADER_RIGHT','HEADER_RIGHT_PRINT','HEADER']) || raw;
  return firstMatch(top, [
    /\b(?:document\s+date|date)\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/i,
    /\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})\b/,
  ]) || firstMatch(raw, [/\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})\b/]);
}

function extractWeight(raw = '', typeId = 'other') {
  const totals = regionText(raw, ['TOTALS_ROW','TOTALS_PRINT','TOTALS','TABLE_PRINT','TABLE']) || raw;
  const patterns = [
    /total\s+weight\s*[:#-]?\s*([\dOoIl|,\s]+(?:\.\d+)?)\s*(?:lb|lbs|pounds)?/i,
    /total\s+wt\.?\s*[:#-]?\s*([\dOoIl|,\s]+(?:\.\d+)?)\s*(?:lb|lbs|pounds)?/i,
    /gross\s+weight\s*[:#-]?\s*([\dOoIl|,\s]+(?:\.\d+)?)\s*(?:lb|lbs|pounds)?/i,
  ];
  if (!['bol','pod'].includes(typeId)) patterns.push(/net\s+weight\s*[:#-]?\s*([\dOoIl|,\s]+(?:\.\d+)?)\s*(?:lb|lbs|pounds)?/i);
  return numericMatch(totals, patterns);
}

function extractPieces(raw = '') {
  const totals = regionText(raw, ['TOTALS_ROW','TOTALS_PRINT','TOTALS','TABLE_PRINT','TABLE']) || raw;
  const direct = numericMatch(totals, [
    /total\s+(?:qty|quantity)\s+pieces?\s*[:#-]?\s*([\dOoIl|,\s]+)/i,
    /total\s+pieces?\s*[:#-]?\s*([\dOoIl|,\s]+)/i,
  ]);
  if (direct > 0 && direct < 1_000_000) return direct;

  const table = regionText(raw, ['TABLE_PRINT','TABLE','TOTALS_PRINT','TOTALS']) || raw;
  const joined = lines(table).join(' ');
  const values = [];
  const rowPattern = /(?:package|packages|pkg|pallets?)\s*\d{1,3}\s+(\d{1,5})(?=\s+[\d,]+(?:\.\d+)?\s*(?:lb|lbs)?)/gi;
  let match;
  while ((match = rowPattern.exec(joined))) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0 && value < 100_000) values.push(value);
  }
  const sum = values.reduce((total, value) => total + value, 0);
  return values.length >= 2 && sum > 0 ? sum : 0;
}

function extractCommodity(raw = '') {
  const source = regionText(raw, ['COMMODITY','TABLE_PRINT','TABLE']) || raw;
  const sourceLines = lines(source);
  const skip = /commodit(?:y|ies)\s+requiring|special\s+or\s+additional|ordinary\s+care|ensure\s+safe\s+transportation|section\s+2|nmfc\s+item|lot\s+code|class|total\s+(?:qty|weight)/i;
  for (let index = 0; index < sourceLines.length; index += 1) {
    const line = sourceLines[index];
    if (skip.test(line)) continue;
    if (/\b[A-Z]{2,}(?:-[A-Z0-9]{2,}){1,}\b/.test(line)) {
      const nextLine = sourceLines[index + 1] || '';
      const next = nextLine
        && !skip.test(nextLine)
        && !/\b[A-Z]{2,}(?:-[A-Z0-9]{2,}){1,}\b/.test(nextLine)
        && !/^\d{2}\/\d{2}\/\d{4}/.test(nextLine)
        && !/\b\d{1,3}\s+(?:package|packages|pkg|pallet)/i.test(nextLine)
        ? nextLine
        : '';
      return clean(`${line} ${next}`)
        .replace(/^.*?(?=[A-Z]{2,}(?:-[A-Z0-9]{2,}){1,})/, '')
        .slice(0, 220);
    }
  }
  return '';
}

function timeMatch(text = '', labels = []) {
  const joined = labels.join('|');
  const value = firstMatch(text, [
    new RegExp(`(?:${joined})[^\\n\\d]{0,50}(\\d{1,2}(?::|\\.)\\d{2}\\s*(?:[ap]\\.?m\\.?)?)`, 'i'),
    new RegExp(`(?:${joined})[^\\n\\d]{0,50}(\\d{1,2}\\s*(?:[ap]\\.?m\\.?))`, 'i'),
  ]);
  return value.replace('.', ':').replace(/\s+/g, ' ').trim();
}

export function extractProDocumentFieldsV987(text = '', typeId = 'other') {
  const raw = String(text || '');
  const bolNo = extractBolNumber(raw);
  const poNumber = extractPoNumber(raw);
  const trailerNo = extractTrailer(raw);
  const seal = extractSeal(raw);
  const carrierName = extractCarrier(raw);
  const route = extractRoute(raw);
  const weight = extractWeight(raw, typeId);
  const totalPieces = extractPieces(raw);
  const commodity = extractCommodity(raw);
  const footer = regionText(raw, ['STOP_TIMES','FOOTER']) || raw;
  const checkIn = timeMatch(footer, ['check\\s*in', 'checked\\s*in']);
  const appointmentTime = timeMatch(footer, ['appointment']);
  const checkOut = timeMatch(footer, ['unloaded\\s*&?\\s*signed\\s*out', 'check\\s*out', 'checked\\s*out', 'signed\\s*out']);
  const genericLoadNo = validGenericIdentifier(firstMatch(raw, [
    /(?:load|order|trip|confirmation|pro)\s*(?:number|num8er|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9_-]{3,})/i,
  ]), { min:4, max:24, requireDigit:true });
  const loadNo = ['bol','pod'].includes(typeId) ? bolNo : (genericLoadNo || bolNo || poNumber);

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
    receiver:'',
    invoiceNo:'',
    signed:Boolean(/(?:shipper|carrier|driver|receiver)\s+signature|signed\s+(?:out|by)/i.test(raw)),
  };
}

export const extractProDocumentFields = extractProDocumentFieldsV987;
