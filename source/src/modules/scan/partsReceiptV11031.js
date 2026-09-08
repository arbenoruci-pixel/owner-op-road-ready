const clean = value => String(value || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
const line = value => String(value || '').replace(/^[\s:#|\-–—]+|[\s|]+$/g, '').replace(/\s{2,}/g, ' ').trim();
const number = value => {
  const n = Number(String(value ?? '').replace(/[OoQqDd]/g, '0').replace(/[Il|!]/g, '1').replace(/[$,\s]/g, '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const money = value => Math.round(number(value) * 100) / 100;
const MONTHS = Object.freeze({JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,SEPT:9,OCT:10,NOV:11,DEC:12});

function normalizeCounterDate(value = '') {
  const raw = line(value).toUpperCase();
  const named = raw.match(/\b(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)[A-Z]*\s+(\d{2}|\d{4})\b/);
  if (named) {
    const year = Number(named[3]) < 100 ? 2000 + Number(named[3]) : Number(named[3]);
    return `${String(MONTHS[named[2]]).padStart(2,'0')}/${String(Number(named[1])).padStart(2,'0')}/${year}`;
  }
  const numeric = raw.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})\b/);
  if (numeric) {
    const year = Number(numeric[3]) < 100 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
    return `${String(Number(numeric[1])).padStart(2,'0')}/${String(Number(numeric[2])).padStart(2,'0')}/${year}`;
  }
  return '';
}

function first(text, patterns = [], group = 1) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[group]) return line(match[group]);
  }
  return '';
}

function lastMoneyOnLine(text, labelPattern) {
  const lines = String(text || '').split('\n').map(line).filter(Boolean);
  for (const row of lines) {
    if (!labelPattern.test(row)) continue;
    labelPattern.lastIndex = 0;
    const values = [...row.matchAll(/\$?\s*([0-9OoQqDdIl|!][0-9OoQqDdIl|!,]*\.\d{2})\b/g)].map(match => money(match[1])).filter(value => value >= 0);
    if (values.length) return values.at(-1);
  }
  return 0;
}

function merchantFromPartsReceipt(text, fallback = '') {
  const lines = String(text || '').split('\n').map(line).filter(Boolean);
  const strong = lines.find(row =>
    /\b(?:truck\s+cent(?:er|ers)|truck\s+parts|fleetpride|truckpro|napa|mack|volvo|freightliner|kenworth|peterbilt|international|western\s+star)\b/i.test(row)
    && !/part\s*n[o0]|description|customer\s+copy|return(?:ed)?\s+goods|sales\s+tax|total/i.test(row)
    && row.length <= 90
  );
  if (strong) return strong;
  const generic = lines.find(row => row.length >= 3 && row.length <= 80 && /[A-Za-z]{3}/.test(row) && !/invoice|receipt|date|account|terms|part\s*n[o0]|description|list|net|amount|customer\s+copy|sales\s+tax|total/i.test(row));
  return generic || fallback || '';
}

function partRow(text) {
  const headerIndex = String(text || '').search(/\bpart\s*n[o0]\.?\b/i);
  const scope = headerIndex >= 0 ? String(text || '').slice(headerIndex, headerIndex + 800) : String(text || '');
  const rows = scope.split('\n').map(line).filter(Boolean);
  for (const row of rows) {
    if (/part\s*n[o0]|description|list\s+net\s+amount/i.test(row)) continue;
    const match = row.match(/(?:^|\s)([A-Z0-9][A-Z0-9._/-]{5,22})\s+(.+?)\s+\$?\d[\d,]*\.\d{2}(?:\s+\$?\d[\d,]*\.\d{2}){1,3}\s*$/i);
    if (!match) continue;
    const partNumber = line(match[1]);
    const description = line(match[2]).replace(/^\d+\s+/, '');
    if (/\d/.test(partNumber) && description.length >= 2) return { partNumber, partDescription:description };
  }
  const loose = scope.match(/\b([A-Z0-9][A-Z0-9._/-]{5,22})\b\s+([A-Z0-9][A-Z0-9 ._&/()-]{2,70}?)\s+\$?\d[\d,]*\.\d{2}/i);
  return loose && /\d/.test(loose[1]) ? { partNumber:line(loose[1]), partDescription:line(loose[2]).replace(/^\d+\s+/, '') } : { partNumber:'', partDescription:'' };
}

export function scorePartsReceiptStructureV11031(value = '') {
  const text = clean(value);
  const evidence = [];
  let score = 0;
  const add = (pattern, weight, name) => { if (pattern.test(text)) { score += weight; evidence.push(name); } };
  add(/\bpart\s*(?:n[o0]\.?|number|#)\b/i, 62, 'part-number column');
  add(/\bdescription\b[\s\S]{0,180}\b(?:list|net)\b[\s\S]{0,120}\bamount\b/i, 40, 'parts price table');
  add(/\bpaid\s+c[o0]unter\b/i, 52, 'paid counter');
  add(/\bparts?\b[\s\S]{0,140}\bsales\s+tax\b[\s\S]{0,140}\btotal\b/i, 36, 'parts tax total');
  add(/\bcustomer\s+copy\b/i, 18, 'customer copy');
  add(/\binvoice\s*(?:number|no\.?|#)\b/i, 16, 'invoice number');
  add(/\bterms?\b[\s\S]{0,30}\bcash\b/i, 10, 'cash terms');
  add(/returned\s+goods|no\s+cash\s+refunds?|electrical\s+items?.{0,80}non[- ]?returnable/i, 14, 'parts return policy');
  const penalties = [];
  const subtract = (pattern, weight, name) => { if (pattern.test(text)) { score -= weight; penalties.push(name); } };
  subtract(/repair\s+(?:order|invoice)|work\s+order/i, 58, 'repair order');
  subtract(/\blabor\b|technician|service\s+advisor|work\s+performed|complaint\s*:|cause\s*:|correction\s*:/i, 42, 'repair labor/work');
  return { score, strong:score >= 90, evidence, penalties };
}

export function extractPartsReceiptFieldsV11031(value = '', baseFields = {}) {
  const text = clean(value);
  const structure = scorePartsReceiptStructureV11031(text);
  const row = partRow(text);
  const invoiceNo = first(text, [
    /invoice\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{2,30})/i,
    /invoice\s+date[^\n]{0,80}invoice\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{2,30})/i,
  ]);
  const dateRaw = first(text, [
    /invoice\s+date\s*[:#-]?\s*((?:\d{1,2}[\/-]\d{1,2}[\/-](?:\d{2}|\d{4}))|(?:\d{1,2}\s+[A-Z]{3,9}\s+(?:\d{2}|\d{4})))/i,
    /date\s+(?:entered|shipped)\s*[:#-]?\s*((?:\d{1,2}[\/-]\d{1,2}[\/-](?:\d{2}|\d{4}))|(?:\d{1,2}\s+[A-Z]{3,9}\s+(?:\d{2}|\d{4})))/i,
    /\b(\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)[A-Z]*\s+(?:\d{2}|\d{4}))\b/i,
  ]);
  const total = lastMoneyOnLine(text, /^\s*total\b/i) || Number(baseFields.total || 0);
  const parts = lastMoneyOnLine(text, /^\s*parts?\b/i) || Number(baseFields.parts || 0);
  const salesTax = lastMoneyOnLine(text, /^\s*sales\s+tax\b/i) || Number(baseFields.salesTax || 0);
  const freight = lastMoneyOnLine(text, /^\s*freight\b/i) || Number(baseFields.freight || 0);
  const accountNumber = first(text, [/(?:account|acct)\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9._/-]{2,30})/i]);
  const paymentMethod = /\bterms?\b[^\n]{0,35}\bcash\b/i.test(text) || /(?:sold|ship)\s+to\s+cash/i.test(text) ? 'Cash' : (baseFields.paymentMethod || '');
  return {
    ...baseFields,
    documentSubtype:'parts_counter_receipt',
    receiptCategory:'Truck Parts / Parts Counter',
    merchant:merchantFromPartsReceipt(text, baseFields.merchant),
    invoiceNo:invoiceNo || baseFields.invoiceNo || '',
    date:normalizeCounterDate(dateRaw) || baseFields.date || '',
    total:total || baseFields.total || 0,
    parts:parts || baseFields.parts || 0,
    salesTax:salesTax || baseFields.salesTax || 0,
    freight:freight || baseFields.freight || 0,
    accountNumber:accountNumber || baseFields.accountNumber || '',
    paymentMethod,
    partNumber:row.partNumber || baseFields.partNumber || '',
    partDescription:row.partDescription || baseFields.partDescription || '',
    partsReceiptStructureV11031:structure,
  };
}
