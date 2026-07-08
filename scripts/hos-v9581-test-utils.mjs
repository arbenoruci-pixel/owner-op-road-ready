export function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

export function assertMinutes(actual, expected, label) {
  assert(actual === expected, `${label}: expected ${expected} minutes, got ${actual}`);
}

export function localDate(day, hour = 0, minute = 0) {
  const [y, m, d] = String(day).split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0);
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
