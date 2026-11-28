import {receiptObservations, sourceLines} from './maintenanceReceiptEvidence.js';

const serviceLabel = /^(?:(?:service|repair|invoice|receipt|transaction|document)\s+date|date(?:\s+of\s+service)?|written|completed)\b\s*[:#-]?\s*/i;
const invoiceId = /^(?:(?:repair|service|sales)\s+)?invoice\s*(?:number\b|no\b\.?|id\b|#|:)\s*[:#-]?\s*([A-Z\d][A-Z\d./_-]*)\b/i;
const serviceInvoiceId = /^(?:repair|service|sales)\s+invoice\s+((?=[A-Z\d./_-]*\d)[A-Z\d][A-Z\d./_-]*)\s*$/i;

export function printedDate(text) {
  const found = /^(?:(20\d\d)-(\d{1,2})-(\d{1,2})|(\d{1,2})[/-](\d{1,2})[/-](20\d\d|\d{2}))(?=$|\s|\|)/.exec(text);
  if (!found) return '';
  const year = found[1] || (found[6].length === 2 ? '20' + found[6] : found[6]);
  const iso = [year, (found[2] || found[4]).padStart(2,'0'), (found[3] || found[5]).padStart(2,'0')].join('-');
  const day = new Date(iso + 'T12:00:00Z');
  return Number.isFinite(day.valueOf()) && day.toISOString().slice(0,10) === iso ? iso : '';
}

function truckServiceBrand(lines) {
  return lines.some(line => {
    if (!/^\W*TA\s+TRUCK\s*SERVICE\b/i.test(line.text)) return false;
    return line.confidence == null || line.confidence >= 75;
  });
}

// On the TA OTC service form the Written and Paid dates share a row. Confirm
// both entries and their positions between the customer ZIP and payment time.
// A readable Written heading also identifies the left cell.
function otcWrittenDate(observation, lines) {
  if (!truckServiceBrand(lines) || !lines.some(line => /^OTC order\s*#/i.test(line.text))) return '';
  const words = observation.words || [];
  const dates = words.filter(word => word.confidence >= 85 && printedDate(word.text));
  for (const left of dates) {
    const closeRow = word => Math.abs(word.top - left.top) < Math.max(word.height, left.height);
    const label = words.some(word => /^(?:written|wren)$/i.test(word.text)
      && word.top < left.top && left.top - word.top < 3 * left.height
      && Math.abs(word.left - left.left) < left.width * .4);
    const inHeader = left.top < observation.imageSize?.height * .42;
    const zipBeforeDate = inHeader && dates.length === 2 && words.some(word =>
      /^\d{5}(?:-\d{4})?$/.test(word.text) && word.confidence >= 85 && closeRow(word)
      && left.left - (word.left + word.width) > left.width * .5
      && left.left - word.left < left.width * 3);
    if (!label && !zipBeforeDate) continue;
    for (const right of dates) {
      if (right.left < left.left + 3 * left.width || !closeRow(right) || right.text !== left.text) continue;
      if (words.some(word => /^\d{1,2}:\d{2}$/.test(word.text) && word.confidence >= 75 &&
        closeRow(word) && word.left >= right.left + right.width && word.left < right.left + right.width * 2.5)) {
        return printedDate(left.text);
      }
    }
  }
  return '';
}

export function maintenanceHeader(pages) {
  let detectedBrand = '';
  const dates = new Set(), invoiceNumbers = new Map(), vendors = new Map();
  for (const observation of pages.flatMap(receiptObservations)) {
    const lines = sourceLines(observation);
    if (truckServiceBrand(lines.slice(0,30))) detectedBrand = 'TA Truck Service';
    for (const {text, confidence} of lines) {
      if (confidence != null && confidence < 75) continue;
      const row = text.trim();
      const vendor = /^(?:vendor|merchant|shop name|seller|service provider)\s*[:#-]\s*(.{2,85})$/i.exec(row)?.[1]?.trim();
      if (vendor) vendors.set(vendor.toUpperCase(),vendor);
      const service = serviceLabel.exec(row);
      const date = service && printedDate(row.slice(service[0].length));
      if (date) dates.add(date);
      const id = (invoiceId.exec(row) || serviceInvoiceId.exec(row))?.[1];
      if (id) invoiceNumbers.set(id.toUpperCase(),id);
    }
    const confirmedDate = otcWrittenDate(observation, lines);
    if (confirmedDate) dates.add(confirmedDate);
  }
  return {vendor:vendors.size === 1 ? [...vendors.values()][0] : detectedBrand, date:dates.size === 1 ? [...dates][0] : '',
    conflictingDates:dates.size > 1, invoiceNumbers:[...invoiceNumbers.values()]};
}
