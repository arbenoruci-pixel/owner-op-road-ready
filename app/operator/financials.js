export function formatDay(value) {
  if (!value) return 'Pending';
  const day = new Date(value.slice(0, 10) + 'T12:00:00Z');
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(day);
}

export function moveDay(value, days) {
  const date = new Date(value + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekStart(value) {
  const dayOfWeek = new Date(value + 'T12:00:00Z').getUTCDay();
  return moveDay(value, -((dayOfWeek + 6) % 7));
}

export function currentWeek(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const field = (name) => parts.find((part) => part.type === name).value;
  return weekStart([field('year'), field('month'), field('day')].join('-'));
}

export function recordedRevenue(loads) {
  const missing = loads.some((load) => !Number.isSafeInteger(load.gross_cents));
  return missing ? null : loads.reduce((total, load) => total + load.gross_cents, 0);
}

export function activityDays(loads, expenses = []) {
  const dates = new Map();
  function bucket(date) {
    const key = date || '';
    if (!dates.has(key)) dates.set(key, { date: key, loads: [], expenses: [] });
    return dates.get(key);
  }
  for (const load of loads) bucket(load.actual_delivery_date).loads.push(load);
  for (const expense of expenses) bucket(expense.purchased_on).expenses.push(expense);
  return [...dates.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function paymentRecorded(statement, netCents, now = Date.now()) {
  const paidAt = Date.parse(statement.paid_at);
  return statement.status === 'paid' && Boolean(statement.payment_reference?.trim())
    && typeof statement.paid_at === 'string' && Number.isFinite(paidAt) && paidAt <= now
    && Number.isSafeInteger(netCents) && netCents >= 0 && statement.payment_amount_cents === netCents;
}
