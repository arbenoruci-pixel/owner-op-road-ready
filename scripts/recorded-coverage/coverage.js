import { getHomeTerminalTimeZone, homeTerminalDayKey } from '../time/homeTerminalTime.js';

const statuses = new Set(['OFF', 'SB', 'ON', 'D']);
const derivedSources = new Set(['timeline_continuity', 'carryover', 'display', 'display_timeline']);
const recorded = event => event && !['voided', 'deleted', 'deletedAt', 'syntheticCoverage',
  'displayOnly', 'carriedFromPreviousDay', 'synthetic', 'continuityGenerated'].some(key => event[key])
  && !derivedSources.has(event.source);
const valid = event => statuses.has(event.status) && Number.isInteger(event.startMin)
  && Number.isInteger(event.endMin) && event.startMin >= 0
  && event.endMin > event.startMin && event.endMin <= 1440;
const stable = value => value == null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? '[' + value.map(stable).join(',') + ']'
    : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
function verifiedSignedEvents(signature, day) {
  const content = signature?.certifiedContent;
  if (!signature?.signed || content?.version !== 1 || content.day !== day || !Array.isArray(content.events)) return null;
  let hash = 2166136261;
  for (const char of stable(content)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return signature.certifiedFingerprint === 'rods-110.1.0-' + hash.toString(16).padStart(8, '0')
    ? content.events : null;
}
const previousDay = day => {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};
export const recordedTimeLabel = minute => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

// A completed day's saved endpoints are authoritative. A source:live_status
// tag alone cannot prove that a 30-minute saved Sleeper lasted until midnight.
// The sole inferred prefix is the same verified immediately-prior signed
// midnight continuation accepted by the immutable inspection package.
export function recordedDayView(state, day, events = state.eventsByDay?.[day] || []) {
  const rows = events.filter(recorded).map(event => ({ ...event })).sort((a, b) => a.startMin - b.startMin);
  const start = rows.length ? rows[0].startMin : 1440;
  if (!(start > 0 && start <= 1440) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return rows;
  const priorDay = previousDay(day), prior = verifiedSignedEvents(state.signatureByDay?.[priorDay], priorDay);
  const last = prior?.at(-1);
  if (!last || !['OFF', 'SB', 'ON'].includes(last.status) || last.endMin !== 1440
    || prior.some((event, index) => !valid(event) || (index && prior[index - 1].endMin > event.startMin))) return rows;
  return [{ id:`recorded_carry_${day}`, status:last.status, startMin:0, endMin:start,
    city:last.city || '', state:last.state || '', note:last.status === 'SB' ? 'Sleeper Berth' : last.status === 'ON' ? 'On Duty' : 'Off Duty',
    source:'known_midnight_carry', displayOnly:true, carriedFromPreviousDay:true }, ...rows];
}

export function recordedCoverage(state, day, at = new Date(), events) {
  const today = homeTerminalDayKey(at, getHomeTerminalTimeZone(state));
  if (!day || day >= today) return null; // The active-day clock still owns Now.
  return completedDayCoverage(state, day, events);
}

export function completedDayCoverage(state, day, events) {
  const rows = recordedDayView(state, day, events);
  const gaps = [], issues = [];
  let cursor = 0;
  for (const event of rows) {
    if (!valid(event)) {
      issues.push({ code:'invalid_recorded_interval', title:'Invalid recorded time', detail:'Review the saved start and end times.', eventId:event.id });
      continue;
    }
    if (event.startMin > cursor) gaps.push({ startMin:cursor, endMin:event.startMin });
    if (event.startMin < cursor) issues.push({ code:'overlap_recorded_interval', title:'Recorded times overlap',
      detail:`${recordedTimeLabel(event.startMin)}–${recordedTimeLabel(Math.min(cursor, event.endMin))}`, eventId:event.id,
      startMin:event.startMin, endMin:Math.min(cursor, event.endMin) });
    cursor = Math.max(cursor, event.endMin);
  }
  if (cursor < 1440) gaps.push({ startMin:cursor, endMin:1440 });
  for (const gap of gaps) issues.push({ code:`missing_recorded_interval_${gap.startMin}_${gap.endMin}`,
    title:'Unrecorded time', detail:`${recordedTimeLabel(gap.startMin)}–${recordedTimeLabel(gap.endMin)} · ${gap.endMin-gap.startMin} min`,
    ...gap, fixAction:'OPEN_LOG', actionLabel:'Review time' });
  return { events:rows, gaps, issues:issues.map(issue => ({ ...issue, where:'Log coverage', day, severity:'fix' })),
    missingMinutes:gaps.reduce((sum, gap) => sum + gap.endMin - gap.startMin, 0) };
}

// Adapt the shared review to the existing coverage wizard contract so its
// explicit correction flow receives the same missing intervals as Log Check.
export function rawRecordedCoverage(state, day) {
  const review = completedDayCoverage(state, day);
  return {events:review.events, total:1440-review.missingMinutes, targetEnd:1440, current:false, future:false,
    issues:review.issues.map(issue => {
      if (!issue.code.startsWith('missing_recorded_interval_')) return {...issue, id:issue.code, section:'coverage', fixAction:'OPEN_EVENT'};
      const previous = review.events.filter(event => event.endMin <= issue.startMin).at(-1);
      const next = review.events.find(event => event.startMin >= issue.endMin);
      const type = issue.startMin === 0 ? 'start_gap' : issue.endMin === 1440 ? 'end_gap' : 'internal_gap';
      const code = type === 'start_gap' ? 'day_start_gap' : type === 'end_gap' ? 'day_end_gap' : `gap_${issue.startMin}`;
      return {...issue, id:code, code, section:'coverage', fixAction:'OPEN_COVERAGE_WIZARD', actionLabel:'Review time',
        missingBlock:{id:`${type}_${day}_${issue.startMin}_${issue.endMin}`,type,startMin:issue.startMin,endMin:issue.endMin,
          durationMin:issue.endMin-issue.startMin,previousEventId:previous?.id||'',nextEventId:next?.id||'',
          suggestedStatus:previous?.status||next?.status||'OFF',
          suggestedLocation:{city:previous?.city||next?.city||'',state:previous?.state||next?.state||''},
          suggestedNote:'Review duty status'}};
    })};
}

export function assertRecordedCertificationComplete(state, day, content, at) {
  // Validate both raw values and the exact payload, before a signature or
  // certification-history entry can be created. Never normalize away a gap.
  const raw = recordedCoverage(state, day, at);
  const payload = recordedCoverage(state, day, at, content.events);
  const issue = raw?.issues[0] || payload?.issues[0];
  if (issue) throw new Error(`Review the recorded log for ${day}: ${issue.title}. ${issue.detail}`);
}
