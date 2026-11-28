import {parseUSDCents} from '../../lib/rr-lease/intake-contract.js';

const moneyText = value => Number.isSafeInteger(value) ? (value / 100).toFixed(2) : '';
const fmt = value => new Intl.NumberFormat('en-US', {style:'currency', currency:'USD'}).format(value / 100);

export function localServiceDate(now = new Date()) {
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('-');
}

export function newReceiptLine(line = {}) {
  return {key:crypto.randomUUID(), description:line.description || '', quantity:line.quantity?.toString() ?? '',
    unitPrice:moneyText(line.unitPriceCents), amount:moneyText(line.amountCents)};
}

export function maintenanceDraft(receipt, hasOriginal = false) {
  const foreign = Boolean(receipt?.foreignCurrency);
  const usdField = value => foreign ? '' : moneyText(value);
  const assetType = ['truck','trailer'].includes(receipt?.assetType) ? receipt.assetType : (/^(truck|trailer)\b/i.exec(receipt?.unit || '')?.[1].toLowerCase() || 'unknown');
  return {
    documentKind:receipt?.documentKind || null,
    assetType, category:'PM', date:receipt?.date || (hasOriginal ? '' : localServiceDate()), unit:receipt?.unit || '',
    description:receipt?.description || (receipt?.lines?.length === 1 ? receipt.lines[0].description : '') || '',
    odometer:receipt?.odometer?.toString() ?? '',
    nextOdometer:'', nextDate:'', vendor:receipt?.vendor || '', invoiceNumber:receipt?.invoiceNumber || '',
    mode:foreign ? 'service_only' : (receipt?.lines?.length ? 'itemized' : 'total_only'), lines:foreign ? [] : (receipt?.lines || []).map(newReceiptLine),
    subtotal:usdField(receipt?.subtotalCents), tax:usdField(receipt?.taxCents), amount:usdField(receipt?.printedTotalCents ?? receipt?.totalCents),
    payer:'unknown', paid:usdField(receipt?.paidCents), balance:usdField(receipt?.balanceDueCents), totalConfirmed:false,
    issues:receipt?.issues || [], multipleInvoices:Boolean(receipt?.multipleInvoices), foreignCurrency:receipt?.foreignCurrency ? (receipt.currency || 'foreign currency') : '',
    requiresSourceCheck:Boolean(receipt?.partialRead || (receipt && receipt.totalCents == null && (receipt.printedTotalCents != null || receipt.issues?.length)))
  };
}

function amount(text, label, signed = false) {
  if (!text.trim()) return null;
  try {
    const cents = parseUSDCents(text);
    if (signed || cents >= 0) return cents;
  } catch {}
  throw Error('Check the dollar amount for ' + label + '.');
}

function receiptLine(line, index) {
  const title = 'line ' + (index + 1);
  const description = line.description.trim();
  if (!description) throw Error('Enter a description for ' + title + '.');
  const q = line.quantity.trim();
  if (q && (!/^\d{1,6}(?:\.\d{1,3})?$/.test(q) || Number(q) <= 0)) throw Error('Check the quantity for ' + title + '.');
  const quantity = q ? Number(q) : null;
  const unitPriceCents = amount(line.unitPrice, title + ' unit price', true);
  const amountCents = amount(line.amount, title + ' total', true);
  if (amountCents === null) throw Error('Enter the printed amount for ' + title + '.');
  if (quantity !== null && unitPriceCents !== null) {
    const thousandths = Math.round(quantity * 1000);
    const expected = Number((BigInt(thousandths) * BigInt(Math.abs(unitPriceCents)) + 500n) / 1000n) * Math.sign(unitPriceCents);
    if (expected !== amountCents)
      throw Error('Quantity × unit price differs from the total for ' + description + '.');
  }
  return {description, quantity, unitPriceCents, amountCents};
}

export function reviewMaintenance(draft) {
  try {
    if (draft.documentKind === 'bill_of_lading') throw Error('Choose a maintenance receipt to record a service.');
    if (draft.foreignCurrency && draft.mode !== 'service_only') throw Error('This receipt is in '+draft.foreignCurrency+'. Choose an original showing the USD charges.');
    if (draft.multipleInvoices) throw Error('Choose one invoice per service record.');
    const serviceOnly = draft.mode === 'service_only', itemized = draft.mode === 'itemized';
    const details = {
      mode:draft.mode, assetType:draft.assetType, invoiceNumber:draft.invoiceNumber.trim() || null, payer:serviceOnly ? 'unknown' : draft.payer,
      paidCents:serviceOnly ? null : amount(draft.paid, 'amount paid'), balanceDueCents:serviceOnly ? null : amount(draft.balance, 'balance due'),
      subtotalCents:itemized ? amount(draft.subtotal, 'printed subtotal') : null,
      taxCents:itemized ? amount(draft.tax, 'tax') : null, totalCents:serviceOnly ? null : amount(draft.amount, 'invoice total'),
      totalConfirmed:!serviceOnly && draft.totalConfirmed, lines:itemized ? draft.lines.map(receiptLine) : []
    };
    if (serviceOnly) return {details};
    if (itemized && !details.lines.length) throw Error('Add the printed parts or service lines.');
    if (details.totalCents === null) throw Error('Enter the printed invoice total.');
    if (itemized) {
      const sum = details.lines.reduce((n, line) => n + line.amountCents, 0);
      if (details.subtotalCents !== null && sum !== details.subtotalCents)
        throw Error('Line amounts differ from the printed subtotal by ' + fmt(Math.abs(sum-details.subtotalCents)) + '.');
      const calculated = sum + (details.taxCents ?? 0);
      const diff = calculated - details.totalCents;
      if (diff) throw Error('Lines plus tax '+fmt(calculated)+' · Printed total '+fmt(details.totalCents)+' · Difference '+fmt(Math.abs(diff))+'.');
      if (draft.requiresSourceCheck && !draft.totalConfirmed) throw Error('Check all lines and the total against the original.');
    } else if (!details.totalConfirmed) throw Error('Check the invoice total before saving.');
    const {totalCents, paidCents, balanceDueCents} = details;
    if ((paidCents !== null && paidCents > totalCents) || (balanceDueCents !== null && balanceDueCents > totalCents)
      || (paidCents !== null && balanceDueCents !== null && paidCents + balanceDueCents !== totalCents))
      throw Error('Check the amount paid and balance due against the invoice total.');
    return {details};
  } catch (error) {
    return {message:error.message};
  }
}
