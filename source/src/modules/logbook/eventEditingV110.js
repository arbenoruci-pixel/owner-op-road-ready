// Logbook UI contract. Stored minute values are home-terminal wall-clock values.
// Projection is read-only; editing never invokes continuity/repair normalizers.
import { getHomeTerminalTimeZone, homeTerminalDayKey, homeTerminalMinute } from '../../core/time/homeTerminalTime.js';

export function editorTimeInput(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const m = Math.max(0, Math.min(1440, Math.round(n)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
export function editorMinute(value) {
  if (value === '24:00') return 1440;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value))) return NaN;
  const [h,m] = value.split(':').map(Number);
  return h * 60 + m;
}
export function editorRangeError(start, end, live = false) {
  if (!Number.isInteger(start) || !Number.isInteger(end)) return 'Enter a valid Start and End time.';
  if (start < 0 || start > 1439 || end < 0 || end > 1440) return 'Times must stay within the selected log day.';
  if (end < start || (!live && end === start)) return 'End must be after Start. For a midnight ending, select 24:00.';
  return '';
}
export function logbookClock(state = {}, at = new Date()) {
  const timeZone = getHomeTerminalTimeZone(state);
  return { timeZone, day:homeTerminalDayKey(at,timeZone), minute:homeTerminalMinute(at,timeZone), at };
}
export function projectLogbookEvents(state = {}, day = state.activeDay, at = new Date()) {
  const clock = logbookClock(state, at);
  const rows = (state.eventsByDay?.[day] || []).filter(e => e && !e.voided && !e.syntheticCoverage && !e.displayOnly && !e.carriedFromPreviousDay && !e.synthetic && !e.continuityGenerated && !['timeline_continuity','carryover','display','display_timeline'].includes(e.source))
    .map(e => ({ ...e })).sort((a,b) => a.startMin - b.startMin);
  const last = rows[rows.length - 1];
  if (!last || day !== clock.day || state.certifyStatus?.[day] === 'Certified') return rows;
  const manual = state.manualDrivingSession, gps = state.gpsTrip;
  const ownedSession = (manual?.active === true && manual.eventId === last.id && (!manual.startDay || manual.startDay === day)) || (gps?.status === 'active' && gps.eventId === last.id);
  const liveSource = ['live_status','manual_drive_midnight_continuation'].includes(last.source);
  if (state.currentStatus === last.status && (ownedSession || liveSource) && Number(last.startMin) <= clock.minute) {
    rows[rows.length-1] = { ...last, endMin:clock.minute, isLive:true, recordedEndMin:last.endMin };
  }
  return rows;
}
const EDIT_FIELDS = new Set(['status','startMin','endMin','city','state','description','note','reasons','lat','lng','gpsAccuracy','locationSource','shippingDocs','loadNo','bol','destination','destinationState','loadDetailsExplicit']);
const equal = (a,b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** Exact single-event edit. No inferred OFF, neighbor merge, current-status change,
 * load mutation or signature replacement. The caller updates certification status. */
export function applyLogbookEditorEdit(state, { day, id, patch = {}, expected }, at = new Date()) {
  const rows = state.eventsByDay?.[day] || [];
  const index = rows.findIndex(e => e?.id === id && !e.voided);
  if (index < 0) return { ok:false, error:'This event is no longer available. Reopen the log.' };
  const before = rows[index];
  if (expected && !equal(before,expected)) return { ok:false, error:'This event changed while the editor was open. Reopen it before saving.' };
  const changes = {};
  for (const [key,value] of Object.entries(patch)) {
    if (!EDIT_FIELDS.has(key)) return { ok:false, error:`Unsupported log field: ${key}` };
    if (!equal(value,before[key])) changes[key] = value;
  }
  if (!Object.keys(changes).length) return { ok:true, changed:false, state };
  const live = projectLogbookEvents(state,day,at).find(e => e.id === id)?.isLive;
  if (live && ['status','startMin','endMin'].some(k => Object.hasOwn(changes,k))) return { ok:false, error:'Use Change status to end the live event. Its timing continues while you edit details.' };
  const after = { ...before, ...changes };
  if (!['OFF','SB','D','ON'].includes(after.status)) return { ok:false,error:'Choose a valid duty status.' };
  const error = editorRangeError(Number(after.startMin),Number(after.endMin));
  if (error) return { ok:false,error };
  const next = rows.slice(); next[index] = after;
  return { ok:true, changed:true, state:{ ...state, eventsByDay:{ ...state.eventsByDay,[day]:next } } };
}
