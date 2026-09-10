// Explicit retrospective Insert in the elapsed part of a live non-driving row.
// The existing command still owns validation, stale-snapshot checks, automatic
// Driving protection and ordinary interval splitting. No live session is ended.
export function previewElapsedInsertV110313(state, command, at, contract) {
  const { preview, project, clock: readClock, summarize, isStoredEvent } = contract;
  const original = preview(state, command, at);
  if (original.ok || original.error !== 'The current live event cannot be overwritten. End it using Change status first.') return original;

  const { day, event } = command;
  const clock = readClock(state, at);
  const liveRows = project(state, day, at).filter(row => row.isLive);
  if (day !== clock.day || liveRows.length !== 1) return original;
  const live = liveRows[0];
  if (!['OFF', 'SB', 'ON'].includes(live.status)) return original;
  if ([state.manualDrivingSession, state.gpsTrip].some(session =>
    session?.eventId === live.id && (session.active === true || session.status === 'active'))) return original;
  if (event.endMin > clock.minute) return { ok: false, error: 'Insert must end at or before Now. Choose an elapsed interval.' };

  const rows = state.eventsByDay[day];
  const raw = rows.find(row => isStoredEvent(row) && row.id === live.id);
  // The first call above has already checked expectedRows against the real day.
  // Project only this row to Now in a private preview input. The live identity
  // and current status are restored below; this temporary state is never saved.
  const projectedRows = rows.map(row => row === raw
    ? { ...row, source: 'manual', endMin: clock.minute }
    : row);
  const projected = {
    ...state,
    currentStatus: '',
    eventsByDay: { ...state.eventsByDay, [day]: projectedRows },
  };
  const split = preview(projected, {
    ...command,
    expectedRows: command.expectedRows ? projectedRows : undefined,
  }, at);
  if (!split.ok) return split;

  const used = new Set(rows.map(row => row?.id).concat(split.events.map(row => row?.id)));
  function fragmentId() {
    const base = `${raw.id}__before_${event.id}_${event.startMin}`;
    let id = base, suffix = 2;
    while (used.has(id)) id = `${base}_${suffix++}`;
    return id;
  }
  const left = split.events.find(row => isStoredEvent(row) && row.id === raw.id && row.startMin < event.startMin);
  const right = split.events.find(row => isStoredEvent(row) && row.startMin === event.endMin &&
    (row.id === raw.id || row.splitFromEventId === raw.id));
  const events = split.events.map(row => {
    if (row === left) return { ...row, id: fragmentId(), source: raw.source, splitFromEventId: raw.id };
    if (row !== right) return row;
    const resumed = { ...row, id: raw.id, source: raw.source };
    if (raw.splitFromEventId) resumed.splitFromEventId = raw.splitFromEventId;
    else delete resumed.splitFromEventId;
    return resumed;
  });
  if (!right) {
    // Keep the established live-row ID even when Insert ends exactly at Now.
    // The app's existing one-minute raw sentinel projects to zero elapsed time
    // at Now and grows normally; it does not start a new status or a recording.
    events.push({
      ...raw,
      startMin: event.endMin,
      endMin: Math.max(clock.minute, event.endMin + 1),
      ...(left && Number(raw.manualMiles) > 0
        ? { manualMiles: 0, manualMilesNeedsReview: true } : {}),
    });
  }
  const real = events.filter(isStoredEvent).sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin || String(a.id).localeCompare(String(b.id)));
  const changes = summarize(rows.filter(isStoredEvent), real, event.id);
  return { ...split, events: [...real, ...rows.filter(row => !isStoredEvent(row))], ...changes, timelineChanged: changes.neighborIds.length > 0 };
}
