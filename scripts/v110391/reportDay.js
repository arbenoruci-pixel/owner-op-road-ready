import { projectLogbookEvents, logbookClock } from './eventEditingV110.js';
import { confirmedDrivingDayView } from './drivingDayViewV110372.js';
import { knownMidnightCarry } from '../../core/timeline/knownMidnightCarry.js';
import { historicalStatusTailV110317 } from '../../core/timeline/historicalStatusTailV110317.js';
import { addDays } from '../../shared/utils/date.js';

const statuses = new Set(['OFF', 'SB', 'D', 'ON']);
const derived = new Set(['timeline_continuity', 'carryover', 'display', 'display_timeline']);
const recorded = event => event && !['voided', 'deleted', 'deletedAt', 'syntheticCoverage',
  'displayOnly', 'carriedFromPreviousDay', 'synthetic', 'continuityGenerated'].some(key => event[key])
  && !derived.has(event.source);
const valid = event => statuses.has(event.status)
  && Number.isInteger(event.startMin) && Number.isInteger(event.endMin)
  && event.startMin >= 0 && event.endMin > event.startMin && event.endMin <= 1440;
const rowsFor = (state, day) => (Array.isArray(state.eventsByDay?.[day]) ? state.eventsByDay[day] : [])
  .filter(recorded).slice().sort((a, b) => a.startMin - b.startMin);

function manuallyEnded(state, day, event) {
  if (event.paperLogEndV110315) return true;
  // Historical edits can predate the explicit-End flag. The stored audit is
  // evidence only when its resulting interval still matches this record.
  return (state.logbookEditHistoryByDay?.[day] || []).some(edit => {
    if (edit.kind !== 'edit' || edit.targetId !== event.id) return false;
    const before = edit.beforeEvents?.find(row => row.id === event.id);
    const after = edit.afterEvents?.find(row => row.id === event.id);
    return before && after && before.endMin !== after.endMin
      && after.status === event.status && after.startMin === event.startMin && after.endMin === event.endMin;
  });
}

function previousOpenStatus(state, day) {
  for (const date of Object.keys(state.eventsByDay || {}).filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key) && key < day).sort().reverse()) {
    const rows = rowsFor(state, date);
    if (!rows.length) continue;
    const last = rows.at(-1);
    // A corrupt or explicitly ended day is a barrier: do not skip it to find
    // an older convenient status, and never infer Driving into another day.
    if (rows.some((row, index) => !valid(row) || (index && rows[index - 1].endMin > row.startMin))
      || last.status === 'D' || manuallyEnded(state, date, last)) return null;
    return { event:last, day:date };
  }
  return null;
}

/** Read-only officer projection, using the same evidence rules as Logbook.
 * Stored suggestions are discarded; a prefix is re-derived from the actual
 * preceding status. No default OFF, interior gap filling, or RODS writes.
 */
export function readLogbookReportDay(state = {}, day = '', at = new Date(), timeZone) {
  const viewState = timeZone ? { ...state, homeTerminalTimeZone:timeZone } : state;
  const clock = logbookClock(viewState, at);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > clock.day) return [];
  const end = day === clock.day ? clock.minute : 1440;
  const raw = rowsFor(state, day);
  const sound = raw.every((row, index) => valid(row) && (!index || raw[index - 1].endMin <= row.startMin));
  const previous = sound ? previousOpenStatus(state, day) : null;
  if (!raw.length) {
    if (!previous || end <= 0) return [];
    const event = previous.event;
    return [{ id:`report_carry_${day}_${event.id || previous.day}`, status:event.status,
      startMin:0, endMin:end, city:event.city || '', state:event.state || '',
      note:event.status === 'SB' ? 'Sleeper' : event.status === 'ON' ? 'On Duty' : 'Off Duty',
      source:'known_midnight_carry', displayOnly:true, syntheticCoverage:true, carriedFromPreviousDay:true }];
  }
  const input = raw.filter(valid).map(event => manuallyEnded(state, day, event)
    ? { ...event, paperLogEndV110315:true } : { ...event });
  const nextDay = addDays(day, 1);
  const projectionState = { ...viewState, eventsByDay:{ ...state.eventsByDay,
    [day]:input, [nextDay]:rowsFor(state, nextDay) } };
  let events = projectLogbookEvents(projectionState, day, at);
  if (sound && day < clock.day) {
    events = confirmedDrivingDayView(events, { state:projectionState, day, clock });
    events = historicalStatusTailV110317(events, true);
  }
  const carry = previous ? knownMidnightCarry(events, previous.event) : null;
  return (carry ? [carry, ...events] : events)
    .map(event => ({ ...event, endMin:Math.min(event.endMin, end) }))
    .filter(event => event.endMin > event.startMin);
}

export function logbookReportGaps(events = [], end = 1440) {
  const gaps = [];
  let cursor = 0;
  for (const event of events) {
    if (event.startMin > cursor) gaps.push({ startMin:cursor, endMin:Math.min(event.startMin, end) });
    cursor = Math.max(cursor, event.endMin);
  }
  if (cursor < end) gaps.push({ startMin:cursor, endMin:end });
  return gaps.filter(gap => gap.endMin > gap.startMin);
}
