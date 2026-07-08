import {
  addDaysToDayKey,
  dayKeyDateParts,
  getStoredHomeTerminalTimeZone,
  homeTerminalDayKey,
} from '../../core/time/homeTerminalTime.js';

export function localDayKey(date = new Date(), timeZone = getStoredHomeTerminalTimeZone()) {
  return homeTerminalDayKey(date, timeZone);
}

export function addDays(dayKey, delta) {
  return addDaysToDayKey(dayKey, delta);
}

export function isToday(dayKey, timeZone = getStoredHomeTerminalTimeZone()) {
  return dayKey === localDayKey(new Date(), timeZone);
}

export function lastNDays(count, fromKey = localDayKey()) {
  return Array.from({ length: count }, (_, i) => addDays(fromKey, -i));
}

export function dayTitle(dayKey) {
  const parts = dayKeyDateParts(dayKey);
  return `${parts.weekdayShort.toUpperCase()} | ${parts.monthShort.toUpperCase()} ${parts.day}`;
}

export function dayRowTitle(dayKey) {
  const parts = dayKeyDateParts(dayKey);
  return {
    day: parts.weekdayLong.toUpperCase(),
    date: `${parts.monthShort.toUpperCase()} ${parts.day}`,
  };
}
