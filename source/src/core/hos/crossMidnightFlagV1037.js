function minuteV1037(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1440, Math.round(number)));
}

function orderedRealEventsV1037(events = []) {
  return [...(Array.isArray(events) ? events : [])]
    .filter(Boolean)
    .filter(event => !event.voided && !event.syntheticCoverage && !event.carriedFromPreviousDay && !event.displayOnly)
    .sort((a, b) => minuteV1037(a.startMin, 0) - minuteV1037(b.startMin, 0));
}

function nextDayKeyV1037(day = '') {
  const match = String(day || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * crossMidnightContinues is valid only when a Driving event reaches midnight
 * and the next log day begins with an explicit Driving event. Old backups could
 * retain the flag after the driver changed to Sleeper/Off Duty before midnight.
 * This repairs metadata only; duty status, start/end times and locations stay
 * unchanged.
 */
export function repairCrossMidnightFlagsV1037(eventsByDay = {}) {
  const source = eventsByDay && typeof eventsByDay === 'object' ? eventsByDay : {};
  const out = { ...source };

  Object.keys(source).forEach(day => {
    const nextDay = nextDayKeyV1037(day);
    const nextFirst = orderedRealEventsV1037(source[nextDay] || [])[0] || null;
    const rows = Array.isArray(source[day]) ? source[day] : [];

    out[day] = rows.map(event => {
      if (!event?.crossMidnightContinues) return event;

      const reachesMidnight = minuteV1037(event.endMin, minuteV1037(event.startMin, 0) + 1) >= 1439;
      const explicitNextDayDriving = !!nextFirst
        && String(nextFirst.status || '').toUpperCase() === 'D'
        && minuteV1037(nextFirst.startMin, 0) <= 1;

      if (String(event.status || '').toUpperCase() === 'D' && reachesMidnight && explicitNextDayDriving) {
        return event;
      }

      const repaired = { ...event };
      delete repaired.crossMidnightContinues;
      return repaired;
    });
  });

  return out;
}
