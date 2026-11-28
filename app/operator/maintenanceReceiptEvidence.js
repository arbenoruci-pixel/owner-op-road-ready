// OCR line and word confidence are on Tesseract's 0–100 scale. Native PDF
// text has no confidence score.
export function sourceLines(page) {
  return page.lines?.length ? page.lines.slice(0, 450) : String(page.text || '')
    .split(/\r?\n/).slice(0, 450).map(text => ({text}));
}

export function receiptObservations(page) {
  return [page].concat(page.supplemental || []);
}

export function includesFreightPage(pages) {
  return pages.some(page => {
    const lines = receiptObservations(page).flatMap(sourceLines)
      .filter(row => row.confidence == null || row.confidence >= 50)
      .map(row => String(row.text).slice(0,1000));
    // BOL references occur on legitimate repair invoices. Require a document
    // title plus separate shipping fields on the same page.
    const heading = lines.some(text =>
      /^(?:[^a-z\n]*)(?:straight |uniform |short form )*(?:bill of l?ading|proof of delivery)\b(?!\s*(?:number\b|no\b|#|:))/i.test(text));
    if (!heading) return false;
    const freightFields = [/\bship(?:ped)? from\b/i, /\bship(?:ped)? to\b/i, /\bseal (?:no|number)\b/i,
      /\bfreight class\b|\bcharge terms\b/i, /\bcustomer order information\b/i,
      /\bconsignee\b/i, /\b(?:carrier|shipper)(?:'s)? signature\b/i, /\bbill (?:of|bf) lading (?:no|number)\b/i];
    return freightFields.filter(field => lines.some(text => field.test(text))).length >= 2;
  });
}

const tokenPattern = /\b(?:USD|CAD|EUR|GBP|AUD|MXN|CHF|NZD|JPY|INR|BRL)\b|\b(?:CA|C|US|AU|A|NZ|MX)\$|[€£¥₹]/gi;
const symbols = {'C$':'CAD','CA$':'CAD','US$':'USD','A$':'AUD','AU$':'AUD','NZ$':'NZD','MX$':'MXN','€':'EUR','£':'GBP','¥':'JPY','₹':'INR'};
const currencyWords = /\b(?:currency\s*[:=-]?|(?:amounts?|prices?|charges?|total)\s+(?:are\s+)?in)\s*/i;

function tiedToMoney(text, match) {
  const left = text.slice(0, match.index);
  const right = text.slice(match.index + match[0].length);
  const declared = currencyWords.exec(text);
  if (declared && match.index >= declared.index + declared[0].length) {
    // Allow compound declarations such as "Currency: USD / CAD".
    const between = text.slice(declared.index + declared[0].length, match.index);
    if (!between.replace(tokenPattern, '').replace(/[\s/|,&()-]/g, '')) return true;
  }
  // Currency codes often sit in a summary column heading, e.g. "Total (CAD)".
  if (/\b(?:total|subtotal|amount|price|paid|balance|tax)\s*[([]\s*$/i.test(left) && /^\s*[)\]]/.test(right)) return true;
  const decimal = /^\s*[-(]?\s*\$?\s*\d[\d.,]*[.,]\d{2}(?![\w.,/])/.test(right) ||
    /(?:^|[^\w.,/])[-(]?\s*\$?\s*\d[\d.,]*[.,]\d{2}\)?\s*$/.test(left);
  if (decimal) return true;
  // Whole units are common in yen. A currency sign or an amount label
  // distinguishes whole prices from a part number such as "CAD 1260".
  const priced = /[$€£¥₹]/.test(match[0]) || /\b(?:total|subtotal|price|paid|balance|amount|tax|cost)\b/i.test(text);
  return priced && (/^\s*[-(]?\s*\d+(?![\w.,/])/.test(right) || /(?:^|[^\w.,/])\d+\)?\s*$/.test(left));
}

function currencyWordConfidence(row, pageWords, token) {
  let words = row.words;
  if (!words?.length && Number.isFinite(row.top) && Number.isFinite(row.height) &&
      Number.isFinite(row.left) && Number.isFinite(row.width)) {
    words = pageWords?.filter(word => {
      const x = word.left + word.width / 2;
      const y = word.top + word.height / 2;
      return x >= row.left && x <= row.left + row.width && y >= row.top && y <= row.top + row.height;
    });
  }
  const matches = (words || []).filter(word => String(word.text).toUpperCase().includes(token));
  const scores = matches.map(word => word.confidence).filter(Number.isFinite);
  return scores.length ? Math.min(...scores) : row.confidence;
}

// Only the shop's letterhead can establish the market of an unqualified $.
// In particular, an American bill-to address is common on foreign invoices.
const stateCode = '(?:AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)';
const shopCity = new RegExp(String.raw`\b[A-Z][A-Z.'-]{1,}(?:[ \t]+[A-Z][A-Z.'-]{1,}){0,4},?[ \t]+${stateCode}\b[., ]*(?:\d{5}(?:-\d{4})?\b|(?:\d{0,5}[ (]*)\(\d{3}\)\s*\d{3}[- ]\d{4}\b)`, 'i');
const customerSection = /\b(?:bill(?:ed)? to|sold to|ship(?:ped)? to|remit(?:tance)? to|mail payments to|customer(?: name| address| information)?|company name|driver['’]?s name|cardholder)\b/i;
const tableStart = /\b(?:item description|amount tendered|subtotal|qty\s+price|unit price|balance due)\b/i;

export function hasUSMerchantAddress(page) {
  if (!page) return false;
  return receiptObservations(page).some(read => {
    // A detail crop can begin in the customer's address or in the footer.
    if (read.region && !['page','full-page','sparse','thermal','printed-merchant'].includes(read.region)) return false;
    for (const row of sourceLines(read).slice(0,22)) {
      if (read.imageSize?.height && row.top > read.imageSize.height * .45) break;
      const text = String(row.text || '');
      const boundary = text.search(customerSection);
      const letterhead = boundary < 0 ? text : text.slice(0,boundary);
      if (tableStart.test(letterhead)) break;
      if ((row.confidence == null || row.confidence >= 75) && shopCity.test(letterhead)) return true;
      if (boundary >= 0) break;
    }
    return false;
  });
}

export function receiptCurrency(pages) {
  const confirmed = new Set(), uncertain = new Set(), ambiguous = new Set();
  for (const page of pages.flatMap(receiptObservations)) {
    for (const row of sourceLines(page)) {
      const text = String(row.text).slice(0,1000);
      for (const match of text.matchAll(tokenPattern)) {
        if (!tiedToMoney(text, match)) continue;
        const token = match[0].toUpperCase();
        const code = symbols[token] || token;
        const score = currencyWordConfidence(row, page.words, token);
        if (score == null || score >= 75) confirmed.add(code);
        else if (code !== 'USD') {
          uncertain.add(code);
          // A very faint standalone glyph inside an OCR row that merged
          // several ledger columns has no reliable monetary association.
          const flattened = (text.match(/\d[\d,]*\.\d{2}\b/g) || []).length > 1;
          const columnNoise = score < 50 && flattened && /^[€£¥₹]$/.test(token) && !currencyWords.test(text);
          if (!columnNoise) ambiguous.add(code);
        }
      }
    }
  }
  return {
    currency: confirmed.size === 1 ? [...confirmed][0] : null,
    foreignCurrency: [...confirmed].some(code => code !== 'USD'),
    requiresReview: [...uncertain].some(code => !confirmed.has(code)),
    credibleUncertainty: [...ambiguous].some(code => !confirmed.has(code)),
  };
}
