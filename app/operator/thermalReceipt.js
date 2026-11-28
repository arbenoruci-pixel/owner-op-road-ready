import {receiptObservations, sourceLines} from './maintenanceReceiptEvidence.js';

const subtotal = /^sub[ -]?total\b/i;
const tender = /^(?:amount tendered|cash tendered|change(?: returned| due)?)\b/i;
const summary = /^(?:(?:grand|invoice|receipt|sale) )?total$/i;
const taxLabel = /^(?:[A-Z][A-Z /.-]{0,32} )?TAX(?:\s+\d+(?:\.\d+)?%)?$/i;
const invoice = /\bINVOICE\s*(?:NO\.?\s*|NUMBER\s*|#|:)\s*([\w-]*\d[\w-]*)\b/gi;
const numberAtEnd = /([(-]?)\s*\$?\s*(-?)\s*((?:\d+|\d{1,3}(?:,\d{3})+)\s*\.\s*\d{2})(\)?-?)\s*$/;
const storeHeader = /^[\p{L}][\p{L}\d &.'’/-]{2,65}(?:\s+#\s*\d{1,8}|\b(?:STORE|STATION|SERVICE|CENTER|CENTRE|SUPPLY|REPAIR|LLC|INC\.?))$/iu;
const reliable = row => row.confidence == null || row.confidence >= 75;

function splitPrice(text) {
  // Preserve explicit credit signs, including an OCR typographic minus.
  text = text.trim().replace(/[−–—](?=\s*\$?\s*\d)/g,'-').replace(/\s+[~_|]+$/, '').trim();
  const match = numberAtEnd.exec(text);
  if (!match) return null;
  const sign = match[1]+match[2]+match[4];
  if (sign && sign !== '-' && sign !== '()') return null;
  const amount = (sign ? '-' : '')+match[3].replace(/[,\s]/g,'');
  const cents = Number(amount.replace('.',''));
  if (!Number.isSafeInteger(cents)) return null;
  return {label:text.slice(0,match.index).replace(/^[\s|~_—–:*]+|[\s|~—–:*>►]+$/g,'').trim(), amount, cents};
}

function ticketRows(observation) {
  const rows = sourceLines(observation).map(row => ({...row,text:String(row.text || '').slice(0,1000).trim()}));
  const bySubtotal = rows.findIndex(row => subtotal.test(row.text) && splitPrice(row.text));
  if (bySubtotal < 1) return null;
  // Trailing receipt borders can be segmented as dashes or bars. This row
  // establishes the layout. Tender is never used as the invoice price.
  const checkout = rows.slice(bySubtotal+1).some(row =>
    tender.test(row.text) && splitPrice(row.text.replace(/(?:\s+[~—_|-]+)+$/, '')));
  if (!checkout) return null;
  // A ledger may print these words in its footer too. Restrict the receipt
  // layout to individual labeled amounts, with a transaction header above.
  const header = rows.findIndex((row,i) => i < bySubtotal && /\b(?:invoice\s*(?:#|no\b|number\b|:)|date\s*[:\s]+\d)/i.test(row.text));
  if (header < 0 || rows.some(row => /\b(?:reg\.? price|extended amount|freight counted|new tires)\b/i.test(row.text))) return null;
  return {rows,header,bySubtotal,observation};
}

// Ruling fragments sometimes form their own low-confidence word on the same
// row as TOTAL. Score the printed label and amount independently of punctuation.
function moneyConfidence(row, print, observation, otherReads) {
  if (row.confidence == null) return null;
  const words = (observation.words || []).filter(word => {
    const x = word.left + word.width/2, y = word.top + word.height/2;
    return x >= row.left && x <= row.left+row.width && y >= row.top && y <= row.top+row.height;
  });
  const value = words.find(word => splitPrice(word.text)?.amount === print.amount);
  const labels = words.filter(word => /[A-Z]/i.test(word.text));
  let score = row.confidence;
  if (labels.length && Number.isFinite(value?.confidence)) {
    score = Math.min(value.confidence,labels.reduce((sum,word) => sum+word.confidence,0)/labels.length);
  }
  if (score >= 75) return score;
  // On a skewed original, sparse OCR can place a label and its value in
  // separate blocks. Accept the same printed pair only in close row order.
  for (const read of otherReads) {
    if (read === observation) continue;
    const lines = sourceLines(read).filter(line=>/[A-Za-z0-9]/.test(line.text));
    for (let i=0;i<lines.length-1;i++) {
      const left = lines[i], right = lines[i+1];
      if (left.text.trim().toUpperCase() !== print.label.toUpperCase() || !reliable(left) || !reliable(right)) continue;
      const amount = splitPrice(right.text);
      if (!amount || amount.label !== '' || amount.amount !== print.amount || !(right.left >= left.left+left.width)) continue;
      if (Math.abs(right.top-left.top) <= Math.max(left.height,right.height)) return Math.min(left.confidence,right.confidence);
    }
  }
  return score;
}

function relevantRows(ticket, original) {
  const {rows,header,bySubtotal,observation} = ticket;
  const reads = receiptObservations(original);
  const lines = [];
  const taxes = new Map();
  let taxConfidence = 100;
  let uncertainTax = false;
  function recordTax(print,confidence) {
    const label = print.label.toUpperCase().replace(/\s+/g,' ');
    const values = taxes.get(label) || new Set();
    values.add(print.cents);
    taxes.set(label,values);
    if (confidence != null) taxConfidence = Math.min(taxConfidence,confidence);
  }
  function keepInvoiceNumbers(row) {
    for (const match of row.text.matchAll(invoice)) lines.push({...row,text:'Invoice #'+match[1]});
  }
  for (const [i,row] of rows.entries()) {
    const print = splitPrice(row.text);
    const confidence = i > header && print ? moneyConfidence(row,print,observation,reads) : row.confidence;
    if (i >= bySubtotal && print && taxLabel.test(print.label)) {
      recordTax(print,confidence);
      continue;
    }
    if (i >= bySubtotal && /\bTAX\b/i.test(row.text) && !print) uncertainTax = true;
    const normalized = print ? print.label + ' ' + print.amount : row.text;
    lines.push({...row,confidence,text:normalized,thermalItem:i > header && i < bySubtotal});
    if (i < header && i < 5 && storeHeader.test(row.text) && !/\b(?:invoice|receipt|date|order|customer|address)\b/i.test(row.text)) {
      lines.push({...row,text:'Vendor: '+row.text});
    }
    keepInvoiceNumbers(row);
  }
  // Keep conflicting printed final totals from independent reads. Tender and
  // change can corroborate a purchase, but never supply a missing final total.
  for (const other of reads) {
    if (other === observation) continue;
    for (const row of sourceLines(other)) {
      if (!reliable(row)) continue;
      keepInvoiceNumbers(row);
      const print = splitPrice(row.text);
      if (!print) continue;
      const confidence = moneyConfidence(row,print,other,[]);
      if (confidence != null && confidence < 75) continue;
      if (taxLabel.test(print.label)) recordTax(print,confidence);
      else if (summary.test(print.label) || /^(?:sub[ -]?total|balance due|amount paid|paid)$/i.test(print.label)) {
        lines.push({...row,text:print.label+' '+print.amount,confidence});
      }
    }
  }
  const components = [];
  const aggregates = new Set();
  for (const [label,values] of taxes) {
    if (values.size !== 1) { uncertainTax = true; continue; }
    const amount = [...values][0];
    if (label === 'TOTAL TAX' || label === 'TAX') aggregates.add(amount);
    else components.push(amount);
  }
  const sum = components.reduce((total,value) => total+value,0);
  const [aggregate] = aggregates;
  if (aggregates.size > 1) uncertainTax = true;
  if (aggregate != null && components.length && aggregate !== sum) uncertainTax = true;
  if (taxes.size && !uncertainTax) lines.push({text:'Tax '+((aggregate ?? sum)/100).toFixed(2),confidence:taxConfidence});
  return {...original,text:lines.map(row=>row.text).join('\n'),lines,words:[],supplemental:[],thermal:true,uncertainTax};
}

export function thermalReceiptPage(page) {
  for (const read of receiptObservations(page).filter(read => read.region === 'thermal').concat(page)) {
    const ticket = ticketRows(read);
    if (ticket) return relevantRows(ticket,page);
  }
  return page;
}

// Rules just above a thermal total can extend the amount bounding box into
// the preceding row. Read the entire printed caption and price at the height
// of the TOTAL word. Both the page pass and the independent row must agree.
async function confirmThermalTotal(read, corrected, recognize, signal) {
  const totals = sourceLines(read).map(row => ({row,price:splitPrice(row.text)}))
    .filter(entry => entry.price && summary.test(entry.price.label));
  if (new Set(totals.map(entry => entry.price.cents)).size !== 1) return null;
  for (const {row,price} of totals) {
    if (moneyConfidence(row,price,read,[]) >= 75) continue;
    const label = read.words?.find(word => /^total$/i.test(word.text) &&
      word.left >= row.left && word.right <= row.right && word.top >= row.top && word.bottom <= row.bottom);
    if (!label || !read.imageSize) continue;
    const margin = Math.ceil(label.height*.2);
    const left = Math.max(0,row.left-margin), top = Math.max(0,label.top-margin);
    const rectangle = {left,top,width:Math.min(read.imageSize.width,row.right+margin)-left,
      height:Math.min(read.imageSize.height,label.bottom+margin)-top};
    const check = await recognize(corrected,{signal,pageSegMode:'7',rectangle,returnLayout:true});
    if (check?.lines?.length !== 1) return null;
    const verified = splitPrice(check.lines[0].text);
    if (verified?.label.toUpperCase() === price.label.toUpperCase() && verified.amount === price.amount &&
        moneyConfidence(check.lines[0],verified,check,[]) >= 75) return {...check,region:'thermal-total'};
    return null;
  }
  return null;
}

export async function readSkewedThermalReceipt(file,page,recognize,{signal,progress}) {
  const {width=0,height=0} = page.imageSize || {};
  if (!width || height < width*1.2) return;
  const primary = ticketRows(page);
  if (primary && primary.rows.slice(primary.bySubtotal).some(row => {
    const price = splitPrice(row.text);
    return price && summary.test(price.label) && reliable(row);
  }) && primary.rows.slice(0,primary.bySubtotal).every(reliable)) return;
  const text = receiptObservations(page).map(read => read.text).join('\n');
  if (!/\b(?:subtotal|sub total|amount tendered)\b/i.test(text) || !/\b(?:change|tendered|tax)\b/i.test(text)) return;
  try {
    const {straightenThermalReceipt} = await import('./thermalReceiptImage.js');
    const corrected = await straightenThermalReceipt(file,signal);
    if (!corrected) return;
    const read = await recognize(corrected,{signal,returnLayout:true,pageSegMode:'4',onProgress:value=>progress(.86+value*.14)});
    if (read?.text && ticketRows(read)) {
      (page.supplemental ||= []).push({...read,region:'thermal'});
      const confirmed = await confirmThermalTotal(read,corrected,recognize,signal);
      if (confirmed) page.supplemental.push(confirmed);
    }
  } catch { signal?.throwIfAborted(); }
}
