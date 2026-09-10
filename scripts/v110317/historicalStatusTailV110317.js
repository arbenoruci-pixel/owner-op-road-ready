// A live paper-log status remains in effect after its initial one-minute row.
// Past-day checks use the same known tail that Log and Insert already use.
// This projection is read-only; an explicit manual End remains authoritative.
export function historicalStatusTailV110317(events = [], isPastDay = false) {
  const rows = events.map(event => ({ ...event }));
  const last = rows.at(-1);
  if (isPastDay && last && ['OFF', 'SB', 'ON'].includes(last.status)
    && last.source === 'live_status' && !last.paperLogEndV110315
    && Number.isInteger(last.startMin) && Number.isInteger(last.endMin)
    && last.startMin >= 0 && last.endMin > last.startMin && last.endMin < 1440) {
    rows[rows.length - 1] = { ...last, endMin: 1440 };
  }
  return rows;
}
