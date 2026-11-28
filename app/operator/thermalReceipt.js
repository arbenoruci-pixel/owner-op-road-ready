import {receiptObservations, sourceLines} from './maintenanceReceiptEvidence.js';
import {receiptWordRows} from './maintenanceReceiptLayout.js';
import {splitPrice, moneyConfidence, moneyRole, moneyObservations} from './maintenanceReceiptMoney.js';

const tender = /^(?:amount tendered|cash tendered|change(?: returned| due)?)\b/i;
const summary = /^(?:(?:grand|invoice|receipt|sale) )?total$/i;
const storeHeader = /^[\p{L}][\p{L}\d &.'’/-]{2,65}(?:\s+#\s*\d{1,8}|\b(?:STORE|STATION|SERVICE|CENTER|CENTRE|SUPPLY|REPAIR|LLC|INC\.?))$/iu;
const reliable = row => row.confidence == null || row.confidence >= 75;

const ledger = /\b(?:reg\.? price|extended amount|freight counted|new tires|unit price.+qty)\b/i;
function ticketRows(observation, source = sourceLines(observation), partial = false) {
  const rows = source.map(row => ({...row,text:String(row.text || '').slice(0,1000).trim()}));
  if (rows.some(row => ledger.test(row.text))) return null;
  const header = rows.findIndex(row => /\b(?:invoice\s*(?:#|no\b|number\b|:)|date\s*[:\s]+\d)/i.test(row.text));
  const merchant = rows.slice(0,6).findIndex(row => reliable(row) && storeHeader.test(row.text));
  let footer = rows.findIndex(row => {
    const print = splitPrice(row.text);
    return print ? moneyRole(print.label) || tender.test(print.label) : /^(?:sub[ -]?total|amount tendered|change)$/i.test(row.text);
  });
  const tall = observation.imageSize?.height > observation.imageSize?.width*1.25;
  const start = header >= 0 ? header : merchant;
  if (footer < 0) {
    // A damaged bottom edge can leave the shop/date and priced items intact.
    if (start < 0 || !(partial || ((tall || observation.region === 'thermal') && header >= 0 && merchant >= 0))) return null;
    footer = rows.length;
  }
  const sale = rows.slice(footer).some(row => tender.test(row.text));
  if (start >= footer || (!partial && (start < 0 || !(sale || ((tall || observation.region === 'thermal') && merchant >= 0))))) return null;
  const score = rows.slice(start+1,footer).filter(row => reliable(row) && splitPrice(row.text)?.label.match(/[a-z]/i)).length;
  return {rows,header:start,bySubtotal:footer,observation,score};
}

// Sparse OCR may put each price in its own text block. Rejoin only words on
// the same physical line and keep the ranked item list from one observation.
function alignedRows(read) {
  return receiptWordRows(read).flatMap(words => {
    const value = words.at(-1);
    const priced = splitPrice(value.text);
    const aligned = words.every(word => Math.abs(word.top+word.height*.75-value.top-value.height*.75) <=
      Math.max(2,Math.min(word.height,value.height)*.45));
    if (!aligned || words.length < 2 || (priced && words.slice(0,-1).some(word=>splitPrice(word.text)))) return [];
    const left = words[0].left, top = Math.min(...words.map(word=>word.top));
    return [{text:words.map(word=>word.text).join(' '),confidence:Math.min(...words.map(word=>word.confidence ?? 100)),
      left,top,width:value.left+value.width-left,height:Math.max(...words.map(word=>word.top+word.height))-top}];
  });
}

export function thermalReceiptPage(page) {
  const reads = moneyObservations(page).filter(read => !['small-total','small-tax','thermal-total'].includes(read.region));
  const tickets = reads.map(read=>ticketRows(read)).filter(Boolean);
  const thermal = tickets.length || reads.some(read=>read.region === 'thermal');
  if (thermal && !reads.some(read => sourceLines(read).some(row => ledger.test(row.text)))) {
    for (const read of reads) {
      const candidate = ticketRows(read,sourceLines(read),true);
      if (candidate) tickets.push(candidate);
      if (read.words?.length) {
        const aligned = ticketRows(read,alignedRows(read),true);
        if (aligned) tickets.push(aligned);
      }
    }
  }
  const ticket = tickets.sort((a,b) => b.score-a.score || Number(b.observation.region==='thermal')-Number(a.observation.region==='thermal'))[0];
  if (!ticket) {
    if (sourceLines(page).some(row=>String(row.text || '').trim())) return page;
    const fallback = reads.find(read => sourceLines(read).some(row=>String(row.text || '').trim()));
    return fallback ? {...page,text:fallback.text,lines:sourceLines(fallback)} : page;
  }
  const {rows,header,bySubtotal,observation} = ticket;
  const lines = rows.map((row,i) => {
    const print = splitPrice(row.text);
    const item = i > header && i < bySubtotal && print && !moneyRole(print.label);
    return item ? {...row,text:print.label+' '+print.amount,confidence:moneyConfidence(row,print,observation,reads),thermalItem:true} : row;
  });
  return {...page,text:lines.map(row=>row.text).join('\n'),lines,thermal:true};
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
  if (ledger.test(text) || !/\b(?:sub[ -]?total|total|tendered|tax)\b/i.test(text) ||
      !/\b(?:change|tendered|invoice|tax)\b/i.test(text) || !/\d[.,]\d{2}\b/.test(text)) return;
  try {
    const {straightenThermalReceipt} = await import('./thermalReceiptImage.js');
    const corrected = await straightenThermalReceipt(file,signal);
    if (!corrected) return;
    const read = await recognize(corrected,{signal,returnLayout:true,pageSegMode:'4',onProgress:value=>progress(.86+value*.14)});
    if (read?.text?.trim()) {
      (page.supplemental ||= []).push({...read,region:'thermal'});
      const confirmed = await confirmThermalTotal(read,corrected,recognize,signal);
      if (confirmed) page.supplemental.push(confirmed);
    }
  } catch { signal?.throwIfAborted(); }
}
