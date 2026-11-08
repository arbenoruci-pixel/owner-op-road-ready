// Read-only display model. Never writes loads, invoices, payments or driver records.
const text = value => String(value ?? '').trim();
const statuses = load => [load.status, load.operationalStatus, load.serviceStatus, load.documentWorkflowStage, load.serviceOutcome].map(value => text(value).toLowerCase());
export function grossValue(load = {}) {
  for (const key of ['gross', 'revenue']) {
    const value = load[key];
    if (value === null || value === undefined || text(value) === '') continue;
    const cleaned = typeof value === 'number' ? value : text(value).replace(/^\$\s*/, '').replace(/,/g, '');
    if (typeof cleaned === 'string' && !/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
    const amount = Number(cleaned);
    return Number.isFinite(amount) && amount >= 0 && amount <= 1e10 ? Math.round(amount * 100) / 100 : null;
  }
  return null;
}
export const grossMoney = value => value === null ? '—' : Number(value).toLocaleString('en-US', {style:'currency', currency:'USD', minimumFractionDigits:2, maximumFractionDigits:2});
function dayKey(value) {
  const s = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const date = new Date(s + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === s ? s : '';
}
export function recordedGrossDate(load = {}) {
  const explicit = dayKey(load.actualDeliveryDate) || dayKey(load.deliveryDate);
  if (explicit) return explicit;
  return statuses(load).includes('tonu') ? dayKey(load.serviceDate) || dayKey(load.pickupDate) || dayKey(load.date) : '';
}
export function grossSummary(loads = [], today) {
  if (!dayKey(today)) throw new TypeError('A valid home-terminal calendar date is required');
  const end = new Date(today + 'T12:00:00Z');
  end.setUTCDate(end.getUTCDate() - (end.getUTCDay() + 6) % 7);
  const weekStart = end.toISOString().slice(0,10), monthStart = today.slice(0,7) + '-01';
  const result = {today, weekStart, monthStart, week:{cents:0,count:0}, month:{cents:0,count:0}, total:{cents:0,count:0}, missingAmount:0, undated:0, conflicts:0, future:0};
  const groups = new Map();
  for (const load of Array.isArray(loads) ? loads : []) {
    if (!load || load.deleted || load.isTest || load.testOnly) continue;
    const state = statuses(load);
    if (state.some(s => /^(cancelled|canceled|void|voided|test)$/.test(s))) continue;
    if (!state.some(s => /^(delivered|completed|closed|invoice_ready|invoiced|submitted|paid|archived|tonu|completed_per_owner)$/.test(s)) && !load.shipmentCompletionReview) continue;
    const identity = text(load.canonicalLoadNo || load.loadNo || load.load_no).toUpperCase() || text(load.id);
    if (!identity) continue;
    const rows = groups.get(identity) || []; rows.push(load); groups.set(identity, rows);
  }
  for (const rows of groups.values()) {
    const amounts = [...new Set(rows.map(grossValue).filter(v => v !== null).map(v => Math.round(v * 100)))];
    const days = [...new Set(rows.map(recordedGrossDate).filter(Boolean))];
    if (amounts.length > 1 || days.length > 1) {result.conflicts++; continue;}
    if (!amounts.length) {result.missingAmount++; continue;}
    const cents = amounts[0], day = days[0] || '';
    if (day > today) {result.future++; continue;}
    result.total.cents += cents; result.total.count++;
    if (!day) {result.undated++; continue;}
    for (const [key, from] of [['week',weekStart],['month',monthStart]]) {
      if (day >= from) {result[key].cents += cents; result[key].count++;}
    }
  }
  return result;
}
