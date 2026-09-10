// Insert owns a draft interval. Moving either handle can move that interval
// past its other edge, including a one-minute selection.
export function insertPointerMinuteV110316(edge, initial, deltaX, width) {
  if (!['start','end'].includes(edge) || !Number.isFinite(width) || width <= 0) return initial;
  const minute = Math.round(initial + deltaX / (width * 0.894) * 1440);
  return Math.max(edge === 'start' ? 0 : 1, Math.min(edge === 'start' ? 1439 : 1440, minute));
}
