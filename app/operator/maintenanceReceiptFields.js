import {readDocument} from '../../packages/smart-reader-core/src/index.js';
import {maintenanceHeader, printedDate} from './maintenanceReceiptHeader.js';
import {pageMoneyEvidence, moneyRole, splitPrice} from './maintenanceReceiptMoney.js';
import {thermalReceiptPage} from './thermalReceipt.js';
import {maintenanceTableItems} from './maintenanceReceiptItems.js';
import {includesFreightPage, receiptCurrency} from './maintenanceReceiptEvidence.js';

const money = String.raw`(?:\(\s*\$?\s*\d[\d,]*\.\d{2}\s*\)|-?\s*\$?\s*\d[\d,]*\.\d{2}-?)`;
const amountAtEnd = new RegExp('(' + money + ')\\s*(?:USD)?$', 'i');
const quantityValue = /^(?:\d{1,6}(?:\.\d{1,3})?)$/;
const moneyNames = {subtotalCents:'subtotal', taxCents:'tax', totalCents:'invoice total',
  paidCents:'amount paid', balanceDueCents:'balance due'};

function cents(token) {
  const clean = token.trim().replace(/[$\s]/g, '');
  const negative = clean.startsWith('(') || clean.startsWith('-') || clean.endsWith('-');
  const value = clean.replace(/^[(-]|[)-]$/g, '');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)\.\d{2}$/.test(value)) return null;
  const number = Number(value.replace(/[,.]/g, ''));
  return Number.isSafeInteger(number) ? (negative ? -number : number) : null;
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

export function parseMaintenanceReceipt(originalPages) {
  const pages = originalPages.map(thermalReceiptPage);
  const issues = new Set();
  const conflicts = new Set();
  const records = [];
  let clipped = false;
  for (const [index, page] of pages.entries()) {
    const source = page.lines?.length ? page.lines : (page.text || '').split(/\r?\n/).map(text => ({text}));
    const originalReads = [originalPages[index],...(originalPages[index].supplemental || [])];
    if (originalReads.some(read => {
      const rows = read.lines?.length ? read.lines : String(read.text || '').split(/\r?\n/,451).map(text => ({text}));
      return read.words?.length > 4000 || rows.length > 450 || rows.some(row => row.text?.length > 1000);
    })) clipped = true;
    const lines = source.slice(0,450).map(row => ({
      text:String(row.text || '').slice(0,1000).replace(/\s+/g,' ').trim(),
      thermalItem:row.thermalItem,
      confidence:Number.isFinite(row.confidence) ? Math.min(1, row.confidence / 100) : null,
    })).filter(row => row.text);
    if (lines.length) records.push({inputIndex:index,id:'page-' + (page.number || index + 1), observations:[{source:page.source || 'text', lines}]});
  }
  const result = {vendor:'', date:'', unit:'', assetType:'unknown', odometer:null, invoiceNumber:'', description:'', lines:[], subtotalCents:null,
    taxCents:null, totalCents:null, paidCents:null, balanceDueCents:null, printedTotalCents:null,itemizedCents:null,differenceCents:null,currency:null,foreignCurrency:false,partialRead:false,
    multipleInvoices:false, conflictFields:[], issues:[], pagesRead:records.length};
  if (!records.length) return {...result,issues:['No readable receipt details were found. Enter the details from the original.']};
  const rows = records.flatMap(page => page.observations[0].lines);
  const reliable = rows.filter(row => row.confidence == null || row.confidence >= .75).map(row => row.text);
  if (includesFreightPage(originalPages)) return {...result, documentKind:'bill_of_lading',
    issues:['This looks like a freight document. Choose a maintenance receipt or attach this page to its load.']};
  const docs = readDocument({documentId:'maintenance-receipt',pages:records}).documents;
  const values = regex => reliable.map(row => regex.exec(row)?.[1]?.trim()).filter(Boolean);
  const field = key => onlyValue(docs.map(doc => doc.fields[key]).filter(f => f?.status === 'supported').map(f => f.value));
  const header = maintenanceHeader(originalPages);
  const invoiceIds = header.invoiceNumbers;
  result.multipleInvoices = invoiceIds.length > 1 || header.orderReferences.length > 1;
  if (result.multipleInvoices) return {...result,multipleInvoices:true,
    conflictFields:['vendor','date','invoiceNumber','unit','assetType','odometer','description','lines',...Object.keys(moneyNames)],
    issues:['More than one invoice was found. Attach each invoice separately.']};
  if (header.conflictingVendors) conflicts.add('vendor');
  if (header.conflictingDates) conflicts.add('date');
  result.invoiceNumber = onlyValue(invoiceIds) || onlyValue(header.orderReferences) || '';
  result.vendor = header.conflictingVendors ? '' : header.vendor || field('vendor') || field('merchant') || '';
  if (!result.vendor && !header.conflictingVendors) {
    const header = reliable.slice(0,4).filter(row => /^[\p{L}][\p{L}\d &.'’-]{2,70}$/u.test(row) && /\b(?:repair|truck|tire|auto|service|parts|garage|diesel|motors)\b/i.test(row) && !/\b(?:invoice|receipt|order|date|description|service performed)\b/i.test(row));
    result.vendor = onlyValue(header) || '';
  }
  if (!result.vendor && !header.conflictingVendors) {
    const header = reliable.slice(0,6).filter(row => row.length <= 78 && !/invoice|receipt|work order|description|date[:#]|amount/i.test(row)
      && /\b(?:LLC|INC\.?|TIRE (?:SHOP|CENTER|CENTRE|SERVICE)|(?:TRUCK|DIESEL|AUTO) (?:SERVICE|REPAIR|CENTER|PARTS)(?: SHOP)?)$/i.test(row));
    result.vendor = onlyValue(header) || '';
  }
  result.unit = onlyValue(values(/^(?:unit|truck|trailer|vehicle)(?:\s*(?:number|no\.?|id|#))?(?:\s*[:#-]\s*|\s+)((?=[A-Z\d-]*\d)[A-Z\d][A-Z\d-]*)\b/i)) || field('unitNumber') || '';
  const seenAsset = reliable.map(row => /^(truck|trailer)(?:\s*(?:number|no\.?|id|#))?(?:\s*[:#-]\s*|\s+)((?=[A-Z\d-]*\d)[A-Z\d][A-Z\d-]*)\b/i.exec(row)).filter(m => m && m[2] === result.unit);
  result.assetType = onlyValue(seenAsset.map(m => m[1].toLowerCase())) || 'unknown';
  result.date = header.conflictingDates ? '' : header.date || printedDate(field('date') || '');
  const odo = onlyValue(values(/^(?:odometer|mileage)\s*[:#-]?\s*([0-9][0-9,]*)\b/i)) || field('odometer');
  if (odo && /^\d{1,8}$/.test(String(odo).replaceAll(',',''))) result.odometer = Number(String(odo).replaceAll(',',''));
  result.description = onlyValue(values(/^(?:work performed|service performed|repair description|service description)\s*:\s*(.+)$/i)) || '';

  const currency = receiptCurrency(originalPages);
  result.currency = currency.currency;
  result.foreignCurrency = currency.foreignCurrency;
  if (currency.foreignCurrency) issues.add('A foreign or mixed currency appears on this receipt. Check the currency before recording a USD cost.');
  else if (currency.requiresReview) {
    result.partialRead = true;
    issues.add('The currency beside a printed amount is unclear. Verify it on the original before recording a USD cost.');
  }
  const amounts = new Map(Object.keys(moneyNames).map(key => [key,new Set()]));
  const faintRoles = new Set();
  let weakItems = false, inconsistentMoney = false;
  let incompleteTax = false;
  for (const page of records) {
    const firstItem = result.lines.length;
    let inGrid = false, afterSubtotal = false;
    for (const row of page.observations[0].lines) {
      if (gridHeader.test(row.text) && !amountAtEnd.test(row.text)) { inGrid = true; afterSubtotal = false; continue; }
      const price = splitPrice(row.text);
      const role = price && moneyRole(price.label);
      if (role) {
        inGrid = false;
        if (role === 'subtotalCents') afterSubtotal = true;
        continue;
      }
      if (afterSubtotal || /^(?:parts|labor|services?)\s+total\b/i.test(row.text)) continue;
      // A block read often flattens an entire footer. A line that starts
      // with Labor or Parts and also contains a financial summary is not an item.
      if (/\b(?:taxable|non-taxable|amount tendered|change returned|grand total)\b/i.test(row.text) && /\b(?:total|discount|tax)\b/i.test(row.text)) continue;
      const item = itemFromRow(row.text, inGrid || row.thermalItem);
      if (!item) continue;
      if (row.confidence != null && row.confidence < .75) { weakItems = true; continue; }
      if (item.quantity != null && item.unitPriceCents != null && Math.round(item.quantity * item.unitPriceCents) !== item.amountCents) {
        inconsistentMoney = true;
        issues.add('A line amount differs from its quantity × unit price. Check the original.');
      }
      result.lines.push(item);
    }
    const input = pages[page.inputIndex];
    if (!input.thermal && firstItem === result.lines.length) result.lines.push(...maintenanceTableItems(input));
    const evidence = pageMoneyEvidence(originalPages[page.inputIndex]);
    for (const [key,values] of evidence.amounts) for (const value of values) amounts.get(key).add(value);
    for (const key of evidence.faint) faintRoles.add(key);
    if (evidence.taxConflict) conflicts.add('taxCents');
    incompleteTax ||= evidence.taxIncomplete;
  }
  for (const [key,observed] of amounts) {
    if (observed.size > 1) conflicts.add(key);
    if (!conflicts.has(key) && observed.size === 1) result[key] = [...observed][0];
  }
  if (incompleteTax) {
    result.taxCents = null;
    issues.add('Check the tax on the original. At least one printed tax line has no readable amount.');
  }
  for (const key of conflicts) {
    const name = moneyNames[key] || ({vendor:'shop name',date:'service date'})[key];
    if (name) issues.add('The printed '+name+' differs between readings. Confirm it on the original.');
  }
  for (const key of faintRoles) {
    if (result[key] == null && !conflicts.has(key)) issues.add('The printed '+moneyNames[key]+' is too faint to read. Check it on the original.');
  }
  const {subtotalCents, taxCents, totalCents, paidCents, balanceDueCents} = result;
  result.printedTotalCents = totalCents;
  if (pages.some(page => page.thermal) && subtotalCents != null && totalCents != null && taxCents == null && subtotalCents !== totalCents) {
    inconsistentMoney = true;
    issues.add('The printed total differs from the subtotal. Check the receipt for taxes or other charges.');
  }
  if (subtotalCents != null && taxCents != null && totalCents != null && subtotalCents + taxCents !== totalCents) {
    inconsistentMoney = true;
    issues.add('Subtotal plus tax differs from the printed total. Check for fees, discounts or a reading error.');
  }
  if (result.lines.length) {
    const sum = result.lines.reduce((sum,line) => sum + line.amountCents,0);
    result.itemizedCents = sum;
    if (totalCents != null && !incompleteTax && !conflicts.has('taxCents')) result.differenceCents = totalCents - (sum + (taxCents ?? 0));
    if (subtotalCents != null ? sum !== subtotalCents : totalCents != null && sum + (taxCents ?? 0) !== totalCents) {
      inconsistentMoney = true;
      issues.add('The itemized amounts do not reconcile to the printed figures. Check for missing or unreadable lines.');
    }
  }
  // A tilted ledger can place the neighboring invoice total under a tax label.
  // With a positive parts subtotal that reading cannot reconcile as tax.
  if (totalCents > 0 && taxCents === totalCents && (subtotalCents ?? result.itemizedCents) > 0) {
    result.taxCents = null;
    result.differenceCents = null;
    conflicts.add('taxCents');
    inconsistentMoney = true;
    issues.add('Verify the tax on the original. The scan read the invoice total in the tax column.');
  }
  if (totalCents != null && paidCents != null && balanceDueCents != null && paidCents + balanceDueCents !== totalCents) {
    inconsistentMoney = true;
    issues.add('The payment plus balance differs from the invoice total.');
  }
  if (weakItems) issues.add('Some item prices were too faint to read. Check the line items on the original.');
  if (clipped) { result.partialRead = true; issues.add('This receipt exceeds the reading limit. Review the full original.'); }
  const unresolvedMoney = [...faintRoles].some(key => result[key] == null) ||
    [...conflicts].some(key => key in moneyNames);
  if (result.foreignCurrency || result.partialRead || inconsistentMoney || incompleteTax || weakItems || unresolvedMoney) result.totalCents = null;
  if (totalCents == null && !conflicts.has('totalCents') && !faintRoles.has('totalCents')) issues.add('No single printed invoice total was found. Check the original before entering an amount.');
  result.conflictFields = [...conflicts];
  result.issues = [...issues];
  return result;
}
