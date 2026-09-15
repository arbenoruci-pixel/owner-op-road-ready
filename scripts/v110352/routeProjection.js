// Read-only projection: choose one whole revision per route ID before day/status
// filtering. Bucket insertion order must never override a newer saved revision.
const text = value => value == null ? '' : String(value).trim();
const timestamp = value => {
  if (value == null || value === '') return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
};
const stable = value => value == null || typeof value !== 'object'
  ? JSON.stringify(value)
  : Array.isArray(value) ? '[' + value.map(stable).join(',') + ']'
    : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
const statusRank = row => /^(cancelled|canceled|archived|superseded|dismissed)$/i.test(text(row.status)) ? 2
  : /^(delivered|completed|closed)$/i.test(text(row.status)) ? 1 : 0;
const linkCount = row => ['pickupEventId','deliveryEventId','sourceEventId'].filter(key => text(row[key])).length;
function prefer(a, b) {
  const delta = timestamp(b.updatedAt) - timestamp(a.updatedAt)
    || statusRank(b) - statusRank(a) || linkCount(b) - linkCount(a);
  if (delta) return delta > 0 ? b : a;
  // Equal/missing timestamps are legacy data: choose deterministically, without
  // manufacturing a timestamp or mixing fields from conflicting revisions.
  return stable(b) > stable(a) ? b : a;
}
export function newestRouteCopies(rows = []) {
  const selected = new Map(), order = [], exclusions = new Map();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const id = text(row.id);
    if (!id) { order.push({row}); continue; }
    if (!selected.has(id)) { selected.set(id,row); order.push({id}); }
    else selected.set(id,prefer(selected.get(id),row));
    // Explicit erased-day exclusions are tombstones, not stale display fields.
    if (Array.isArray(row.logbookExcludedDaysV110352)) {
      if (!exclusions.has(id)) exclusions.set(id,new Set());
      for (const day of row.logbookExcludedDaysV110352) exclusions.get(id).add(day);
    }
  }
  return order.map(({id,row}) => {
    if (!id) return row;
    const winner = selected.get(id), omitted = exclusions.get(id);
    return omitted ? {...winner,logbookExcludedDaysV110352:[...omitted].sort()} : winner;
  });
}
