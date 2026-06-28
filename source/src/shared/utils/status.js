export const STATUS_ORDER = ['OFF', 'SB', 'D', 'ON'];
// v92.5 Owner-Op Road Ready palette — original duty-status identity.
// OFF/SB read as graded steel-slate (neutral), D = ready green, ON = Road Ready blue.
// These hexes are the single source of truth for the graph + every duty chip/badge.
export const STATUS = {
  OFF: { label: 'OFF DUTY', color: '#596677', soft: 'rgba(89,102,119,.13)' },
  SB: { label: 'SLEEPER', color: '#7a8292', soft: 'rgba(122,130,146,.15)' },
  D: { label: 'DRIVING', color: '#168980', soft: 'rgba(22,137,128,.14)' },
  ON: { label: 'ON DUTY', color: '#2156d9', soft: 'rgba(33,86,217,.12)' },
};
export function label(status) { return STATUS[status]?.label || 'OFF DUTY'; }
export function color(status) { return STATUS[status]?.color || STATUS.OFF.color; }
export function soft(status) { return STATUS[status]?.soft || STATUS.OFF.soft; }
export function rowIndex(status) { return STATUS_ORDER.indexOf(status); }
