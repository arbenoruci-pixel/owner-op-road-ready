export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Math.round(n)));
}
export function nowMin() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}
export function toInput(min) {
  const m = clamp(min, 0, 1439);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
export function fromInput(value) {
  const [h='0', m='0'] = String(value || '00:00').split(':');
  return clamp(Number(h) * 60 + Number(m), 0, 1439);
}
export function timeLabel(min, seconds=false) {
  const raw = Number(min || 0);
  if (raw >= 1440) return `12:00${seconds ? ':00' : ''} AM`;
  const m = clamp(raw, 0, 1439);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(mm).padStart(2, '0')}${seconds ? ':00' : ''} ${ap}`;
}
export function durLabel(mins) {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h && mm) return `${h}h ${mm}m`;
  if (h) return `${h}h`;
  return `${mm}m`;
}
export function round5(min) {
  return Math.round(min / 5) * 5;
}
