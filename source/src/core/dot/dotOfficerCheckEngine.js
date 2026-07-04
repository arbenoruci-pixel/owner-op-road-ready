import { addDays, localDayKey } from '../../shared/utils/date.js';
import { durLabel, nowMin, timeLabel } from '../../shared/utils/time.js';
import { displayEventsForDayFromState } from '../timeline/displayTimeline.js';
import { analyzeLinkedHos, violationRangesForDay } from '../hos/hosEngine.js';
import { haversineMiles, pointFromLogLocation } from '../gps/locationService.js';

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
  if (!pa || !pb) return 0;
  const miles = haversineMiles(pa, pb);
  return Number.isFinite(miles) ? miles : 0;
}

function buildLocationContinuityIssues(events = []) {
  const issues = [];
  (events || []).forEach((event, index) => {
    const next = events[index + 1];
    if (!next) return;
    if (event.status === 'D' || next.status === 'D') return;
    if (!safeText(event.city) || !safeText(event.state) || !safeText(next.city) || !safeText(next.state)) return;
    if (sameEventLocation(event, next)) return;
    const touches = Math.abs(Number(next.startMin || 0) - Number(event.endMin || 0)) <= 5;
    if (!touches) return;
    const miles = estimatedLocationMiles(event, next);
    const preferPreviousToCurrent = next.status === 'ON';
    issues.push(makeIssue('location', {
      id:`location_jump_${event.id || index}_${next.id || index + 1}`,
      severity:'fix',
      title:'Location jump with no driving',
      detail:`${eventTitle(next)} starts in ${cityState(next.city, next.state)} right after ${eventTitle(event)} in ${cityState(event.city, event.state)}${miles ? ` · about ${miles.toFixed(0)} mi apart` : ''}`,
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
  const all = Object.entries(state.routeLegsByDay || {}).flatMap(([legDay, legs]) => (
    (legs || []).map(leg => ({ ...leg, day:leg.day || legDay }))
  ));

  return all
    .filter(leg => {
      if (leg.day === day || leg.pickupDay === day || leg.deliveryDay === day) return true;
      return String(leg.pickupDay || leg.day || '') < String(day || '') && leg.status !== 'delivered' && leg.status !== 'cancelled';
    })
    .sort((a,b) => String(a.pickupDay || a.day).localeCompare(String(b.pickupDay || b.day)) || Number(a.pickupMin ?? 9999) - Number(b.pickupMin ?? 9999));
}

function shippingDocsForDay(state, day, events = []) {
  const load = state.loadInfo || {};
  const equipment = state.equipment || {};
  const routeLegs = routeLegsForDay(state, day);
  const values = [
    load.loadNo,
    load.po,
    load.bol,
    load.shippingDocs,
    equipment.container,
    equipment.chassis,
    ...routeLegs.map(leg => leg.shippingDocs || leg.loadNo),
    ...events.map(event => event.shippingDocs || event.loadNo),
  ].map(safeText).filter(Boolean);
  return values;
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

  const drivingWithoutMiles = events.filter(event =>
    event.status === 'D' &&
    Number(event.endMin || 0) > Number(event.startMin || 0) &&
    !(Number(event.manualMiles || 0) > 0)
  );
  drivingWithoutMiles.forEach((event, index) => {
    issues.push(makeIssue('form', {
      id:`missing_driving_miles_${event.id || index}`,
      severity:'fix',
      title:'Driving miles missing',
      detail:`${eventTitle(event)} · ${durLabel(eventDuration(event))}`,
      fixAction:'OPEN_MANUAL_MILES',
      eventId:event.id,
      actionLabel:'Add miles',
    }));
  });

  const docTokens = splitDocTokens(docs);
  const dupes = [...new Set(docTokens.filter((item, index) => docTokens.indexOf(item) !== index))];
  if (dupes.length) {
    issues.push(makeIssue('form', { id:'duplicate_shipping_docs', severity:'review', title:'Shipping docs duplicated', detail:`Review: ${dupes.join(', ')}`, fixAction:'OPEN_FORM_FIELD', target:'shippingDocs', actionLabel:'Review' }));
  }

  return issues;
}

function buildCoverageIssues(state, day, events) {
  const issues = [];
  const today = localDayKey();
  const isActive = day >= today;
  const targetEnd = isActive ? nowMin() : 1440;
  const completed = events.filter(event => Number(event.endMin || 0) > Number(event.startMin || 0));
  const total = totalMinutes(completed);

  if (!completed.length) {
    issues.push(makeIssue('coverage', { id:'no_events', title:'No duty-status events', detail:'Log tab → Events', fixAction:'OPEN_LOG' }));
    return issues;
  }

  const first = completed[0];
  const last = completed[completed.length - 1];

  if (Number(first.startMin || 0) > 1) {
    issues.push(makeIssue('coverage', { id:'start_gap', title:'Day starts after midnight', detail:`First event starts ${timeLabel(first.startMin, true)}`, fixAction:'OPEN_HOS_RANGE', startMin:0, endMin:first.startMin, eventId:first.id }));
  }

  if (Number(last.endMin || 0) < targetEnd - 1) {
    issues.push(makeIssue('coverage', { id:'end_gap', title:isActive ? 'Current log not carried to now' : 'Day ends before midnight', detail:`Last event ends ${timeLabel(last.endMin, true)}`, fixAction:'OPEN_HOS_RANGE', startMin:last.endMin, endMin:targetEnd, eventId:last.id }));
  }

  if (!isActive && Math.abs(total - 1440) > 1) {
    issues.push(makeIssue('coverage', { id:'total_not_24h', title:'Daily total not 24h', detail:`Total ${durLabel(total)}`, fixAction:'OPEN_LOG' }));
  }

  completed.forEach((event, index) => {
    const next = completed[index + 1];
    if (!next) return;
    const gap = Number(next.startMin || 0) - Number(event.endMin || 0);
    if (gap > 1) {
      issues.push(makeIssue('coverage', { id:`gap_${event.id || index}`, title:'Gap between events', detail:`${timeLabel(event.endMin, true)}–${timeLabel(next.startMin, true)}`, fixAction:'OPEN_HOS_RANGE', startMin:event.endMin, endMin:next.startMin, eventId:event.id }));
    }
    if (gap < -1) {
      issues.push(makeIssue('coverage', { id:`overlap_${event.id || index}`, title:'Events overlap', detail:`Around ${timeLabel(next.startMin, true)}`, fixAction:'OPEN_EVENT', eventId:event.id }));
    }
  });

  return issues;
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

function buildHosIssues(state, day, events) {
  const issues = [];
  const result = analyzeLinkedHos(state.eventsByDay || {}, day, state.certifyStatus || {});
  const ranges = violationRangesForDay(state.eventsByDay || {}, day) || [];

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
    !sameEventLocation(preTrip, firstDriving)
  ) {
    issues.push(makeIssue('inspection', {
      id:`location_jump_pretrip_drive_${preTrip.id || preTrip.startMin}_${firstDriving.id || firstDriving.startMin}`,
      severity:'fix',
      title:'Pre-trip / driving location mismatch',
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

function buildPreviousDayIssues(state, day) {
  const issues = [];
  previousSevenDays(day).forEach(prevDay => {
    const events = displayEventsForDayFromState(state.eventsByDay || {}, prevDay);
    const completeEvents = events.filter(event => eventDuration(event) > 0);
    const signed = !!state.signatureByDay?.[prevDay]?.signed;
    if (!completeEvents.length) {
      issues.push(makeIssue('previous', { id:`missing_previous_${prevDay}`, title:'Previous day missing', detail:prevDay, day:prevDay, fixAction:'CREATE_MISSING_DAY', actionLabel:'Create day' }));
      return;
    }
    const total = totalMinutes(completeEvents);
    if (Math.abs(total - 1440) > 1) {
      issues.push(makeIssue('previous', { id:`previous_total_${prevDay}`, title:'Previous day incomplete', detail:`${prevDay} · ${durLabel(total)}`, day:prevDay, fixAction:'OPEN_DAY', actionLabel:'Open day' }));
    }
    if (!signed) {
      issues.push(makeIssue('previous', { id:`previous_unsigned_${prevDay}`, severity:'review', title:'Previous day not signed', detail:prevDay, day:prevDay, fixAction:'OPEN_DAY_SIGN', actionLabel:'Sign day' }));
    }
  });
  return issues;
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
      const linked = legs.some(leg => leg.deliveryEventId === event.id || leg.status === 'delivered');
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
  const events = displayEventsForDayFromState(state.eventsByDay || {}, day);
  const sections = [
    sectionSummary('form', 'Form fields', buildFormIssues(state, day, events)),
    sectionSummary('coverage', 'Log coverage', buildCoverageIssues(state, day, events)),
    sectionSummary('location', 'Locations', buildLocationIssues(events)),
    sectionSummary('hos', 'HOS review', buildHosIssues(state, day, events)),
    sectionSummary('inspection', 'Inspection', buildInspectionIssues(state, day, events)),
    sectionSummary('previous', 'Previous 7 days', buildPreviousDayIssues(state, day)),
    sectionSummary('route', 'Route / shipping', buildRouteIssues(state, day, events)),
  ];

  const issues = sections.flatMap(section => section.issues.map(issue => ({ ...issue, sectionTitle: section.title })));
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
  };
}
