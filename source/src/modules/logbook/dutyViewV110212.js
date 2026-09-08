import { knownMidnightCarry, previousRecordedDuty } from '../../core/timeline/knownMidnightCarry.js';

// Read-only continuity must not hide actual gaps/overlaps or invent Driving.
// Editor projections and persisted events are never modified here.
export function dutyViewEvents(exactEvents=[],continuousEvents=[],context={}) {
  if (!exactEvents.length) return continuousEvents;
  const carry=knownMidnightCarry(exactEvents,previousRecordedDuty(context.eventsByDay,context.day));
  const exactWithCarry=carry?[carry,...exactEvents]:exactEvents;
  let end=carry?.endMin || 0;
  for (const event of exactEvents) {
    if (!Number.isInteger(event.startMin) || !Number.isInteger(event.endMin)
      || event.startMin!==end || event.endMin<=event.startMin || event.endMin>1440) {
      return exactWithCarry;
    }
    end=event.endMin;
  }
  if (exactEvents.at(-1).status==='D') return exactWithCarry;
  if (carry) {
    // Preserve each recorded boundary and keep the prefix separately view-only.
    // Only the last non-driving row may use the already-computed Now/day end.
    const last=exactEvents.at(-1), tail=continuousEvents.at(-1);
    if (tail?.status===last.status && Number.isInteger(tail.endMin)
      && tail.endMin>=last.endMin && tail.endMin<=1440) {
      return [...exactWithCarry.slice(0,-1),{...last,endMin:tail.endMin}];
    }
    return exactWithCarry;
  }
  return continuousEvents;
}
