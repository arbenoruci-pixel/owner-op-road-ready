import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Header, Tabs } from '../../shared/ui/Chrome.jsx';
import LogGraph from '../graph/LogGraph.jsx';
import EventList from './EventList.jsx';
import LogCheckPanel from './LogCheckPanel.jsx';
import SelectedEventBar from './SelectedEventBar.jsx';
import { violationRangesForDay } from '../../core/hos/hosEngine.js';
import { buildDotOfficerCheck } from '../../core/dot/dotOfficerCheckEngine.js';
import { estimatedRoadMiles, pointFromLogLocation, recalcMilesByTimeWindow } from '../../core/gps/locationService.js';
import { normalizeLogEvents } from '../../core/timeline/timelineEngine.js';
import { displayEventsForDay, displayEventsForDayFromState } from '../../core/timeline/displayTimeline.js';
import { isToday, localDayKey } from '../../shared/utils/date.js';
import { durLabel } from '../../shared/utils/time.js';
import { buildChatGptLogReviewPrompt, buildIssueFixPrompt, buildSignGuardSummary, issueSuggestedAction, logSignState, signingWarnings, validateLogForSigning } from './signing.js';

const DEFAULT_DRIVER_NAME = 'Arben Oruci';
const DEFAULT_CARRIER_NAME = 'Narta express llc';
const DEFAULT_MAIN_OFFICE = '92 201 lake drive , willowbrook, IL 60527';

function title(day) {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  const dow = d.toLocaleDateString(undefined, { weekday:'short' }).toUpperCase();
  const mon = d.toLocaleDateString(undefined, { month:'short' }).toUpperCase();
  return `${dow} | ${mon} ${String(d.getDate()).padStart(2,'0')}`;
}

function clampDelta(event, delta) {
  if (!event) return 0;
  const min = -Number(event.startMin || 0);
  const max = 1439 - Number(event.endMin || 0);
  return Math.max(min, Math.min(max, delta));
}

function shiftOneEvent(events, eventId, delta) {
  if (!eventId || !delta) return events;
  return normalizeLogEvents((events || []).map(event => (
    event.id === eventId
      ? { ...event, startMin:event.startMin + delta, endMin:event.endMin + delta }
      : event
  )));
}

function violationSignature(ranges) {
  return (ranges || [])
    .map(r => `${r.type || ''}:${r.severity || ''}:${r.status || ''}:${r.startMin}-${r.endMin}`)
    .join('|');
}

const INSPECTION_ITEMS = [
  ['brakes', 'Brakes'],
  ['lights', 'Lights'],
  ['tires', 'Tires'],
  ['mirrors', 'Mirrors'],
  ['coupling', 'Coupling / 5th wheel'],
  ['documents', 'Documents'],
];

function prettyStamp(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }); }
  catch { return ''; }
}

function minutesLabel(minute) {
  if (!Number.isFinite(Number(minute))) return '';
  const total = Math.max(0, Math.min(1440, Number(minute)));
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

function isPreTripEvent(event = {}) {
  return event.status === 'ON' && /pre[- ]?trip|inspection/i.test(`${event.note || ''} ${event.description || ''}`);
}

function minuteTimestampForDay(day, minute) {
  const [year, month, date] = String(day || '').split('-').map(Number);
  if (!year || !month || !date) return Date.now();
  const d = new Date(year, month - 1, date, 0, 0, 0, 0);
  d.setMinutes(Math.max(0, Math.min(1440, Number(minute || 0))));
  return d.getTime();
}

function inspectionPayloadFromEvent(day, event, saved = {}) {
  const sourceStartMin = Math.max(0, Math.min(1440, Number(event?.startMin ?? 0)));
  const sourceEndMin = Math.max(sourceStartMin, Math.min(1440, Number(event?.endMin ?? sourceStartMin)));
  return {
    ...saved,
    type: 'pretrip',
    checked: INSPECTION_ITEMS.map(([id]) => id),
    complete: true,
    completedAt: minuteTimestampForDay(day, sourceStartMin),
    source: 'auto_on_duty_pretrip_event',
    sourceEventId: event?.id || null,
    sourceEventChainId: event?.event_chain_id || event?.eventChainId || null,
    sourceStartMin,
    sourceEndMin,
    city: event?.city || '',
    state: event?.state || '',
    locationSource: event?.locationSource || event?.source || 'manual',
  };
}


function isAutoInspection(saved = {}) {
  return String(saved.source || '').includes('auto_on_duty_pretrip');
}

function safeValue(value, fallback = 'None') {
  const text = value === 0 ? '0' : String(value || '').trim();
  return text ? text : fallback;
}

function formatDutyMinutes(mins) {
  const total = Math.max(0, Number(mins || 0));
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

function joinCityState(city, state) {
  const parts = [city, state].filter(Boolean);
  return parts.length ? parts.join(', ') : 'None';
}

function routeLegsForDay(state, day) {
  const all = Object.entries(state.routeLegsByDay || {}).flatMap(([legDay, legs]) => (legs || []).map(leg => ({ ...leg, day:leg.day || legDay })));
  return all
    .filter(leg => {
      if (leg.day === day || leg.pickupDay === day || leg.deliveryDay === day) return true;
      // Carry only open/in-progress legs into newer days; completed legs stay on their own day.
      return String(leg.pickupDay || leg.day || '') < String(day || '') && leg.status !== 'delivered' && leg.status !== 'cancelled';
    })
    .sort((a,b)=>String(a.pickupDay || a.day).localeCompare(String(b.pickupDay || b.day)) || Number(a.pickupMin ?? 9999)-Number(b.pickupMin ?? 9999));
}

function legLabel(leg) {
  const from = joinCityState(leg.fromCity, leg.fromState);
  const to = joinCityState(leg.toCity, leg.toState);
  if (from === 'None' && to === 'None') return 'Route leg';
  if (from === 'None') return `To ${to}`;
  if (to === 'None') return `${from} → open`;
  return `${from} → ${to}`;
}

function legMeta(leg) {
  const parts = [];
  if (leg.shippingDocs) parts.push(`BOL ${leg.shippingDocs}`);
  parts.push(leg.status === 'delivered' ? 'Delivered' : 'Open');
  if (leg.pickupDay) parts.push(`Pickup ${leg.pickupDay}`);
  return parts.join(' · ');
}

function driverNameForState(state) {
  return state.signatureByDay?.[state.activeDay]?.driverName || state.driverProfile?.name || DEFAULT_DRIVER_NAME;
}

function manualMilesTotal(events = []) {
  return (events || []).reduce((sum, event) => sum + Math.max(0, Number(event.manualMiles || 0)), 0);
}

function hasLocationForMiles(event = {}) {
  return !!pointFromLogLocation(event) || (!!String(event.city || '').trim() && !!String(event.state || '').trim());
}

function displayLocationForMiles(event = {}) {
  return joinCityState(event.city, event.state) !== 'None'
    ? joinCityState(event.city, event.state)
    : (event.lat != null && event.lng != null ? 'GPS point' : 'Unknown');
}

function drivingBlockForEvent(events = [], eventId = '') {
  const sorted = [...events].sort((a, b) => Number(a.startMin || 0) - Number(b.startMin || 0));
  const eventIndex = sorted.findIndex(event => event.id === eventId);
  if (eventIndex < 0) return { sorted, event:null, startIndex:-1, endIndex:-1 };
  let startIndex = eventIndex;
  let endIndex = eventIndex;

  while (
    startIndex > 0 &&
    sorted[startIndex - 1]?.status === 'D' &&
    Math.abs(Number(sorted[startIndex]?.startMin || 0) - Number(sorted[startIndex - 1]?.endMin || 0)) <= 5
  ) {
    startIndex -= 1;
  }

  while (
    endIndex < sorted.length - 1 &&
    sorted[endIndex + 1]?.status === 'D' &&
    Math.abs(Number(sorted[endIndex + 1]?.startMin || 0) - Number(sorted[endIndex]?.endMin || 0)) <= 5
  ) {
    endIndex += 1;
  }

  return { sorted, event:sorted[eventIndex], startIndex, endIndex };
}

function nearestLocationBefore(sorted = [], index = 0) {
  for (let i = index; i >= 0; i -= 1) {
    if (hasLocationForMiles(sorted[i])) return sorted[i];
  }
  return null;
}

function nearestLocationAfter(sorted = [], index = 0) {
  for (let i = index; i < sorted.length; i += 1) {
    if (hasLocationForMiles(sorted[i])) return sorted[i];
  }
  return null;
}

function drivingMinutesForBlock(events = [], eventId = '') {
  const block = drivingBlockForEvent(events, eventId);
  if (!block.event) return 0;
  const startEvent = block.sorted[block.startIndex];
  const endEvent = block.sorted[block.endIndex];
  return Math.max(0, Number(endEvent?.endMin || 0) - Number(startEvent?.startMin || 0));
}

function drivingMinutesForDay(events = []) {
  return (events || [])
    .filter(event => event.status === 'D')
    .reduce((sum, event) => sum + Math.max(0, Number(event.endMin || 0) - Number(event.startMin || 0)), 0);
}

function milesAtSpeed(minutes = 0, mph = 65) {
  return Number(((Math.max(0, Number(minutes || 0)) / 60) * Number(mph || 0)).toFixed(2));
}

function speedMilesOptions(minutes = 0) {
  return [62, 65, 68].map(speed => ({ speed, miles:milesAtSpeed(minutes, speed) }));
}

function speedOptionsText(options = []) {
  return options.map(item => `${item.speed}mph ${item.miles.toFixed(2)} mi`).join(' · ');
}

function bestSpeedDefault(options = []) {
  return options.find(item => item.speed === 65)?.miles || options[0]?.miles || 0;
}

function drivingMilesSpeedGuide(events = [], eventId = '') {
  const legMinutes = drivingMinutesForBlock(events, eventId);
  const dayMinutes = drivingMinutesForDay(events);
  return {
    legMinutes,
    dayMinutes,
    leg:speedMilesOptions(legMinutes),
    day:speedMilesOptions(dayMinutes),
  };
}

function bestManualMilesSuggestion({ events = [], eventId = '', gpsPoints = [] } = {}) {
  const block = drivingBlockForEvent(events, eventId);
  if (!block.event) return null;
  const startEvent = block.sorted[block.startIndex];
  const endEvent = block.sorted[block.endIndex];
  const gps = recalcMilesByTimeWindow(gpsPoints, Number(startEvent.startMin || 0), Number(endEvent.endMin || 0));
  if (gps.totalMiles > 0 && gps.pointsUsed >= 2) {
    const topState = Object.entries(gps.milesByState || {}).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))[0]?.[0] || block.event.state || 'UNK';
    return {
      miles:gps.totalMiles,
      state:topState,
      confidence:'High',
      source:'GPS points',
      from:displayLocationForMiles(startEvent),
      to:displayLocationForMiles(endEvent),
    };
  }

  const originEvent = nearestLocationBefore(block.sorted, block.startIndex) || startEvent;
  const destinationEvent = nearestLocationAfter(block.sorted, block.endIndex + 1) || endEvent;
  const origin = pointFromLogLocation(originEvent);
  const destination = pointFromLogLocation(destinationEvent);
  if (!origin || !destination) return null;

  const miles = estimatedRoadMiles(origin, destination);
  if (!miles) return null;
  return {
    miles,
    state:destination.state || block.event.state || origin.state || 'UNK',
    confidence:origin.source === 'gps' && destination.source === 'gps' ? 'High' : 'Medium',
    source:origin.source === 'gps' && destination.source === 'gps' ? 'log GPS points' : 'log locations',
    from:displayLocationForMiles(originEvent),
    to:displayLocationForMiles(destinationEvent),
    originEventId:originEvent.id,
    destinationEventId:destinationEvent.id,
  };
}

function formSummary(state, events) {
  const dutyTotals = ['OFF','SB','D','ON'].map(status => {
    const mins = (events || []).filter(e => e.status === status).reduce((sum, e) => sum + Math.max(0, e.endMin - e.startMin), 0);
    return [status, mins];
  });
  const dutyMap = Object.fromEntries(dutyTotals);
  const load = state.loadInfo || {};
  const equipment = state.equipment || {};
  const routeLegs = routeLegsForDay(state, state.activeDay);
  const legDocs = routeLegs.map(leg => leg.shippingDocs || leg.loadNo).filter(Boolean);
  const shippingDocs = [...new Set([...(legDocs || []), load.shippingDocs || load.loadNo, equipment.container, equipment.chassis].filter(Boolean))].join(' ');
  const trailers = state.currentTrailer && state.currentTrailer !== 'No trailer'
    ? state.currentTrailer
    : (equipment.trailer || state.driver?.trailer || 'None');
  const notes = [...new Set((events || []).map(e => e.description || e.note).filter(Boolean))].slice(0, 2).join(' · ');
  const manualMiles = manualMilesTotal(events);
  const hasDriving = (events || []).some(event => event.status === 'D');
  return {
    off: formatDutyMinutes(dutyMap.OFF || 0),
    sb: formatDutyMinutes(dutyMap.SB || 0),
    d: formatDutyMinutes(dutyMap.D || 0),
    on: formatDutyMinutes(dutyMap.ON || 0),
    vehicles: safeValue(state.driver?.truck),
    trailers: safeValue(trailers),
    distance: manualMiles > 0 ? `${manualMiles.toFixed(2)} mi` : (hasDriving ? 'Missing' : 'None'),
    odometers: 'No Vehicles',
    shippingDocs: safeValue(shippingDocs),
    driverName: driverNameForState(state),
    carrierName: safeValue(state.carrierName || DEFAULT_CARRIER_NAME),
    mainOffice: safeValue(state.mainOfficeAddress || DEFAULT_MAIN_OFFICE),
    homeTerminal: safeValue(state.homeTerminalAddress),
    coDrivers: safeValue(state.coDrivers),
    from: routeLegs[0] ? joinCityState(routeLegs[0].fromCity, routeLegs[0].fromState) : joinCityState(load.pickupCity, load.pickupState),
    to: routeLegs.length ? joinCityState(routeLegs[routeLegs.length - 1].toCity, routeLegs[routeLegs.length - 1].toState) : joinCityState(load.deliveryCity, load.deliveryState),
    routeLegs,
    notes: safeValue(notes),
  };
}

function FormSectionTitle({ children }) {
  return <div className="road-form-section-title">{children}</div>;
}

function parseCityStateEdit(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return { city:'', state:'' };
  const parts = raw.split(',');
  if (parts.length >= 2) {
    const state = parts.pop().trim().toUpperCase().slice(0, 2);
    return { city:parts.join(',').trim(), state };
  }
  const trailing = raw.match(/^(.+?)\s+([A-Za-z]{2})$/);
  if (trailing) return { city:trailing[1].trim(), state:trailing[2].toUpperCase() };
  return { city:raw, state:'' };
}

function FormRow({ label, value, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`road-form-row ${onClick ? 'editable' : ''}`} onClick={onClick}>
      <div className="road-form-label">{label}</div>
      <div className="road-form-value">{value}</div>
    </Tag>
  );
}

function MiniFormPanel({ state, events, onSaveLoad, onOpenTrailer }) {
  const form = formSummary(state, events);
  const load = state.loadInfo || {};
  function editText(title, current, key) {
    if (typeof window === 'undefined') return;
    const value = window.prompt(title, current === 'None' ? '' : current);
    if (value == null) return;
    onSaveLoad?.({ [key]: String(value || '').trim() });
  }
  function editPickup() {
    if (typeof window === 'undefined') return;
    const value = window.prompt('Pickup / From location (City, ST)', joinCityState(load.pickupCity, load.pickupState) === 'None' ? '' : joinCityState(load.pickupCity, load.pickupState));
    if (value == null) return;
    const parsed = parseCityStateEdit(value);
    onSaveLoad?.({ pickupCity: parsed.city, pickupState: parsed.state });
  }
  function editDelivery() {
    if (typeof window === 'undefined') return;
    const value = window.prompt('Delivery / To location (City, ST)', joinCityState(load.deliveryCity, load.deliveryState) === 'None' ? '' : joinCityState(load.deliveryCity, load.deliveryState));
    if (value == null) return;
    const parsed = parseCityStateEdit(value);
    onSaveLoad?.({ deliveryCity: parsed.city, deliveryState: parsed.state });
  }
  function editShipping() {
    if (typeof window === 'undefined') return;
    const value = window.prompt('BOL / shipping document / load reference', form.shippingDocs === 'None' ? '' : form.shippingDocs);
    if (value == null) return;
    onSaveLoad?.({ shippingDocs: String(value || '').trim(), loadNo: String(value || '').trim() });
  }
  function addRouteLeg() {
    if (typeof window === 'undefined') return;
    const fromValue = window.prompt('Pickup from (City, ST)', form.from === 'None' ? '' : form.from);
    if (fromValue == null) return;
    const toValue = window.prompt('Going to (City, ST)', form.to === 'None' ? '' : form.to);
    if (toValue == null) return;
    const bolValue = window.prompt('BOL / Shipping #', form.shippingDocs === 'None' ? '' : form.shippingDocs) || '';
    const from = parseCityStateEdit(fromValue);
    const to = parseCityStateEdit(toValue);
    const day = state.activeDay;
    const leg = {
      id:`manual_leg_${Date.now()}`,
      day,
      pickupDay:day,
      pickupEventId:'',
      pickupMin:null,
      fromCity:from.city,
      fromState:from.state,
      toCity:to.city,
      toState:to.state,
      shippingDocs:String(bolValue || '').trim(),
      loadNo:String(bolValue || '').trim(),
      status:'open',
      source:'manual_form',
      updatedAt:Date.now(),
    };
    const routeLegsByDay = { ...(state.routeLegsByDay || {}) };
    routeLegsByDay[day] = [...(routeLegsByDay[day] || []), leg];
    onSaveLoad?.({
      routeLegsByDay,
      shippingDocs: leg.shippingDocs || load.shippingDocs || '',
      loadNo: leg.loadNo || load.loadNo || '',
      pickupCity: from.city,
      pickupState: from.state,
      deliveryCity: to.city,
      deliveryState: to.state,
    });
  }
  return (
    <div className="road-paper-form">
      <div className="road-form-totals">
        <div><b>OFF</b><span>{form.off}</span></div>
        <div><b>SB</b><span>{form.sb}</span></div>
        <div><b>D</b><span>{form.d}</span></div>
        <div><b>ON</b><span>{form.on}</span></div>
      </div>

      <FormSectionTitle>GENERAL</FormSectionTitle>
      <FormRow label="Vehicles" value={form.vehicles} onClick={() => editText('Truck / unit number', form.vehicles, 'truck')} />
      <FormRow label="Trailers" value={form.trailers} onClick={onOpenTrailer || (() => editText('Trailer / equipment', form.trailers, 'trailer'))} />
      <div className="road-form-split-row">
        <div>
          <div className="road-form-label">Distance</div>
          <div className="road-form-value">{form.distance}</div>
        </div>
        <div>
          <div className="road-form-label">Odometers</div>
          <div className="road-form-value">{form.odometers}</div>
        </div>
      </div>
      <FormRow label="Shipping Documents" value={form.shippingDocs} onClick={editShipping} />
      <FormRow label="Driver" value={form.driverName} onClick={() => editText('Driver name', form.driverName, 'driverName')} />

      <FormSectionTitle>CARRIER</FormSectionTitle>
      <FormRow label="Carrier" value={form.carrierName} onClick={() => editText('Carrier name', form.carrierName, 'carrierName')} />
      <FormRow label="Main Office Address" value={form.mainOffice} onClick={() => editText('Main office address', form.mainOffice, 'mainOfficeAddress')} />
      <FormRow label="Home Terminal Address" value={form.homeTerminal} onClick={() => editText('Home terminal address', form.homeTerminal, 'homeTerminalAddress')} />

      <FormSectionTitle>ROUTE / SHIPPING</FormSectionTitle>
      <div className="route-leg-list">
        {form.routeLegs.length ? form.routeLegs.map(leg => (
          <button key={leg.id} type="button" className={`route-leg-row ${leg.status === 'delivered' ? 'done' : 'open'}`} onClick={addRouteLeg}>
            <b>{legLabel(leg)}</b>
            <span>{legMeta(leg)}</span>
          </button>
        )) : <div className="route-leg-empty">No route legs yet.</div>}
        <button type="button" className="route-leg-add" onClick={addRouteLeg}>+ Add stop / leg</button>
      </div>

      <FormSectionTitle>OTHER</FormSectionTitle>
      <FormRow label="Co-Drivers" value={form.coDrivers} onClick={() => editText('Co-drivers', form.coDrivers, 'coDrivers')} />
      <FormRow label="From" value={form.from} onClick={editPickup} />
      <FormRow label="To" value={form.to} onClick={editDelivery} />
      <FormRow label="Notes" value={form.notes} />
    </div>
  );
}

function InspectionPanel({ state, events = [], onSaveInspection }) {
  const day = state.activeDay;
  const saved = state.inspectionByDay?.[day] || {};
  const checked = new Set(saved.checked || []);
  const allChecked = INSPECTION_ITEMS.every(([id]) => checked.has(id));
  const autoDone = allChecked && isAutoInspection(saved);
  const preTripEvent = [...(events || [])].sort((a,b)=>a.startMin-b.startMin).find(isPreTripEvent) || null;

  function saveChecked(ids) {
    onSaveInspection?.({
      type: 'pretrip',
      checked: ids,
      complete: INSPECTION_ITEMS.every(([id]) => ids.includes(id)),
      completedAt: INSPECTION_ITEMS.every(([id]) => ids.includes(id)) ? (saved.completedAt || Date.now()) : null,
      source: saved.source || 'manual_inspection_form',
    });
  }

  function toggle(id) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id); else next.add(id);
    saveChecked([...next]);
  }

  function selectAll() {
    saveChecked(INSPECTION_ITEMS.map(([id]) => id));
  }

  function acceptPreTripSheet() {
    if (!preTripEvent) return;
    onSaveInspection?.(inspectionPayloadFromEvent(day, preTripEvent, saved));
  }

  return (
    <div className={`inspection-panel ${allChecked ? 'complete' : ''} ${autoDone ? 'auto-complete' : ''}`}>
      <div className="inspection-headline">
        <div>
          <b>Daily inspection sheet</b>
          <span>
            {autoDone
              ? `Completed from ON DUTY Pre-trip${saved.sourceStartMin != null ? ` · ${minutesLabel(saved.sourceStartMin)}` : ''}${saved.city || saved.state ? ` · ${[saved.city, saved.state].filter(Boolean).join(', ')}` : ''}`
              : allChecked
                ? `Completed${saved.completedAt ? ` · ${prettyStamp(saved.completedAt)}` : ''}`
                : preTripEvent
                  ? `ON DUTY Pre-trip found · ${minutesLabel(preTripEvent.startMin)} · ${[preTripEvent.city, preTripEvent.state].filter(Boolean).join(', ')}`
                  : 'One inspection sheet is required per log day when you go ON DUTY / Driving.'}
          </span>
        </div>
        {!autoDone && <button onClick={selectAll}>{allChecked ? 'All OK' : 'Manual OK'}</button>}
      </div>

      {!allChecked && preTripEvent && (
        <div className="inspection-prompt-card">
          <b>Complete inspection sheet from ON DUTY Pre-trip?</b>
          <span>Use this after the driver has actually inspected the truck. The sheet will link to this event time and will move with it if the event is edited.</span>
          <div className="inspection-prompt-actions">
            <button onClick={acceptPreTripSheet}>Yes, fill sheet</button>
            <button className="secondary" onClick={() => saveChecked([])}>No, I will review manually</button>
          </div>
        </div>
      )}

      {autoDone ? (
        <div className="inspection-done-note">
          Linked to duty status event. If that ON DUTY Pre-trip time is edited, this inspection time updates with it.
        </div>
      ) : (
        <>
          <div className="inspection-check-grid">
            {INSPECTION_ITEMS.map(([id, text]) => (
              <button key={id} className={checked.has(id) ? 'picked' : ''} onClick={() => toggle(id)}>
                <span>{checked.has(id) ? '✓' : ''}</span>
                <b>{text}</b>
              </button>
            ))}
          </div>
          {allChecked && <div className="inspection-done-note">Saved. This is the inspection sheet for this log day.</div>}
        </>
      )}
    </div>
  );
}


function actionLabelForIssue(issue = {}) {
  return issueSuggestedAction(issue).label || 'Open';
}

function parseChatGptFixPlan(text = '') {
  const blocks = String(text || '')
    .split(/(?=FIX_ID\s*:)/i)
    .map(block => block.trim())
    .filter(Boolean);

  return blocks.map((block, index) => {
    const read = (label) => {
      const match = block.match(new RegExp(`${label}\\s*:\\s*([^\\n]+)`, 'i'));
      return match ? match[1].trim() : '';
    };
    return {
      id: read('FIX_ID') || `F${index + 1}`,
      issue: read('ISSUE') || 'Suggested fix',
      appAction: read('APP_ACTION') || 'REVIEW_ONLY',
      value: read('VALUE') || 'Review only',
      applyOnlyIfTrue: read('APPLY_ONLY_IF_TRUE') || 'only if accurate',
      raw: block,
    };
  });
}

function SignGuardIssueCard({ issue, state, day, onCopy, onQuickFix }) {
  const suggested = issueSuggestedAction(issue);
  const code = String(issue.code || '');
  const type = code.includes('hos_') ? 'violation' : (code.includes('active_day') ? 'notice' : (/missing|gap|overlap|invalid|total|inspection|vehicle|shipping|location|carrier|office|driver/i.test(`${issue.code || ''} ${issue.title || ''}`) ? 'fix' : 'review'));
  const label = type === 'violation' ? 'HOS REVIEW' : type === 'fix' ? 'FIX REQUIRED' : type === 'notice' ? 'NOTICE' : 'REVIEW';
  return (
    <div className={`signguard-issue signguard-issue-v92 ${type}`}>
      <div className="signguard-issue-main">
        <span>{label}</span>
        <b>{issue.title}</b>
        <p>{issue.detail}</p>
        <em>{issue.where}</em>
      </div>
      <div className="signguard-issue-actions-v92">
        {suggested.action !== 'NO_ACTION' && (
          <button className="mini-primary" onClick={() => onQuickFix?.(suggested.action, { issue, day: suggested.day || issue.day || day })}>
            {actionLabelForIssue(issue)}
          </button>
        )}
        <button className="mini-secondary" onClick={() => onCopy(buildIssueFixPrompt(state, day, issue), 'Issue copied')}>Copy</button>
      </div>
    </div>
  );
}

function DotPackageTable({ rows = [], onQuickFix, onCopy, state, day }) {
  if (!rows.length) return null;
  return (
    <div className="signguard-dot-table-wrap">
      <div className="signguard-section-title-row">
        <b>DOT Package / Previous 7 days</b>
        <span>Open only the days that are missing or short.</span>
      </div>
      <div className="signguard-dot-table">
        <div className="head"><span>Date</span><span>Total</span><span>Status</span><span></span></div>
        {rows.map(row => (
          <div key={row.day} className={row.issue ? 'bad' : 'ok'}>
            <span>{row.day}</span>
            <span>{row.total}</span>
            <span>{row.status}{row.signed ? ' · signed' : row.status === 'Ready' ? '' : ''}</span>
            <span>
              {row.issue ? (
                <>
                  <button onClick={() => onQuickFix?.('OPEN_DAY', { day: row.day, issue: row.issue })}>Open</button>
                  <button className="ghost" onClick={() => onCopy(buildIssueFixPrompt(state, day, row.issue), 'DOT day copied')}>Copy</button>
                </>
              ) : <em>OK</em>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatGptAssistBox({ state, day, onCopy, onQuickFix }) {
  const [open, setOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [reviewText, setReviewText] = useState('');
  const parsedFixes = useMemo(() => parseChatGptFixPlan(reviewText), [reviewText]);

  return (
    <div className={`signguard-chatgpt-v92 ${open ? 'open' : ''}`}>
      <button className="chatgpt-collapsed-row" onClick={() => setOpen(value => !value)}>
        <div>
          <b>Ask ChatGPT helper</b>
          <span>Copy the log, ask for review, paste fix plan back here.</span>
        </div>
        <em>{open ? 'Hide' : 'Open'}</em>
      </button>

      {open && (
        <div className="chatgpt-actions-v92">
          <button onClick={() => onCopy(buildChatGptLogReviewPrompt(state, day), 'Log review copied')}>Copy Log for ChatGPT</button>
          <button className="secondary" onClick={() => setPasteOpen(true)}>Paste ChatGPT Answer</button>
        </div>
      )}

      {open && parsedFixes.length > 0 && (
        <div className="parsed-fix-plan-v92">
          <div className="signguard-section-title-row">
            <b>Suggested fix plan</b>
            <span>Apply only if the value is accurate.</span>
          </div>
          {parsedFixes.map(fix => (
            <div className="parsed-fix-card" key={fix.id}>
              <span>{fix.appAction}</span>
              <b>{fix.issue}</b>
              <p>{fix.value}</p>
              <em>{fix.applyOnlyIfTrue}</em>
              <div>
                <button onClick={() => onQuickFix?.('APPLY_CHATGPT_FIX', { fix })}>Apply / Open</button>
                <button className="secondary" onClick={() => onCopy(fix.raw, 'Fix block copied')}>Copy block</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pasteOpen && (
        <div className="chatgpt-paste-sheet-v92">
          <div className="chatgpt-paste-card-v92">
            <div className="chatgpt-paste-head-v92">
              <b>Paste ChatGPT fix plan</b>
              <button onClick={() => setPasteOpen(false)}>Done</button>
            </div>
            <textarea
              value={reviewText}
              onChange={e => setReviewText(e.target.value)}
              placeholder="Paste ChatGPT D) COPY/PASTE FIX PLAN here..."
              autoFocus
            />
            <div className="chatgpt-paste-actions-v92">
              <button onClick={() => onCopy(reviewText || 'No pasted fix plan yet.', 'Fix plan copied')}>Copy Fix Plan</button>
              <button className="secondary" onClick={() => setReviewText('')}>Clear</button>
              <button className="secondary" onClick={() => setPasteOpen(false)}>Close</button>
            </div>
            <small>This does not auto-change records. Suggested fixes still require driver confirmation.</small>
          </div>
        </div>
      )}
    </div>
  );
}


function isProfileIssue(issue = {}) {
  return /missing_driver|missing_carrier|missing_main_office/i.test(String(issue.code || ''));
}

function isNoticeOnlyIssue(issue = {}) {
  return /active_day/i.test(String(issue.code || ''));
}

function buildFixWizardSteps(guard, day) {
  const todayIssues = (guard.todayIssues || []).filter(issue => !isNoticeOnlyIssue(issue));
  const steps = [];
  const profileIssues = todayIssues.filter(isProfileIssue);

  if (profileIssues.length) {
    steps.push({
      id: 'saved_profile',
      title: 'Profile info missing',
      detail: 'Apply saved driver, carrier, main office, and unit info.',
      where: 'Form tab → Driver / Carrier',
      action: 'APPLY_SAVED_PROFILE',
      actionLabel: 'Apply saved profile',
      kind: 'safe',
      issue: profileIssues[0],
      applyOnlyIfTrue: 'Uses the saved profile. Review it after applying.',
    });
  }

  todayIssues
    .filter(issue => !isProfileIssue(issue))
    .forEach(issue => {
      const suggested = issueSuggestedAction(issue);
      const code = String(issue.code || '');
      const reviewOnly = /hos_|violation|cycle|break|window|drive11/i.test(`${code} ${issue.title || ''} ${issue.detail || ''}`);
      steps.push({
        id: issue.code || `${issue.title}-${steps.length}`,
        title: issue.title || 'Review item',
        detail: issue.detail || 'Review this item before signing.',
        where: issue.where || 'Log',
        action: suggested.action,
        actionLabel: reviewOnly ? 'Review log' : suggested.label || 'Open',
        kind: reviewOnly ? 'review' : 'fix',
        day: suggested.day || issue.day || day,
        issue,
        applyOnlyIfTrue: reviewOnly
          ? 'Review only. Do not change accurate driving/on-duty time.'
          : 'Apply or edit only if the current record is wrong or incomplete.',
      });
    });

  (guard.dotPackage || []).forEach(issue => {
    const suggested = issueSuggestedAction(issue);
    steps.push({
      id: issue.code || `dot-${issue.day}`,
      title: issue.title || 'Previous day needs review',
      detail: issue.detail || 'Open this day and complete only with accurate records.',
      where: issue.where || 'DOT package',
      action: suggested.action || 'OPEN_DAY',
      actionLabel: 'Open day',
      kind: 'dot',
      day: suggested.day || issue.day || day,
      issue,
      applyOnlyIfTrue: 'Open the day. Fill or change time only if you know the true record.',
    });
  });

  return steps;
}

function RoadGuardFixWizard({ open, guard, day, state, onClose, onQuickFix, onCopy }) {
  const steps = useMemo(() => buildFixWizardSteps(guard, day), [guard, day]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setIndex(current => Math.min(current, steps.length));
  }, [open, steps.length]);

  if (!open) return null;

  const total = steps.length;
  const step = steps[index] || null;
  const done = !step;

  function nextStep() {
    setIndex(current => Math.min(current + 1, total));
  }

  function runStep() {
    if (!step) return;
    if (!step.action || step.action === 'NO_ACTION') {
      nextStep();
      return;
    }

    const silentApply = step.action === 'APPLY_SAVED_PROFILE' || step.action === 'OPEN_SHIPPING_DOCS';
    onQuickFix?.(step.action, {
      issue: step.issue,
      day: step.day || day,
      silent: silentApply,
      wizard: true,
    });

    if (silentApply) {
      window.setTimeout(() => setIndex(current => Math.min(current, Math.max(0, steps.length - 1))), 80);
    } else {
      onClose?.();
    }
  }

  function copyStep() {
    if (!step) return;
    const text = buildIssueFixPrompt(state, day, step.issue || {
      title: step.title,
      detail: step.detail,
      where: step.where,
      code: step.id,
    });
    onCopy?.(text, 'Wizard step copied');
  }

  return (
    <div className="roadguard-wizard-backdrop" role="dialog" aria-modal="true" aria-label="Fix issues wizard">
      <div className="roadguard-wizard-card">
        <div className="roadguard-wizard-head">
          <div>
            <span>Fix wizard</span>
            <b>{done ? 'All fixable items reviewed' : `Step ${Math.min(index + 1, total)} of ${total}`}</b>
          </div>
          <button onClick={onClose}>Close</button>
        </div>

        {done ? (
          <div className="roadguard-wizard-done">
            <b>Run Log Check again.</b>
            <p>If the record is true and complete, the sign button will become available when the day is ready.</p>
            <div className="roadguard-wizard-actions">
              <button onClick={onClose}>Done</button>
              <button className="secondary" onClick={() => onCopy?.(buildChatGptLogReviewPrompt(state, day), 'Log review copied')}>Copy for ChatGPT</button>
            </div>
          </div>
        ) : (
          <>
            <div className={`roadguard-wizard-step ${step.kind}`}>
              <span>{step.kind === 'dot' ? 'DOT package' : step.kind === 'review' ? 'Review only' : 'Fix item'}</span>
              <b>{step.title}</b>
              <p>{step.detail}</p>
              <em>{step.where}</em>
              <small>{step.applyOnlyIfTrue}</small>
            </div>

            <div className="roadguard-wizard-progress">
              <i style={{ width: `${total ? ((index + 1) / total) * 100 : 100}%` }} />
            </div>

            <div className="roadguard-wizard-actions">
              <button onClick={runStep}>{step.actionLabel || 'Fix / Open'}</button>
              <button className="secondary" onClick={nextStep}>Skip</button>
              <button className="secondary" onClick={copyStep}>Copy</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


function officerChecklistRows(state, day, guard) {
  const events = displayEventsForDay(state.eventsByDay?.[day] || [], day >= localDayKey());
  const total = events.reduce((sum, event) => sum + Math.max(0, Number(event.endMin || 0) - Number(event.startMin || 0)), 0);
  const activeDay = day >= localDayKey();
  const inspection = state.inspectionByDay?.[day] || {};
  const signed = !!state.signatureByDay?.[day]?.signed;
  const profileIssues = guard.fixRequired.filter(issue => /driver|carrier|main_office|truck|unit|trailer|shipping/i.test(String(issue.code || issue.title || '')));
  const fieldIssues = guard.fixRequired.length;
  const hosIssues = guard.hosViolations.length + guard.review.filter(issue => /hos|hour|break|cycle|window|driving/i.test(`${issue.code || ''} ${issue.title || ''}`)).length;

  return [
    {
      key:'form',
      title:'Form/header fields',
      status: profileIssues.length || fieldIssues ? 'Fix' : 'OK',
      detail: profileIssues.length || fieldIssues ? `${fieldIssues || profileIssues.length} required item(s) to review` : 'Driver, carrier, office, equipment, and shipping docs present',
      tone: profileIssues.length || fieldIssues ? 'bad' : 'ok',
      action:'APPLY_SAVED_PROFILE',
    },
    {
      key:'day',
      title:'24-hour log coverage',
      status: activeDay ? 'Active' : (Math.abs(total - 1440) <= 1 ? 'OK' : 'Fix'),
      detail: activeDay ? 'Today is still open. Sign after day is complete.' : `Total ${durLabel(total)}${Math.abs(total - 1440) <= 1 ? '' : ' / needs 24h'}`,
      tone: activeDay ? 'notice' : (Math.abs(total - 1440) <= 1 ? 'ok' : 'bad'),
      action:'OPEN_LOG',
    },
    {
      key:'hos',
      title:'HOS review',
      status: guard.hosViolations.length ? 'Violation?' : (hosIssues ? 'Review' : 'OK'),
      detail: guard.hosViolations.length ? `${guard.hosViolations.length} possible HOS violation(s)` : (hosIssues ? `${hosIssues} HOS item(s) to review` : 'No HOS violations shown by app'),
      tone: guard.hosViolations.length ? 'bad' : (hosIssues ? 'warn' : 'ok'),
      action:'OPEN_LOG',
    },
    {
      key:'inspection',
      title:'Inspection / pre-trip',
      status: inspection.complete ? 'OK' : 'Review',
      detail: inspection.complete ? `Completed${inspection.sourceStartMin != null ? ` at ${minutesLabel(inspection.sourceStartMin)}` : ''}` : 'No completed inspection sheet for this day',
      tone: inspection.complete ? 'ok' : 'warn',
      action:'OPEN_INSPECTION',
    },
    {
      key:'sign',
      title:'Certification',
      status: signed ? 'Signed' : (activeDay ? 'Later' : 'Fix'),
      detail: signed ? 'Driver certification is saved' : (activeDay ? 'Active day cannot be signed until complete' : 'Driver signature/certification missing'),
      tone: signed ? 'ok' : (activeDay ? 'notice' : 'bad'),
      action:'OPEN_SIGN',
    },
    {
      key:'dot',
      title:'Previous 7 days',
      status: guard.dotPackage.length ? 'Fix' : 'OK',
      detail: guard.dotPackage.length ? `${guard.dotPackage.length} previous-day package issue(s)` : 'Previous 7 days are present/ready by app check',
      tone: guard.dotPackage.length ? 'bad' : 'ok',
      action:'OPEN_DOT_DAYS',
    },
  ];
}

function DotOfficerChecklist({ check, onQuickFix, onIssueAction, setShowDot }) {
  const sections = check?.sections || [];
  const issues = check?.issues || [];

  function runSection(section) {
    if (section.id === 'previous') {
      setShowDot?.(true);
      return;
    }
    const firstIssue = section.issues?.[0];
    if (firstIssue) {
      onIssueAction?.(firstIssue);
      return;
    }
    if (section.id === 'inspection') onQuickFix?.('OPEN_INSPECTION', {});
    if (section.id === 'coverage' || section.id === 'hos' || section.id === 'location') onQuickFix?.('OPEN_LOG', {});
  }

  function runIssue(issue) {
    if (issue.fixAction === 'OPEN_DOT_DAYS') {
      setShowDot?.(true);
      return;
    }
    onIssueAction?.(issue);
  }

  return (
    <div className={`dot-officer-check smart ${check?.status?.toLowerCase() || 'review'}`}>
      <div className="dot-officer-check-head smart">
        <div>
          <b>DOT Check</b>
          <span>Form · log · locations · HOS · inspection · previous 7</span>
        </div>
        <strong>{check?.label || 'Review before signing'}</strong>
      </div>

      <div className="dot-officer-score">
        <b>{Math.round(check?.score ?? 0)}</b>
        <span>Readiness</span>
        <em>{check?.fixCount || 0} fix · {check?.reviewCount || 0} review</em>
      </div>

      <div className="dot-officer-check-rows">
        {sections.map(section => (
          <button key={section.id} type="button" className={`dot-officer-row ${section.tone}`} onClick={() => runSection(section)}>
            <span>
              <b>{section.title}</b>
              <em>{section.detail}</em>
            </span>
            <strong>{section.status}</strong>
          </button>
        ))}
      </div>

      {issues.length ? (
        <div className="dot-officer-issues">
          {issues.slice(0, 12).map(issue => (
            <button key={issue.id} type="button" className={`dot-officer-issue ${issue.tone || 'warn'}`} onClick={() => runIssue(issue)}>
              <span>
                <b>{issue.title}</b>
                <em>{issue.detail}</em>
              </span>
              <strong>{issue.actionLabel || 'Open'}</strong>
            </button>
          ))}
          {issues.length > 12 ? <div className="dot-officer-more">{issues.length - 12} more item(s)</div> : null}
        </div>
      ) : (
        <div className="dot-officer-clean">Ready by current app checks.</div>
      )}
    </div>
  );
}

function SignGuardPanel({ state, day, onQuickFix, onDotIssueAction, wizardRequestId = 0 }) {
  const [copyStatus, setCopyStatus] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [showToday, setShowToday] = useState(true);
  const [showDot, setShowDot] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [officerOpen, setOfficerOpen] = useState(false);
  const guard = buildSignGuardSummary(state, day);
  const officer = buildDotOfficerCheck(state, day);

  useEffect(() => {
    if (!wizardRequestId) return;
    setExpanded(true);
    setWizardOpen(true);
  }, [wizardRequestId]);

  async function copyText(text, message = 'Copied') {
    try {
      await navigator.clipboard?.writeText(text);
      setCopyStatus(message);
    } catch {
      setCopyStatus('Copy failed. Select the text and copy manually.');
    }
    window.setTimeout(() => setCopyStatus(''), 2200);
  }

  const headline = officer.label || (guard.status === 'READY'
    ? 'Ready'
    : guard.status === 'FIX_REQUIRED'
      ? 'Needs fixes'
      : 'Review needed');

  const firstIssue = officer.issues?.[0] || guard.todayIssues?.[0] || guard.dotPackage?.[0] || null;
  const issueCount = officer.issues?.length || (guard.fixRequired.length + guard.hosViolations.length + guard.dotPackage.length);

  return (
    <div className={`signguard-panel signguard-panel-v92 roadguard-lite ${String(officer.status || guard.status).toLowerCase()} ${expanded ? 'expanded' : 'collapsed'}`}>
      <div className="roadguard-lite-head">
        <button className="roadguard-lite-main" onClick={() => setExpanded(value => !value)}>
          <span>DOT officer check</span>
          <b>{headline}</b>
          <em>{issueCount ? `${issueCount} item${issueCount === 1 ? '' : 's'}` : 'No open items'}</em>
        </button>
        <div className="roadguard-head-actions">
          <button className="roadguard-copy-mini" onClick={() => copyText(buildChatGptLogReviewPrompt(state, day), 'Log review copied')}>Copy</button>
          <button className="roadguard-fix-mini" onClick={() => { setExpanded(true); setOfficerOpen(true); setShowDot(true); }}>DOT</button>
          {issueCount > 0 && <button className="roadguard-fix-mini" onClick={() => { setExpanded(true); setWizardOpen(true); }}>Fix</button>}
        </div>
      </div>

      {firstIssue && !expanded && (
        <button className="roadguard-first-issue" onClick={() => setExpanded(true)}>
          <span>{firstIssue.title}</span>
          <em>{firstIssue.where || 'Open review'}</em>
        </button>
      )}

      <div className="signguard-score-row signguard-score-row-v92 roadguard-score-compact">
        <button className={officer.fixCount ? 'bad' : 'ok'} onClick={() => { setExpanded(true); setOfficerOpen(true); }}><b>{officer.fixCount}</b><span>Fix</span></button>
        <button className={officer.reviewCount ? 'warn' : 'ok'} onClick={() => { setExpanded(true); setOfficerOpen(true); }}><b>{officer.reviewCount}</b><span>Review</span></button>
        <button className={guard.dotPackage.length ? 'warn' : 'ok'} onClick={() => { setExpanded(true); setShowDot(value => !value); }}><b>{guard.dotPackage.length}</b><span>7 days</span></button>
      </div>

      {expanded && (
        <>
          {guard.notices.length > 0 && (
            <div className="signguard-notice-v92 roadguard-notice-compact">
              {guard.notices.map(issue => <span key={issue.code}>{issue.title}: {issue.detail}</span>)}
            </div>
          )}

          <div className="signguard-action-strip-v92 roadguard-action-row">
            <button onClick={() => { setOfficerOpen(true); setShowDot(false); }}>Run DOT Check</button>
            <button onClick={() => onQuickFix?.('APPLY_SAVED_PROFILE', { day })}>Profile</button>
            <button onClick={() => onQuickFix?.('OPEN_SHIPPING_DOCS', { day })}>BOL / empty</button>
            <button onClick={() => setShowDot(value => !value)}>{showDot ? 'Hide DOT' : 'DOT days'}</button>
          </div>

          {officerOpen && <DotOfficerChecklist check={officer} onQuickFix={onQuickFix} onIssueAction={onDotIssueAction} setShowDot={setShowDot} />}

          {showToday && (guard.todayIssues.length ? (
            <div className="signguard-issues signguard-issues-v92 roadguard-issues-compact">
              {guard.todayIssues.map(issue => <SignGuardIssueCard key={issue.code} issue={issue} state={state} day={day} onCopy={copyText} onQuickFix={onQuickFix} />)}
            </div>
          ) : (
            <div className="signguard-clean roadguard-clean">Today looks clean.</div>
          ))}

          {showDot && <DotPackageTable rows={guard.dotRows} onQuickFix={onQuickFix} onCopy={copyText} state={state} day={day} />}

          <ChatGptAssistBox state={state} day={day} onCopy={copyText} onQuickFix={onQuickFix} />
        </>
      )}
      <RoadGuardFixWizard open={wizardOpen} guard={guard} day={day} state={state} onClose={() => setWizardOpen(false)} onQuickFix={onQuickFix} onCopy={copyText} />
      {copyStatus ? <span className="signguard-copy-status">{copyStatus}</span> : null}
    </div>
  );
}

class SignatureErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    if (prevProps.day !== this.props.day && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="signature-panel road-sign-panel">
          <div className="signature-error-inline">
            Signature screen had a problem. Tap Try again. If it still appears, reload the app.
          </div>
          <button type="button" className="road-sign-save sign-save" onClick={() => this.setState({ error: null })}>
            Try signature again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function SignaturePanel({ state, onSaveSignature, onQuickFix, onDotIssueAction }) {
  const day = state.activeDay;
  const saved = state.signatureByDay?.[day] || {};
  const savedDriverSignature = state.driverSignature || null;
  const existingDataUrl = saved.signatureDataUrl || (saved.signatureRef === 'driverSignature' ? savedDriverSignature?.dataUrl : '') || savedDriverSignature?.dataUrl || '';
  const [name, setName] = useState(savedDriverSignature?.driverName || saved.driverName || driverNameForState(state));
  const [hasInk, setHasInk] = useState(!!existingDataUrl);
  const [changeSignature, setChangeSignature] = useState(!existingDataUrl);
  const [wizardRequestId, setWizardRequestId] = useState(0);
  const [signatureError, setSignatureError] = useState('');
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const signState = logSignState(state, day);
  const blockers = validateLogForSigning(state, day);
  const fixBlockers = blockers.filter(issue => !/active_day/i.test(String(issue.code || '')));
  const todayActive = day >= localDayKey();

  useEffect(() => {
    setName(savedDriverSignature?.driverName || saved.driverName || driverNameForState(state));
    setChangeSignature(!existingDataUrl);
    setHasInk(!!existingDataUrl);
  }, [day, savedDriverSignature?.dataUrl, savedDriverSignature?.driverName, saved.signatureDataUrl, saved.driverName, existingDataUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !changeSignature) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 4;
  }, [changeSignature, day]);

  function pointFromEvent(e) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function startDraw(e) {
    if (!changeSignature) return;
    const point = pointFromEvent(e);
    if (!point) return;
    e.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = point;
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(point.x + 0.01, point.y + 0.01);
    ctx.stroke();
    setHasInk(true);
  }

  function moveDraw(e) {
    if (!drawingRef.current || !changeSignature) return;
    const point = pointFromEvent(e);
    if (!point) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const previous = lastPointRef.current || point;
    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
  }

  function endDraw() {
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  function signLog() {
    try {
      setSignatureError('');
      if (changeSignature) {
        const canvas = canvasRef.current;
        if (!canvas || !hasInk) return;
        let signatureDataUrl = '';
        try {
          signatureDataUrl = canvas.toDataURL('image/png');
        } catch (error) {
          console.error('signature canvas export failed', error);
          setSignatureError('Signature could not be saved. Please clear and draw it again.');
          return;
        }
        onSaveSignature?.({
          driverName: name || driverNameForState(state),
          signatureDataUrl,
        });
        return;
      }

      if (!existingDataUrl) {
        setChangeSignature(true);
        return;
      }

      onSaveSignature?.({
        driverName: name || savedDriverSignature?.driverName || driverNameForState(state),
        signatureDataUrl: existingDataUrl,
      });
    } catch (error) {
      console.error('sign click failed', error);
      setSignatureError('Signing failed. Reload and try again.');
    }
  }

  const signButtonLabel = signState.status === 'Needs Recertification'
    ? 'Recertify Log'
    : saved.signed && signState.status === 'Certified'
      ? 'Sign Again'
      : existingDataUrl && !changeSignature
        ? 'Sign Log'
        : 'Save Signature + Sign';

  return (
    <div className={`signature-panel road-sign-panel ${saved.signed ? 'signed' : ''}`}>
      <div className="sign-legal-copy">
        I certify this log is true and correct.
      </div>

      <div className="sign-driver-row">
        <span>Driver</span>
        <b>{name}</b>
      </div>

      {existingDataUrl && !changeSignature ? (
        <div className="saved-signature-preview">
          <img src={existingDataUrl} alt="Saved driver signature" />
          <span>Saved signature</span>
        </div>
      ) : (
        <>
          <div className="signature-canvas-wrap">
            <canvas
              ref={canvasRef}
              className="signature-canvas"
              width="720"
              height="220"
              onPointerDown={startDraw}
              onPointerMove={moveDraw}
              onPointerUp={endDraw}
              onPointerLeave={endDraw}
              onPointerCancel={endDraw}
            />
          </div>
          <button type="button" className="clear-signature-link" onClick={clearSignature}>Clear Signature</button>
        </>
      )}

      <div className="sign-status-card">
        <b>{signState.label}</b>
        <span>{todayActive ? 'Today is active. Sign after the day is complete.' : signState.reason}</span>
      </div>

      <SignGuardPanel state={state} day={day} onQuickFix={onQuickFix} onDotIssueAction={onDotIssueAction} wizardRequestId={wizardRequestId} />


      {signatureError ? <div className="signature-error-inline">{signatureError}</div> : null}

      <div className="signature-actions-row">
        <button
          type="button"
          className="sign-save road-sign-save"
          onClick={fixBlockers.length ? () => setWizardRequestId(Date.now()) : signLog}
          disabled={fixBlockers.length ? false : ((changeSignature && !hasInk) || todayActive)}
        >
          {fixBlockers.length ? 'Fix Issues Before Sign' : todayActive ? 'Sign after day complete' : signButtonLabel}
        </button>
      </div>

      {existingDataUrl && !changeSignature && <button type="button" className="clear-signature-link" onClick={() => setChangeSignature(true)}>Change Signature</button>}

      <div className="signature-footnote">
        {saved.signed ? `Signed · ${prettyStamp(saved.signedAt)}` : existingDataUrl ? 'Ready with saved signature.' : 'Draw signature once.'}
      </div>
    </div>
  );
}

export default function DayDetail({
  state, liveCurrent, events, selectedEvent, onBack, onSelect, onOpenAdd, onOpenEdit, onDelete,
  onToggleSelectMode, onToggleSelectedId, onSelectAll, onClearSelection, onOpenShift, onMoveSelected,
  onCertify, onTools, onOpenStatus, onOpenTrailer, onDriverFlow, onSaveLoad, onToggleGps,
  onSaveInspection, onSaveSignature, onRoadGuardFix, onSaveManualMiles
}) {
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveDelta, setMoveDelta] = useState(0);
  const [activeTab, setActiveTab] = useState('log');

  useEffect(() => {
    const requested = state.roadGuardTabRequest?.tab;
    if (requested && ['log', 'form', 'sign', 'inspection'].includes(requested)) {
      setActiveTab(requested);
    }
  }, [state.roadGuardTabRequest?.at, state.roadGuardTabRequest?.tab]);

  const rawDayEvents = state.eventsByDay?.[state.activeDay] || [];
  const displayEvents = useMemo(
    () => displayEventsForDayFromState(state.eventsByDay || {}, state.activeDay),
    [state.eventsByDay, state.activeDay]
  );
  const displaySelectedEvent = displayEvents.find(event => event.id === state.selectedEventId) || selectedEvent || null;
  const selectedRawEvent = rawDayEvents.find(event => event.id === state.selectedEventId) || null;
  const boundedMoveDelta = selectedRawEvent ? clampDelta(selectedRawEvent, moveDelta) : 0;
  const moveWasClamped = selectedRawEvent && moveDelta !== boundedMoveDelta;
  const isMoving = !!selectedRawEvent && moveOpen && boundedMoveDelta !== 0;

  useEffect(() => {
    setMoveOpen(false);
    setMoveDelta(0);
  }, [state.selectedEventId, state.activeDay]);

  const baseViolationRanges = useMemo(
    () => violationRangesForDay(state.eventsByDay || {}, state.activeDay),
    [state.eventsByDay, state.activeDay]
  );

  const previewRawEvents = useMemo(
    () => (isMoving ? shiftOneEvent(rawDayEvents, state.selectedEventId, boundedMoveDelta) : rawDayEvents),
    [isMoving, rawDayEvents, state.selectedEventId, boundedMoveDelta]
  );

  const previewGraphEvents = useMemo(
    () => (isMoving ? displayEventsForDay(previewRawEvents, isToday(state.activeDay)) : displayEvents),
    [isMoving, previewRawEvents, state.activeDay, displayEvents]
  );

  const previewViolationRanges = useMemo(
    () => (isMoving
      ? violationRangesForDay({ ...(state.eventsByDay || {}), [state.activeDay]: previewRawEvents }, state.activeDay)
      : baseViolationRanges),
    [isMoving, state.eventsByDay, state.activeDay, previewRawEvents, baseViolationRanges]
  );

  const selectedPreviewEvent = previewGraphEvents.find(event => event.id === state.selectedEventId) || displaySelectedEvent;
  const violationsChanged = isMoving && violationSignature(baseViolationRanges) !== violationSignature(previewViolationRanges);
  const moveHasWarning = violationsChanged && previewViolationRanges.length > 0;

  function adjustMove(delta) {
    if (!selectedRawEvent) return;
    setMoveOpen(true);
    setMoveDelta(current => clampDelta(selectedRawEvent, current + delta));
  }

  function applyMove() {
    if (!selectedRawEvent || !boundedMoveDelta) return;
    onMoveSelected?.(selectedRawEvent.id, boundedMoveDelta);
    setMoveOpen(false);
    setMoveDelta(0);
  }


  function promptManualMilesForEvent(eventId = '') {
    const event = displayEvents.find(item => item.id === eventId) || displayEvents.find(item => item.status === 'D');
    if (!event) {
      window.alert?.('No driving event found on this day.');
      return;
    }

    const suggestion = bestManualMilesSuggestion({
      events: displayEvents,
      eventId: event.id,
      gpsPoints: state.gpsTrip?.points || [],
    });
    const speedGuide = drivingMilesSpeedGuide(displayEvents, event.id);
    const legSpeedDefault = bestSpeedDefault(speedGuide.leg);
    const current = Number(event.manualMiles || 0) > 0
      ? String(event.manualMiles)
      : (suggestion?.miles ? String(suggestion.miles) : (legSpeedDefault ? String(legSpeedDefault) : ''));
    const label = `${minutesLabel(event.startMin)}–${minutesLabel(event.endMin)} · ${event.city || 'GPS'}, ${event.state || 'UNK'}`;
    const speedText = `\n\nSpeed guide for this leg (${formatDutyMinutes(speedGuide.legMinutes)}):\n${speedOptionsText(speedGuide.leg)}${
      speedGuide.dayMinutes !== speedGuide.legMinutes
        ? `\n\nDay driving total (${formatDutyMinutes(speedGuide.dayMinutes)}):\n${speedOptionsText(speedGuide.day)}`
        : ''
    }`;
    const suggestionText = suggestion
      ? `\n\nLocation estimate ${suggestion.miles.toFixed(2)} mi from ${suggestion.source}\n${suggestion.from} → ${suggestion.to}\nConfidence: ${suggestion.confidence}`
      : '';
    const rawMiles = window.prompt?.(`Enter total miles for this driving:\n${label}${speedText}${suggestionText}`, current);
    if (rawMiles == null) return;

    const miles = Number(String(rawMiles).replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(miles) || miles <= 0) {
      window.alert?.('Enter a valid miles number greater than 0.');
      return;
    }

    const durationMin = Math.max(1, speedGuide.legMinutes || (Number(event.endMin || 0) - Number(event.startMin || 0)));
    const highForSingleEvent = miles > Math.max(5, (durationMin / 60) * 85 + 3);
    if (highForSingleEvent && !window.confirm?.(`${miles.toFixed(2)} mi looks high for ${formatDutyMinutes(durationMin)}. Continue?`)) {
      return;
    }

    onSaveManualMiles?.(event.id, {
      manualMiles: miles,
      manualMilesByState: null,
      manualMilesState: '',
      manualMilesReviewedAt: Date.now(),
      manualMilesSource: suggestion ? suggestion.source : 'speed guide',
      manualMilesSuggestion: {
        miles:suggestion?.miles || null,
        source:suggestion?.source || 'speed guide',
        confidence:suggestion?.confidence || 'Guide',
        from:suggestion?.from || null,
        to:suggestion?.to || null,
        speedGuide:{
          legMinutes:speedGuide.legMinutes,
          dayMinutes:speedGuide.dayMinutes,
          leg:speedGuide.leg,
          day:speedGuide.day,
        },
      },
      description: event.description || `Driving miles ${miles.toFixed(2)} mi`,
    });

    window.alert?.(`Saved ${miles.toFixed(2)} driving miles.`);
  }

  function handleDotOfficerIssue(issue = {}) {
    if (!issue) return;
    const action = issue.fixAction || '';
    if (action === 'OPEN_SIGN' || action === 'OPEN_DAY_SIGN') {
      if (issue.day && issue.day !== state.activeDay) onRoadGuardFix?.('OPEN_DAY', { day:issue.day });
      setActiveTab('sign');
      return;
    }

    if (action === 'OPEN_INSPECTION') {
      setActiveTab('inspection');
      return;
    }

    if (action === 'OPEN_FORM_FIELD' || action === 'OPEN_ROUTE_LEG') {
      setActiveTab('form');
      if (issue.target === 'shippingDocs') {
        window.setTimeout(() => onRoadGuardFix?.('OPEN_SHIPPING_DOCS', { day:issue.day || state.activeDay }), 0);
      }
      return;
    }

    if (action === 'CREATE_MISSING_DAY' || action === 'OPEN_DAY') {
      const dayToOpen = issue.day || state.activeDay;
      onRoadGuardFix?.('OPEN_DAY', { day:dayToOpen });
      return;
    }

    if (action === 'OPEN_MANUAL_MILES') {
      setActiveTab('log');
      promptManualMilesForEvent(issue.eventId || '');
      return;
    }

    if (action === 'OPEN_EVENT' || action === 'OPEN_HOS_RANGE' || action === 'OPEN_LOG') {
      setActiveTab('log');
      let targetEventId = issue.eventId || '';
      if (!targetEventId && issue.startMin != null) {
        targetEventId = displayEvents.find(event =>
          Number(event.startMin || 0) <= Number(issue.startMin) &&
          Number(event.endMin || 0) >= Number(issue.startMin)
        )?.id || '';
      }
      if (targetEventId) {
        onSelect?.(targetEventId);
        window.setTimeout(() => onOpenEdit?.(targetEventId), 0);
      }
      return;
    }

    setActiveTab('log');
  }

  function handleLogCheckIssue(payload = {}) {
    const warningText = String(payload.warning?.text || '');
    const target = payload.target || {};
    const type = payload.type || target.type || '';

    if (type === 'sign' || /certified/i.test(warningText)) {
      setActiveTab('sign');
      return;
    }

    let targetEventId = target.eventId || '';

    if (!targetEventId && (type === 'missingLocation' || /city\/state|location/i.test(warningText))) {
      targetEventId = displayEvents.find(event => !event.city || !event.state || event.city === 'GPS' || event.state === 'UNK')?.id || '';
    }

    if (!targetEventId && target.startMin != null) {
      targetEventId = displayEvents.find(event =>
        Number(event.startMin || 0) <= Number(target.startMin) &&
        Number(event.endMin || 0) >= Number(target.startMin)
      )?.id || '';
    }

    setActiveTab('log');

    if (targetEventId) {
      onSelect?.(targetEventId);
      // Open the exact event when this is a fixable row. HOS rows remain driver-reviewed
      // but still open the event so the driver can inspect the logged time/status.
      setTimeout(() => onOpenEdit?.(targetEventId), 0);
    }
  }

  return (
    <section className={`screen active graph-first-screen ${selectedEvent ? "editing-graph" : ""} ${moveOpen ? "inline-moving" : ""}`}>
      <Header title={title(state.activeDay)} onBack={onBack} onRight={onTools} />
      <Tabs active={activeTab} onTab={setActiveTab} />

      {activeTab === 'log' && (
        <div className="graph-panel graph-first-panel">
          <LogGraph
            events={previewGraphEvents}
            selectedId={state.selectedEventId}
            violationRanges={previewViolationRanges}
            onSelect={onSelect}
            onEmptyTap={() => onSelect(null)}
          />
        </div>
      )}

      {activeTab === 'log' && (
        <SelectedEventBar
          event={selectedPreviewEvent}
          onEdit={onOpenEdit}
          onVoid={onDelete}
          onClear={() => onSelect(null)}
          moveOpen={moveOpen}
          moveDelta={boundedMoveDelta}
          moveWasClamped={!!moveWasClamped}
          moveHasWarning={moveHasWarning}
          onToggleMove={() => { setMoveOpen(value => !value); setMoveDelta(0); }}
          onAdjustMove={adjustMove}
          onApplyMove={applyMove}
          onResetMove={() => setMoveDelta(0)}
        />
      )}

      {activeTab === 'form' && <MiniFormPanel state={state} events={displayEvents} onSaveLoad={onSaveLoad} onOpenTrailer={onOpenTrailer} />}
      {activeTab === 'sign' && <SignatureErrorBoundary day={state.activeDay}><SignaturePanel state={state} onSaveSignature={onSaveSignature} onQuickFix={onRoadGuardFix} onDotIssueAction={handleDotOfficerIssue} /></SignatureErrorBoundary>}
      {activeTab === 'inspection' && <InspectionPanel state={state} events={displayEvents} onSaveInspection={onSaveInspection} />}

      {activeTab === 'log' && !selectedEvent && (
        <div className="graph-action-rail">
          <button onClick={() => onOpenAdd({ mode:'choice' })}>Insert</button>
          <button onClick={onToggleSelectMode}>{state.selectMode ? 'Done' : 'Move'}</button>
          <button onClick={onOpenStatus}>Status</button>
          <button onClick={onToggleGps}>Drive</button>
        </div>
      )}

      {activeTab === 'log' && state.selectMode && !selectedEvent && (
        <div className="bulk-strip graph-bulk-strip graph-bulk-compact">
          <button onClick={onSelectAll}>All</button>
          <button onClick={onClearSelection}>Clear</button>
          <button className="primary" onClick={onOpenShift}>Shift</button>
        </div>
      )}

      {activeTab === 'log' && (
        <>
          <EventList events={displayEvents} selectedId={state.selectedEventId} selectMode={state.selectMode} selectedIds={state.selectedIds} onSelect={onSelect} onToggleSelected={onToggleSelectedId} onOpenEdit={onOpenEdit} />

          <LogCheckPanel events={displayEvents} state={state} onIssueAction={handleLogCheckIssue} />

          <div className="cert-line cert-line-status-only">
            <span>Certification</span>
            <b>{state.certifyStatus[state.activeDay]}</b>
          </div>
        </>
      )}
    </section>
  );
}
