export function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

export function assertMinutes(actual, expected, label) {
  assert(actual === expected, `${label}: expected ${expected} minutes, got ${actual}`);
}

function zonedDate(day, hour = 0, minute = 0, timeZone = 'America/New_York') {
  const [y, m, d] = String(day).split('-').map(Number);
  const targetUtc = Date.UTC(y, m - 1, d, hour, minute, 0, 0);
  let utc = targetUtc;
  for (let i = 0; i < 4; i += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(utc));
    const byType = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    let hh = Number(byType.hour || 0);
    if (hh === 24) hh = 0;
    const renderedUtc = Date.UTC(
      Number(byType.year),
      Number(byType.month) - 1,
      Number(byType.day),
      hh,
      Number(byType.minute || 0),
      0,
      0
    );
    const diff = renderedUtc - targetUtc;
    if (Math.abs(diff) < 1000) break;
    utc -= diff;
  }
  return new Date(utc);
}

export function localDate(day, hour = 0, minute = 0, timeZone = 'America/New_York') {
  return zonedDate(day, hour, minute, timeZone);
}

export function ev(status, startMin, endMin, extra = {}) {
  return {
    id: extra.id || `${status}_${startMin}_${endMin}_${Math.random().toString(36).slice(2)}`,
    status,
    startMin,
    endMin,
    city: extra.city || 'Chicago',
    state: extra.state || 'IL',
    note: extra.note || (status === 'D' ? 'Driving' : status === 'ON' ? 'On Duty' : status === 'SB' ? 'Sleeper' : 'Off Duty'),
    source: extra.source || 'manual',
    ...extra,
  };
}

export function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function pass(name) {
  console.log(`PASS ${name}`);
}
