import { localDayKey } from '../../shared/utils/date.js';
import { durLabel, nowMin, timeLabel } from '../../shared/utils/time.js';
import { normalizeLogEvents } from '../timeline/timelineEngine.js';

export function rawStoredEventsForDay(eventsByDay = {}, day = '') {
  return normalizeLogEvents((eventsByDay?.[day] || [])
    .filter(event => event && !event.carriedFromPreviousDay && !event.syntheticCoverage && event.source !== 'timeline_continuity')
    .map(event => ({ ...event, carriedFromPreviousDay:false, syntheticCoverage:false })));
}

export function confirmedMinutes(events = []) {
  return (events || []).reduce((sum, event) => (
    sum + Math.max(0, Number(event.endMin || 0) - Number(event.startMin || 0))
  ), 0);
}

export function isCurrentLogDay(day = '', today = localDayKey()) {
  return day === today;
}

export function isFutureLogDay(day = '', today = localDayKey()) {
  return String(day || '') > String(today || '');
}

export function rawCoverageIssues(eventsByDay = {}, day = '', options = {}) {
  const today = options.today || localDayKey();
  const events = rawStoredEventsForDay(eventsByDay, day);
  const issues = [];

  if (isFutureLogDay(day, today)) {
    issues.push({
      code:'future_log_day',
      title:'Future log date',
      detail:'This log date is after today.',
      where:'Log day',
      day,
      severity:'notice',
    });
    return { events, issues, total:0, targetEnd:0, current:false, future:true };
  }

  const current = isCurrentLogDay(day, today);
  const targetEnd = current ? (options.nowMinute ?? nowMin()) : 1440;
  const completed = events.filter(event => Number(event.endMin || 0) > Number(event.startMin || 0));
  const total = confirmedMinutes(completed);

  if (!completed.length) {
    issues.push({
      code:'no_events',
      title:'No completed duty-status events',
      detail:'This day has no confirmed duty-status events.',
      where:'Log graph / event list',
      day,
      severity:'fix',
    });
    return { events, issues, total, targetEnd, current, future:false };
  }

  const first = completed[0];
  const last = completed[completed.length - 1];

  if (Number(first.startMin || 0) > 1) {
    issues.push({
      code:'day_start_gap',
      title:'Log does not start at midnight',
      detail:`First confirmed event starts at ${timeLabel(first.startMin, true)}. Confirm 12:00 AM–${timeLabel(first.startMin, true)}.`,
      where:'Log graph',
      day,
      eventId:first.id || '',
      startMin:0,
      endMin:first.startMin,
      severity:'fix',
    });
  }

  completed.forEach((event, index) => {
    const next = completed[index + 1];
    if (!next) return;
    const gap = Number(next.startMin || 0) - Number(event.endMin || 0);
    if (gap > 1) {
      issues.push({
        code:`gap_${event.id || index}`,
        title:'Gap between duty-status events',
        detail:`Confirm ${timeLabel(event.endMin, true)}–${timeLabel(next.startMin, true)} (${durLabel(gap)}).`,
        where:'Log graph',
        day,
        eventId:event.id || '',
        startMin:event.endMin,
        endMin:next.startMin,
        severity:'fix',
      });
    }
    if (gap < -1) {
      issues.push({
        code:`overlap_${event.id || index}`,
        title:'Events overlap',
        detail:`Events overlap around ${timeLabel(next.startMin, true)}.`,
        where:'Log graph',
        day,
        eventId:event.id || '',
        startMin:next.startMin,
        endMin:event.endMin,
        severity:'fix',
      });
    }
  });

  if (!current && Number(last.endMin || 0) < 1439) {
    issues.push({
      code:'day_end_gap',
      title:'Log does not reach end of day',
      detail:`Last confirmed event ends at ${timeLabel(last.endMin, true)}. Confirm through midnight.`,
      where:'Log graph',
      day,
      eventId:last.id || '',
      startMin:last.endMin,
      endMin:1440,
      severity:'fix',
    });
  }

  if (!current && Math.abs(total - 1440) > 1) {
    issues.push({
      code:'day_total_not_24h',
      title:'Daily totals do not equal 24 hours',
      detail:`Confirmed duty-status time totals ${durLabel(total)}.`,
      where:'Form tab → Totals',
      day,
      severity:'fix',
    });
  }

  return { events, issues, total, targetEnd, current, future:false };
}
