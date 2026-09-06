// Read-only UI time model. Stored minutes are home-terminal wall-clock minutes.
// No coverage filling, event merging, clock conversion, or persistence occurs here.
import { getHomeTerminalTimeZone, homeTerminalDayKey, homeTerminalMinute } from '../../core/time/homeTerminalTime.js';
import { isSyntheticEvent } from '../../core/compliance/rawRodsChecks.js';

export function recordedEvents(events = []) {
  return events.filter(e => e && !e.voided && !isSyntheticEvent(e))
    .map(e => ({ ...e })).sort((a, b) => Number(a.startMin) - Number(b.startMin));
}
export function liveEventId(state = {}, day = state.activeDay, now = new Date()) {
  if (day !== homeTerminalDayKey(now, getHomeTerminalTimeZone(state))) return null;
  const last = recordedEvents(state.eventsByDay?.[day]).at(-1);
  if (!last || Number(last.startMin) > homeTerminalMinute(now, getHomeTerminalTimeZone(state))) return null;
  const session = state.manualDrivingSession;
  if (session?.active) return session.eventId === last.id && last.status === 'D' ? last.id : null;
  if (state.gpsTrip?.status === 'active') return state.gpsTrip.eventId === last.id ? last.id : null;
  // Generic statuses have no session object. Only an explicit status record or
  // an existing carry-forward record can represent the current open status.
  const liveSource = /^(live_status|gps_drive|driver_workflow|manual_status|manual_driving|carryover|day_carryover|live_carryover)/.test(String(last.source || ''));
  return liveSource && last.status === state.currentStatus && !last.closedAt && !last.endedAt ? last.id : null;
}
export function eventView(state = {}, day = state.activeDay, now = new Date(), input = state.eventsByDay?.[day] || []) {
  const id = liveEventId(state, day, now);
  const minute = homeTerminalMinute(now, getHomeTerminalTimeZone(state));
  return recordedEvents(input).map(e => e.id === id
    ? { ...e, endMin:minute, uiLive:true, uiStoredEndMin:e.endMin }
    : { ...e, uiLive:false });
}
export function editorInput(minute) {
  const n = Number(minute);
  if (!Number.isInteger(n) || n < 0 || n > 1440) return '';
  return `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}
export function editorMinute(value, edge = 'start') {
  if (!/^\d{2}:\d{2}$/.test(String(value))) return NaN;
  const [h,m] = value.split(':').map(Number);
  if (h > 23 || m > 59) return NaN;
  const n = h * 60 + m;
  return edge === 'end' && n === 0 ? 1440 : n;
}
export function editorRange(start, end, { live = false, nowMinute = null, storedStart = null } = {}) {
  const startMin = live ? Number(storedStart) : editorMinute(start);
  const endMin = live ? Number(nowMinute) : editorMinute(end, 'end');
  const valid = Number.isInteger(startMin) && Number.isInteger(endMin) && startMin >= 0 && startMin < 1440 && endMin <= 1440 && (live ? endMin >= startMin : endMin > startMin);
  return { startMin, endMin, duration:valid ? endMin - startMin : null, valid,
    error:valid ? '' : 'Enter a valid range within this log day. End must follow Start; 12:00 AM End means midnight at the end of this day.' };
}
const EDITABLE = new Set(['status','startMin','endMin','city','state','description','note','reasons','lat','lng','gpsAccuracy','locationSource','shippingDocs','loadNo','bol','destination','destinationState','loadDetailsExplicit','shippingDocsUpdatedAt']);
export function sparseEditorPatch(initial, current) {
  return Object.fromEntries(Object.entries(current).filter(([key,value]) => EDITABLE.has(key) && JSON.stringify(value ?? null) !== JSON.stringify(initial[key] ?? null)));
}
// Exact event command shared by preview and App's explicit editor save. An edit
// cannot silently merge IDs, close the current status, or rewrite its neighbors.
export function applyEditorPatch(events, id, patch, { liveId = null } = {}) {
  const before = events.find(e => e?.id === id);
  if (!before) throw new Error('The selected event no longer exists. Reopen the editor.');
  for (const key of Object.keys(patch)) if (!EDITABLE.has(key)) throw new Error('Unsupported event field: ' + key);
  const changed = sparseEditorPatch(before, patch);
  if (id === liveId && ['status','startMin','endMin'].some(k => k in changed)) throw new Error('Use Change current status to end a live event.');
  if (!Object.keys(changed).length) return events;
  const next = { ...before, ...changed };
  if (!['OFF','SB','D','ON'].includes(next.status)) throw new Error('Choose a valid duty status.');
  if (['startMin','endMin'].some(k => k in changed) && !(Number.isInteger(next.startMin) && Number.isInteger(next.endMin) && next.startMin >= 0 && next.startMin < next.endMin && next.endMin <= 1440)) throw new Error('Invalid event time range.');
  return events.map(e => e?.id === id ? next : e);
}
export function timelineRelations(events = []) {
  const sorted = recordedEvents(events).filter(e => Number.isFinite(Number(e.startMin)) && Number.isFinite(Number(e.endMin)) && Number(e.endMin) >= Number(e.startMin));
  const out = [];
  // Coverage is a union, so a short nested overlap cannot create a false gap.
  let covered = 0, coveringId = null;
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i], start = Number(e.startMin), end = Number(e.endMin);
    if (start > covered) out.push({ type:'gap', startMin:covered, endMin:start, beforeId:coveringId, afterId:e.id });
    for (let j = 0; j < i; j++) {
      const prev = sorted[j], overlapStart = Math.max(start, Number(prev.startMin)), overlapEnd = Math.min(end, Number(prev.endMin));
      if (overlapEnd > overlapStart) out.push({ type:'overlap', startMin:overlapStart, endMin:overlapEnd, beforeId:prev.id, afterId:e.id });
    }
    if (end > covered) { covered = end; coveringId = e.id; }
  }
  return out;
}
export function steppedSegments(events, x, y) {
  const sorted = recordedEvents(events).filter(e => Number.isFinite(Number(e.startMin)) && Number.isFinite(Number(e.endMin)) && Number(e.endMin) >= Number(e.startMin));
  return sorted.map((event,i) => {
    const prev=sorted[i-1], next=sorted[i+1];
    const unambiguous = (a, b, minute) => !sorted.some(e => e !== a && e !== b && Number(e.startMin) < minute && Number(e.endMin) > minute);
    const joinBefore=!!prev && Number(prev.endMin) === Number(event.startMin) && unambiguous(prev, event, Number(event.startMin));
    const joinAfter=!!next && Number(event.endMin) === Number(next.startMin) && unambiguous(event, next, Number(event.endMin));
    const yy=y(event.status), xx=x(event.startMin);
    // Split each vertical at its midpoint. Each corner belongs to a single
    // joined path; both colors meet with identical widths and no white halo.
    let d=joinBefore && prev.status!==event.status ? `M ${xx} ${(y(prev.status)+yy)/2} V ${yy}` : `M ${xx} ${yy}`;
    d+=` H ${x(event.endMin)}`;
    if(joinAfter && next.status!==event.status) d+=` V ${(yy+y(next.status))/2}`;
    return { event, d, joinBefore, joinAfter };
  });
}
