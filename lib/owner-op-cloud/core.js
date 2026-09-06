export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(x => canonical(x === undefined ? null : x)).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export function validDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return false;
  const d = new Date(day + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}
export function eightDays(end) {
  if (!validDay(end)) throw new Error('Invalid inspection date');
  return Array.from({ length: 8 }, (_, i) => {
    const d = new Date(end + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 7 + i); return d.toISOString().slice(0, 10);
  });
}
export function homeDay(now = new Date(), zone = 'America/Chicago') {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function minuteAt(stamp, zone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(stamp)).map(x => [x.type, x.value]));
  return Number(p.hour) * 60 + Number(p.minute);
}
export function timeLabel(minute) {
  if (!Number.isFinite(minute)) return 'Open';
  const n = Math.max(0, Math.min(1440, Math.floor(minute)));
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}
export function durationLabel(minute) {
  const n = Math.max(0, Math.round(minute)); return `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, '0')}m`;
}
export function dailyModel(snapshot, cutoff = 1440) {
  const raw = snapshot?.dayData?.events || [];
  const warnings = [];
  const totals = { OFF: 0, SB: 0, D: 0, ON: 0 };
  const rows = raw.map(event => {
    const start = event.startMin == null ? NaN : Number(event.startMin);
    const end = event.endMin == null ? NaN : Number(event.endMin);
    const valid = Object.hasOwn(totals, event.status) && Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end >= start && end <= 1440;
    if (!valid) warnings.push('An event has missing or invalid time/status; review the original record.');
    return { ...event, start, end, valid };
  }).sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const row of rows) {
    if (!row.valid || row.start >= cutoff) continue;
    const end = Math.min(row.end, cutoff);
    if (row.start > cursor) warnings.push(`No recorded event from ${timeLabel(cursor)} to ${timeLabel(row.start)}.`);
    if (row.start < cursor) warnings.push(`Overlapping events at ${timeLabel(row.start)}.`);
    totals[row.status] += end - row.start;
    cursor = Math.max(cursor, end);
  }
  if (cursor < cutoff) warnings.push(`No recorded event from ${timeLabel(cursor)} to ${timeLabel(cutoff)}.`);
  const form = snapshot?.dayData?.form || {};
  const candidates = [form.distance, form.distanceMiles, form.totalMiles, snapshot?.dayData?.manualMiles];
  const recorded = candidates.find(x => (typeof x === 'number' || typeof x === 'string') && String(x).trim() !== '' && Number.isFinite(Number(x)) && Number(x) >= 0);
  const miles = recorded === undefined ? null : Number(recorded);
  return { rows, totals, warnings: [...new Set(warnings)], miles };
}
export const METADATA_FIELDS = ['title','number','state','unit','trailer','plate','vin','carrier','policyNo','mcNumber','usdotNumber','year','quarter','loadNo','bolNo','inspectionDate','expiresOn','notes','present','enabled','updatedAt','attachedAt','attachmentName','attachmentType','attachmentSize'];
export function walletMetadata(doc = {}) {
  return Object.fromEntries(METADATA_FIELDS.filter(k => ['string','number','boolean'].includes(typeof doc[k])).map(k => [k, typeof doc[k] === 'string' ? doc[k].slice(0, k === 'notes' ? 2000 : 250) : doc[k]]));
}
export function makeSnapshot(state, day, builder) {
  const snapshot = builder(state, day, '110.0.0');
  delete snapshot.createdAt;
  snapshot.rawDayBuckets = {};
  for (const [key, value] of Object.entries(state)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, day)) snapshot.rawDayBuckets[key] = value[day];
  }
  snapshot.profileAtBackup = profileFromState(state);
  return JSON.parse(JSON.stringify(snapshot));
}
export function profileFromState(state = {}) {
  const p = state.driverProfile || {}, r = state.roadguardProfile || {};
  return {
    driverName: p.name || p.driverName || state.driverSignature?.driverName || r.driverName || state.driver?.name || state.driverName || '',
    carrierName: state.carrierName || p.carrierName || r.carrierName || state.companyName || '',
    usdot: state.dotNumber || state.usdot || p.usdotNumber || '',
    unit: state.currentTruck || state.driver?.truck || p.truckNumber || '',
    trailer: state.currentTrailer || state.driver?.trailer || '',
    homeTerminal: state.homeTerminalAddress || p.homeTerminal || '',
    mainOffice: state.mainOfficeAddress || state.mainOffice || r.mainOffice || ''
  };
}
