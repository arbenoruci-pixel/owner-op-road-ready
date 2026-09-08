const CARRYABLE = new Set(['OFF', 'SB', 'ON']);
const DERIVED_SOURCES = new Set(['timeline_continuity', 'carryover', 'display', 'display_timeline']);

function recorded(event) {
  return event && !event.voided && !event.syntheticCoverage && !event.displayOnly
    && !event.carriedFromPreviousDay && !event.synthetic && !event.continuityGenerated
    && !DERIVED_SOURCES.has(event.source);
}

export function previousRecordedDuty(eventsByDay = {}, day = '') {
  for (const previousDay of Object.keys(eventsByDay).filter(key => key < day).sort().reverse()) {
    const rows = (eventsByDay[previousDay] || []).filter(recorded).slice().sort((a, b) => a.startMin - b.startMin);
    if (rows.length) return rows.at(-1);
  }
  return null;
}

// A known non-driving status remains in effect until the first recorded change.
// The stored end can be an earlier live snapshot. This read-only prefix follows
// the same evidence used for an empty carried day; it never invents Driving.
export function knownMidnightCarry(events = [], previous = null) {
  const first = events[0];
  if (!first || !Number.isInteger(first.startMin) || first.startMin <= 0 || first.startMin >= 1440
    || !recorded(previous) || !CARRYABLE.has(previous.status)
    || !Number.isInteger(previous.startMin) || !Number.isInteger(previous.endMin)
    || previous.startMin < 0 || previous.endMin <= previous.startMin || previous.endMin > 1440) return null;
  return {
    id: `known_midnight_${previous.id || 'prior'}_${first.id || 'first'}`,
    status: previous.status, startMin: 0, endMin: first.startMin,
    city: previous.city || '', state: previous.state || '',
    note: previous.status === 'SB' ? 'Sleeper' : previous.status === 'ON' ? 'On Duty' : 'Off Duty',
    description: '', source: 'known_midnight_carry',
    displayOnly: true, syntheticCoverage: true, carriedFromPreviousDay: true,
    carriedStartCoverageFromPreviousDay: true,
  };
}
