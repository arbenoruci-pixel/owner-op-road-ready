// Sparse OCR returns labels and amounts in different blocks even when they are
// printed on the same row. Join by baseline on each image, never across pages.
export function receiptWordRows(observation) {
  const words = (observation.words || []).slice(0,4000)
    .filter(word => word.text?.trim() && [word.left,word.top,word.width,word.height].every(Number.isFinite) && word.width > 0 && word.height > 0);
  const baseline = word => word.top + word.height * .75;
  const rows = [];
  for (const word of words.sort((a,b) => baseline(a) - baseline(b) || a.left - b.left)) {
    const row = rows.at(-1);
    if (row && Math.abs(baseline(word) - row.base) <= Math.max(3, Math.max(row.height * .6,Math.min(row.height,word.height)) * 1.05)) {
      row.words.push(word);
      // Tiny punctuation and ruling fragments must not split the next word.
      if (word.height >= row.height * .55) {
        row.base += (baseline(word) - row.base) / ++row.count;
        row.height += (word.height - row.height) / row.count;
      }
    } else rows.push({base:baseline(word),height:word.height,count:1,words:[word]});
  }
  return rows.map(row => row.words.sort((a,b) => a.left - b.left));
}

const numeric = /^\(?-?\$?(?:\d+|\d{1,3}(?:,\d{3})+)\.\d{2}\)?-?$/;
const label = word => word?.text.toLowerCase().replace(/[^a-z-]/g,'') || '';
const gap = (a,b) => b.left - a.left - a.width;
const qualified = new Set(['grand','invoice','receipt','sale','net']);
const excluded = /^(?:labor|parts|tires?|fees?|saving[s]?|discount|env|envwst|fuel|oil|taxable|nontaxable|non-taxable|qty|quantity|page|previous)$/;
const stop = /^(?:due|paid|labor|parts|miles|weight|pallets|cases|units|qty|quantity|items|savings|discount)$/;

const restrictedRegions = new Map([
  ['small-total','totalCents'], ['thermal-total','totalCents'], ['small-tax','taxCents'],
]);
const fullMoneyRegions = new Set(['thermal','page','full-page','sparse']);
const marker = /^(?:[\s:|=•.()–—$§►▸»<>-]+|[DPd]{1,2}>?|USD)$/i;

function onSameBaseline(a,b) {
  // Within one OCR paragraph, distinct line IDs identify different rows even
  // when slanted or oversized bounding boxes overlap. Sparse blocks may differ.
  if (a.block != null && a.block === b.block && a.paragraph != null && a.paragraph === b.paragraph &&
      a.line != null && b.line != null && a.line !== b.line) return false;
  const baseline = w => w.top+w.height*.75;
  return Math.abs(baseline(a)-baseline(b)) <= Math.max(2,Math.min(a.height,b.height)*.55);
}

function captionGap(left,right) {
  const space = gap(left,right);
  return onSameBaseline(left,right) && space >= -Math.min(left.width,right.width)*.15 &&
    space <= Math.max(3, Math.min(left.height,right.height)*1.65);
}

function printedTaxCaption(row, index) {
  const text = word => word.text.trim().toUpperCase().replace(/^[|:;]+|[|:;.,]+$/g,'');
  const tokens = [text(row[index])];
  let confidence = row[index].confidence ?? 100;
  for (let j=index-1; j>=0 && tokens.length<6; j--) {
    const part = text(row[j]);
    if (!captionGap(row[j],row[j+1]) || !/^(?:[A-Z][A-Z/' .-]*|\/)$/.test(part)) break;
    if (excluded.test(label(row[j])) || /^(?:SUBTOTAL|BALANCE|DUE|PAID|CHANGE|TENDERED)$/.test(part)) return null;
    tokens.unshift(part);
    confidence = Math.min(confidence,row[j].confidence ?? 100);
    if (part === 'TOTAL') break;
  }
  const name = tokens.join(' ').replace(/\s*\/\s*/g,'/').replace(/\s+/g,' ');
  if (!/^(?:[A-Z][A-Z/ .'-]{0,32} )?TAX$/.test(name) || /\b(?:BEFORE|AFTER|PRE|EXEMPT|INCLUD\w*|EXCLUD\w*|ENV\/WST)\b/.test(name)) return null;
  return {name,confidence};
}

function amountCandidates(observation) {
  const candidates = [];
  const width = observation.imageSize?.width;
  const restrictedRole = restrictedRegions.get(observation.region);
  if (!width || (observation.region && !restrictedRole && !fullMoneyRegions.has(observation.region))) return candidates;
  // These two crops already contain one label/value pair validated against the
  // ledger. Their coordinates can originate in separately scaled image regions.
  const validatedPair = observation.region === 'small-tax' || observation.region === 'small-total';
  const rows = validatedPair && observation.words?.length === 2 ? [observation.words] : receiptWordRows(observation);
  for (const row of rows) {
    for (let i=0;i<row.length;i++) {
      const word = row[i];
      let token = label(word);
      if (/(?:^|\s)TAX[.:;|]*$/i.test(word.text.trim())) token = 'tax';
      if (observation.region === 'small-total' && /^total[dp]?[.:$§►▸]*$/i.test(word.text)) token = 'total';
      if (!['total','subtotal','tax','balance'].includes(token)) continue;
      const previous = row[i-1];
      const neighbor = previous && captionGap(previous,word);
      const prefix = neighbor ? label(previous) : '';
      if (excluded.test(prefix)) continue;
      let at = i+1;
      let role = token==='subtotal' ? 'subtotalCents' : token==='tax' ? 'taxCents' : token==='balance' ? 'balanceDueCents' : 'totalCents';
      if (token==='total' && (prefix==='tax' || label(row[at])==='tax')) continue;
      if (token==='total' && stop.test(label(row[at]))) continue;
      if (token==='balance' && ['due','owed'].includes(label(row[at]))) at++;
      if (token==='total' && prefix==='sub') role='subtotalCents';
      // A nearby noun qualifies this total (e.g. merchandise total or line total).
      if (role==='totalCents' && prefix && !qualified.has(prefix)) continue;
      if (restrictedRole && role !== restrictedRole) continue;
      const caption = token === 'tax' ? printedTaxCaption(row,i) : null;
      if (token === 'tax' && !caption) continue;
      if (caption && /^\d+(?:\.\d+)?%$/.test(row[at]?.text)) at++;
      else if (caption && /^\d+(?:\.\d+)?$/.test(row[at]?.text) && row[at+1]?.text === '%') at+=2;
      let marked = /[$§]/.test(word.text);
      while (at<row.length && at-i<=6 && marker.test(row[at].text)) {
        marked ||= /[$§►▸»>]/.test(row[at].text);
        at++;
      }
      const value = row[at];
      if (!value || !numeric.test(value.text) || gap(word,value) < -2 || gap(word,value) > width*.35) continue;
      if (!validatedPair && !onSameBaseline(word,value)) continue;
      // A second amount before another caption leaves the column association
      // ambiguous. Do not let an adjacent price or tender confirm this label.
      let next = at+1;
      while (next < row.length && marker.test(row[next].text)) next++;
      if (row[next] && numeric.test(row[next].text)) continue;
      if (role==='totalCents' && row.slice(at+1).some(w => /[a-z]{2}/i.test(w.text)) && !qualified.has(prefix) && !marked && !value.text.includes('$')) continue;
      candidates.push({role, taxLabel:caption?.name, key:value.text.replace(/[$,]/g,''), top:value.top, height:value.height,
        labelConfidence:caption?.confidence ?? word.confidence ?? 100, valueConfidence:value.confidence ?? 100});
    }
  }
  return candidates;
}

export function receiptLayoutAmounts(page, {includeLocations = false} = {}) {
  const reads = [...new Set([page,...(page.supplemental || [])])];
  const groups = new Map();
  for (const read of reads) {
    for (const candidate of amountCandidates(read)) {
      const id = [candidate.role,candidate.taxLabel,candidate.key].join('|');
      const evidence = groups.get(id) || [];
      evidence.push({...candidate,read});
      groups.set(id,evidence);
    }
  }
  const accepted = [];
  for (const evidence of groups.values()) {
    const strong = evidence.filter(e => e.labelConfidence >= 70 && e.valueConfidence >= 75);
    const anchors = strong.length ? strong : evidence.filter(e => e.valueConfidence >= 80);
    if (!anchors.length || (!strong.length && new Set(evidence.map(e => e.read)).size < 2)) continue;
    const {role,key,taxLabel} = evidence[0];
    const entry = taxLabel ? {role,token:key,taxLabel} : {role,token:key};
    if (includeLocations) {
      // Automatic expense entry uses a stronger threshold than an editable suggestion.
      entry.strongFinal = role === 'totalCents' && (anchors.some(e =>
        e.labelConfidence >= 85 && e.valueConfidence >= 85) ||
        new Set(strong.filter(e => e.valueConfidence >= 80).map(e => e.read)).size >= 2);
      entry.locations = anchors.filter(e => Number.isFinite(e.top) && e.height > 0 && Number.isFinite(e.height))
        .map(({read,top,height}) => ({read,top,height}));
    }
    accepted.push(entry);
  }
  return accepted;
}
