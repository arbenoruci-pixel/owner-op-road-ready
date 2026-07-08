export const DEFAULT_HOME_TERMINAL_TIMEZONE = 'America/New_York';
export const DEFAULT_HOME_TERMINAL_TIMEZONE_LABEL = 'Eastern Time';
export const DEFAULT_HOME_TERMINAL_ADDRESS = '482 Race St, Rahway, NJ 07065';
export const HOME_TERMINAL_TIMEZONE_STORAGE_KEY = 'owner-op-road-ready-home-terminal-timezone-v1';

export const COMMON_LOG_TIME_ZONES = [
  { value: 'America/New_York', label: 'Eastern Time', short: 'ET', example: 'New Jersey / New York / Atlanta' },
  { value: 'America/Chicago', label: 'Central Time', short: 'CT', example: 'Chicago / Dallas / Memphis' },
  { value: 'America/Denver', label: 'Mountain Time', short: 'MT', example: 'Denver / Salt Lake City' },
  { value: 'America/Phoenix', label: 'Arizona Time', short: 'AZ', example: 'Phoenix / no DST' },
  { value: 'America/Los_Angeles', label: 'Pacific Time', short: 'PT', example: 'Los Angeles / Seattle' },
  { value: 'America/Anchorage', label: 'Alaska Time', short: 'AK', example: 'Anchorage' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time', short: 'HI', example: 'Honolulu / no DST' },
  { value: 'Europe/Belgrade', label: 'Kosovo / Central Europe', short: 'CET', example: 'Kosovo test only' },
];

const COMMON_BY_VALUE = new Map(COMMON_LOG_TIME_ZONES.map(item => [item.value, item]));

export function isValidTimeZone(value) {
  const zone = String(value || '').trim();
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimeZone(value, fallback = DEFAULT_HOME_TERMINAL_TIMEZONE) {
  const zone = String(value || '').trim();
  if (isValidTimeZone(zone)) return zone;
  const safeFallback = String(fallback || DEFAULT_HOME_TERMINAL_TIMEZONE).trim();
  return isValidTimeZone(safeFallback) ? safeFallback : DEFAULT_HOME_TERMINAL_TIMEZONE;
}

export function getStoredHomeTerminalTimeZone() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return normalizeTimeZone(window.localStorage.getItem(HOME_TERMINAL_TIMEZONE_STORAGE_KEY));
    }
  } catch {}
  return DEFAULT_HOME_TERMINAL_TIMEZONE;
}

export function persistHomeTerminalTimeZone(value) {
  const zone = normalizeTimeZone(value);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(HOME_TERMINAL_TIMEZONE_STORAGE_KEY, zone);
    }
  } catch {}
  return zone;
}

export function getHomeTerminalTimeZone(stateLike = null) {
  const fromState = stateLike?.homeTerminalTimeZone
    || stateLike?.settings?.homeTerminalTimeZone
    || stateLike?.carrierSettings?.homeTerminalTimeZone
    || stateLike?.driverProfile?.homeTerminalTimeZone;
  if (fromState) return normalizeTimeZone(fromState);
  return getStoredHomeTerminalTimeZone();
}

export function timeZoneDisplayName(value = DEFAULT_HOME_TERMINAL_TIMEZONE) {
  const zone = normalizeTimeZone(value);
  const known = COMMON_BY_VALUE.get(zone);
  if (known) return known.label;
  return zone.replace(/_/g, ' ');
}

export function timeZoneShortLabel(value = DEFAULT_HOME_TERMINAL_TIMEZONE, date = new Date()) {
  const zone = normalizeTimeZone(value);
  const known = COMMON_BY_VALUE.get(zone);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).formatToParts(date instanceof Date ? date : new Date(date || Date.now()));
    const label = parts.find(part => part.type === 'timeZoneName')?.value || '';
    if (label && label.length <= 5) return label;
  } catch {}
  return known?.short || zone;
}

export function timeZoneSettingSummary(value = DEFAULT_HOME_TERMINAL_TIMEZONE) {
  const zone = normalizeTimeZone(value);
  const name = timeZoneDisplayName(zone);
  const short = timeZoneShortLabel(zone);
  return `${name} (${zone}${short && short !== zone ? ` · ${short}` : ''})`;
}

export function homeTerminalConfigFromState(stateLike = {}) {
  const zone = getHomeTerminalTimeZone(stateLike);
  return {
    timeZone: zone,
    label: timeZoneDisplayName(zone),
    shortLabel: timeZoneShortLabel(zone),
    address: stateLike?.homeTerminalAddress || stateLike?.settings?.homeTerminalAddress || DEFAULT_HOME_TERMINAL_ADDRESS,
  };
}

function partsForDate(date = new Date(), timeZone = getStoredHomeTerminalTimeZone()) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  const zone = normalizeTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(Number.isNaN(d.getTime()) ? new Date() : d);
  const out = {};
  for (const part of parts) {
    if (part.type !== 'literal') out[part.type] = part.value;
  }
  let hour = Number(out.hour || 0);
  if (hour === 24) hour = 0;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour,
    minute: Number(out.minute || 0),
  };
}

export function homeTerminalDayKey(date = new Date(), timeZone = getStoredHomeTerminalTimeZone()) {
  const p = partsForDate(date, timeZone);
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function homeTerminalMinute(date = new Date(), timeZone = getStoredHomeTerminalTimeZone()) {
  const p = partsForDate(date, timeZone);
  return Math.max(0, Math.min(1439, p.hour * 60 + p.minute));
}

export function addDaysToDayKey(dayKey, delta = 0) {
  const [y, m, d] = String(dayKey || '').split('-').map(Number);
  const dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1, 12, 0, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + Number(delta || 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function dayKeyDateParts(dayKey) {
  const [y, m, d] = String(dayKey || '').split('-').map(Number);
  const dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1, 12, 0, 0, 0));
  return {
    weekdayShort: dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
    weekdayLong: dt.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
    monthShort: dt.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
    day: String(d || 1).padStart(2, '0'),
    year: String(y || 1970),
  };
}
