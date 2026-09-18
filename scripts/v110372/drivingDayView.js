// Read-only completion of a recorded Driving origin across terminal midnight.
// This is deliberately separate from Edit/Insert and all persisted duty time.
const excluded = new Set(['timeline_continuity','carryover','display','display_timeline']);
const real = e => e && !e.voided && !e.syntheticCoverage && !e.displayOnly &&
  !e.carriedFromPreviousDay && !e.synthetic && !e.continuityGenerated && !excluded.has(e.source);
const rows = list => (Array.isArray(list) ? list : []).filter(real).slice().sort((a,b)=>a.startMin-b.startMin);
const valid = e => e && typeof e.id === 'string' && e.id.length > 0 &&
  Number.isInteger(e.startMin) && Number.isInteger(e.endMin) &&
  e.startMin >= 0 && e.endMin > e.startMin && e.endMin <= 1440;
function nextDate(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(day+'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== day) return null;
  date.setUTCDate(date.getUTCDate()+1);
  return date.toISOString().slice(0,10);
}
function manuallyEnded(state, day, event) {
  if (event.paperLogEndV110315) return true;
  // Older historical edits do not always carry the live-End flag. Honour an
  // explicit end edit whose resulting interval is still the stored interval.
  return (state?.logbookEditHistoryByDay?.[day] || []).some(edit => {
    if (edit.kind !== 'edit' || edit.targetId !== event.id) return false;
    const before = edit.beforeEvents?.find(e=>e.id===event.id);
    const after = edit.afterEvents?.find(e=>e.id===event.id);
    return before && after && before.endMin !== after.endMin &&
      after.status === event.status && after.startMin === event.startMin && after.endMin === event.endMin;
  });
}
export function confirmedDrivingDayView(exactEvents = [], context = {}) {
  const {day,clock,state = {}} = context;
  const eventsByDay = context.eventsByDay || state.eventsByDay || {};
  const nextDay = nextDate(day);
  // The current-day projection already owns Now; never use phone-local dates.
  if (!nextDay || !nextDate(clock?.day) || day >= clock.day || !exactEvents.length) return exactEvents;
  const last = exactEvents.at(-1), raw = rows(eventsByDay[day]);
  const origin = raw.at(-1);
  if (!valid(origin) || !valid(last) || last.id !== origin.id ||
      last.status !== 'D' || origin.status !== 'D' || last.startMin !== origin.startMin ||
      last.endMin !== origin.endMin || origin.endMin >= 1440 || manuallyEnded(state,day,origin)) return exactEvents;
  if (raw.filter(e=>e.id===origin.id).length !== 1 ||
      raw.slice(0,-1).some(e=>!valid(e) || e.endMin>origin.startMin)) return exactEvents;

  const nextRows = rows(eventsByDay[nextDay]), first = nextRows[0];
  const linked = valid(first) && first.status === 'D' && first.startMin === 0 &&
    first.source === 'manual_drive_midnight_continuation' && first.crossMidnightContinuation === true &&
    first.crossMidnightFromDay === day && first.crossMidnightFromEventId === origin.id &&
    nextRows.every((e,i)=>valid(e) && (i===0 || (e.id!==first.id && e.startMin>=first.endMin)));

  // During the midnight tick, the active session may still own yesterday's
  // exact event. It can prove that day's endpoint while rollover is pending.
  const session = state.manualDrivingSession;
  const pending = nextDay === clock.day && !(eventsByDay[nextDay] || []).length && state.currentStatus === 'D' &&
    session?.active === true && session.status === 'D' && !session.endedAt &&
    session.eventId === origin.id && session.startDay === day;
  if (!linked && !pending) return exactEvents;
  return [...exactEvents.slice(0,-1), {...last,endMin:1440,isLive:false,
    recordedEndMin:origin.endMin,
    confirmedDrivingContinuationV110372:{kind:linked?'recorded_midnight_link':'active_session_at_midnight',
      nextDay,sourceEventId:origin.id,continuationEventId:linked?first.id:null}}];
}
