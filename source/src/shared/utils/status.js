export const STATUS_ORDER = ['OFF', 'SB', 'D', 'ON'];
export const STATUS = {
  OFF: { label: 'OFF DUTY', color: '#0B7DEC', soft: 'rgba(11,125,236,.10)' },
  SB: { label: 'SLEEPER', color: '#6B7280', soft: 'rgba(107,114,128,.12)' },
  D: { label: 'DRIVING', color: '#62B934', soft: 'rgba(98,185,52,.14)' },
  ON: { label: 'ON DUTY', color: '#4F95D1', soft: 'rgba(79,149,209,.13)' },
};
export function label(status) { return STATUS[status]?.label || 'OFF DUTY'; }
export function color(status) { return STATUS[status]?.color || STATUS.OFF.color; }
export function soft(status) { return STATUS[status]?.soft || STATUS.OFF.soft; }
export function rowIndex(status) { return STATUS_ORDER.indexOf(status); }
