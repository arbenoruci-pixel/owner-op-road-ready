import { addDays, localDayKey } from '../../shared/utils/date.js';
import { durLabel, nowMin, timeLabel } from '../../shared/utils/time.js';
import { buildCoverageFixGroup, coverageIssuesWithoutGroupedChildren, rawCoverageIssues, rawStoredEventsForDay } from '../compliance/rawRodsChecks.js';
import { analyzeLinkedHos, violationRangesForDay } from '../hos/hosEngine.js';
import { haversineMiles, pointFromLogLocation } from '../gps/locationService.js';
import { routeLegsForDayCanonical, suggestedMilesForDayFromRoute } from '../routes/routeNormalization.js';

const STATUS_LABEL = { OFF:'OFF DUTY', SB:'SLEEPER', D:'DRIVING', ON:'ON DUTY' };

function safeText(value = '') {
  return String(value || '').trim();
}

function cityState(city = '', state = '') {
  return [safeText(city), safeText(state)].filter(Boolean).join(', ');
}

function eventTitle(event = {}) {
  const status = STATUS_LABEL[event.status] || event.status || 'Event';
  return `${status} ${timeLabel(Number(event.startMin || 0), true)}–${timeLabel(Number(event.endMin || 0), true)}`;
}

function sameEventLocation(a = {}, b = {}) {
  const ac = safeText(a.city).toLowerCase();
  const as = safeText(a.state).toLowerCase();
  const bc = safeText(b.city).toLowerCase();
  const bs = safeText(b.state).toLowerCase();
  return !!ac && !!as && ac === bc && as === bs;
}

function estimatedLocationMiles(a = {}, b = {}) {
  const pa = pointFromLogLocation(a);
  const pb = pointFromLogLocation(b);
  if (!pa || !pb) return null;
  const miles = haversineMiles(pa, pb);
  return Number.isFinite(miles) ? miles : null;
}

function locationsAreEffectivelySamePlace(a = {}, b = {}) {
  if (sameEventLocation(a, b)) return true;
  const miles = estimatedLocationMiles(a, b);
  return miles != null && miles <= 5;
}

function isGenericDrivingStart(event = {}) {
  return event.status === 'D' && /driving started|manual driving|^driving$/i.test(`${event.note || ''} ${event.description || ''}`.trim());
}

function isConnectedOnDutyStart(event = {}) {
  return event.status === 'ON' && /pre[- ]?trip|inspection|pickup|loading|drop|hook|delivery|unloading/i.test(`${event.note || ''} ${event.description || ''}`);
}

function buildLocationContinuityIssues(events = []) {
  const issues = [];
  (events || []).forEach((event, index) => {
    const next = events[index + 1];
    if (!next) return;
    if (event.status === 'D' || next.status === 'D') return;
    if (!safeText(event.city) || !safeText(event.state) || !safeText(next.city) || !safeText(next.state)) return;
    if (locationsAreEffectivelySamePlace(event, next)) return;
    const touches = Math.abs(Number(next.startMin || 0) - Number(event.endMin || 0)) <= 5;
    if (!touches) return;
    const miles = estimatedLocationMiles(event, next);
    if (miles == null || miles <= 5) return;
    const preferPreviousToCurrent = next.status === 'ON';
    issues.push(makeIssue('location', {
      id:`location_jump_${event.id || index}_${next.id || index + 1}`,
      severity:'review',
      title:'Location continuity review',
      detail:`${eventTitle(next)} starts in ${cityState(next.city, next.state)} right after ${eventTitle(event)} in ${cityState(event.city, event.state)} · about ${miles.toFixed(0)} mi apart`,
      fixAction:'FIX_LOCATION_CONTINUITY',
      previousEventId:event.id || '',
      eventId:next.id || event.id || '',
      previousLocation:{ city:event.city || '', state:event.state || '' },
      currentLocation:{ city:next.city || '', state:next.state || '' },
      preferPreviousToCurrent,
      fixChainToCurrent: preferPreviousToCurrent,
      startMin:next.startMin,
      actionLabel:'Fix location',
    }));
  });
  return issues;
}

function previousSevenDays(day) {
  return Array.from({ length: 7 }, (_, index) => addDays(day, -(index + 1)));
}

function eventDuration(event = {}) {
  return Math.max(0, Number(event.endMin || 0) - Number(event.startMin || 0));
}

function totalMinutes(events = []) {
  return (events || []).reduce((sum, event) => sum + eventDuration(event), 0);
}

function hasPickupText(event = {}) {
  return /pickup|pick up|loading/i.test(`${event.note || ''} ${event.description || ''}`);
}

function hasDeliveryText(event = {}) {
  return /delivery|unloading|drop/i.test(`${event.note || ''} ${event.description || ''}`);
}

function hasPreTripText(event = {}) {
  return event.status === 'ON' && /pre[- ]?trip|inspection/i.test(`${event.note || ''} ${event.description || ''}`);
}

function hasVehicleWork(events = []) {
  return (events || []).some(event => event.status === 'D' || event.status === 'ON' || hasPickupText(event) || hasDeliveryText(event));
}

function isNoLoadText(text = '') {
  return /empty|bobtail|deadhead|no load|no trailer/i.test(String(text || ''));
}

function routeLegsForDay(state, day) {
  return routeLegsForDayCanonical(state, day);
}

function uniqueDocValues(values = []) {
  const seen = new Set();
  return values
    .map(safeText)
    .filter(Boolean)
    .filter(value => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function shippingDocsForDay(state, day, events = []) {
  const load = state.loadInfo || {};
  const equipment = state.equipment || {};
  const routeLegs = routeLegsForDay(state, day);
  return uniqueDocValues([
    ...routeLegs.map(leg => leg.displayShippingDocs || leg.shippingDocs || leg.loadNo),
    ...events.map(event => event.displayShippingDocs || event.shippingDocs || event.loadNo),
    ...(routeLegs.length ? [] : [load.loadNo, load.po, load.bol, load.shippingDocs]),
    equipment.container,
    equipment.chassis,
  ]);
}

function splitDocTokens(values = []) {
  return values
    .flatMap(value => String(value || '').split(/[,\s]+/))
    .map(item => item.trim())
    .filter(Boolean);
}

function classifyIssue(issue) {
  if (!issue) return 'review';
  if (issue.severity) return issue.severity;
  const text = `${issue.id || ''} ${issue.title || ''} ${issue.detail || ''}`.toLowerCase();
  if (/missing|gap|overlap|incomplete|invalid|required|not signed|duplicate/.test(text)) return 'fix';
  if (/hos|window|break|driving|cycle|manual|review|inspection/.test(text)) return 'review';
  return 'review';
}

function makeIssue(section, opts = {}) {
  const severity = classifyIssue(opts);
  return {
    section,
    severity,
    tone: severity === 'fix' ? 'bad' : severity === 'notice' ? 'notice' : 'warn',
    actionLabel: opts.actionLabel || (severity === 'fix' ? 'Fix' : 'Review'),
    ...opts,
  };
}

function sectionSummary(id, title, issues = []) {
  const fix = issues.filter(issue => issue.severity === 'fix').length;
  const review = issues.filter(issue => issue.severity === 'review').length;
  const notice = issues.filter(issue => issue.severity === 'notice').length;
  const status = fix ? 'Fix' : review ? 'Review' : notice ? 'Active' : 'OK';
  const tone = fix ? 'bad' : review ? 'warn' : notice ? 'notice' : 'ok';
  const count = issues.length;
  return {
    id,
    title,
    status,
    tone,
    count,
    detail: count ? `${count} item${count === 1 ? '' : 's'}` : 'Clean',
    issues,
  };
}

function firstEventInRange(events = [], range = {}) {
  if (range.eventId) return events.find(event => event.id === range.eventId) || null;
  if (range.startMin == null) return null;
  return events.find(event =>
    Number(event.startMin || 0) <= Number(range.startMin) &&
    Number(event.endMin || 0) >= Number(range.startMin)
  ) || null;
}

function buildFormIssues(state, day, events) {
  const issues = [];
  const driverName = safeText(state.driverProfile?.name || state.driver?.name);
  const carrier = safeText(state.carrierName || state.driver?.carrier);
  const office = safeText(state.mainOfficeAddress || state.driver?.mainOffice);
  const truck = safeText(state.driver?.truck);
  const trailer = safeText(state.currentTrailer || state.driver?.trailer);
  const docs = shippingDocsForDay(state, day, events);
  const hasLoadWork = events.some(event => hasPickupText(event) || hasDeliveryText(event) || event.status === 'D');
  const hasNoLoadNote = events.some(event => isNoLoadText(`${event.note || ''} ${event.description || ''}`));

  if (!driverName) issues.push(makeIssue('form', { id:'missing_driver', title:'Driver name missing', detail:'Form → Driver', fixAction:'OPEN_FORM_FIELD', target:'driverName' }));
  if (!carrier) issues.push(makeIssue('form', { id:'missing_carrier', title:'Carrier name missing', detail:'Form → Carrier', fixAction:'OPEN_FORM_FIELD', target:'carrierName' }));
  if (!office) issues.push(makeIssue('form', { id:'missing_main_office', title:'Main office missing', detail:'Form → Main office', fixAction:'OPEN_FORM_FIELD', target:'mainOffice' }));
  if (!truck) issues.push(makeIssue('form', { id:'missing_truck', title:'Truck/unit missing', detail:'Form → Truck/unit', fixAction:'OPEN_FORM_FIELD', target:'truck' }));
  if (!trailer || /^no trailer$/i.test(trailer)) {
    issues.push(makeIssue('form', { id:'trailer_review', severity:'review', title:'Trailer/equipment review', detail:'Form → Trailer/equipment', fixAction:'OPEN_FORM_FIELD', target:'trailer', actionLabel:'Open' }));
  }
  if (hasLoadWork && !docs.length && !hasNoLoadNote) {
    issues.push(makeIssue('form', { id:'missing_shipping_docs', title:'Shipping docs missing', detail:'Form → Shipping docs / BOL', fixAction:'OPEN_FORM_FIELD', target:'shippingDocs', actionLabel:'Add BOL' }));
  }

  const drivingEvents = events.filter(event =>
    event.status === 'D' &&
    Number(event.endMin || 0) > Number(event.startMin || 0)
  );
  const eventMilesTotal = drivingEvents.reduce((sum, event) => sum + Math.max(0, Number(event.manualMiles || 0)), 0);
  const dayMilesTotal = Math.max(0, Number(state.manualMilesByDay?.[day] || 0));
  const manualMilesTotal = dayMilesTotal || eventMilesTotal;
  const routeMilesSuggestion = suggestedMilesForDayFromRoute(state, day);
  if (drivingEvents.length && !(manualMilesTotal > 0)) {
    issues.push(makeIssue('form', {
      id:'missing_total_driving_miles',
      severity:'fix',
      title:'Total driving miles missing',
      detail: routeMilesSuggestion > 0
        ? `Enter total miles driven today. Recommendation: ${routeMilesSuggestion.toFixed(2)} mi.`
        : 'Enter total miles driven today.',
      fixAction:'OPEN_MANUAL_MILES',
      eventId:drivingEvents[0]?.id || '',
      suggestedMiles:routeMilesSuggestion || undefined,
      actionLabel:'Add total miles',
    }));
  }

  const docTokens = splitDocTokens(docs);
  const dupes = [...new Set(docTokens.filter((item, index) => docTokens.indexOf(item) !== index))];
  const transitionTokens = new Set(events.flatMap(event => [
    ...(Array.isArray(event.transitionLoadNos) ? event.transitionLoadNos : []),
    event.deliveredLoadNo,
    event.pickedUpLoadNo,
  ]).map(value => safeText(value).toLowerCase()).filter(Boolean));
  const unexpectedDupes = dupes.filter(item => !transitionTokens.has(String(item || '').toLowerCase()));
  if (unexpectedDupes.length) {
    issues.push(makeIssue('form', { id:'duplicate_shipping_docs', severity:'review', title:'Shipping docs duplicated', detail:`Review: ${unexpectedDupes.join(', ')}`, fixAction:'OPEN_FORM_FIELD', target:'shippingDocs', actionLabel:'Review' }));
  }

  return issues;
}

function buildCoverageIssues(state, day, rawCoverageResult = null) {
  const result = rawCoverageResult || rawCoverageIssues(state.eventsByDay || {}, day, { currentLocation: state.currentLocation || {} });
  const group = buildCoverageFixGroup(result, day);
  const remainder = coverageIssuesWithoutGroupedChildren(result, group)
    .filter(issue => String(issue.code || issue.id || '') !== 'future_day')
    .map(issue => makeIssue('coverage', issue));
  return group ? [makeIssue('coverage', group), ...remainder] : remainder;
}

function buildLocationIssues(events) {
  const missingIssues = events.flatMap((event, index) => {
    const missing = !safeText(event.city) || !safeText(event.state) || /^gps$/i.test(safeText(event.city)) || /^unk$/i.test(safeText(event.state));
    if (!missing) return [];
    return [makeIssue('location', {
      id:`location_${event.id || index}`,
      title:'City/state needed',
      detail:`${eventTitle(event)} → Location`,
      fixAction:'OPEN_EVENT',
      eventId:event.id,
      target:'location',
      actionLabel:'Fix location',
    })];
  });
  return [...missingIssues, ...buildLocationContinuityIssues(events)];
}

function rawEventsByDayForHos(eventsByDay = {}) {
  const out = {};
  Object.keys(eventsByDay || {}).forEach(dayKey => {
    out[dayKey] = rawStoredEventsForDay(eventsByDay, dayKey);
  });
  return out;
}

function buildHosIssues(state, day, events) {
  const issues = [];
  const rawEventsByDay = rawEventsByDayForHos(state.eventsByDay || {});
  const result = analyzeLinkedHos(rawEventsByDay, day, state.certifyStatus || {});
  const ranges = violationRangesForDay(rawEventsByDay, day) || [];

  ranges.forEach((range, index) => {
    const event = firstEventInRange(events, range);
    issues.push(makeIssue('hos', {
      id:`hos_${range.type || index}_${range.startMin}`,
      severity: range.severity === 'high' ? 'review' : 'review',
      title: range.text || 'HOS review item',
      detail:`Around ${timeLabel(range.startMin, true)}`,
      fixAction:'OPEN_HOS_RANGE',
      eventId:event?.id || range.eventId || '',
      startMin:range.startMin,
      endMin:range.endMin,
      actionLabel:'Review',
    }));
  });

  const hosWarnings = (result.warnings || []).filter(w => /11-hour|14-hour|30-minute|70-hour|cycle/i.test(String(w.text || '')));
  hosWarnings.forEach((warning, index) => {
    const exists = issues.some(issue => String(issue.title || '').includes(String(warning.text || '').slice(0, 20)));
    if (exists) return;
    issues.push(makeIssue('hos', {
      id:`hos_warning_${index}`,
      severity:'review',
      title:warning.text || 'HOS review',
      detail:'Log Check',
      fixAction:'OPEN_LOG',
      actionLabel:'Review',
    }));
  });

  return issues;
}

function buildInspectionIssues(state, day, events) {
  const issues = [];
  const inspection = state.inspectionByDay?.[day] || {};
  const firstDriving = events.find(event => event.status === 'D');
  const preTrip = events.find(hasPreTripText);
  const eventIds = new Set(events.map(event => event.id));
  const hasWork = hasVehicleWork(events);

  if (firstDriving && !preTrip) {
    issues.push(makeIssue('inspection', {
      id:`missing_pretrip_event_${firstDriving.id || firstDriving.startMin}`,
      severity:'fix',
      title:'Pre-trip ON DUTY event missing',
      detail:`Driving starts ${timeLabel(firstDriving.startMin, true)} · add 15m ON DUTY before driving`,
      fixAction:'ADD_PRETRIP_BEFORE_DRIVING',
      eventId:firstDriving.id || '',
      startMin:firstDriving.startMin,
      actionLabel:'Add 15m pre-trip',
    }));
  } else if (firstDriving && preTrip && Number(preTrip.endMin || 0) > Number(firstDriving.startMin || 0)) {
    issues.push(makeIssue('inspection', {
      id:`pretrip_after_driving_${preTrip.id || preTrip.startMin}`,
      severity:'review',
      title:'Pre-trip timing needs review',
      detail:`Pre-trip ends ${timeLabel(preTrip.endMin, true)} but driving starts ${timeLabel(firstDriving.startMin, true)}`,
      fixAction:'OPEN_EVENT',
      eventId:preTrip.id || '',
      startMin:preTrip.startMin,
      actionLabel:'Review',
    }));
  } else if (
    firstDriving &&
    preTrip &&
    Math.abs(Number(firstDriving.startMin || 0) - Number(preTrip.endMin || 0)) <= 5 &&
    safeText(preTrip.city) && safeText(preTrip.state) &&
    safeText(firstDriving.city) && safeText(firstDriving.state) &&
    !locationsAreEffectivelySamePlace(preTrip, firstDriving) &&
    !(isConnectedOnDutyStart(preTrip) && isGenericDrivingStart(firstDriving))
  ) {
    issues.push(makeIssue('inspection', {
      id:`location_jump_pretrip_drive_${preTrip.id || preTrip.startMin}_${firstDriving.id || firstDriving.startMin}`,
      severity:'review',
      title:'Pre-trip / driving location review',
      detail:`Pre-trip ${cityState(preTrip.city, preTrip.state)} → Driving ${cityState(firstDriving.city, firstDriving.state)}`,
      fixAction:'FIX_LOCATION_CONTINUITY',
      previousEventId:preTrip.id || '',
      eventId:firstDriving.id || '',
      previousLocation:{ city:preTrip.city || '', state:preTrip.state || '' },
      currentLocation:{ city:firstDriving.city || '', state:firstDriving.state || '' },
      preferPreviousToCurrent:true,
      fixChainToCurrent:true,
      startMin:firstDriving.startMin,
      actionLabel:'Fix location',
    }));
  } else if (preTrip && !inspection.complete) {
    issues.push(makeIssue('inspection', { id:'inspection_review', severity:'review', title:'Inspection review', detail:'Inspection tab', fixAction:'OPEN_INSPECTION', actionLabel:'Open' }));
  }

  if (inspection.complete && preTrip && !inspection.sourceEventId) {
    issues.push(makeIssue('inspection', {
      id:'inspection_complete_unlinked_pretrip',
      severity:'review',
      title:'Inspection complete but Pre-trip link missing',
      detail:`Inspection is complete, but it is not linked to the ON DUTY Pre-trip event at ${timeLabel(preTrip.startMin, true)}`,
      fixAction:'OPEN_INSPECTION',
      eventId:preTrip.id || '',
      actionLabel:'Link pre-trip',
    }));
  }

  if (inspection.complete && preTrip && inspection.sourceEventId && inspection.sourceEventId !== preTrip.id) {
    issues.push(makeIssue('inspection', {
      id:'inspection_unlinked_pretrip',
      severity:'review',
      title:'Inspection link review',
      detail:`Inspection is not linked to pre-trip at ${timeLabel(preTrip.startMin, true)}`,
      fixAction:'OPEN_INSPECTION',
      eventId:preTrip.id || '',
      actionLabel:'Review',
    }));
  }

  if (inspection.complete && inspection.sourceEventId && !eventIds.has(inspection.sourceEventId)) {
    issues.push(makeIssue('inspection', { id:'stale_inspection_link', title:'Inspection link stale', detail:'Linked pre-trip event not found', fixAction:'OPEN_INSPECTION', actionLabel:'Review' }));
  }

  if (inspection.complete && preTrip && inspection.sourceEventId === preTrip.id && Number(inspection.sourceStartMin) !== Number(preTrip.startMin)) {
    issues.push(makeIssue('inspection', { id:'inspection_time_mismatch', title:'Inspection time mismatch', detail:`Inspection ${timeLabel(inspection.sourceStartMin, true)} / Pre-trip ${timeLabel(preTrip.startMin, true)}`, fixAction:'OPEN_INSPECTION', eventId:preTrip.id, actionLabel:'Review' }));
  }

  return issues;
}

function buildPreviousDayPackage(state, day) {
  const issues = [];
  const rows = [];
  previousSevenDays(day).forEach(prevDay => {
    const coverage = rawCoverageIssues(state.eventsByDay || {}, prevDay, { currentLocation: state.currentLocation || {} });
    const group = buildCoverageFixGroup(coverage, prevDay);
    const completeEvents = coverage.events || [];
    const signed = !!state.signatureByDay?.[prevDay]?.signed;
    const signStatus = state.certifyStatus?.[prevDay] || '';
    const needsRecert = signStatus === 'Needs Recertification';
    const isCertified = signStatus === 'Certified' && signed && !needsRecert;
    let status = 'Ready';
    let issue = null;

    if (!completeEvents.length) {
      status = 'Missing';
      issue = makeIssue('previous', {
        id:`missing_previous_${prevDay}`,
        severity:'fix',
        title:'Previous day missing',
        detail:prevDay,
        day:prevDay,
        fixAction:'CREATE_MISSING_DAY',
        actionLabel:'Create day',
      });
    } else if (group || Math.abs(Number(coverage.total || 0) - 1440) > 1) {
      status = 'Incomplete';
      issue = makeIssue('previous', {
        id:`previous_total_${prevDay}`,
        severity:'fix',
        title:'Previous day incomplete',
        detail:`${prevDay} · ${durLabel(coverage.total || 0)} confirmed`,
        day:prevDay,
        fixAction:'OPEN_DAY',
        actionLabel:'Open day',
      });
    } else if (needsRecert) {
      status = 'Needs recertification';
      issue = makeIssue('previous', {
        id:`previous_recert_${prevDay}`,
        severity:'fix',
        title:'Previous day needs recertification',
        detail:prevDay,
        day:prevDay,
        fixAction:'OPEN_DAY_SIGN',
        actionLabel:'Recertify',
      });
    } else if (!isCertified) {
      status = 'Unsigned';
      issue = makeIssue('previous', {
        id:`previous_unsigned_${prevDay}`,
        severity:'fix',
        title:'Previous day not signed',
        detail:prevDay,
        day:prevDay,
        fixAction:'OPEN_DAY_SIGN',
        actionLabel:'Sign day',
      });
    }

    if (issue) issues.push(issue);
    rows.push({
      day:prevDay,
      total:durLabel(coverage.total || 0),
      signed,
      status,
      issue,
      actionLabel:issue?.actionLabel || 'Open',
      fixAction:issue?.fixAction || 'OPEN_DAY',
    });
  });
  return { issues, rows };
}

function buildPreviousDayIssues(state, day) {
  return buildPreviousDayPackage(state, day).issues;
}

function buildRouteIssues(state, day, events) {
  const issues = [];
  const legs = routeLegsForDay(state, day);

  events.forEach(event => {
    if (hasPickupText(event)) {
      const hasBol = safeText(event.shippingDocs || event.loadNo) || legs.some(leg => leg.pickupEventId === event.id && safeText(leg.shippingDocs || leg.loadNo));
      const hasDest = safeText(event.destination || event.destinationState) || legs.some(leg => leg.pickupEventId === event.id && (safeText(leg.toCity) || safeText(leg.toState)));
      if (!hasBol || !hasDest) {
        issues.push(makeIssue('route', { id:`pickup_route_${event.id}`, title:'Pickup load info needed', detail:eventTitle(event), fixAction:'OPEN_EVENT', eventId:event.id, actionLabel:!hasBol ? 'Add BOL' : 'Add destination' }));
      }
    }
    if (hasDeliveryText(event)) {
      const linked = legs.some(leg => leg.deliveryEventId === event.id);
      if (!linked) {
        issues.push(makeIssue('route', { id:`delivery_route_${event.id}`, severity:'review', title:'Delivery route link review', detail:eventTitle(event), fixAction:'OPEN_EVENT', eventId:event.id, actionLabel:'Review' }));
      }
    }
  });

  const openCarry = legs.filter(leg => leg.status !== 'delivered' && leg.status !== 'cancelled' && String(leg.pickupDay || leg.day || '') < String(day || ''));
  openCarry.forEach(leg => {
    issues.push(makeIssue('route', { id:`open_carry_${leg.id}`, severity:'review', title:'Open load carried in', detail:`${cityState(leg.fromCity, leg.fromState)} → ${cityState(leg.toCity, leg.toState) || 'open'}`, fixAction:'OPEN_ROUTE_LEG', actionLabel:'Review' }));
  });

  return issues;
}

export function buildDotOfficerCheck(state, day) {
  const events = rawStoredEventsForDay(state.eventsByDay || {}, day);
  const rawCoverageResult = rawCoverageIssues(state.eventsByDay || {}, day, { currentLocation: state.currentLocation || {} });
  const previousPackage = buildPreviousDayPackage(state, day);
  const previousSection = sectionSummary('previous', 'Previous 7 days', previousPackage.issues);
  previousSection.rows = previousPackage.rows;

  const sections = [
    sectionSummary('form', 'Form fields', buildFormIssues(state, day, events)),
    sectionSummary('coverage', 'Log coverage', buildCoverageIssues(state, day, rawCoverageResult)),
    sectionSummary('location', 'Locations', buildLocationIssues(events)),
    sectionSummary('hos', 'HOS review', buildHosIssues(state, day, events)),
    sectionSummary('inspection', 'Inspection', buildInspectionIssues(state, day, events)),
    sectionSummary('route', 'Route / shipping', buildRouteIssues(state, day, events)),
    previousSection,
  ];

  const issues = sections
    .flatMap(section => section.issues.map(issue => ({ ...issue, sectionTitle: section.title })))
    .sort((a, b) => {
      const ar = a.fixAction === 'OPEN_COVERAGE_WIZARD' ? 0 : a.section === 'previous' ? 4 : a.severity === 'fix' ? 1 : a.severity === 'review' ? 2 : 3;
      const br = b.fixAction === 'OPEN_COVERAGE_WIZARD' ? 0 : b.section === 'previous' ? 4 : b.severity === 'fix' ? 1 : b.severity === 'review' ? 2 : 3;
      return ar - br;
    });
  const fixCount = issues.filter(issue => issue.severity === 'fix').length;
  const reviewCount = issues.filter(issue => issue.severity === 'review').length;
  const noticeCount = issues.filter(issue => issue.severity === 'notice').length;
  const status = fixCount ? 'FIX_REQUIRED' : reviewCount ? 'REVIEW' : 'READY';
  const score = Math.max(0, Math.min(100, 100 - fixCount * 15 - reviewCount * 7 - noticeCount * 2));

  return {
    status,
    label: status === 'READY' ? 'DOT Ready' : status === 'FIX_REQUIRED' ? 'Fix before signing' : 'Review before signing',
    score,
    fixCount,
    reviewCount,
    noticeCount,
    sections,
    issues,
    rawCoverageResult,
    coverageGroup: buildCoverageFixGroup(rawCoverageResult, day),
    previousRows: previousPackage.rows,
  };
}
