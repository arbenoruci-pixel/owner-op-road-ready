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

function amountCandidates(observation) {
  const candidates = [];
  const width = observation.imageSize?.width;
  if (!width) return candidates;
  for (const row of receiptWordRows(observation)) {
    for (let i=0;i<row.length;i++) {
      const word = row[i], token = label(word);
      if (!['total','subtotal','tax','balance'].includes(token)) continue;
      const previous = row[i-1];
      const neighbor = previous && gap(previous,word) < Math.max(word.height * 2, width * .008);
      const prefix = neighbor ? label(previous) : '';
      if (excluded.test(prefix)) continue;
      let at = i+1;
      let role = token==='subtotal' ? 'subtotalCents' : token==='tax' ? 'taxCents' : token==='balance' ? 'balanceDueCents' : 'totalCents';
      if (token==='total' && label(row[at])==='tax') continue;
      if (token==='total' && stop.test(label(row[at]))) continue;
      if (token==='balance' && ['due','owed'].includes(label(row[at]))) at++;
      if (token==='total' && prefix==='sub') role='subtotalCents';
      let marked = /[$§]/.test(word.text);
      while (at<row.length && at-i<=4 && /^(?:[\s:|=•.()–—$§►▸»<>-]+|[DPd]{1,2}>?|USD)$/i.test(row[at].text)) {
        marked ||= /[$§►▸»>]/.test(row[at].text);
        at++;
      }
      const value = row[at];
      if (!value || !numeric.test(value.text) || gap(word,value) > width*.34) continue;
      // In a ledger one unqualified Total can be a category subtotal alongside
      // other columns. The grand-total caption or currency marker disambiguates.
      if (role==='totalCents' && row.slice(at+1).some(w => /[a-z]{2}/i.test(w.text)) && !qualified.has(prefix) && !marked && !value.text.includes('$')) continue;
      const key = value.text.replace(/[$,]/g,'');
      candidates.push({role, key, labelConfidence:word.confidence ?? 100, valueConfidence:value.confidence ?? 100});
    }
  }
  return candidates;
}

export function receiptLayoutAmounts(page) {
  const reads = [page,...(page.supplemental || [])];
  const byRole = new Map();
  for (const [index, read] of reads.entries()) {
    for (const candidate of amountCandidates(read)) {
      const role = byRole.get(candidate.role) || new Map();
      const evidence = role.get(candidate.key) || [];
      evidence.push({...candidate,index});
      role.set(candidate.key,evidence);
      byRole.set(candidate.role,role);
    }
  }
  const accepted = [];
  for (const [role,values] of byRole) {
    for (const [key,evidence] of values) {
      const strong = evidence.some(e => e.labelConfidence >= 70 && e.valueConfidence >= 75);
      const corroborated = new Set(evidence.map(e => e.index)).size >= 2 && evidence.some(e => e.valueConfidence >= 80);
      if (strong || corroborated) accepted.push({role,token:key});
    }
  }
  return accepted;
}
