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

export function receiptCurrency(pages) {
  const confirmed = new Set(), uncertain = new Set();
  for (const page of pages.flatMap(receiptObservations)) {
    for (const row of sourceLines(page)) {
      const text = String(row.text).slice(0,1000);
      for (const match of text.matchAll(tokenPattern)) {
        if (!tiedToMoney(text, match)) continue;
        const token = match[0].toUpperCase();
        const code = symbols[token] || token;
        const score = currencyWordConfidence(row, page.words, token);
        if (score == null || score >= 75) confirmed.add(code);
        else if (code !== 'USD') uncertain.add(code);
      }
    }
  }
  return {
    currency: confirmed.size === 1 ? [...confirmed][0] : null,
    foreignCurrency: [...confirmed].some(code => code !== 'USD'),
    requiresReview: [...uncertain].some(code => !confirmed.has(code)),
  };
}
