const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS',
  'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV',
  'WI','WY','DC',
]);

const LABEL_NOISE = /\b(?:bill\s+of\s+lading|not\s+negotiable|page\s+\d|ship\s+from|ship\s+to|customer\s+p\.?\s*o\.?|carrier\s+name|seal|trailer|third\s+party|freight\s+charges|delivery\s+instructions|account|handling\s+unit|commodity\s+description|total\s+(?:qty|weight|units|pieces))\b/i;

function clean(value = '') {
  return String(value || '')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/[|¦]/g, 'I')
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\\+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textOf(result) {
  return clean(result?.text || result || '');
}

function linesOf(result) {
  const structured = Array.isArray(result?.lines)
    ? result.lines.filter(line => Number(line?.confidence ?? 100) >= 18).map(line => clean(line?.text || '')).filter(Boolean)
    : [];
  if (structured.length) return structured;
  return String(result?.text || result || '').split(/\r?\n/).map(clean).filter(Boolean);
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

function normalizeNumber(value = '') {
  const normalized = String(value || '')
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/\s+/g, '')
    .replace(/,/g, '')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeBol(value = '') {
  let compact = String(value || '')
    .toUpperCase()
    .replace(/\b(?:BOL|BL|NO|NUMBER|NUM8ER)\b/g, '')
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/^-+|-+$/g, '');
  if (!compact) return '';
  const firstDigit = compact.search(/\d/);
  if (firstDigit <= 0) return '';
  const prefix = compact.slice(0, firstDigit).replace(/[^A-Z]/g, '');
  let suffix = compact.slice(firstDigit)
    .replace(/[OQD]/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/Z/g, '2')
    .replace(/S/g, '5')
    .replace(/G/g, '6')
    .replace(/B/g, '8');
  suffix = suffix.replace(/[^0-9-]/g, '').replace(/^-+|-+$/g, '');
  const digits = suffix.replace(/-/g, '');
  if (prefix.length < 1 || prefix.length > 5 || digits.length < 3 || digits.length > 14) return '';
  const candidate = `${prefix}${suffix}`;
  if (candidate.length < 4 || candidate.length > 20) return '';
  return candidate;
}

function scoreWinner(candidates = []) {
  const grouped = new Map();
  for (const candidate of candidates) {
    if (!candidate?.value) continue;
    const current = grouped.get(candidate.value) || { value:candidate.value, score:0, count:0 };
    current.score += Number(candidate.score || 0);
    current.count += 1;
    grouped.set(candidate.value, current);
  }
  return [...grouped.values()]
    .map(item => ({ ...item, score:item.score + Math.min(15, Math.max(0, item.count - 1) * 5) }))
    .sort((a, b) => b.score - a.score || b.count - a.count || b.value.length - a.value.length)[0] || null;
}

function bolCandidates(value = '', score = 0) {
  const source = String(value || '');
  const output = [];
  const labeled = [
    /bill\s+of\s+lading\s*(?:number|num8er|no\.?|#)?\s*[:#-]?\s*([A-Z]{1,5}\s*[- ]?\s*[A-Z0-9-]{3,18})/gi,
    /\b(?:BOL|B\/L)\s*(?:number|num8er|no\.?|#)?\s*[:#-]?\s*([A-Z]{1,5}\s*[- ]?\s*[A-Z0-9-]{3,18})/gi,
  ];
  for (const pattern of labeled) {
    let match;
    while ((match = pattern.exec(source))) {
      const candidate = normalizeBol(match[1]);
      if (candidate) output.push({ value:candidate, score:score + 30 });
    }
  }
  const tokenPattern = /\b[A-Z]{1,5}\s*[- ]?\s*[A-Z0-9]{3,14}\b/gi;
  let token;
  while ((token = tokenPattern.exec(source))) {
    const candidate = normalizeBol(token[0]);
    if (candidate) output.push({ value:candidate, score:score + 12 });
  }
  return output;
}

function extractBol(fieldResults = {}, raw = '', barcodes = []) {
  const candidates = [];
  candidates.push(...bolCandidates(textOf(fieldResults.BOL_VALUE), 35));
  candidates.push(...bolCandidates(textOf(fieldResults.BOL_BAR_TEXT), 38));
  candidates.push(...bolCandidates(textOf(fieldResults.HEADER_RIGHT), 22));
  candidates.push(...bolCandidates(raw, 3));
  for (const barcode of barcodes || []) {
    const value = normalizeBol(barcode);
    if (value) candidates.push({ value, score:55 });
  }
  return scoreWinner(candidates)?.value || '';
}

function digitRuns(value = '', min = 1, max = 20) {
  const output = [];
  const direct = String(value || '').match(/\d+/g) || [];
  for (const run of direct) if (run.length >= min && run.length <= max) output.push(run);
  const normalized = normalizeDigits(value);
  if (normalized.length >= min && normalized.length <= max && !output.includes(normalized)) output.push(normalized);
  return output;
}

function extractPo(fieldResults = {}, raw = '') {
  const candidates = [];
  for (const run of digitRuns(textOf(fieldResults.CUSTOMER_PO), 7, 16)) candidates.push({ value:run, score:45 + Math.min(8, run.length - 7) });
  const labeled = firstMatch(raw, [
    /customer\s+p\.?\s*o\.?\s*(?:number|num8er|no\.?|#)?\s*[:#-]?\s*([^\n]{3,40})/i,
    /purchase\s+order\s*(?:number|num8er|no\.?|#)?\s*[:#-]?\s*([^\n]{3,40})/i,
  ]);
  for (const run of digitRuns(labeled, 7, 16)) candidates.push({ value:run, score:20 });
  return scoreWinner(candidates)?.value || '';
}

function extractSeal(fieldResults = {}, raw = '') {
  const candidates = [];
  for (const run of digitRuns(textOf(fieldResults.SEAL), 4, 10)) candidates.push({ value:run, score:42 });
  const labeled = firstMatch(raw, [/seal\s*(?:number|num8er|no\.?|#)?\s*[:#-]?\s*([^\n]{2,24})/i]);
  for (const run of digitRuns(labeled, 4, 10)) candidates.push({ value:run, score:16 });
  return scoreWinner(candidates)?.value || '';
}

function extractTrailer(fieldResults = {}, raw = '') {
  const source = `${textOf(fieldResults.TRAILER)}\n${firstMatch(raw, [/trailer\s*(?:number|num8er|no\.?|#)?\s*[:#-]?\s*([^\n]{2,24})/i])}`;
  const candidates = [];
  for (const token of source.match(/[A-Z0-9-]{3,18}/gi) || []) {
    const value = token.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (!/\d/.test(value) || /^(?:TRAILER|NUMBER|OPTIONAL|LOADES?)$/i.test(value)) continue;
    candidates.push({ value, score:20 });
  }
  return scoreWinner(candidates)?.value || '';
}

function cityStateZip(value = '') {
  const source = clean(value).replace(/\bUnited States\b/i, '').trim();
  const match = source.match(/([A-Za-z][A-Za-z .'-]{1,45})[ ,]+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/i);
  if (!match) return null;
  const state = match[2].toUpperCase();
  if (!US_STATES.has(state)) return null;
  return { city:clean(match[1]), state, zip:match[3], text:`${clean(match[1])}, ${state}` };
}

function companyFromText(value = '') {
  const tokens = clean(value).split(/\s+/).filter(Boolean);
  const suffixes = /^(?:inc\.?|llc|ltd\.?|corp\.?|company|co\.?|dc|distribution|warehouse|logistics)$/i;
  let best = '';
  tokens.forEach((token, index) => {
    if (!suffixes.test(token)) return;
    let start = Math.max(0, index - 7);
    let selected = tokens.slice(start, index + 1);
    while (selected.length && (/^[A-Z]$/i.test(selected[0]) || /^(?:page|of|the|a|an|ss|heirs)$/i.test(selected[0]) || /^\d+$/.test(selected[0]))) selected.shift();
    const candidate = clean(selected.join(' ').replace(/^[^A-Za-z]+/, ''));
    const words = candidate.match(/[A-Za-z]{2,}/g) || [];
    if (words.length >= 2 && candidate.length <= 70 && candidate.length > best.length) best = candidate;
  });
  return best;
}

function streetFromText(value = '') {
  const source = clean(value);
  const match = source.match(/\b(\d{1,6}\s+[A-Za-z0-9][A-Za-z0-9 .'-]{2,48}?)(?=\s+[A-Za-z][A-Za-z .'-]{2,35}[ ,]+[A-Z]{2}\s+\d{5}|\s+United\s+States|$)/i);
  if (!match) return '';
  return clean(match[1]).replace(/[,:;]+$/, '');
}

function addressPieces(result) {
  const originalLines = linesOf(result);
  const joined = clean(originalLines.join(' , '));
  const expanded = joined
    .replace(/\s+(?=\d{1,6}\s+[A-Za-z0-9])/g, ' | ')
    .replace(/\s+(?=[A-Za-z][A-Za-z .'-]{2,35}[ ,]+[A-Z]{2}\s+\d{5})/g, ' | ')
    .replace(/\s+(?=United\s+States)/gi, ' | ');
  const segments = [...originalLines, ...expanded.split(/\s*[|,;]\s*/g)].map(clean).filter(Boolean);
  const company = companyFromText(joined) || segments.map(companyFromText).find(Boolean) || '';
  const street = streetFromText(joined) || segments.map(streetFromText).find(Boolean) || '';
  const city = cityStateZip(joined) || segments.map(cityStateZip).find(Boolean) || null;
  const country = /\bUnited States\b/i.test(joined) ? 'United States' : '';
  const fallback = segments.find(segment => {
    if (LABEL_NOISE.test(segment) || segment.length < 4 || segment.length > 65) return false;
    if (/^[A-Z]{1,2}$/.test(segment) || /^\d+$/.test(segment)) return false;
    const letters = (segment.match(/[A-Za-z]/g) || []).length;
    const punctuation = (segment.match(/[^A-Za-z0-9 .'-]/g) || []).length;
    return letters >= 5 && punctuation / Math.max(1, segment.length) < .14;
  }) || '';

  const valid = Boolean((company && (street || city)) || (street && city));
  if (!valid) return { details:'', cityState:'', confidence:0 };
  const parts = [company || fallback, street, city ? `${city.city}, ${city.state} ${city.zip}` : '', country].filter(Boolean);
  const details = [...new Set(parts.map(clean))].join(', ');
  const confidence = [company, street, city, country].filter(Boolean).length / 4;
  return { details, cityState:city?.text || '', confidence };
}

function extractWeight(fieldResults = {}, raw = '') {
  const candidates = [];
  const focused = textOf(fieldResults.WEIGHT);
  const focusedMatches = focused.match(/\d{3,6}(?:[,.]\d{1,2})?/g) || [];
  for (const match of focusedMatches) {
    const value = normalizeNumber(match.replace(',', '.'));
    if (value >= 100 && value <= 200000) candidates.push({ value:String(value), score:match.includes('.') || match.includes(',') ? 45 : 30 });
  }
  const labeled = firstMatch(raw, [
    /total\s+weight\s*[:#-]?\s*([\dOoIl|, .]+)\s*(?:lb|lbs|pounds)?/i,
    /total\s+wt\.?\s*[:#-]?\s*([\dOoIl|, .]+)\s*(?:lb|lbs|pounds)?/i,
  ]);
  const labeledValue = normalizeNumber(labeled);
  if (labeledValue >= 100 && labeledValue <= 200000) candidates.push({ value:String(labeledValue), score:25 });
  const winner = scoreWinner(candidates);
  return winner ? Number(winner.value) : 0;
}

function extractPieces(fieldResults = {}, raw = '') {
  const candidates = [];
  const focused = textOf(fieldResults.PIECES);
  for (const run of digitRuns(focused, 1, 6)) {
    const value = Number(run);
    if (value >= 1 && value <= 1000000) candidates.push({ value:String(value), score:value >= 10 ? 42 : 20 });
  }
  const labeled = firstMatch(raw, [
    /total\s+(?:qty|quantity)\s+pieces?\s*[:#-]?\s*([\dOoIl|, ]+)/i,
    /total\s+pieces?\s*[:#-]?\s*([\dOoIl|, ]+)/i,
  ]);
  const labeledValue = Number(normalizeDigits(labeled));
  if (labeledValue > 0 && labeledValue <= 1000000) candidates.push({ value:String(labeledValue), score:28 });
  const winner = scoreWinner(candidates);
  return winner ? Number(winner.value) : 0;
}

function extractDate(fieldResults = {}, raw = '') {
  const source = `${textOf(fieldResults.DATE)}\n${raw}`;
  return firstMatch(source, [
    /\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})\b/,
    /\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2})\b/,
  ]);
}

function extractCommodity(fieldResults = {}, raw = '') {
  const source = `${textOf(fieldResults.COMMODITY)}\n${raw}`;
  const sourceLines = String(source).split(/\r?\n/).map(clean).filter(Boolean);
  const skip = /commodit(?:y|ies)\s+requiring|special\s+or\s+additional|ordinary\s+care|ensure\s+safe\s+transportation|section\s+2|nmfc\s+item|lot\s+code|class|total\s+(?:qty|weight)/i;
  for (let index = 0; index < sourceLines.length; index += 1) {
    const line = sourceLines[index];
    if (skip.test(line)) continue;
    const code = line.match(/\b[A-Z]{2,}(?:-[A-Z0-9]{2,}){1,}\b/);
    if (!code) continue;
    const next = sourceLines[index + 1] && !skip.test(sourceLines[index + 1]) ? sourceLines[index + 1] : '';
    return clean(`${line} ${next}`).replace(/^.*?(?=[A-Z]{2,}(?:-[A-Z0-9]{2,}){1,})/, '').slice(0, 220);
  }
  return '';
}

function extractTime(source = '', labelPattern) {
  const match = String(source || '').match(new RegExp(`${labelPattern}[^\\n\\d]{0,55}(\\d{1,2}(?::|\\.)\\d{2}\\s*(?:[ap]\\.?m\\.?)?|\\d{1,2}\\s*(?:[ap]\\.?m\\.?))`, 'i'));
  return clean(match?.[1] || '').replace('.', ':');
}

function confidenceValue(result, valid, bonus = 0) {
  if (!valid) return 0;
  const base = Math.max(0, Math.min(1, Number(result?.confidence || 0)));
  return Math.max(.55, Math.min(.99, base + bonus));
}

export function extractProDocumentFieldsV989(text = '', typeId = 'other', fieldResults = {}, barcodes = []) {
  const raw = String(text || '');
  const bolNo = extractBol(fieldResults, raw, barcodes);
  const poNumber = extractPo(fieldResults, raw);
  const seal = extractSeal(fieldResults, raw);
  const trailerNo = extractTrailer(fieldResults, raw);
  const from = addressPieces(fieldResults.SHIP_FROM);
  const to = addressPieces(fieldResults.SHIP_TO);
  const weight = extractWeight(fieldResults, raw);
  const totalPieces = extractPieces(fieldResults, raw);
  const commodity = extractCommodity(fieldResults, raw);
  const stopText = `${textOf(fieldResults.STOP_TIMES)}\n${raw}`;
  const date = extractDate(fieldResults, raw);
  const checkIn = extractTime(stopText, 'check\\s*in(?:\\s*\\(guard\\))?');
  const appointmentTime = extractTime(stopText, 'appointment(?:\\s*time)?');
  const checkOut = extractTime(stopText, '(?:unloaded\\s*&?\\s*signed\\s*out|check\\s*out|signed\\s*out)');
  const carrierName = firstMatch(textOf(fieldResults.HEADER_RIGHT) || raw, [/carrier\s+name\s*[:#-]?\s*([^\n]{3,70})/i])
    .replace(/\b(?:seal|trailer)\b.*$/i, '').trim();
  const loadNo = ['bol','pod'].includes(typeId) ? bolNo : bolNo || poNumber;

  const fieldConfidence = {
    date:confidenceValue(fieldResults.DATE, date, .08),
    loadNo:Math.max(confidenceValue(fieldResults.BOL_VALUE, bolNo, .12), confidenceValue(fieldResults.BOL_BAR_TEXT, bolNo, .14), bolNo && (barcodes || []).some(value => normalizeBol(value) === bolNo) ? .99 : 0),
    poNumber:confidenceValue(fieldResults.CUSTOMER_PO, poNumber, .12),
    seal:confidenceValue(fieldResults.SEAL, seal, .02),
    origin:from.confidence,
    destination:to.confidence,
    weight:confidenceValue(fieldResults.WEIGHT, weight, .12),
    totalPieces:confidenceValue(fieldResults.PIECES, totalPieces, .10),
    commodity:confidenceValue(fieldResults.COMMODITY, commodity, .02),
    checkIn:confidenceValue(fieldResults.STOP_TIMES, checkIn),
    appointmentTime:confidenceValue(fieldResults.STOP_TIMES, appointmentTime),
    checkOut:confidenceValue(fieldResults.STOP_TIMES, checkOut),
  };

  return {
    date,
    loadNo,
    bolNo,
    poNumber,
    trailerNo,
    seal,
    carrierName:/^(?:name|optional|carrier)$/i.test(carrierName) ? '' : carrierName,
    origin:from.cityState,
    destination:to.cityState,
    shipFromDetails:from.details,
    shipToDetails:to.details,
    weight,
    totalPieces,
    commodity,
    checkIn,
    appointmentTime,
    checkOut,
    receiver:'',
    invoiceNo:'',
    signed:Boolean(/(?:shipper|carrier|driver|receiver)\s+signature|signed\s+(?:out|by)/i.test(raw)),
    fieldConfidence,
  };
}

export const extractProDocumentFields = extractProDocumentFieldsV989;
