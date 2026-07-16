function textV1036(value = '') {
  return String(value || '').trim();
}

function minuteV1036(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1440, Math.round(parsed)));
}

/**
 * Manual RODS stores a newly-selected live status as a short raw row. The row
 * remains in force until the next duty-status change. This helper derives that
 * open tail for display/check calculations only; it never mutates or invents
 * stored duty-status time.
 */
export function extendCurrentStatusTailV1036(events = [], options = {}) {
  const rows = (Array.isArray(events) ? events : []).map(event => ({ ...event }));
  const targetEnd = minuteV1036(options.targetEnd, 0);
  if (!options.isCurrentDay || !rows.length || targetEnd <= 0) {
    return { events:rows, extended:false, eventId:'', rawEndMin:null, targetEnd };
  }

  const lastIndex = rows.length - 1;
  const last = rows[lastIndex] || {};
  const activeStatus = textV1036(options.currentStatus || options.activeStatus).toUpperCase();
  const activeEventId = textV1036(options.currentEventId || options.activeEventId);
  const lastStatus = textV1036(last.status).toUpperCase();
  const lastId = textV1036(last.id);
  const startMin = minuteV1036(last.startMin, 0);
  const rawEndMin = Math.max(startMin + 1, minuteV1036(last.endMin, startMin + 1));

  const statusMatches = Boolean(activeStatus) && activeStatus === lastStatus;
  const eventMatches = !activeEventId || !lastId || activeEventId === lastId;
  const alreadyStarted = startMin <= targetEnd;
  if (!statusMatches || !eventMatches || !alreadyStarted || targetEnd <= rawEndMin) {
    return { events:rows, extended:false, eventId:lastId, rawEndMin, targetEnd };
  }

  rows[lastIndex] = {
    ...last,
    endMin:Math.max(startMin + 1, targetEnd),
    liveTailDerivedV1036:true,
  };
  return {
    events:rows,
    extended:true,
    eventId:lastId,
    status:lastStatus,
    startMin,
    rawEndMin,
    targetEnd,
  };
}
