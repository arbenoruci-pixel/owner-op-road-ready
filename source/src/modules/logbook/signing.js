import { addDays, localDayKey } from '../../shared/utils/date.js';
import { violationRangesForDay } from '../../core/hos/hosEngine.js';
import { displayEventsForDay } from '../../core/timeline/displayTimeline.js';
import { buildCoverageFixGroup, coverageIssuesWithoutGroupedChildren, rawCoverageIssues, rawStoredEventsForDay } from '../../core/compliance/rawRodsChecks.js';
import { haversineMiles, pointFromLogLocation } from '../../core/gps/locationService.js';
import { durLabel, timeLabel } from '../../shared/utils/time.js';
import { docsTokensForTransition, routeLegsForDayCanonical, suggestedMilesForDayFromRoute } from '../../core/routes/routeNormalization.js';

function hasRealEvents(events = []) {
  return (events || []).some(event => !event.carriedFromPreviousDay && Number(event.endMin || 0) > Number(event.startMin || 0));
}

function sortedEvents(events = []) {
  return [...(events || [])].filter(Boolean).sort((a, b) => Number(a.startMin || 0) - Number(b.startMin || 0));
}

function isPreTripEvent(event = {}) {
  return event.status === 'ON' && /pre[- ]?trip|inspection/i.test(`${event.note || ''} ${event.description || ''}`);
}

function isStartDutyContextEvent(event = {}) {
  return event.status === 'ON' && /pre[- ]?trip|inspection|pickup|loading|drop\s*&\s*hook|hook|delivery|unloading|drop\s*off/i.test(`${event.note || ''} ${event.description || ''}`);
}

function latestOnDutyBefore(events = [], firstDriving = null, predicate = () => true) {
  if (!firstDriving) return null;
  return [...(events || [])]
    .filter(event => event.status === 'ON')
    .filter(event => Number(event.endMin || 0) <= Number(firstDriving.startMin || 0))
    .filter(predicate)
    .sort((a, b) => Number(b.endMin || 0) - Number(a.endMin || 0))[0] || null;
}

function relevantPreTripContext(events = [], firstDriving = null) {
  if (!firstDriving) return (events || []).find(isPreTripEvent) || null;
  return latestOnDutyBefore(events, firstDriving, isPreTripEvent)
    || latestOnDutyBefore(events, firstDriving, isStartDutyContextEvent)
    || null;
}

function eventLabel(event = {}) {
  const start = Number(event.startMin || 0);
  const end = Number(event.endMin || 0);
  return `${event.status || 'EVENT'} ${timeLabel(start, true)}-${timeLabel(end, true)}`;
}

function fullDayTitle(day) {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(undefined, { weekday:'long', month:'short', day:'numeric', year:'numeric' });
}

function dutyTotals(events = []) {
  const map = Object.fromEntries(['OFF','SB','D','ON'].map(status => [status, 0]));
  sortedEvents(events).forEach(event => {
    if (!(event.status in map)) return;
    map[event.status] += Math.max(0, Number(event.endMin || 0) - Number(event.startMin || 0));
  });
  return map;
}

function totalMinutes(events = []) {
  const totals = dutyTotals(events);
  return Object.values(totals).reduce((sum, mins) => sum + Number(mins || 0), 0);
}

function locationLabel(event = {}) {
  return [event.city, event.state].filter(Boolean).join(', ') || 'MISSING LOCATION';
}

function sameLocation(a = {}, b = {}) {
  const ac = String(a.city || '').trim().toLowerCase();
  const as = String(a.state || '').trim().toLowerCase();
  const bc = String(b.city || '').trim().toLowerCase();
  const bs = String(b.state || '').trim().toLowerCase();
  return !!ac && !!as && ac === bc && as === bs;
}

function estimatedLocationMiles(a = {}, b = {}) {
  const pa = pointFromLogLocation(a);
  const pb = pointFromLogLocation(b);
  if (!pa || !pb) return null;
  const miles = haversineMiles(pa, pb);
  return Number.isFinite(miles) ? miles : null;
}

function effectivelySameLocation(a = {}, b = {}) {
  if (sameLocation(a, b)) return true;
  const miles = estimatedLocationMiles(a, b);
  return miles != null && miles <= 5;
}

function isGenericDrivingStart(event = {}) {
  return event.status === 'D' && /driving started|manual driving|^driving$/i.test(`${event.note || ''} ${event.description || ''}`.trim());
}

function isConnectedPreTripStart(event = {}) {
  return event.status === 'ON' && /pre[- ]?trip|inspection|pickup|loading|drop|hook|delivery|unloading/i.test(`${event.note || ''} ${event.description || ''}`);
}

function locationContinuityIssues(events = [], day = '') {
  const issues = [];
  const ordered = sortedEvents(events).filter(event => Number(event.endMin || 0) > Number(event.startMin || 0));
  ordered.forEach((event, index) => {
    const next = ordered[index + 1];
    if (!next) return;
    if (event.status === 'D' || next.status === 'D') return;
    if (!event.city || !event.state || !next.city || !next.state) return;
    if (effectivelySameLocation(event, next)) return;
    const touches = Math.abs(Number(next.startMin || 0) - Number(event.endMin || 0)) <= 5;
    if (!touches) return;
    const preferPreviousToCurrent = next.status === 'ON';
    issues.push({
      code:`location_jump_${event.id || index}_${next.id || index + 1}`,
      title:'Location jump with no driving',
      detail:`${statusLabel(next.status)} starts in ${locationLabel(next)} immediately after ${statusLabel(event.status)} in ${locationLabel(event)}. If there was no driving between them, these locations should match.`,
      where:'Log tab → location continuity',
      day,
      previousEventId:event.id || '',
      eventId:next.id || event.id || '',
      previousLocation:{ city:event.city || '', state:event.state || '' },
      currentLocation:{ city:next.city || '', state:next.state || '' },
      preferPreviousToCurrent,
      fixChainToCurrent: preferPreviousToCurrent,
      startMin:next.startMin,
    });
  });
  return issues;
}

function statusLabel(status) {
  if (status === 'OFF') return 'OFF DUTY';
  if (status === 'SB') return 'SLEEPER';
  if (status === 'D') return 'DRIVING';
  if (status === 'ON') return 'ON DUTY';
  return status || 'UNKNOWN';
}

function stateText(state, ...paths) {
  for (const path of paths) {
    const value = path.split('.').reduce((obj, key) => obj?.[key], state);
    const text = value === 0 ? '0' : String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function uniqueText(values = []) {
  const seen = new Set();
  return values
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .filter(value => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function hasShippingDocsRequirementForDay(state, day = state.activeDay, eventsOverride = null) {
  const routeLegs = routeLegsForDayCanonical(state, day);
  const dayEvents = Array.isArray(eventsOverride) ? eventsOverride : (state.eventsByDay?.[day] || []);
  const hasDriving = dayEvents.some(event =>
    event.status === 'D' && Number(event.endMin || 0) > Number(event.startMin || 0)
  );
  const hasLoadedRoute = routeLegs.some(leg => {
    const kind = String(leg.kind || '').toLowerCase();
    const status = String(leg.status || '').toLowerCase();
    const hasDocs = docsTokensForTransition([leg.shippingDocs, leg.loadNo, ...(Array.isArray(leg.transitionLoadNos) ? leg.transitionLoadNos : [])].join(' ')).length > 0;
    const emptyLike = /empty|reposition|return|bobtail|deadhead/.test(`${kind} ${status} ${leg.source || ''}`);
    return hasDocs && !emptyLike;
  });
  const hasLoadWorkText = dayEvents.some(event =>
    /pickup|loading|delivery|unloading|drop\s*&\s*hook|drop and hook|hooked|picked up|delivered|shipper|receiver/i.test(`${event.note || ''} ${event.description || ''}`)
  );
  const hasOnDutyWork = dayEvents.some(event =>
    event.status === 'ON' &&
    Number(event.endMin || 0) > Number(event.startMin || 0) &&
    /pickup|loading|delivery|unloading|drop\s*&\s*hook|drop and hook|hooked|picked up|delivered|shipper|receiver/i.test(`${event.note || ''} ${event.description || ''}`)
  );
  return hasDriving || hasLoadedRoute || hasOnDutyWork || hasLoadWorkText;
}

function shippingDocsText(state, day = state.activeDay) {
  const load = state.loadInfo || {};
  const equipment = state.equipment || {};
  const routeLegs = routeLegsForDayCanonical(state, day);
  const dayEvents = state.eventsByDay?.[day] || [];
  const docs = uniqueText([
    ...routeLegs.flatMap(leg => [leg.shippingDocs, leg.loadNo, ...(Array.isArray(leg.transitionLoadNos) ? leg.transitionLoadNos : [])]),
    ...dayEvents.flatMap(event => [event.shippingDocs, event.loadNo, ...(Array.isArray(event.transitionLoadNos) ? event.transitionLoadNos : [])]),
    ...(routeLegs.length ? [] : [load.loadNo, load.po, load.bol, load.shippingDocs]),
    equipment.container,
    equipment.chassis,
  ].flatMap(value => docsTokensForTransition(value))).join(' ');
  if (docs) return docs;
  const mentionsEmpty = routeLegs.some(leg => /empty|reposition|return/i.test(`${leg.kind || ''} ${leg.source || ''}`))
    || dayEvents.some(e => /empty|bobtail|no trailer|deadhead|reposition/i.test(`${e.note || ''} ${e.description || ''}`));
  return mentionsEmpty ? 'Empty / reposition move noted in log' : '';
}

function previousSevenDays(day) {
  return Array.from({ length: 7 }, (_, index) => addDays(day, -(index + 1)));
}

function issueToCopyLine(issue) {
  return `${issue.where}: ${issue.title} — ${issue.detail}`;
}

function issueSeverity(issue = {}) {
  const text = `${issue.code || ''} ${issue.title || ''} ${issue.detail || ''}`;
  if (/active_day/i.test(issue.code || '')) return 'notice';
  if (/previous_|missing_previous/i.test(issue.code || '')) return 'dot';
  if (/hos_|drive11|window14|break8|cycle70|violation/i.test(text)) return 'violation';
  if (/location_jump|pretrip_after_driving|inspection_unlinked/i.test(text)) return 'review';
  if (/missing|invalid|overlap|gap|total|vehicle|shipping|location|inspection|driver|carrier|office/i.test(text)) return 'fix';
  return 'review';
}

export function isFatalSigningIssue(issue = {}) {
  const severity = issueSeverity(issue);
  const code = String(issue.code || issue.id || '').toLowerCase();
  if (severity === 'notice' || severity === 'review') return false;
  if (/active_day|location_jump|duplicate_shipping_docs|pretrip_after_driving|inspection_unlinked|inspection_complete_unlinked/.test(code)) return false;
  return severity === 'fix' || severity === 'violation' || severity === 'dot';
}

function issueRuleLabel(issue = {}) {
  const code = String(issue.code || '');
  if (code.includes('missing_location')) return 'RODS requires location at duty-status changes';
  if (code.includes('day_total') || code.includes('gap') || code.includes('coverage')) return 'Daily grid must cover the full 24-hour period';
  if (code.includes('shipping')) return 'RODS requires shipping document number or shipper/commodity information when applicable';
  if (code.includes('missing_vehicle')) return 'RODS requires truck/tractor and trailer/equipment identification';
  if (code.includes('inspection')) return 'Vehicle safety/pre-trip record must match the log event in this app';
  if (code.includes('hos_')) return 'Potential HOS rule issue';
  if (code.includes('carrier') || code.includes('office') || code.includes('driver')) return 'RODS form header must identify driver/carrier/main office';
  return 'DOT/RODS readiness check';
}

export function issueSuggestedAction(issue = {}) {
  const code = String(issue.code || '');
  if (code.includes('missing_driver') || code.includes('missing_carrier') || code.includes('missing_main_office')) {
    return { label:'Apply saved profile', action:'APPLY_SAVED_PROFILE' };
  }
  if (code.includes('missing_shipping')) {
    return { label:'Add BOL / mark empty', action:'OPEN_SHIPPING_DOCS' };
  }
  if (code.includes('missing_vehicle')) {
    return { label:'Open truck / trailer', action:'OPEN_EQUIPMENT' };
  }
  if (code.includes('active_day')) {
    return { label:'Keep driving / sign later', action:'NO_ACTION' };
  }
  if (code.includes('missing_pretrip_event')) {
    return { label:'Add 15m pre-trip', action:'ADD_PRETRIP_BEFORE_DRIVING' };
  }
  if (code.includes('location_jump')) {
    return { label:'Fix it', action:'FIX_LOCATION_CONTINUITY' };
  }
  if (code.includes('pretrip_after_driving')) {
    return { label:'Open event', action:'OPEN_LOG' };
  }
  if (code.includes('inspection_unlinked') || code.includes('missing_inspection') || code.includes('inspection_time')) {
    return { label:'Open inspection', action:'OPEN_INSPECTION' };
  }
  if (code.includes('coverage_group')) {
    return { label:'Start Fix Wizard', action:'OPEN_COVERAGE_WIZARD' };
  }
  if (code.includes('missing_location') || code.includes('bad_duration') || code.includes('overlap') || code.includes('gap') || code.includes('day_')) {
    return { label:'Open log', action:'OPEN_LOG' };
  }
  if (code.includes('hos_')) {
    return { label:'Review HOS', action:'OPEN_LOG' };
  }
  if (code.includes('previous_') || code.includes('missing_previous')) {
    const match = code.match(/(\d{4}-\d{2}-\d{2})/);
    return { label:'Open day', action:'OPEN_DAY', day: match ? match[1] : '' };
  }
  return { label:'Review', action:'OPEN_LOG' };
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

  if (day > today) {
    return {
      signed,
      status,
      needsSignature: false,
      label: 'Future log date',
      reason: 'Future days cannot be signed yet.',
    };
  }

  if (day === today) {
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

function rawEventsByDayForHos(eventsByDay = {}) {
  const out = {};
  Object.keys(eventsByDay || {}).forEach(dayKey => {
    out[dayKey] = rawStoredEventsForDay(eventsByDay, dayKey);
  });
  return out;
}

export function validateLogForSigning(state, day) {
  const issues = [];
  const today = localDayKey();
  const rawEvents = rawStoredEventsForDay(state.eventsByDay || {}, day);
  const events = sortedEvents(rawEvents);
  const rawCoverageResult = rawCoverageIssues(state.eventsByDay || {}, day, { currentLocation: state.currentLocation || {} });
  const coverageGroup = buildCoverageFixGroup(rawCoverageResult, day);
  const inspection = state.inspectionByDay?.[day] || {};
  const vehicle = String(state.driver?.truck || '').trim();
  const hasOnOrDrive = events.some(event => event.status === 'ON' || event.status === 'D');
  const firstDriving = events.find(event => event.status === 'D');
  const preTrip = relevantPreTripContext(events, firstDriving);
  const preTripIsActualPreTrip = !!preTrip && isPreTripEvent(preTrip);
  const completedEvents = events.filter(event => Number(event.endMin || 0) > Number(event.startMin || 0));
  const driverName = stateText(state, 'driverProfile.name', 'driver.name');
  const carrier = stateText(state, 'carrierName', 'driver.carrier');
  const mainOffice = stateText(state, 'mainOfficeAddress', 'driver.mainOffice');
  const shipping = shippingDocsText(state, day);

  if (coverageGroup) {
    issues.push({
      code: coverageGroup.code || coverageGroup.id,
      title: coverageGroup.title,
      detail: coverageGroup.detail,
      where: 'Log coverage',
      day,
      fixAction: coverageGroup.fixAction,
      actionLabel: coverageGroup.actionLabel,
      missingBlocks: coverageGroup.missingBlocks || [],
    });
  }

  coverageIssuesWithoutGroupedChildren(rawCoverageResult, coverageGroup).forEach(issue => {
    if (String(issue.code || issue.id || '') === 'future_day') return;
    issues.push({
      code: issue.code || issue.id,
      title: issue.title || 'Log coverage needs review',
      detail: issue.detail || 'Open the log and review this coverage item.',
      where: 'Log coverage',
      day,
      eventId: issue.eventId || '',
      startMin: issue.startMin,
      endMin: issue.endMin,
      fixAction: issue.fixAction || 'OPEN_LOG',
      actionLabel: issue.actionLabel || 'Open log',
    });
  });

  if (!driverName) {
    issues.push({ code:'missing_driver_name', title:'Driver name is missing', detail:'Add the driver name before signing this log.', where:'Form tab → Driver' });
  }
  if (!carrier) {
    issues.push({ code:'missing_carrier', title:'Carrier name is missing', detail:'Add the motor carrier name before signing this log.', where:'Form tab → Carrier' });
  }
  if (!mainOffice) {
    issues.push({ code:'missing_main_office', title:'Main office address is missing', detail:'Add the carrier main office address before signing this log.', where:'Form tab → Carrier' });
  }
  if (!shipping && hasShippingDocsRequirementForDay(state, day, events)) {
    issues.push({ code:'missing_shipping_docs', title:'Shipping document information is missing', detail:'Add the shipping document number, load reference, shipper/commodity, or note that the truck is empty/bobtail if that is accurate.', where:'Form tab → Shipping Docs' });
  }

  if (day === today) {
    issues.push({
      code: 'active_day',
      title: 'Today is active',
      detail: 'Signing becomes available after the day is complete. This is a notice, not a log defect.',
      where: 'Sign tab',
    });
  }

  if (!completedEvents.length) {
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

  const drivingEvents = events.filter(event => event.status === 'D' && Number(event.endMin || 0) > Number(event.startMin || 0));
  const eventMilesTotal = drivingEvents.reduce((sum, event) => sum + Math.max(0, Number(event.manualMiles || 0)), 0);
  const dayMilesTotal = Math.max(0, Number(state.manualMilesByDay?.[day] || 0));
  const routeMilesSuggestion = suggestedMilesForDayFromRoute(state, day);
  if (drivingEvents.length && !(dayMilesTotal > 0 || eventMilesTotal > 0)) {
    issues.push({
      code:'missing_total_driving_miles',
      title:'Total driving miles missing',
      detail: routeMilesSuggestion > 0
        ? `Enter total miles driven today. Recommendation: ${routeMilesSuggestion.toFixed(2)} mi.`
        : 'Enter total miles driven today.',
      where:'Form tab → Distance',
      day,
      eventId:drivingEvents[0]?.id || '',
      recommendedMiles:routeMilesSuggestion || undefined,
      fixAction:'OPEN_MANUAL_MILES',
      actionLabel:'Add miles',
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
    if (!event.city || !event.state || /^gps$/i.test(String(event.city || '')) || /^unk$/i.test(String(event.state || ''))) {
      issues.push({
        code: `missing_location_${event.id || index}`,
        title: 'Event location is missing',
        detail: `${eventLabel(event)} needs city/state.`,
        where: 'Event location',
        eventId:event.id || '',
      });
    }
    const next = events[index + 1];
    if (next && Number(next.startMin || 0) < Number(event.endMin || 0)) {
      issues.push({
        code: `overlap_${event.id || index}`,
        title: 'Events overlap',
        detail: `${eventLabel(event)} overlaps with ${eventLabel(next)}.`,
        where: 'Log graph',
        eventId:event.id || '',
      });
    }
  });

  if (firstDriving && !preTrip) {
    issues.push({
      code: `missing_pretrip_event_${firstDriving.id || firstDriving.startMin}`,
      title: 'Pre-trip ON DUTY event is missing',
      detail: `Driving starts at ${timeLabel(firstDriving.startMin, true)}. Add an ON DUTY Pre-trip inspection before driving if it was done.`,
      where: 'Log tab → before first driving',
      day,
      eventId: firstDriving.id || '',
      startMin: firstDriving.startMin,
    });
  }

  if (
    firstDriving &&
    preTrip &&
    preTripIsActualPreTrip &&
    Number(preTrip.endMin || 0) <= Number(firstDriving.startMin || 0) &&
    Math.abs(Number(firstDriving.startMin || 0) - Number(preTrip.endMin || 0)) <= 5 &&
    preTrip.city && preTrip.state && firstDriving.city && firstDriving.state &&
    !effectivelySameLocation(preTrip, firstDriving) &&
    !(isConnectedPreTripStart(preTrip) && isGenericDrivingStart(firstDriving))
  ) {
    issues.push({
      code:`location_jump_pretrip_drive_${preTrip.id || preTrip.startMin}_${firstDriving.id || firstDriving.startMin}`,
      title:'Pre-trip and driving locations do not match',
      detail:`Pre-trip is in ${locationLabel(preTrip)}, but driving starts in ${locationLabel(firstDriving)}.`,
      where:'Log tab → Pre-trip / first driving location',
      day,
      previousEventId:preTrip.id || '',
      eventId:firstDriving.id || '',
      previousLocation:{ city:preTrip.city || '', state:preTrip.state || '' },
      currentLocation:{ city:firstDriving.city || '', state:firstDriving.state || '' },
      preferPreviousToCurrent:true,
      fixChainToCurrent:true,
      startMin:firstDriving.startMin,
    });
  }

  if (hasOnOrDrive && !inspection.complete) {
    issues.push({
      code: 'missing_inspection',
      title: 'Pre-trip inspection sheet is missing',
      detail: 'Complete the daily inspection sheet before signing this log.',
      where: 'Inspection tab',
    });
  }

  // Completed inspection with a valid ON DUTY/start-work context should not block signing
  // because of stale sourceEventId/link metadata.

  issues.push(...locationContinuityIssues(completedEvents, day));

  const rawEventsByDayForReview = rawEventsByDayForHos(state.eventsByDay || {});
  const violations = violationRangesForDay(rawEventsByDayForReview, day) || [];
  violations
    .filter(v => v.severity === 'high' || v.type === 'violation')
    .forEach((violation, index) => {
      issues.push({
        code: `hos_${violation.type || index}`,
        title: 'HOS rule issue found',
        detail: `${violation.text || violation.label || violation.type || 'HOS issue'} Around ${timeLabel(violation.startMin, true)}. Review before signing.`,
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
  const events = rawStoredEventsForDay(state.eventsByDay || {}, day);
  const signState = logSignState(state, day);
  const inspection = state.inspectionByDay?.[day] || {};
  const equipment = state.equipment || {};
  const trailer = String(
    equipment.type === 'intermodal'
      ? (equipment.chassis || state.loadInfo?.equipmentChassis || '')
      : (state.currentTrailer && state.currentTrailer !== 'No trailer' ? state.currentTrailer : state.driver?.trailer || equipment.trailer || '')
  ).trim();
  const hasOnOrDrive = events.some(event => event.status === 'ON' || event.status === 'D');

  validateLogForSigning(state, day).forEach(issue => warnings.push(`${issue.title}: ${issue.detail}`));
  if (signState.status === 'Needs Recertification') warnings.push('This log was edited after it was signed and needs recertification.');
  if (!trailer || /no trailer|no vehicle/i.test(trailer)) warnings.push('Trailer/equipment is empty. If bobtail or no trailer is correct, verify the Form tab before signing.');
  if (day === today) warnings.push('This is today’s active log. It is normally signed after the day is complete.');
  if (hasOnOrDrive && !inspection.complete) warnings.push('Pre-trip inspection is missing for this log day.');

  const rawEventsByDayForReview = rawEventsByDayForHos(state.eventsByDay || {});
  const violations = violationRangesForDay(rawEventsByDayForReview, day) || [];
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
  const issues = validateLogForSigning(state, day).filter(isFatalSigningIssue);
  if (!issues.length) return '';
  return `Cannot sign this log yet. Fix these items first:\n\n${issues.map(issue => `• ${issue.where}: ${issue.title} — ${issue.detail}`).join('\n')}`;
}

function isStaleImportArtifactDay(state = {}, day = '', events = []) {
  const real = sortedEvents(events).filter(event => Number(event.endMin || 0) > Number(event.startMin || 0));
  if (!real.length || real.length > 2) return false;
  if (real.some(event => event.status === 'D' || event.status === 'ON')) return false;
  const total = real.reduce((sum, event) => sum + Math.max(0, Number(event.endMin || 0) - Number(event.startMin || 0)), 0);
  if (total > 5) return false;
  const text = real.map(event => `${event.id || ''} ${event.source || ''} ${event.note || ''} ${event.description || ''} ${event.shippingDocs || ''} ${event.loadNo || ''}`).join(' ').toLowerCase();
  const restored = !!state._restoredBackupMeta || /import|restore|legacy|test|bol\s+[a-z0-9]/i.test(text);
  return restored && day < String(state.activeDay || day);
}


export function buildSignGuardSummary(state, day) {
  const dayIssues = validateLogForSigning(state, day);
  const previousDays = previousSevenDays(day);
  const dotPackage = [];
  const dotRows = [];

  previousDays.forEach(prevDay => {
    const coverage = rawCoverageIssues(state.eventsByDay || {}, prevDay, { currentLocation: state.currentLocation || {} });
    const coverageGroup = buildCoverageFixGroup(coverage, prevDay);
    const prevEvents = coverage.events || [];
    const signed = !!state.signatureByDay?.[prevDay]?.signed;
    const statusText = state.certifyStatus?.[prevDay] || '';
    const needsRecert = statusText === 'Needs Recertification';
    const certified = statusText === 'Certified' && signed && !needsRecert;

    if (isStaleImportArtifactDay(state, prevDay, prevEvents)) {
      dotRows.push({
        day: prevDay,
        total: durLabel(coverage.total || 0),
        signed,
        status: 'Reviewable import artifact',
        issue: null,
        artifact: true,
      });
      return;
    }

    if (!prevEvents.length) {
      const issue = {
        code: `missing_previous_${prevDay}`,
        title: `Previous log missing for ${prevDay}`,
        detail: 'Previous 7-day package needs this day available.',
        where: 'DOT package',
        day: prevDay,
      };
      dotPackage.push(issue);
      dotRows.push({ day: prevDay, total: '0m', signed, status: 'Missing', issue });
      return;
    }

    if (coverageGroup || Math.abs(Number(coverage.total || 0) - 1440) > 1) {
      const issue = {
        code: `previous_total_${prevDay}`,
        title: `Previous log incomplete for ${prevDay}`,
        detail: `This day has ${durLabel(coverage.total || 0)} confirmed.`,
        where: 'DOT package',
        day: prevDay,
      };
      dotPackage.push(issue);
      dotRows.push({ day: prevDay, total: durLabel(coverage.total || 0), signed, status: 'Incomplete', issue });
      return;
    }

    if (needsRecert) {
      const issue = {
        code:`previous_recert_${prevDay}`,
        title:`Previous log needs recertification for ${prevDay}`,
        detail:'This day was edited after signing.',
        where:'DOT package',
        day:prevDay,
      };
      dotPackage.push(issue);
      dotRows.push({ day: prevDay, total: durLabel(coverage.total || 0), signed, status:'Needs recertification', issue });
      return;
    }

    if (!certified) {
      const issue = {
        code:`previous_unsigned_${prevDay}`,
        title:`Previous log not signed for ${prevDay}`,
        detail:'Previous 7-day package has a complete day that still needs certification.',
        where:'DOT package',
        day:prevDay,
      };
      dotPackage.push(issue);
      dotRows.push({ day: prevDay, total: durLabel(coverage.total || 0), signed, status:'Unsigned', issue });
      return;
    }

    dotRows.push({ day: prevDay, total: durLabel(coverage.total || 0), signed, status: 'Ready', issue: null });
  });

  const fixRequired = dayIssues.filter(issue => isFatalSigningIssue(issue) && issueSeverity(issue) === 'fix');
  const hosViolations = dayIssues.filter(issue => isFatalSigningIssue(issue) && issueSeverity(issue) === 'violation');
  const notices = dayIssues.filter(issue => issueSeverity(issue) === 'notice');
  const review = dayIssues.filter(issue => issueSeverity(issue) === 'review');
  const ready = fixRequired.length === 0 && hosViolations.length === 0;
  const status = ready && review.length === 0 && dotPackage.length === 0 ? 'READY' : fixRequired.length || hosViolations.length ? 'FIX_REQUIRED' : 'REVIEW';

  return {
    status,
    ready,
    fixRequired,
    hosViolations,
    review,
    notices,
    dotPackage,
    dotRows,
    allIssues: [...fixRequired, ...hosViolations, ...review, ...notices, ...dotPackage],
    todayIssues: [...fixRequired, ...hosViolations, ...review, ...notices],
    previousDays,
    dayIssues,
  };
}

export function buildIssueFixPrompt(state, day, issue) {
  return [
    'I am reviewing a CMV driver manual RODS log before certification.',
    'Do not suggest falsifying or changing accurate records. Only help identify what is missing, inconsistent, or needs review.',
    '',
    `Log date: ${day} (${fullDayTitle(day)})`,
    `Issue: ${issueToCopyLine(issue)}`,
    `Rule/check: ${issueRuleLabel(issue)}`,
    '',
    'Relevant events for this day:',
    ...sortedEvents(displayEventsForDay(state.eventsByDay?.[day] || [], day === localDayKey())).map((event, index) => `${index + 1}. ${timeLabel(event.startMin, true)} to ${timeLabel(event.endMin, true)} | ${statusLabel(event.status)} | ${locationLabel(event)} | ${event.note || event.description || ''}`),
    '',
    'Tell me:',
    '1. Is this a missing required field, a possible HOS/DOT violation, or only a review item?',
    '2. Which exact event/field should I open in the app?',
    '3. What should I enter only if the current record is actually wrong or incomplete?',
    '4. If the log is accurate and the issue is a real violation, say to certify the accurate log with the violation shown, not to change the time.',
  ].join('\n');
}

export function buildChatGptLogReviewPrompt(state, day) {
  const events = sortedEvents(displayEventsForDay(state.eventsByDay?.[day] || [], day === localDayKey()));
  const totals = dutyTotals(events);
  const guard = buildSignGuardSummary(state, day);
  const inspection = state.inspectionByDay?.[day] || {};
  const signature = state.signatureByDay?.[day] || {};
  const previous = guard.previousDays.map(prevDay => {
    const prevEvents = displayEventsForDay(state.eventsByDay?.[prevDay] || [], prevDay === localDayKey());
    return `${prevDay}: ${durLabel(totalMinutes(prevEvents))} total, ${prevEvents.length} event(s), ${state.signatureByDay?.[prevDay]?.signed ? 'signed' : 'not signed'}`;
  });

  return [
    'Please review this CMV driver manual RODS / ELD-exempt log before certification.',
    'Do not suggest falsifying records or changing accurate times. Flag only missing required information, inconsistency, or possible DOT/HOS review issues.',
    '',
    'Return your answer in this format:',
    'A) FIX BEFORE SIGNING',
    'B) REVIEW / POSSIBLE VIOLATION',
    'C) DOT PACKAGE READINESS',
    'D) COPY/PASTE FIX PLAN',
    '',
    'For D, use ONLY this structured format so the app/driver can copy-paste it back:',
    'FIX_ID: F1',
    'ISSUE: short issue name',
    'APP_ACTION: one of SET_DRIVER_NAME, SET_CARRIER_NAME, SET_MAIN_OFFICE, SET_SHIPPING_DOCS, SET_TRAILER_STATUS, OPEN_EVENT, CHANGE_EVENT_NOTE, ADD_MISSING_OFF_DUTY_TIME, CREATE_MISSING_DAY, CREATE_INSPECTION_FROM_PRETRIP, REVIEW_HOS_ONLY, OPEN_DAY, NO_CHANGE_TRUE_RECORD',
    'VALUE: exact value to enter, or REVIEW ONLY',
    'APPLY_ONLY_IF_TRUE: yes / only if accurate / no auto-change',
    '',
    `Driver: ${stateText(state, 'driverProfile.name', 'driver.name') || 'Not set'}`,
    `Carrier: ${stateText(state, 'carrierName', 'driver.carrier') || 'Not set'}`,
    `Main office: ${stateText(state, 'mainOfficeAddress', 'driver.mainOffice') || 'Not set'}`,
    `Truck/unit: ${stateText(state, 'driver.truck') || 'Not set'}`,
    `Trailer/equipment: ${stateText(state, 'currentTrailer', 'equipment.trailer', 'driver.trailer') || 'Not set'}`,
    `Shipping docs / load reference: ${shippingDocsText(state, day) || 'Not set'}`,
    `Log date: ${day} (${fullDayTitle(day)})`,
    '24-hour period starts: Midnight',
    '',
    `Totals: OFF ${durLabel(totals.OFF)} | SB ${durLabel(totals.SB)} | D ${durLabel(totals.D)} | ON ${durLabel(totals.ON)} | TOTAL ${durLabel(totalMinutes(events))}`,
    `Inspection: ${inspection.complete ? `Completed${inspection.sourceStartMin != null ? ` at ${timeLabel(inspection.sourceStartMin, true)}` : ''}` : 'Not completed'}`,
    `Certification: ${signature.signed ? 'Signed' : 'Not signed'}`,
    '',
    'Events:',
    ...(events.length ? events.map((event, index) => `${index + 1}. ${timeLabel(event.startMin, true)} to ${timeLabel(event.endMin, true)} | ${statusLabel(event.status)} | ${locationLabel(event)} | ${event.note || event.description || ''}`) : ['No events recorded']),
    '',
    'App-detected issues:',
    ...(guard.allIssues.length ? guard.allIssues.map(issue => `- ${issueToCopyLine(issue)} (${issueRuleLabel(issue)})`) : ['- None']),
    '',
    'Previous 7 days summary:',
    ...(previous.length ? previous : ['No previous-day summary available']),
  ].join('\n');
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
