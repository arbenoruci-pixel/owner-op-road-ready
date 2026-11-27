import {readDocument} from '../../packages/smart-reader-core/src/index.js';

const money = String.raw`(?:\(\s*\$?\s*\d[\d,]*\.\d{2}\s*\)|-?\s*\$?\s*\d[\d,]*\.\d{2}-?)`;
const amountAtEnd = new RegExp('(' + money + ')\\s*(?:USD)?$', 'i');
const quantityValue = /^(?:\d{1,6}(?:\.\d{1,3})?)$/;
const labeledMoney = [
  ['subtotalCents', /^(?:sub[ -]?total|net subtotal)\b/i],
  ['taxCents', /^(?:(?:sales|state|local|total)\s+)?tax\b/i],
  ['paidCents', /^(?:amount paid|total paid|payment received|deposit paid|down payment|paid)\b/i],
  ['balanceDueCents', /^(?:balance(?: due| owed)?|amount due|total due|remaining balance)\b/i],
  ['totalCents', /^(?:(?:invoice|grand|receipt|sale|net)\s+total|total(?:\s+(?:amount|sale|charges))?)\b/i],
];

function cents(token) {
  const clean = token.trim().replace(/[$\s]/g, '');
  const negative = clean.startsWith('(') || clean.startsWith('-') || clean.endsWith('-');
  const value = clean.replace(/^[(-]|[)-]$/g, '');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)\.\d{2}$/.test(value)) return null;
  const number = Number(value.replace(/[,.]/g, ''));
  return Number.isSafeInteger(number) ? (negative ? -number : number) : null;
}

function dateValue(raw) {
  const m = /\b(?:(20\d\d)-(\d{1,2})-(\d{1,2})|(\d{1,2})[/-](\d{1,2})[/-](20\d\d))\b/.exec(raw || '');
  if (!m) return '';
  const date = [m[1] || m[6], (m[2] || m[4]).padStart(2,'0'), (m[3] || m[5]).padStart(2,'0')].join('-');
  const day = new Date(date + 'T12:00:00Z');
  return Number.isFinite(day.valueOf()) && day.toISOString().slice(0,10) === date ? date : '';
}

function onlyValue(values) {
  const unique = [...new Set(values.filter(value => value !== '' && value != null))];
  return unique.length === 1 ? unique[0] : null;
}

const gridHeader = /\b(?:description|item|service|part)\b.*\b(?:qty|quantity|price|amount|extended|extension|total)\b|\b(?:qty|quantity)\b.*\b(?:description|unit price|amount)\b/i;
const ignoreItem = /^(?:invoice|receipt|address|date|phone|odometer|mileage|terms|balance|total|sub[ -]?total|tax|paid|payment|amount (?:due|paid)|check|credit card|card|visa|mastercard|cash|tender|change|deposit|previous balance)\b/i;
function itemFromRow(row, inGrid) {
  const end = amountAtEnd.exec(row);
  if (!end || ignoreItem.test(row)) return null;
  let prefix = row.slice(0, end.index).trim().replace(/[|:]+$/g,'').trim();
  const amountCents = cents(end[1]);
  if (amountCents == null || !/[A-Za-z]/.test(prefix)) return null;
  const previous = amountAtEnd.exec(prefix);
  let unitPriceCents = null, quantity = null;
  if (previous) {
    unitPriceCents = cents(previous[1]);
    prefix = prefix.slice(0, previous.index).replace(/\s*[@×x]\s*$/i,'').trim();
    const qty = /(?:\s|^)(\d+(?:\.\d{1,3})?)$/.exec(prefix) || /^(\d+(?:\.\d{1,3})?)\s+/.exec(prefix);
    if (qty) {
      quantity = quantityValue.test(qty[1]) ? Number(qty[1]) : null;
      prefix = (prefix.slice(0,qty.index) + ' ' + prefix.slice(qty.index + qty[0].length)).trim();
    }
  }
  if (!inGrid && !previous && !/^(?:labor|parts|oil change|service fee|shop (?:supplies|fee)|environmental fee|disposal fee|discount|credit|alignment|tire|filter)\b/i.test(prefix)) return null;
  if (!prefix || /\d\.\d{2}/.test(prefix)) return null;
  return {description:prefix, quantity, unitPriceCents, amountCents};
}

export function parseMaintenanceReceipt(pages) {
  const issues = new Set();
  const records = [];
  let clipped = false;
  for (const [index, page] of pages.entries()) {
    const source = page.lines?.length ? page.lines : (page.text || '').split(/\r?\n/).map(text => ({text}));
    if (source.length > 450 || source.some(row => row.text?.length > 1000)) clipped = true;
    const lines = source.slice(0,450).map(row => ({
      text:String(row.text || '').slice(0,1000).replace(/\s+/g,' ').trim(),
      confidence:Number.isFinite(row.confidence) ? Math.min(1, row.confidence / 100) : null,
    })).filter(row => row.text);
    if (lines.length) records.push({id:'page-' + (page.number || index + 1), observations:[{source:page.source || 'text', lines}]});
  }
  const result = {vendor:'', date:'', unit:'', assetType:'unknown', odometer:null, invoiceNumber:'', description:'', lines:[], subtotalCents:null,
    taxCents:null, totalCents:null, paidCents:null, balanceDueCents:null, printedTotalCents:null,itemizedCents:null,differenceCents:null,currency:null,foreignCurrency:false,partialRead:false,
    multipleInvoices:false, issues:[], pagesRead:records.length};
  if (!records.length) return {...result,issues:['No readable receipt details were found. Enter the details from the original.']};
  const docs = readDocument({documentId:'maintenance-receipt',pages:records}).documents;
  const rows = records.flatMap(page => page.observations[0].lines);
  const reliable = rows.filter(row => row.confidence == null || row.confidence >= .75).map(row => row.text);
  const values = regex => reliable.map(row => regex.exec(row)?.[1]?.trim()).filter(Boolean);
  const field = key => onlyValue(docs.map(doc => doc.fields[key]).filter(f => f?.status === 'supported').map(f => f.value));
  const invoiceIds = [
    ...values(/^(?:(?:repair|service|sales)\s+)?invoice\s*(?:number\b|no\b\.?|id\b|#|:)\s*[:#-]?\s*([A-Z\d][A-Z\d./_-]*)\b/i),
    ...values(/^(?:repair|service|sales)\s+invoice\s+((?=[A-Z\d./_-]*\d)[A-Z\d][A-Z\d./_-]*)\s*$/i),
  ];
  const refs = [...new Set(invoiceIds.map(id => id.toUpperCase()))];
  result.multipleInvoices = refs.length > 1;
  result.invoiceNumber = onlyValue(invoiceIds) || (!refs.length ? field('invoiceNumber') : '') || '';
  result.vendor = onlyValue(values(/^(?:vendor|merchant|shop name|service provider)\s*[:#-]\s*(.+)$/i)) || field('vendor') || field('merchant') || '';
  if (!result.vendor) {
    const header = reliable.slice(0,4).filter(row => /^[\p{L}][\p{L}\d &.'’-]{2,70}$/u.test(row) && /\b(?:repair|truck|tire|auto|service|parts|garage|diesel|motors)\b/i.test(row) && !/\b(?:invoice|receipt|order|date|description|service performed)\b/i.test(row));
    result.vendor = onlyValue(header) || '';
  }
  if (!result.vendor) {
    const header = reliable.slice(0,6).filter(row => row.length <= 78 && !/invoice|receipt|work order|description|date[:#]|amount/i.test(row)
      && /\b(?:LLC|INC\.?|TIRE (?:SHOP|CENTER|CENTRE|SERVICE)|(?:TRUCK|DIESEL|AUTO) (?:SERVICE|REPAIR|CENTER|PARTS)(?: SHOP)?)$/i.test(row));
    result.vendor = onlyValue(header) || '';
  }
  result.unit = onlyValue(values(/^(?:unit|truck|trailer|vehicle)(?:\s*(?:number|no\.?|id|#))?(?:\s*[:#-]\s*|\s+)((?=[A-Z\d-]*\d)[A-Z\d][A-Z\d-]*)\b/i)) || field('unitNumber') || '';
  const seenAsset = reliable.map(row => /^(truck|trailer)(?:\s*(?:number|no\.?|id|#))?(?:\s*[:#-]\s*|\s+)((?=[A-Z\d-]*\d)[A-Z\d][A-Z\d-]*)\b/i.exec(row)).filter(m => m && m[2] === result.unit);
  result.assetType = onlyValue(seenAsset.map(m => m[1].toLowerCase())) || 'unknown';
  result.date = onlyValue(values(/^(?:(?:invoice|service|receipt|transaction)\s+)?date\s*[:#-]?\s*(.+)$/i).map(dateValue)) || dateValue(field('date'));
  const odo = onlyValue(values(/^(?:odometer|mileage)\s*[:#-]?\s*([0-9][0-9,]*)\b/i)) || field('odometer');
  if (odo && /^\d{1,8}$/.test(String(odo).replaceAll(',',''))) result.odometer = Number(String(odo).replaceAll(',',''));
  result.description = onlyValue(values(/^(?:work performed|service performed|repair description|service description)\s*:\s*(.+)$/i)) || '';

  const currencyTokens = new Set();
  for (const row of rows) {
    for (const match of row.text.matchAll(/\b(USD|CAD|EUR|GBP|AUD|MXN|CHF|NZD|JPY|INR|BRL)\b|(?:CA|C|US|AU|A|NZ|MX)\$|[€£¥₹]/gi)) {
      const token = match[0].toUpperCase();
      currencyTokens.add(({ 'C$':'CAD','CA$':'CAD','US$':'USD','A$':'AUD','AU$':'AUD','NZ$':'NZD','MX$':'MXN','€':'EUR','£':'GBP','¥':'JPY','₹':'INR' })[token] || token);
    }
  }
  result.currency = onlyValue([...currencyTokens]);
  result.foreignCurrency = [...currencyTokens].some(code => code !== 'USD');
  if (result.foreignCurrency) issues.add('A foreign or mixed currency appears on this receipt. Check the currency before recording a USD cost.');
  const amounts = new Map(labeledMoney.map(([key]) => [key,[]]));
  let mismatched = false, weakMoney = false;
  for (const page of records) {
    let inGrid = false, afterSubtotal = false;
    for (const row of page.observations[0].lines) {
      if (gridHeader.test(row.text) && !amountAtEnd.test(row.text)) { inGrid = true; afterSubtotal = false; continue; }
      const role = labeledMoney.find(([,pattern]) => pattern.test(row.text));
      if (role) {
        const rest = row.text.replace(role[1],'').trim();
        // A label such as "TOTAL LABOR" is a section summary, not invoice total.
        const value = amountAtEnd.exec(rest);
        if (!value || !/^(?:\s*[:=$|–-]?\s*(?:\d+(?:\.\d+)?\s*%)?\s*[:=$|–-]?\s*)$/.test(rest.slice(0,value.index))) continue;
        if (row.confidence != null && row.confidence < .75) { weakMoney = true; continue; }
        const n = cents(value[1]);
        if (n != null) amounts.get(role[0]).push(n);
        inGrid = false;
        if (role[0] === 'subtotalCents') afterSubtotal = true;
        continue;
      }
      if (afterSubtotal || /^(?:parts|labor|services?)\s+total\b/i.test(row.text)) continue;
      const item = itemFromRow(row.text, inGrid);
      if (!item) continue;
      if (row.confidence != null && row.confidence < .75) { weakMoney = true; continue; }
      if (item.quantity != null && item.unitPriceCents != null && Math.round(item.quantity * item.unitPriceCents) !== item.amountCents) {
        mismatched = true;
        issues.add('A line amount differs from its quantity × unit price. Check the original.');
      }
      result.lines.push(item);
    }
  }
  for (const [key, observed] of amounts) {
    result[key] = onlyValue(observed);
    if (new Set(observed).size > 1) { mismatched = true; issues.add('Different printed amounts share the same label. Confirm the figures on the original.'); }
  }
  const {subtotalCents, taxCents, totalCents, paidCents, balanceDueCents} = result;
  result.printedTotalCents = totalCents;
  if (subtotalCents != null && taxCents != null && totalCents != null && subtotalCents + taxCents !== totalCents) {
    mismatched = true; issues.add('Subtotal plus tax differs from the printed total. Check for fees, discounts or a reading error.');
  }
  if (result.lines.length) {
    const sum = result.lines.reduce((sum,line) => sum + line.amountCents,0);
    result.itemizedCents = sum;
    if (totalCents != null) result.differenceCents = totalCents - (sum + (taxCents ?? 0));
    if (subtotalCents != null ? sum !== subtotalCents : totalCents != null && sum + (taxCents ?? 0) !== totalCents) {
      mismatched = true; issues.add('The itemized amounts do not reconcile to the printed figures. Check for missing or unreadable lines.');
    }
  }
  if (totalCents != null && paidCents != null && balanceDueCents != null && paidCents + balanceDueCents !== totalCents) {
    mismatched = true; issues.add('The payment plus balance differs from the invoice total.');
  }
  if (weakMoney) issues.add('Some printed amounts were too faint to read confidently. Check them on the original.');
  if (clipped) { result.partialRead = true; issues.add('This receipt exceeds the reading limit. Review the full original.'); }
  if (result.multipleInvoices) issues.add('More than one invoice number was found. Attach each invoice separately.');
  if (mismatched || result.multipleInvoices || result.foreignCurrency || weakMoney || clipped) result.totalCents = null;
  if (totalCents == null && !mismatched) issues.add('No single printed invoice total was found. Check the original before entering an amount.');
  result.issues = [...issues];
  return result;
}
