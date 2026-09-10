// Draft-only time choices. Save still uses the Logbook override contract.
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export function insertDayLimitV110314(state, clock) {
  const day = state.activeDay || clock.day;
  return day < clock.day ? 1440 : day > clock.day ? 0 : clamp(clock.minute, 0, 1440);
}
export function initialInsertRangeV110314(limit, start, end) {
  if (limit < 1) return { startMin: 0, endMin: 0 };
  if (!Number.isFinite(start) || start >= limit) {
    return { startMin: Math.max(0, limit - 15), endMin: limit };
  }
  const startMin = clamp(Math.round(start), 0, limit - 1);
  return { startMin, endMin: clamp(Math.round(Number.isFinite(end) ? end : startMin + 15), startMin + 1, limit) };
}
export function quickInsertRangeV110314(limit, minutesAgo) {
  return minutesAgo === 0
    ? initialInsertRangeV110314(limit)
    : initialInsertRangeV110314(limit, Math.max(0, limit - minutesAgo), limit);
}
export function durationInsertRangeV110314(limit, start, minutes) {
  if (limit < 1) return { startMin: 0, endMin: 0 };
  const duration = clamp(Math.round(minutes), 1, limit);
  const startMin = clamp(Number.isFinite(start) ? start : limit - duration, 0, limit - duration);
  return { startMin, endMin: startMin + duration };
}
export function insertBoundaryV110314(range, edge, minute, limit, field = false) {
  if (!Number.isFinite(minute) || !['start', 'end'].includes(edge)) return range;
  if (limit < 1) return { startMin: 0, endMin: 0 };
  let { startMin, endMin } = range;
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || startMin >= endMin || endMin > limit) {
    ({ startMin, endMin } = initialInsertRangeV110314(limit));
  }
  const duration = endMin - startMin;
  if (edge === 'start') {
    const next = clamp(Math.round(minute), 0, limit - 1);
    if (field && next >= endMin) endMin = Math.min(limit, next + duration);
    startMin = Math.min(next, endMin - 1);
  } else {
    const next = clamp(Math.round(minute), 1, limit);
    if (field && next <= startMin) startMin = Math.max(0, next - duration);
    endMin = Math.max(next, startMin + 1);
  }
  return { startMin, endMin };
}
