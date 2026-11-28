import {receiptObservations, sourceLines} from './maintenanceReceiptEvidence.js';
import {receiptWordRows} from './maintenanceReceiptLayout.js';

const serviceLabel = /\b(?:(?:service|repair|invoice|receipt|transaction|document)\s+date|date(?:\s+of\s+service)?|written|completed)\b\s*[:#-]?\s*/gi;
const invoiceId = /\binvoice\s*(?:number\b|no\b\.?|id\b|#|:)\s*[:#-]?\s*([A-Z\d][A-Z\d./_-]*)\b/gi;
const serviceInvoiceId = /^(?:repair|service|sales)\s+invoice\s+([A-Z\d][A-Z\d./_-]*)\s*$/i;
const numberedStore = /^([\p{L}][\p{L}\d &'’./-]{1,64}?)\s*#\s*(\d{1,8})$/u;
const nonMerchant = /\b(?:customer|client|account|member|loyalty|driver|ship(?:per)?|consignee|bill(?:ed)?\s+to|sold\s+to|phone|address|street|road|highway|hwy|ave(?:nue)?|apt|suite|exit|unit|truck\s*(?:no|number)|item|qty|quantity|part\s*(?:no|number)|receipt|invoice|order|purchase|po|p\.o\.|terminal|cashier|register|transaction)\b/i;
const transactionHeading = /\b(?:invoice\b|(?:sales?|transaction|service|repair)\s+(?:date|time|ticket|receipt)|date\s*[:#]|(?:transaction|receipt)\s*(?:#|no\b|id\b))/i;
const customerOrItems = /\b(?:customer|client|bill(?:ed)?\s+to|sold\s+to|ship\s+to|item\s+description|qty\s+(?:item|description)|sub[ -]?total)\b/i;
const otherDate = /\b(?:payment|paid|due|tender(?:ed)?|balance|expiry|expires?|expiration|ship(?:ped|ping)?|delivery|birth|card|purchase\s+order|work\s+order|p\.?o\.?)\s*(?:[:#/-]\s*)?$/i;

export function printedDate(text) {
  const found = /^(?:(20\d\d)-(\d{1,2})-(\d{1,2})|(\d{1,2})[/-](\d{1,2})[/-](20\d\d|\d{2}))(?=$|\s|\|)/.exec(text);
  if (!found) return '';
  const year = found[1] || (found[6].length === 2 ? '20' + found[6] : found[6]);
  const iso = [year, (found[2] || found[4]).padStart(2,'0'), (found[3] || found[5]).padStart(2,'0')].join('-');
  const day = new Date(iso + 'T12:00:00Z');
  return Number.isFinite(day.valueOf()) && day.toISOString().slice(0,10) === iso ? iso : '';
}

const otcOrder = /^OTC Order\s*#\s*(\d{2,6})[ -]+(\d{4,12})\s*$/i;

function printedOtcOrders(lines) {
  return lines.filter(line => line.confidence == null || line.confidence >= 85)
    .map(line => otcOrder.exec(line.text.trim())).filter(Boolean)
    .map(match => 'OTC Order #' + match[1] + ' ' + match[2]);
}

function truckServiceBrand(lines) {
  return lines.some(line => {
    if (!/^\W*TA\s+TRUCK\s*SERVICE\b/i.test(line.text)) return false;
    // Location and phone text can lower the OCR score of the entire row.
    // The separately printed OTC form heading corroborates the exact brand.
    return line.confidence == null || line.confidence >= 75 || printedOtcOrders(lines).length > 0;
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

// Only adjacent words from the same observation can bind a label to its
// value. Keep weak tokens in place as separators so missing digits cannot
// silently become a shorter ID. Native text segments use their printed text.
function headerLines(observation) {
  const words = observation.words?.length ? observation.words : observation.lines?.flatMap(row => row.words || []);
  if (!words?.some(word => [word.left,word.top,word.width,word.height].every(Number.isFinite))) {
    return sourceLines(observation).map(row => {
      let text = String(row.text || '').trim();
      const words = row.words || [];
      if (!words.length) return {text,trusted:row.confidence == null || row.confidence >= 75};
      let offset = 0;
      for (const word of words) {
        const token = String(word.text || '').trim();
        const index = text.indexOf(token,offset);
        if (!token || index < 0) return {text,trusted:false};
        if (word.confidence != null && word.confidence < 75 && /[\p{L}\d]/u.test(token)) {
          text = text.slice(0,index)+'\uFFFD'.repeat(token.length)+text.slice(index+token.length);
        }
        offset = index+token.length;
      }
      return {text,trusted:true};
    });
  }
  return receiptWordRows({words}).map(row => {
    let text = '', previous;
    for (const word of row) {
      if (previous) {
        const gap = word.left - previous.left - previous.width;
        const near = Math.min(previous.height,word.height);
        const overlap = Math.min(previous.top+previous.height,word.top+word.height) - Math.max(previous.top,word.top);
        text += gap <= near*1.9 && overlap >= near*.5 ? ' ' : ' | ';
      }
      text += word.confidence == null || word.confidence >= 75 || !/[\p{L}\d]/u.test(word.text) ? word.text : '\uFFFD';
      previous = word;
    }
    return {text:text.trim(),trusted:true};
  });
}

function merchantHeading(lines) {
  const heading = lines.findIndex(row => row.trusted && transactionHeading.test(row.text));
  if (heading < 1) return [];
  const merchants = [];
  for (const {text,trusted} of lines.slice(0,Math.min(heading,9))) {
    if (customerOrItems.test(text)) break;
    if (!trusted || nonMerchant.test(text)) continue;
    const store = numberedStore.exec(text);
    if (store && !/^(?:store|shop|location|station|branch|department|service center|truck stop)$/i.test(store[1].trim())) {
      merchants.push(store[1].trim()+' #'+store[2]);
    }
  }
  return merchants;
}

function usableId(id) {
  return /\d/.test(id) && !/^(?:(?:p\.?o\.?|purchase[- ]?order|order)[-#/]*\d)/i.test(id)
    && !printedDate(id);
}

export function maintenanceHeader(pages) {
  const dates = new Set(), invoiceNumbers = new Map(), orderReferences = new Set(), vendors = new Map();
  const addVendor = name => {
    const value = name.trim().replace(/\s+/g,' ').replace(/\s*#\s*(\d+)$/,' #$1');
    if (value && !value.includes('\uFFFD')) vendors.set(value.toUpperCase(),value);
  };
  for (const observation of pages.flatMap(receiptObservations)) {
    // A synthesized thermal summary repeats the original identity labels
    // without their word scores. Each original receipt read is already visited.
    if (observation.thermal) continue;
    const lines = sourceLines(observation);
    const top = lines.slice(0,30);
    if (truckServiceBrand(top)) {
      addVendor('TA Truck Service');
      for (const order of printedOtcOrders(top)) orderReferences.add(order);
    }
    const physicalLines = headerLines(observation);
    for (const merchant of merchantHeading(physicalLines)) addVendor(merchant);
    for (const {text,trusted} of physicalLines) {
      if (!trusted) continue;
      const segments = text.split(/\s*\|\s*|\t+| {3,}/);
      for (const [index,segment] of segments.entries()) {
        const row = segment.trim();
        const vendor = /^(?:vendor|merchant|shop name|seller|service provider)\s*[:#-]\s*(.{2,85})$/i.exec(row)?.[1];
        if (vendor && !/\b(?:invoice|date|customer)\s*[:#]/i.test(vendor)) addVendor(vendor);
        for (const match of row.matchAll(serviceLabel)) {
          const before = row.slice(0,match.index).trim();
          const previous = before || segments[index-1]?.trim() || '';
          if (otherDate.test(previous) || (/^date\b/i.test(match[0]) && /[\p{L}\uFFFD]$/u.test(before))) continue;
          const date = printedDate(row.slice(match.index+match[0].length));
          if (date) dates.add(date);
        }
        for (const match of row.matchAll(invoiceId)) {
          const id = match[1];
          const suffix = row.slice(match.index+match[0].length);
          if (/^[-/_.]?\s*\uFFFD/.test(suffix)) continue;
          if (usableId(id) && !/\b(?:purchase\s+order|order|p\.?o\.?)\s*[/&-]?\s*$/i.test(row.slice(0,match.index))) {
            invoiceNumbers.set(id.toUpperCase(),id);
          }
        }
        const standalone = serviceInvoiceId.exec(row)?.[1];
        if (standalone && usableId(standalone)) invoiceNumbers.set(standalone.toUpperCase(),standalone);
      }
    }
    const confirmedDate = otcWrittenDate(observation, lines);
    if (confirmedDate) dates.add(confirmedDate);
  }
  // A merchant name with and without its printed store number can describe
  // the same business. Two different store numbers remain a conflict.
  for (const name of vendors.keys()) {
    const base = name.replace(/ #\d+$/,'');
    if (base !== name) vendors.delete(base);
  }
  return {vendor:vendors.size === 1 ? [...vendors.values()][0] : '', conflictingVendors:vendors.size > 1,
    date:dates.size === 1 ? [...dates][0] : '', conflictingDates:dates.size > 1,
    orderReferences:[...orderReferences], invoiceNumbers:[...invoiceNumbers.values()]};
}
