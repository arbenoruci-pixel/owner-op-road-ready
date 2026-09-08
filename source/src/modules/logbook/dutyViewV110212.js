// Read-only continuity must not hide actual gaps/overlaps or invent Driving.
// Editor projections and persisted events are never modified here.
export function dutyViewEvents(exactEvents=[],continuousEvents=[]) {
  if (!exactEvents.length) return continuousEvents;
  let end=0;
  for (const event of exactEvents) {
    if (!Number.isInteger(event.startMin) || !Number.isInteger(event.endMin)
      || event.startMin!==end || event.endMin<=event.startMin || event.endMin>1440) {
      return exactEvents;
    }
    end=event.endMin;
  }
  if (exactEvents.at(-1).status==='D') return exactEvents;
  return continuousEvents;
}
