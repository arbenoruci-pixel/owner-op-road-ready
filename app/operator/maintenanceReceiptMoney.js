import {receiptObservations, sourceLines} from './maintenanceReceiptEvidence.js';
import {receiptLayoutAmounts} from './maintenanceReceiptLayout.js';

const numberAtEnd = /([(-]?)\s*\$?\s*(-?)\s*((?:\d+|\d{1,3}(?:,\d{3})+)\s*\.\s*\d{2})(\)?-?)\s*$/;
const reliable = row => row.confidence == null || row.confidence >= 75;

export function splitPrice(text) {
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

// Ruling fragments sometimes form their own low-confidence word on the same
// row as TOTAL. Score the printed label and amount independently of punctuation.
export function moneyConfidence(row, print, observation, otherReads) {
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
      if (Math.abs(right.top+right.height*.5-left.top-left.height*.5) <= Math.min(left.height,right.height)*.75) return Math.min(left.confidence,right.confidence);
    }
  }
  return score;
}

const roles = [
  ['subtotalCents', /^(?:sub[ -]?total|net subtotal)$/i],
  ['paidCents', /^(?:amount paid|total paid|payment received|deposit paid|down payment|paid)$/i],
  ['balanceDueCents', /^(?:balance(?: due| owed)?|amount due|total due|remaining balance)$/i],
  ['totalCents', /^(?:(?:invoice|grand|receipt|sale|net) total|total(?: amount| sale| charges)?)$/i],
];
function taxName(label) {
  const clean = label.trim().toUpperCase().replace(/\s+/g,' ').replace(/\s+\d+(?:\.\d+)?\s*%$/,'').replace(/\s*\/\s*/g,'/');
  if (/\b(?:BEFORE|EXEMPT|PRE|AFTER|INCLUD\w*|EXCLUD\w*|ENV\/WST)\b/.test(clean)) return '';
  return /^(?:[A-Z][A-Z ./'-]{0,32} )?TAX$/.test(clean) ? clean : '';
}

export function moneyRole(label) {
  return taxName(label) ? 'taxCents' : roles.find(([,pattern]) => pattern.test(label))?.[0];
}

export function moneyObservations(page) {
  return [...new Set(receiptObservations(page))].filter(read => !read.region ||
    ['page','full-page','sparse','thermal','thermal-total','small-total','small-tax'].includes(read.region));
}

function sideBySideTotal(read,row,price) {
  if (!/^TOTAL$/i.test(price.label) || /[$►▸]/.test(row.text) || !Number.isFinite(row.top)) return false;
  return (read.words || []).some(word => word.left > row.left+row.width &&
    /^(?:taxable|non-taxable|discount|tax|tendered|balance)$/i.test(word.text) &&
    Math.abs(word.top+word.height*.5-row.top-row.height*.5) < Math.min(word.height,row.height)*.65);
}

function duplicateBareTaxes(traces,taxes) {
  const bare = taxes.get('TAX');
  const named = [...taxes.keys()].filter(name => name !== 'TAX' && name !== 'TOTAL TAX');
  if (!bare || !named.length || named.some(name=>taxes.get(name).size !== 1)) return new Set();
  const componentValues = new Set(named.map(name=>[...taxes.get(name)][0]));
  const sum = named.reduce((n,name)=>n+[...taxes.get(name)][0],0);
  const aggregate = taxes.get('TOTAL TAX');
  const confirmedSum = aggregate?.size === 1 && aggregate.has(sum);
  const sources = [...new Set(traces.map(t=>t.read))];
  const complete = sources.map(read => traces.filter(t=>t.read === read && named.includes(t.name)))
    .filter(group=>named.every(name=>group.some(t=>t.name === name)));
  const duplicate = new Set();
  for (const value of bare) {
    if (!componentValues.has(value)) continue;
    const bareRows = traces.filter(t=>t.name==='TAX' && t.value===value);
    if (!bareRows.length) continue;
    const matched = bareRows.every(row=>complete.some(group=>group.some(t=>{
      if (t.value !== value) return false;
      if (confirmedSum) return true;
      if (t.read === row.read || (t.read.imageSize?.height && row.read.imageSize?.height)) {
        const scale = t.read === row.read ? 1 : t.read.imageSize.height/row.read.imageSize.height;
        const gap = Math.abs(t.center - row.center*scale);
        if (gap <= Math.min(t.height,row.height*scale)*.65) return true;
      }
      return false;
    })));
    if (matched) duplicate.add(value);
  }
  return duplicate;
}

// Each observation keeps its own coordinate system. A tax component and a
// photograph of that same line contribute one amount for that named caption.
export function pageMoneyEvidence(page) {
  const reads = moneyObservations(page);
  const amounts = new Map();
  const taxes = new Map();
  const traces = [];
  const missingTax = new Set();
  const faint = new Set();
  const collect = (map,key,value) => {
    const seen = map.get(key) || new Set();
    seen.add(value);
    map.set(key,seen);
  };
  function collectTax(name,value,read,row) {
    collect(taxes,name,value);
    traces.push({name,value,read,center:row?.top+row?.height*.5,height:row?.height});
  }
  for (const read of reads) {
    for (const row of sourceLines(read)) {
      const text = String(row.text || '').slice(0,1000).trim();
      const price = splitPrice(text.replace(/\s+USD$/i,''));
      if (!price) {
        const named = taxName(text.replace(/[\s:|?]+$/g,''));
        if (named && reliable(row)) missingTax.add(named);
        continue;
      }
      const role = moneyRole(price.label);
      if (!role || sideBySideTotal(read,row,price)) continue;
      if ((read.region === 'small-total' || read.region === 'thermal-total') && role !== 'totalCents') continue;
      if (read.region === 'small-tax' && role !== 'taxCents') continue;
      const confidence = moneyConfidence(row,price,read,reads);
      const named = role === 'taxCents' && taxName(price.label);
      if (confidence != null && confidence < 75) {
        faint.add(role);
        if (named) missingTax.add(named);
      } else if (named) collectTax(named,price.cents,read,row);
      else collect(amounts,role,price.cents);
    }
  }
  if (reads.length) {
    for (const {role,token,taxLabel,locations} of receiptLayoutAmounts(page,{includeLocations:true})) {
      const value = splitPrice(token);
      if (!value || value.label) continue;
      if (role === 'taxCents') {
        const named = taxName(taxLabel || 'TAX');
        if (named) for (const pos of locations) collectTax(named,value.cents,pos.read,pos);
      } else collect(amounts,role,value.cents);
    }
  }
  for (const name of taxes.keys()) missingTax.delete(name);
  // A sparse pass can emit TAX alone from a qualified caption. A qualified
  // caption with its own unreadable amount still needs the driver's review.
  if (taxes.size) missingTax.delete('TAX');
  const duplicates = duplicateBareTaxes(traces,taxes);
  for (const amount of duplicates) taxes.get('TAX').delete(amount);
  if (taxes.get('TAX')?.size === 0) taxes.delete('TAX');
  let taxConflict = false;
  const components = [];
  const bare = taxes.get('TAX');
  const aggregate = taxes.get('TOTAL TAX');
  for (const [label,values] of taxes) {
    if (values.size > 1) taxConflict = true;
    else if (label !== 'TAX' && label !== 'TOTAL TAX') components.push(...values);
  }
  const sum = components.reduce((a,b)=>a+b,0);
  const bareAmount = bare?.values().next().value;
  const totalTax = aggregate?.values().next().value;
  let tax;
  if (totalTax != null) {
    tax = totalTax;
    // An unqualified tax can represent the aggregate or a separate component.
    if (components.length && totalTax !== sum && totalTax !== sum+(bareAmount ?? 0)) taxConflict = true;
    if (!components.length && bareAmount != null && bareAmount !== totalTax) taxConflict = true;
    if (components.length && bareAmount != null && bareAmount !== totalTax && bareAmount+sum !== totalTax) taxConflict = true;
  } else if (bareAmount != null && components.length && sum && bareAmount && sum !== bareAmount) {
    taxConflict = true;
  } else if (taxes.size) tax = bareAmount == null || bareAmount === 0 ? sum : bareAmount;
  const taxIncomplete = missingTax.size > 0;
  if (!taxConflict && !taxIncomplete && Number.isSafeInteger(tax)) collect(amounts,'taxCents',tax);
  return {amounts,faint,taxConflict,taxIncomplete};
}
