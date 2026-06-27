export function localDayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(dayKey, delta) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return localDayKey(dt);
}

export function isToday(dayKey) {
  return dayKey === localDayKey();
}

export function lastNDays(count, fromKey = localDayKey()) {
  return Array.from({ length: count }, (_, i) => addDays(fromKey, -i));
}

export function dayTitle(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const mon = dt.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  return `${dow} | ${mon} ${String(d).padStart(2, '0')}`;
}

export function dayRowTitle(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    day: dt.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase(),
    date: `${dt.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()} ${String(d).padStart(2, '0')}`,
  };
}
