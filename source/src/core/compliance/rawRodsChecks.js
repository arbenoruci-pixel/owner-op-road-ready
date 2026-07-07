import { addDays, localDayKey } from '../../shared/utils/date.js';
import { durLabel, nowMin, timeLabel } from '../../shared/utils/time.js';
import { normalizeLogEvents, sortEvents } from '../timeline/timelineEngine.js';

export const COVERAGE_CHILD_CODES = new Set([
  'no_events',
  'day_start_gap',
  'day_end_gap',
  'day_total_not_24h',
]);

function clampMinute(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1440, Math.round(n)));
}

function statusNote(status = 'OFF') {
  if (status === 'SB') return 'Sleeper';
  if (status === 'D') return 'Driving';
  if (status === 'ON') return 'On Duty';
  return 'Off Duty';
}

function cleanLocation(event = {}) {
  return {
    city: String(event.city || '').trim(),
    state: String(event.state || '').trim().toUpperCase().slice(0, 2),
  };
}

function usableLocation(...items) {
  for (const item of items) {
    const loc = item?.city || item?.state ? cleanLocation(item) : cleanLocation(item?.location || {});
    if (loc.city || loc.state) return loc;
  }
  return { city:'', state:'' };
}

export function isSyntheticEvent(event = {}) {
  const source = String(event.source || '').trim().toLowerCase();
  return !!event.syntheticCoverage
    || !!event.carriedFromPreviousDay
    || !!event.displayOnly
    || !!event.synthetic
    || !!event.continuityGenerated
    || source === 'timeline_continuity'
    || source === 'carryover'
    || source === 'display'
    || source === 'display_timeline';
}

export function stripSyntheticEventFields(event = {}) {
  const {
    syntheticCoverage,
    carriedFromPreviousDay,
    displayOnly,
    synthetic,
    continuityGenerated,
    ...rest
  } = event || {};
  if (String(rest.source || '') === 'timeline_continuity') delete rest.source;
  return rest;
}

export function rawStoredEventsForDay(eventsByDay = {}, day = '') {
  return sortEvents(eventsByDay?.[day] || [])
    .filter(Boolean)
    .filter(event => !event.voided)
    .filter(event => !isSyntheticEvent(event))
    .map(event => {
      const startMin = clampMinute(event.startMin, 0);
      const endMin = Math.max(startMin + 1, clampMinute(event.endMin, startMin + 1));
      return stripSyntheticEventFields({ ...event, startMin, endMin: Math.min(1440, endMin) });
    })
    .filter(event => Number(event.endMin || 0) > Number(event.startMin || 0));
}

export function normalizeRawStoredEvents(events = []) {
  return normalizeLogEvents((events || [])
    .filter(event => !isSyntheticEvent(event))
    .map(stripSyntheticEventFields));
}

function previousRawEvent(eventsByDay = {}, day = '') {
  let cursor = day;
  for (let i = 0; i < 14; i += 1) {
    cursor = addDays(cursor, -1);
    const events = rawStoredEventsForDay(eventsByDay, cursor);
    if (events.length) return events[events.length - 1];
  }
  return null;
}

function statusCanCarryAcrossMidnight(status = '') {
  // Paper-log status carries through midnight for rest/off-duty records.
  // Never silently carry DRIVING into the next day; that must be an explicit
  // stored driving event because it affects HOS and officer review.
  return status === 'OFF' || status === 'SB' || status === 'ON';
}

function carryStartCoverageFromPreviousDay(events = [], previousDayEvent = null) {
  const completed = [...(events || [])];
  if (!completed.length) return completed;
  const first = completed[0];
  const firstStart = Number(first.startMin || 0);
  if (firstStart <= 1) return completed;
  const previousStatus = previousDayEvent?.status || '';
  const firstStatus = first?.status || '';
  const previousEndedAtMidnight = Number(previousDayEvent?.endMin || 0) >= 1438;

  if (
    previousEndedAtMidnight &&
    previousStatus === firstStatus &&
    statusCanCarryAcrossMidnight(firstStatus)
  ) {
    completed[0] = {
      ...first,
      startMin: 0,
      carriedStartCoverageFromPreviousDay: true,
    };
  }
  return completed;
}

function suggestedStatusForBlock(type, previous, next, durationMin) {
  const previousStatus = previous?.status || '';
  const nextStatus = next?.status || '';
  if (type === 'start_gap') {
    if (previousStatus === 'SB' || previousStatus === 'OFF') return previousStatus;
    if (nextStatus === 'SB' || nextStatus === 'OFF') return nextStatus;
    return 'OFF';
  }
  if (type === 'end_gap') return previousStatus || 'OFF';
  if (previousStatus && previousStatus === nextStatus) return previousStatus;
  if (previousStatus === 'ON' && nextStatus === 'D' && Number(durationMin || 0) <= 30) return 'ON';
  if ((previousStatus === 'OFF' || previousStatus === 'SB') && (nextStatus === 'OFF' || nextStatus === 'SB')) return previousStatus;
  return previousStatus || nextStatus || 'OFF';
}

function makeMissingBlock({ day, type, startMin, endMin, previous = null, next = null, currentLocation = null }) {
  const start = clampMinute(startMin, 0);
  const end = Math.max(start, clampMinute(endMin, start));
  const durationMin = Math.max(0, end - start);
  const suggestedStatus = suggestedStatusForBlock(type, previous, next, durationMin);
  const suggestedLocation = usableLocation(previous, next, currentLocation);
  return {
    id: `${type}_${day}_${start}_${end}`,
    type,
    startMin: start,
    endMin: end,
    durationMin,
    previousEventId: previous?.id || '',
    nextEventId: next?.id || '',
    suggestedStatus,
    suggestedLocation,
    suggestedNote: statusNote(suggestedStatus),
  };
}

function makeCoverageIssue(code, opts = {}) {
  return {
    id: opts.id || code,
    code,
    section:'coverage',
    severity: opts.severity || 'fix',
    title: opts.title || 'Missing coverage',
    detail: opts.detail || '',
    fixAction: opts.fixAction || 'OPEN_COVERAGE_WIZARD',
    actionLabel: opts.actionLabel || 'Start Fix Wizard',
    ...opts,
  };
}

export function rawCoverageIssues(eventsByDay = {}, day = '', options = {}) {
  const today = localDayKey();
  const current = day === today;
  const future = !!day && day > today;
  const targetEnd = future ? 0 : (current ? nowMin() : 1440);
  const previousDayEvent = previousRawEvent(eventsByDay, day);
  const events = rawStoredEventsForDay(eventsByDay, day);
  const rawCompleted = events.filter(event => Number(event.endMin || 0) > Number(event.startMin || 0));
  const completed = carryStartCoverageFromPreviousDay(rawCompleted, previousDayEvent);
  const total = completed.reduce((sum, event) => sum + Math.max(0, Number(event.endMin || 0) - Number(event.startMin || 0)), 0);
  const issues = [];

  if (future) {
    return { events, issues:[makeCoverageIssue('future_day', { severity:'notice', title:'Future log date', detail:'Open today to make current records.', fixAction:'OPEN_LOG', actionLabel:'Open log' })], total, targetEnd, current, future };
  }

  if (!completed.length) {
    if (targetEnd > 0) {
      const block = makeMissingBlock({ day, type:'full_day_gap', startMin:0, endMin:targetEnd, previous:previousDayEvent, next:null, currentLocation:options.currentLocation });
      issues.push(makeCoverageIssue('no_events', {
        title:'Missing log coverage',
        detail:`${timeLabel(0, true)}–${timeLabel(targetEnd, true)}`,
        startMin:0,
        endMin:targetEnd,
        missingBlock:block,
      }));
    }
    return { events, issues, total, targetEnd, current, future };
  }

  const first = completed[0];
  const last = completed[completed.length - 1];

  if (Number(first.startMin || 0) > 1) {
    const block = makeMissingBlock({ day, type:'start_gap', startMin:0, endMin:first.startMin, previous:previousDayEvent, next:first, currentLocation:options.currentLocation });
    issues.push(makeCoverageIssue('day_start_gap', {
      title:'Missing coverage at start of day',
      detail:`Start of day missing: ${timeLabel(0, true)}–${timeLabel(first.startMin, true)}`,
      startMin:0,
      endMin:first.startMin,
      eventId:first.id || '',
      nextEventId:first.id || '',
      missingBlock:block,
    }));
  }

  completed.forEach((event, index) => {
    const next = completed[index + 1];
    if (!next) return;
    const gap = Number(next.startMin || 0) - Number(event.endMin || 0);
    if (gap > 1) {
      const block = makeMissingBlock({ day, type:'internal_gap', startMin:event.endMin, endMin:next.startMin, previous:event, next, currentLocation:options.currentLocation });
      issues.push(makeCoverageIssue(`gap_${event.id || index}`, {
        title:'Gap between duty-status events',
        detail:`Gap: ${timeLabel(event.endMin, true)}–${timeLabel(next.startMin, true)}`,
        startMin:event.endMin,
        endMin:next.startMin,
        eventId:event.id || '',
        previousEventId:event.id || '',
        nextEventId:next.id || '',
        missingBlock:block,
      }));
    }
    if (gap < -1) {
      issues.push(makeCoverageIssue(`overlap_${event.id || index}`, {
        severity:'fix',
        title:'Events overlap',
        detail:`Around ${timeLabel(next.startMin, true)}`,
        fixAction:'OPEN_EVENT',
        actionLabel:'Open event',
        eventId:event.id || '',
        startMin:next.startMin,
        endMin:event.endMin,
      }));
    }
  });

  if (Number(last.endMin || 0) < targetEnd - 1) {
    const block = makeMissingBlock({ day, type:'end_gap', startMin:last.endMin, endMin:targetEnd, previous:last, next:null, currentLocation:options.currentLocation });
    issues.push(makeCoverageIssue('day_end_gap', {
      title:current ? 'Missing coverage to now' : 'Missing coverage at end of day',
      detail:`End of day missing: ${timeLabel(last.endMin, true)}–${timeLabel(targetEnd, true)}`,
      startMin:last.endMin,
      endMin:targetEnd,
      eventId:last.id || '',
      previousEventId:last.id || '',
      missingBlock:block,
    }));
  }

  if (!current && Math.abs(total - 1440) > 1) {
    issues.push(makeCoverageIssue('day_total_not_24h', {
      title:'Daily total needs review',
      detail:`Confirmed total: ${durLabel(total)} / 24h`,
      fixAction:'OPEN_LOG',
      actionLabel:'Open log',
    }));
  }

  return { events, issues, total, targetEnd, current, future };
}

function isMissingCoverageIssue(issue = {}) {
  const code = String(issue.code || issue.id || '');
  return code === 'no_events' || code === 'day_start_gap' || code === 'day_end_gap' || /^gap_/.test(code);
}

export function buildCoverageFixGroup(rawCoverageResult = {}, day = '') {
  const issues = rawCoverageResult.issues || [];
  const missingIssues = issues.filter(isMissingCoverageIssue);
  const missingBlocks = missingIssues
    .map(issue => issue.missingBlock)
    .filter(Boolean)
    .filter(block => Number(block.endMin || 0) > Number(block.startMin || 0))
    .sort((a, b) => Number(a.startMin || 0) - Number(b.startMin || 0));
  const rawIssueIds = missingIssues.map(issue => issue.id || issue.code).filter(Boolean);
  const totalMissing = missingBlocks.reduce((sum, block) => sum + Math.max(0, Number(block.durationMin || 0)), 0);

  if (missingBlocks.length) {
    return {
      id: `coverage_group_${day}`,
      code: `coverage_group_${day}`,
      section: 'coverage',
      severity: 'fix',
      tone: 'bad',
      title: 'Missing log coverage',
      detail: `${missingBlocks.length} missing time block${missingBlocks.length === 1 ? '' : 's'} · ${durLabel(totalMissing)} unconfirmed`,
      day,
      actionLabel: 'Start Fix Wizard',
      fixAction: 'OPEN_COVERAGE_WIZARD',
      missingBlocks,
      rawIssueIds,
      confirmedTotal: rawCoverageResult.total || 0,
      neededTotal: rawCoverageResult.targetEnd || 1440,
      shortBy: totalMissing,
    };
  }

  const totalIssue = issues.find(issue => String(issue.code || issue.id || '') === 'day_total_not_24h');
  if (totalIssue) {
    return {
      id: `coverage_total_${day}`,
      code: `coverage_total_${day}`,
      section: 'coverage',
      severity: 'fix',
      tone: 'bad',
      title: 'Daily total needs review',
      detail: totalIssue.detail || `Confirmed total: ${durLabel(rawCoverageResult.total || 0)} / 24h`,
      day,
      actionLabel: 'Open log',
      fixAction: 'OPEN_LOG',
      missingBlocks: [],
      rawIssueIds: [totalIssue.id || totalIssue.code].filter(Boolean),
      confirmedTotal: rawCoverageResult.total || 0,
      neededTotal: rawCoverageResult.targetEnd || 1440,
      shortBy: Math.max(0, Number(rawCoverageResult.targetEnd || 1440) - Number(rawCoverageResult.total || 0)),
    };
  }

  return null;
}

export function coverageIssuesWithoutGroupedChildren(rawCoverageResult = {}, coverageGroup = null) {
  const grouped = new Set(coverageGroup?.rawIssueIds || []);
  return (rawCoverageResult.issues || [])
    .filter(issue => !grouped.has(issue.id || issue.code))
    .filter(issue => String(issue.code || issue.id || '') !== 'day_total_not_24h' || !coverageGroup?.missingBlocks?.length);
}
