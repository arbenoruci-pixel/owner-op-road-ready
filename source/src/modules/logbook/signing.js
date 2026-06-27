import { localDayKey } from '../../shared/utils/date.js';
import { violationRangesForDay } from '../../core/hos/hosEngine.js';
import { timeLabel } from '../../shared/utils/time.js';

function hasRealEvents(events = []) {
  return (events || []).some(event => !event.carriedFromPreviousDay && Number(event.endMin || 0) > Number(event.startMin || 0));
}

function sortedEvents(events = []) {
  return [...(events || [])].filter(Boolean).sort((a, b) => Number(a.startMin || 0) - Number(b.startMin || 0));
}

function isPreTripEvent(event = {}) {
  return event.status === 'ON' && /pre[- ]?trip|inspection/i.test(`${event.note || ''} ${event.description || ''}`);
}

function eventLabel(event = {}) {
  const start = Number(event.startMin || 0);
  const end = Number(event.endMin || 0);
  return `${event.status || 'EVENT'} ${timeLabel(start, true)}-${timeLabel(end, true)}`;
}

export function completedLogDays(state) {
  const today = localDayKey();
  return Object.keys(state.eventsByDay || {})
    .filter(day => day < today && hasRealEvents(state.eventsByDay?.[day] || []))
    .sort()
    .reverse();
}

export function signableLogDays(state) {
  return completedLogDays(state).filter(day => logSignState(state, day).needsSignature);
}

export function logSignState(state, day) {
  const today = localDayKey();
  const status = state.certifyStatus?.[day] || 'Needs signature';
  const signed = !!state.signatureByDay?.[day]?.signed;

  if (day >= today) {
    return {
      signed,
      status,
      needsSignature: false,
      label: signed ? 'Signed today' : 'Active day',
      reason: 'Today is still active. It will show in Unsigned Logs after the day is complete.',
    };
  }

  if (status === 'Certified' && signed) {
    return { signed:true, status, needsSignature:false, label:'Signed', reason:'Signed and certified.' };
  }

  if (status === 'Needs Recertification') {
    return { signed, status, needsSignature:true, label:'Needs recertification', reason:'Log was edited after signing.' };
  }

  return { signed, status, needsSignature:true, label:'Needs signature', reason:'Completed DOT log day is not signed.' };
}

export function validateLogForSigning(state, day) {
  const issues = [];
  const today = localDayKey();
  const events = sortedEvents(state.eventsByDay?.[day] || []);
  const inspection = state.inspectionByDay?.[day] || {};
  const vehicle = String(state.driver?.truck || '').trim();
  const hasOnOrDrive = events.some(event => event.status === 'ON' || event.status === 'D');
  const preTrip = events.find(isPreTripEvent);

  if (day >= today) {
    issues.push({
      code: 'active_day',
      title: 'Active day cannot be signed yet',
      detail: 'This log day is still active. Sign it after the day is complete.',
      where: 'Sign tab',
    });
  }

  if (!hasRealEvents(events)) {
    issues.push({
      code: 'no_events',
      title: 'No completed duty-status events',
      detail: 'Add or fix the duty-status events before signing.',
      where: 'Log graph / event list',
    });
  }

  if (!vehicle) {
    issues.push({
      code: 'missing_vehicle',
      title: 'Vehicle is missing',
      detail: 'Add the truck/unit number before signing this log.',
      where: 'Form tab → Vehicles',
    });
  }

  events.forEach((event, index) => {
    const start = Number(event.startMin || 0);
    const end = Number(event.endMin || 0);
    if (end <= start) {
      issues.push({
        code: `bad_duration_${event.id || index}`,
        title: 'Event time is invalid',
        detail: `${eventLabel(event)} has zero or negative duration.`,
        where: 'Log graph / event list',
      });
    }
    if (!event.city && !event.state) {
      issues.push({
        code: `missing_location_${event.id || index}`,
        title: 'Event location is missing',
        detail: `${eventLabel(event)} needs a city/state or GPS location.`,
        where: 'Event location',
      });
    }
    const next = events[index + 1];
    if (next && Number(next.startMin || 0) < end) {
      issues.push({
        code: `overlap_${event.id || index}`,
        title: 'Events overlap',
        detail: `${eventLabel(event)} overlaps with ${eventLabel(next)}.`,
        where: 'Log graph',
      });
    }
  });

  if (hasOnOrDrive && !inspection.complete) {
    issues.push({
      code: 'missing_inspection',
      title: 'Pre-trip inspection sheet is missing',
      detail: 'Complete the daily inspection sheet before signing this log.',
      where: 'Inspection tab',
    });
  }

  if (inspection.complete && preTrip && inspection.sourceEventId && inspection.sourceEventId === preTrip.id) {
    if (Number(inspection.sourceStartMin) !== Number(preTrip.startMin)) {
      issues.push({
        code: 'inspection_time_mismatch',
        title: 'Inspection time does not match ON DUTY Pre-trip',
        detail: `Inspection shows ${timeLabel(inspection.sourceStartMin, true)}, but the ON DUTY Pre-trip event starts at ${timeLabel(preTrip.startMin, true)}.`,
        where: 'Inspection tab',
      });
    }
  }

  const violations = violationRangesForDay(state.eventsByDay || {}, day) || [];
  violations
    .filter(v => v.severity === 'high' || v.type === 'violation')
    .forEach((violation, index) => {
      issues.push({
        code: `hos_${violation.type || index}`,
        title: 'HOS rule issue found',
        detail: `${violation.label || violation.type || 'HOS issue'} around ${timeLabel(violation.startMin, true)}. Review before signing.`,
        where: 'Log check / graph',
      });
    });

  const seen = new Set();
  return issues.filter(issue => {
    const key = `${issue.code}:${issue.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function signingWarnings(state, day) {
  const warnings = [];
  const today = localDayKey();
  const events = state.eventsByDay?.[day] || [];
  const signState = logSignState(state, day);
  const inspection = state.inspectionByDay?.[day] || {};
  const trailer = String(state.currentTrailer || state.driver?.trailer || state.equipment?.trailer || '').trim();
  const hasOnOrDrive = events.some(event => event.status === 'ON' || event.status === 'D');

  validateLogForSigning(state, day).forEach(issue => warnings.push(`${issue.title}: ${issue.detail}`));
  if (signState.status === 'Needs Recertification') warnings.push('This log was edited after it was signed and needs recertification.');
  if (!trailer || /no trailer|no vehicle/i.test(trailer)) warnings.push('Trailer/equipment is empty. If bobtail or no trailer is correct, verify the Form tab before signing.');
  if (day >= today) warnings.push('This is today’s active log. It is normally signed after the day is complete.');
  if (hasOnOrDrive && !inspection.complete) warnings.push('Pre-trip inspection is missing for this log day.');

  const violations = violationRangesForDay(state.eventsByDay || {}, day) || [];
  if (violations.length) {
    const high = violations.filter(v => v.severity === 'high' || v.type === 'violation').length;
    warnings.push(high ? `${high} high HOS review item(s) found.` : `${violations.length} HOS review item(s) found.`);
  }

  return [...new Set(warnings)];
}

export function signConfirmMessage(state, day) {
  const warnings = signingWarnings(state, day);
  if (!warnings.length) return '';
  return `Review before signing this log:\n\n${warnings.map(w => `• ${w}`).join('\n')}`;
}

export function signBlockMessage(state, day) {
  const issues = validateLogForSigning(state, day);
  if (!issues.length) return '';
  return `Cannot sign this log yet. Fix these items first:\n\n${issues.map(issue => `• ${issue.where}: ${issue.title} — ${issue.detail}`).join('\n')}`;
}

export function dayDisplayTitle(day) {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  const weekday = d.toLocaleDateString(undefined, { weekday:'long' }).toUpperCase();
  const mon = d.toLocaleDateString(undefined, { month:'short' }).toUpperCase();
  return `${weekday} ${mon} ${String(d.getDate()).padStart(2, '0')}`;
}

export function dayDurationMinutes(events = []) {
  return (events || []).reduce((sum, event) => sum + Math.max(0, Number(event.endMin || 0) - Number(event.startMin || 0)), 0);
}
