import { localDayKey } from '../../shared/utils/date.js';
import { violationRangesForDay } from '../../core/hos/hosEngine.js';

function hasRealEvents(events = []) {
  return (events || []).some(event => !event.carriedFromPreviousDay && Number(event.endMin || 0) > Number(event.startMin || 0));
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

export function signingWarnings(state, day) {
  const warnings = [];
  const today = localDayKey();
  const events = state.eventsByDay?.[day] || [];
  const signState = logSignState(state, day);
  const inspection = state.inspectionByDay?.[day] || {};
  const vehicle = String(state.driver?.truck || '').trim();
  const trailer = String(state.currentTrailer || state.driver?.trailer || state.equipment?.trailer || '').trim();
  const hasOnOrDrive = events.some(event => event.status === 'ON' || event.status === 'D');

  if (day >= today) warnings.push('This is today’s active log. It is normally signed after the day is complete.');
  if (!hasRealEvents(events)) warnings.push('No completed duty-status events were found for this day.');
  if (signState.status === 'Needs Recertification') warnings.push('This log was edited after it was signed and needs recertification.');
  if (!vehicle) warnings.push('Vehicle is missing.');
  if (!trailer || /no trailer|no vehicle/i.test(trailer)) warnings.push('Vehicle/trailer selection is missing or incomplete.');
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
  return `Are you sure you want to sign this log?\n\n${warnings.map(w => `• ${w}`).join('\n')}`;
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
