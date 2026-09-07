// Presentation math only. These functions never normalize or persist a log.
export function handleCentersV111(startMin, endMin, width, buttonWidth = 100) {
  const half = buttonWidth / 2, pad = 8, gap = buttonWidth + 8;
  const low = half + pad, high = width - low;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const x = minute => width * (52 + Number(minute) / 1440 * 894) / 1000;
  let start = clamp(x(startMin), low, high), end = clamp(x(endMin), low, high);
  if (end - start < gap) {
    const center = clamp((start + end) / 2, low + gap / 2, high - gap / 2);
    start = center - gap / 2; end = center + gap / 2;
  }
  return { start, end };
}
export function draggedMinuteV111(event, edge, initial, deltaX, width) {
  if (!event || !['start','end'].includes(edge) || !Number.isFinite(width) || width <= 0) return initial;
  const raw = Math.round(initial + deltaX / (width * 0.894) * 1440);
  const low = edge === 'start' ? 0 : Number(event.startMin) + 1;
  const high = edge === 'start' ? Math.min(1439, Number(event.endMin) - 1) : 1440;
  return Math.max(low, Math.min(high, raw));
}
