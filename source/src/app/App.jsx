'use client';

import React, { useMemo, useRef, useState } from 'react';
import HomeScreen from '../modules/home/HomeScreen.jsx';
import DayLogScreen from '../modules/logbook/DayLogScreen.jsx';
import UnsignedLogsScreen from '../modules/logbook/UnsignedLogsScreen.jsx';
import InsertEditEventSheet from '../modules/editor/InsertEditEventSheet.jsx';
import EditEventSheet from '../modules/editor/EditEventSheet.jsx';
import ShiftSheet from '../modules/editor/ShiftSheet.jsx';
import ToolsSheet from '../shared/ui/ToolsSheet.jsx';
import DotMode from '../modules/dot/DotMode.jsx';
import DriveTrackerSheet from '../modules/gps/DriveTrackerSheet.jsx';
import DrivingFocusScreen from '../modules/gps/DrivingFocusScreen.jsx';
import EquipmentSheet from '../modules/equipment/EquipmentSheet.jsx';
import TrailerSheet from '../modules/equipment/TrailerSheet.jsx';
import StatusWorkflowSheet from '../modules/status/StatusWorkflowSheet.jsx';
import { initialCertifyStatus, initialEventsByDay } from '../state/mockData.js';
import { addDays, localDayKey, isToday } from '../shared/utils/date.js';
import { displayEventsForDay, displayEventsForDayFromState, currentFromEvents } from '../core/timeline/displayTimeline.js';
import { addMilesByState, detectState, guessGpsCity, haversineMiles, recalcMilesByTimeWindow } from '../core/gps/locationService.js';
import { insertManyOverride, applyEditOverride, closePreviousAndStart, normalizeLogEvents } from '../core/timeline/timelineEngine.js';
import { signableLogDays, signConfirmMessage, signBlockMessage } from '../modules/logbook/signing.js';
import { APP_STATE_KEY, clearAppSnapshot, loadAppSnapshot, saveAppSnapshot } from '../../../lib/local-db/appState.js';
import { queueDutyEventDiffs, queueInspectionDiffs, startSyncEngine } from '../../../lib/sync/clientSync.js';
import { installOwnerOpAuthBridge } from '../../../lib/supabase/authBridge.js';

const ROADGUARD_DEFAULT_PROFILE = {
  driverName: 'Arben Oruci',
  carrierName: 'Narta Express LLC',
  mainOffice: '92 201 Lake Drive, Willowbrook, IL 60527',
};

function findDateInText(text = '') {
  const match = String(text || '').match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}


function carryoverNoteForStatus(status) {
  if (status === 'SB') return 'Sleeper Berth';
  if (status === 'D') return 'Driving';
  if (status === 'ON') return 'On Duty';
  return 'Off Duty';
}

function statusDefaultNote(status) {
  if (status === 'SB') return 'Sleeper';
  if (status === 'D') return 'Driving';
  if (status === 'ON') return 'On Duty';
  return 'Off Duty';
}

function textLooksLikeStatusArtifact(text = '', status = 'OFF') {
  const value = String(text || '').toLowerCase();
  if (!value.trim()) return false;
  if (status !== 'ON' && /(pre[- ]?trip|inspection|on duty|pickup|loading|delivery|unloading)/i.test(value)) return true;
  if (status !== 'D' && /driving started|manual driving|\bdriving\b/i.test(value)) return true;
  if (status !== 'SB' && /sleeper/i.test(value)) return true;
  if (status !== 'OFF' && /off duty|parked|parking/i.test(value)) return true;
  // Combined notes are usually evidence that an overridden event kept stale text.
  if (/\s\/\s/.test(value) && /(pre[- ]?trip|inspection|on duty|driving|new event)/i.test(value)) return true;
  return false;
}

function sanitizeDutyEventForStatus(event = {}, previousStatus = null) {
  const status = event.status || 'OFF';
  const statusChanged = previousStatus && previousStatus !== status;
  const next = { ...event };
  const noteStale = statusChanged || textLooksLikeStatusArtifact(next.note, status) || /^new event$/i.test(String(next.note || '').trim());
  const descStale = statusChanged || textLooksLikeStatusArtifact(next.description, status) || /^new event$/i.test(String(next.description || '').trim());

  if (noteStale) next.note = statusDefaultNote(status);
  if (descStale) next.description = '';

  // A non-ON event must never keep the identity of an ON DUTY Pre-trip / inspection event.
  if (status !== 'ON') {
    delete next.sourceEventId;
    delete next.sourceEventChainId;
    delete next.inspectionId;
    delete next.inspectionLinkId;
  }

  return next;
}

function sanitizeCarryoverEvent(event) {
  if (!event?.carriedFromPreviousDay) return event;
  return {
    ...event,
    description: '',
    note: carryoverNoteForStatus(event.status),
  };
}

const PRETRIP_AUTO_ITEMS = ['brakes','lights','tires','mirrors','coupling','documents'];

function isPreTripStatus(status, reason = '') {
  return status === 'ON' && /pre[- ]?trip|inspection/i.test(String(reason || ''));
}

function minuteTimestampForDay(day, minute) {
  const [year, month, date] = String(day || '').split('-').map(Number);
  if (!year || !month || !date) return Date.now();
  const d = new Date(year, month - 1, date, 0, 0, 0, 0);
  d.setMinutes(Math.max(0, Math.min(1440, Number(minute || 0))));
  return d.getTime();
}

function inspectionFromPreTripEvent(day, event, previous = {}) {
  const sourceStartMin = Math.max(0, Math.min(1440, Number(event?.startMin ?? 0)));
  const sourceEndMin = Math.max(sourceStartMin, Math.min(1440, Number(event?.endMin ?? sourceStartMin)));
  const completedAt = minuteTimestampForDay(day, sourceStartMin);
  const sourceEventId = event?.id || null;
  const sourceEventChainId = event?.event_chain_id || event?.eventChainId || null;
  const city = event?.city || '';
  const state = event?.state || '';
  const locationSource = event?.locationSource || event?.source || 'manual';
  const unchanged = previous.sourceEventId === sourceEventId
    && previous.sourceStartMin === sourceStartMin
    && previous.sourceEndMin === sourceEndMin
    && previous.completedAt === completedAt
    && previous.city === city
    && previous.state === state
    && previous.locationSource === locationSource;

  return {
    ...previous,
    type: 'pretrip',
    checked: PRETRIP_AUTO_ITEMS,
    complete: true,
    completedAt,
    source: 'auto_on_duty_pretrip_event',
    sourceEventId,
    sourceEventChainId,
    sourceStartMin,
    sourceEndMin,
    city,
    state,
    locationSource,
    updatedAt: unchanged ? (previous.updatedAt || completedAt) : Date.now(),
  };
}

function isAutoPreTripInspection(inspection = {}) {
  return String(inspection.source || '').includes('auto_on_duty_pretrip');
}

function preTripEventForDay(events = []) {
  return sorted(events || []).find(event => (
    isPreTripStatus(event.status, `${event.note || ''} ${event.description || ''}`)
  )) || null;
}

function reconcilePreTripInspectionForDay(inspectionByDay = {}, eventsByDay = {}, day) {
  const event = preTripEventForDay(eventsByDay?.[day] || []);
  const previous = inspectionByDay?.[day] || {};

  if (event) {
    const linkedToThisEvent = previous.sourceEventId === event.id || previous.sourceEventChainId === (event.event_chain_id || event.eventChainId);
    // Never create a new inspection silently. Only keep an already accepted/linked
    // auto sheet synchronized when the driver edits the ON DUTY Pre-trip event.
    if (isAutoPreTripInspection(previous) && (linkedToThisEvent || !previous.sourceEventId)) {
      const nextInspection = inspectionFromPreTripEvent(day, event, previous);
      const previousJson = JSON.stringify(previous);
      const nextJson = JSON.stringify(nextInspection);
      if (previousJson === nextJson) return inspectionByDay;
      return { ...inspectionByDay, [day]: nextInspection };
    }
    return inspectionByDay;
  }

  if (isAutoPreTripInspection(previous)) {
    const next = { ...inspectionByDay };
    delete next[day];
    return next;
  }

  return inspectionByDay;
}

function reconcilePreTripInspections(nextState, days = []) {
  const uniqueDays = [...new Set(days.filter(Boolean))];
  if (!uniqueDays.length) return nextState;

  let inspectionByDay = nextState.inspectionByDay || {};
  for (const day of uniqueDays) {
    inspectionByDay = reconcilePreTripInspectionForDay(inspectionByDay, nextState.eventsByDay || {}, day);
  }

  return inspectionByDay === nextState.inspectionByDay ? nextState : { ...nextState, inspectionByDay };
}

function markPreTripComplete(inspectionByDay = {}, day, source = 'auto_on_duty', event = null) {
  if (event) return reconcilePreTripInspectionForDay(inspectionByDay, { [day]: [event] }, day);
  const previous = inspectionByDay?.[day] || {};
  return {
    ...inspectionByDay,
    [day]: {
      ...previous,
      type: previous.type || 'pretrip',
      checked: PRETRIP_AUTO_ITEMS,
      complete: true,
      completedAt: previous.completedAt || Date.now(),
      source: previous.source || source,
      updatedAt: Date.now(),
    },
  };
}

function inspectionPromptMessage(event) {
  const where = [event?.city, event?.state].filter(Boolean).join(', ');
  return `Complete today’s inspection sheet from this ON DUTY Pre-trip Inspection?${where ? `\n\nLocation: ${where}` : ''}\n\nChoose Yes after you have inspected the truck. The sheet will be auto-filled and linked to this event time.`;
}

function shouldAskInspectionForDay(state, day, event) {
  const existing = state.inspectionByDay?.[day] || {};
  return isPreTripStatus(event?.status, `${event?.note || ''} ${event?.description || ''}`) && !existing.complete;
}

function maybeAcceptInspectionForEvent(state, day, event) {
  if (!shouldAskInspectionForDay(state, day, event)) return false;
  if (typeof window === 'undefined' || !window.confirm) return true;
  return window.confirm(inspectionPromptMessage(event));
}

function withAcceptedPreTripInspection(next, day, event, accepted) {
  if (!accepted || !event) return next;
  return {
    ...next,
    inspectionByDay: {
      ...(next.inspectionByDay || {}),
      [day]: inspectionFromPreTripEvent(day, event, (next.inspectionByDay || {})[day] || {}),
    },
  };
}

function previousDayLastEvent(eventsByDay, dayKey) {
  const prevDay = addDays(dayKey, -1);
  const prev = [...(eventsByDay[prevDay] || [])].sort((a,b)=>a.startMin-b.startMin);
  return prev.length ? prev[prev.length - 1] : null;
}

function buildCarryoverEvent(lastEvent) {
  if (!lastEvent) return null;
  const status = lastEvent.status || 'OFF';
  return {
    id: `carry_${Date.now()}`,
    status,
    startMin: 0,
    endMin: 1,
    city: lastEvent.city || 'GPS',
    state: lastEvent.state || 'UNK',
    description: '',
    note: carryoverNoteForStatus(status),
    source: 'carryover',
    carriedFromPreviousDay: true,
  };
}

function refreshCarryoverIfOnlyPlaceholder(eventsByDay, dayKey) {
  const current = eventsByDay[dayKey] || [];
  if (current.length !== 1 || !current[0]?.carriedFromPreviousDay) return;
  const lastPrev = previousDayLastEvent(eventsByDay, dayKey);
  const carry = buildCarryoverEvent(lastPrev);
  if (carry) {
    carry.id = current[0].id || carry.id;
    carry.endMin = current[0].endMin || 1;
    eventsByDay[dayKey] = [carry];
  } else {
    eventsByDay[dayKey] = [];
  }
}

function ensureTodayCarryover(eventsByDay, certifyStatus, today) {
  if (!eventsByDay[today]) {
    eventsByDay[today] = [];
    certifyStatus[today] = 'Active day / Not certified yet';
  }

  if ((eventsByDay[today] || []).length === 0) {
    const lastPrev = previousDayLastEvent(eventsByDay, today);
    const carry = buildCarryoverEvent(lastPrev);
    if (carry) eventsByDay[today] = [carry];
  }
}

function normalizeState(s) {
  const today = localDayKey();
  const eventsByDay = { ...initialEventsByDay, ...(s.eventsByDay || {}) };
  const certifyStatus = { ...initialCertifyStatus, ...(s.certifyStatus || {}) };

  // sanitize stale carryover notes copied from previous day
  Object.keys(eventsByDay).forEach(day => {
    eventsByDay[day] = normalizeLogEvents((eventsByDay[day] || []).map(event => sanitizeDutyEventForStatus(sanitizeCarryoverEvent(event))));
  });

  ensureTodayCarryover(eventsByDay, certifyStatus, today);
  refreshCarryoverIfOnlyPlaceholder(eventsByDay, today);
  const currentFromCarry = (eventsByDay[today] || []).length ? sorted(eventsByDay[today])[0] : null;

  const existingSignatureFromDays = Object.values(s.signatureByDay || {}).find(sig => sig?.signatureDataUrl)?.signatureDataUrl || '';
  const driverSignature = s.driverSignature || (existingSignatureFromDays
    ? {
      dataUrl: existingSignatureFromDays,
      driverName: Object.values(s.signatureByDay || {}).find(sig => sig?.driverName)?.driverName || s.driverProfile?.name || 'Driver',
      savedAt: Date.now(),
      migratedFromDaySignature: true,
    }
    : null);

  const compactSignatureByDay = Object.fromEntries(Object.entries(s.signatureByDay || {}).map(([dayKey, sig]) => {
    if (!sig || typeof sig !== 'object') return [dayKey, sig];
    const { signatureDataUrl, ...rest } = sig;
    return [dayKey, {
      ...rest,
      ...((signatureDataUrl || sig.signatureRef) ? { signatureRef:'driverSignature' } : {}),
    }];
  }));

  const normalized = {
    ...s,
    migratedTodayCleanV65: true,
    activeDay: s.activeDay || today,
    eventsByDay,
    certifyStatus,
    currentTrailer: s.currentTrailer || 'No trailer',
    currentStatus: s.currentStatus || currentFromCarry?.status || 'OFF',
    currentReason: s.currentReason || currentFromCarry?.note || currentFromCarry?.description || 'Off Duty',
    currentLocation: s.currentLocation || (currentFromCarry ? { city: currentFromCarry.city || 'GPS', state: currentFromCarry.state || 'UNK', locationSource:'carryover' } : { city:'GPS', state:'UNK', locationSource:'pending' }),
    inspectionByDay: s.inspectionByDay || {},
    signatureByDay: compactSignatureByDay || {},
    driverSignature,
    equipment: s.equipment || { type:'intermodal', chassis:'', container:'', seal:'', rail:'', note:'' },
    gpsTrip: s.gpsTrip || null,
    loadInfo: s.loadInfo || { loadNo:'', broker:'', pickupCity:'Chicago', pickupState:'IL', deliveryCity:'', deliveryState:'', appointment:'' },
    routeLegsByDay: s.routeLegsByDay || {},
  };

  return reconcilePreTripInspections(normalized, Object.keys(eventsByDay));
}

function defaultInitialState() {
  return normalizeState({
    view: 'logs',
    activeDay: localDayKey(),
    selectedEventId: null,
    selectMode: false,
    selectedIds: [],
    sheet: null,
    eventsByDay: initialEventsByDay,
    certifyStatus: initialCertifyStatus,
    driver: { truck:'Unit 12', trailer:'Trailer 53' },
    currentTrailer: 'No trailer',
    equipment: { type:'intermodal', chassis:'', container:'', seal:'', rail:'', note:'' },
    gpsTrip: null,
    loadInfo: { loadNo:'', broker:'', pickupCity:'Chicago', pickupState:'IL', deliveryCity:'', deliveryState:'', appointment:'' },
    routeLegsByDay: {},
    currentStatus: 'OFF',
    currentReason: 'Off Duty',
    currentLocation: { city:'GPS', state:'UNK', locationSource:'pending' },
    inspectionByDay: {},
    signatureByDay: {},
    driverSignature: null,
    homeGpsStatus: 'pending',
    gpsPanelOpen: false,
  });
}

async function loadInitial() {
  try {
    const saved = await loadAppSnapshot(APP_STATE_KEY);
    if (saved) return normalizeState(saved);
  } catch {}
  return defaultInitialState();
}

function sorted(events) {
  return [...events].sort((a,b)=>a.startMin-b.startMin);
}

export default function App() {
  const [state, setState] = useState(defaultInitialState);
  const [offlineHydrated, setOfflineHydrated] = useState(false);
  const lastEventsByDayRef = useRef(null);
  const lastInspectionByDayRef = useRef(null);

  React.useEffect(() => {
    let cancelled = false;
    loadInitial().then((initial) => {
      if (cancelled) return;
      installOwnerOpAuthBridge();
      setState(initial);
      lastEventsByDayRef.current = initial.eventsByDay || {};
      lastInspectionByDayRef.current = initial.inspectionByDay || {};
      setOfflineHydrated(true);
      startSyncEngine();
    });
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    if (!offlineHydrated) return;
    const previousEventsByDay = lastEventsByDayRef.current;
    const previousInspectionByDay = lastInspectionByDayRef.current;
    saveAppSnapshot(APP_STATE_KEY, state).catch(() => {});
    if (previousEventsByDay) {
      queueDutyEventDiffs(previousEventsByDay, state.eventsByDay || {}).catch(() => {});
    }
    if (previousInspectionByDay) {
      queueInspectionDiffs(previousInspectionByDay, state.inspectionByDay || {}).catch(() => {});
    }
    lastEventsByDayRef.current = state.eventsByDay || {};
    lastInspectionByDayRef.current = state.inspectionByDay || {};
  }, [state, offlineHydrated]);

  React.useEffect(() => {
    if (!navigator.geolocation) {
      setState(s => ({ ...s, homeGpsStatus:'unavailable' }));
      return;
    }

    setState(s => ({ ...s, homeGpsStatus: s.currentLocation?.locationSource === 'gps' ? 'gps' : 'pending' }));

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords || {};
        const guessed = guessGpsCity(lat, lng);
        setState(s => ({
          ...s,
          homeGpsStatus:'gps',
          currentLocation:{
            city: guessed.city || 'GPS',
            state: guessed.state || detectState(lat, lng),
            lat,
            lng,
            gpsAccuracy: accuracy || null,
            locationSource:'gps',
          },
        }));
      },
      () => {
        setState(s => ({ ...s, homeGpsStatus:'blocked' }));
      },
      { enableHighAccuracy:true, timeout:12000, maximumAge:60000 }
    );
  }, []);

  // Keep today's log available, but never force the driver out of the day they are reviewing.
  React.useEffect(() => {
    const timer = setInterval(() => {
      const today = localDayKey();
      setState(s => {
        const rolled = rolloverActiveDrivingIfNeeded(s, new Date());
        const eventsByDay = { ...rolled.eventsByDay };
        const certifyStatus = { ...rolled.certifyStatus };
        const before = JSON.stringify(eventsByDay[today] || []);
        ensureTodayCarryover(eventsByDay, certifyStatus, today);
        refreshCarryoverIfOnlyPlaceholder(eventsByDay, today);
        const after = JSON.stringify(eventsByDay[today] || []);
        if (rolled !== s || before !== after || !s.eventsByDay?.[today]) return { ...rolled, eventsByDay, certifyStatus };
        return s;
      });
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const rawEvents = useMemo(() => normalizeLogEvents(state.eventsByDay[state.activeDay] || []), [state.eventsByDay, state.activeDay]);
  const events = useMemo(() => displayEventsForDayFromState(state.eventsByDay || {}, state.activeDay), [state.eventsByDay, state.activeDay]);
  const liveCurrent = useMemo(() => currentFromEvents(events, state.currentStatus || 'OFF', state.currentLocation || { city:'GPS', state:'UNK' }, state.currentReason || 'Off Duty'), [events, state.currentStatus, state.currentLocation, state.currentReason]);
  const selectedEvent = events.find(e => e.id === state.selectedEventId) || null;

  function updateDay(day, eventsNext) {
    return { ...state, eventsByDay: { ...state.eventsByDay, [day]: normalizeLogEvents(eventsNext) } };
  }

  function continuousBaseForDay(s, day = s.activeDay) {
    const raw = (s.eventsByDay?.[day] || []).filter(e => !e.carriedFromPreviousDay);
    return displayEventsForDayFromState(s.eventsByDay || {}, day);
  }

  function commitTimelineForDay(eventsNext, day, s) {
    const normalized = normalizeLogEvents(eventsNext);
    // Store the normalized split timeline. Display code still extends the final
    // status to now/current-day or midnight/completed-day, but writing the
    // split segments prevents stale gaps after insert/edit/delete/shift.
    return normalized.map(event => ({ ...event }));
  }

  function minuteFromDate(date = new Date()) {
    return Math.max(0, Math.min(1439, date.getHours() * 60 + date.getMinutes()));
  }

  function findEventDayById(eventsByDay = {}, id = '') {
    if (!id) return '';
    return Object.keys(eventsByDay || {}).find(day => (eventsByDay?.[day] || []).some(e => e.id === id)) || '';
  }

  function rolloverActiveDrivingIfNeeded(s, now = new Date()) {
    const today = localDayKey(now);
    const nowMinute = minuteFromDate(now);
    const gpsId = s.gpsTrip?.eventId || '';
    const gpsDay = findEventDayById(s.eventsByDay || {}, gpsId);
    const sourceDay = gpsDay || (s.currentStatus === 'D' ? s.activeDay : '');

    if (!sourceDay || sourceDay === today || sourceDay > today) return s;
    if (s.currentStatus !== 'D' && s.gpsTrip?.status !== 'active') return s;

    const previousBase = continuousBaseForDay(s, sourceDay);
    const sourceEvent = previousBase.find(e => e.id === gpsId) || [...previousBase].reverse().find(e => e.status === 'D') || null;
    if (!sourceEvent) return { ...s, activeDay: today };

    const previousUpdated = normalizeLogEvents(previousBase.map(e => (e.id === sourceEvent.id ? { ...e, endMin: 1440 } : e)));
    const rolloverId = `gps_drive_${today}_${Date.now()}`;
    const todayExisting = (s.eventsByDay?.[today] || []).filter(e => !e.carriedFromPreviousDay);
    const todayDrive = {
      ...sourceEvent,
      id: rolloverId,
      status: 'D',
      startMin: 0,
      endMin: Math.max(1, nowMinute),
      city: s.currentLocation?.city || sourceEvent.city || 'GPS',
      state: s.currentLocation?.state || sourceEvent.state || 'UNK',
      note: 'Driving',
      description: sourceEvent.description || '',
      source: 'gps_drive_rollover',
      carriedFromPreviousDay: false,
    };
    const todayUpdated = commitTimelineForDay(insertManyOverride(todayExisting, [todayDrive]), today, s);

    return {
      ...s,
      activeDay: today,
      selectedEventId: rolloverId,
      currentStatus: 'D',
      currentReason: s.currentReason || 'Driving',
      currentLocation: {
        ...(s.currentLocation || {}),
        city: s.currentLocation?.city || todayDrive.city,
        state: s.currentLocation?.state || todayDrive.state,
      },
      certifyStatus: { ...(s.certifyStatus || {}), [today]: s.certifyStatus?.[today] || 'Active day / Not certified yet' },
      eventsByDay: { ...(s.eventsByDay || {}), [sourceDay]: previousUpdated, [today]: todayUpdated },
      gpsTrip: s.gpsTrip ? { ...s.gpsTrip, eventId: rolloverId, status: 'active', rolloverFromEventId: gpsId || sourceEvent.id, rolloverFromDay: sourceDay } : s.gpsTrip,
    };
  }

  function markDayRecert(next, day = next.activeDay) {
    if (next.certifyStatus?.[day] === 'Certified') {
      next = { ...next, certifyStatus: { ...next.certifyStatus, [day]: 'Needs Recertification' } };
    }
    return next;
  }

  function markRecert(next) {
    return markDayRecert(next, next.activeDay);
  }

  function openDay(day) {
    setState(s => {
      const eventsByDay = { ...s.eventsByDay };
      const certifyStatus = { ...s.certifyStatus };

      if (!eventsByDay[day]) {
        eventsByDay[day] = [];
        certifyStatus[day] = day === localDayKey() ? 'Active day / Not certified yet' : (certifyStatus[day] || 'Needs signature');
      }

      if (day === localDayKey()) { ensureTodayCarryover(eventsByDay, certifyStatus, day); refreshCarryoverIfOnlyPlaceholder(eventsByDay, day); }

      // Opening a day from the Logs list or graph preview must always land on
      // the Log tab. Older tab requests (for example Inspect from a previous
      // flow) are otherwise replayed by DayLogScreen and make the graph feel
      // broken because tapping it opens Inspection.
      return {
        ...s,
        view:'day',
        activeDay:day,
        eventsByDay,
        certifyStatus,
        selectedEventId:null,
        selectMode:false,
        selectedIds:[],
        sheet:null,
        roadGuardTabRequest:{ tab:'log', at:Date.now(), source:'open-day' },
      };
    });
  }

  function backToLogs() {
    setState(s => ({ ...s, view:'logs', sheet:null, selectMode:false, selectedIds:[] }));
  }

  function addEvent(eventOrEvents) {
    const incomingForPrompt = Array.isArray(eventOrEvents) ? eventOrEvents : [eventOrEvents];
    const preTripForPrompt = incomingForPrompt.find(e => isPreTripStatus(e?.status, `${e?.note || ''} ${e?.description || ''}`));
    const acceptedInspection = preTripForPrompt ? maybeAcceptInspectionForEvent(state, state.activeDay, preTripForPrompt) : false;
    setState(s => {
      const incoming = incomingForPrompt;
      const stamp = Date.now();
      const toAdd = incoming.map((e,i)=>sanitizeDutyEventForStatus({ id:`ev_${stamp}_${i}`, city:s.currentLocation?.city || 'GPS', state:s.currentLocation?.state || 'UNK', description:'', note:statusDefaultNote(e?.status || 'OFF'), source:'manual', ...e }));
      const dayEvents = continuousBaseForDay(s, s.activeDay);
      let merged = commitTimelineForDay(insertManyOverride(dayEvents, toAdd), s.activeDay, s);
      const eventsByDay = { ...s.eventsByDay, [s.activeDay]: merged };
      let routeLegsByDay = s.routeLegsByDay || {};
      for (const event of toAdd) {
        if (isPickupReason(event.note) || isDeliveryReason(event.note)) {
          routeLegsByDay = updateRouteLegsForStatus(routeLegsByDay, s.activeDay, {
            status:event.status,
            reason:event.note,
            city:event.city,
            state:event.state,
            shippingDocs:event.shippingDocs || event.loadNo || '',
            loadNo:event.loadNo || event.shippingDocs || '',
            destination:event.destination || '',
            destinationState:event.destinationState || '',
          }, event.id, event.startMin);
        }
      }
      routeLegsByDay = syncRouteLegTimes(routeLegsByDay, eventsByDay);
      let next = { ...s, eventsByDay, routeLegsByDay, selectedEventId: toAdd[toAdd.length-1]?.id || null, sheet:null };
      const preTripAdded = toAdd.find(e => isPreTripStatus(e.status, `${e.note || ''} ${e.description || ''}`));
      next = withAcceptedPreTripInspection(next, s.activeDay, preTripAdded, acceptedInspection);
      next = reconcilePreTripInspections(next, [s.activeDay]);
      return markRecert(next);
    });
  }

  function updateEvent(id, patch) {
    const currentEvent = (state.eventsByDay?.[state.activeDay] || []).find(event => event.id === id) || {};
    const cleanPatch = sanitizeDutyEventForStatus({ ...currentEvent, ...patch }, currentEvent.status);
    const previewEventForPrompt = cleanPatch;
    const acceptedInspection = maybeAcceptInspectionForEvent(state, state.activeDay, previewEventForPrompt);
    setState(s => {
      const beforeEdit = (s.eventsByDay[s.activeDay] || []).find(event => event.id === id) || currentEvent || {};
      const patchForSave = sanitizeDutyEventForStatus({ ...beforeEdit, ...patch }, beforeEdit.status);
      const baseEvents = continuousBaseForDay(s, s.activeDay);
      const evs = commitTimelineForDay(applyEditOverride(baseEvents, id, patchForSave), s.activeDay, s);
      let gpsTrip = s.gpsTrip;

      // If the driver edits the GPS-created DRIVING event time, keep the raw GPS points,
      // and recalculate the miles/state breakdown only if points exist for the new window.
      if (gpsTrip?.eventId === id && (patch.startMin !== undefined || patch.endMin !== undefined)) {
        const edited = evs.find(e => e.id === id);
        const recalculated = edited ? recalcMilesByTimeWindow(gpsTrip.points || [], edited.startMin, edited.endMin) : null;
        if (recalculated && recalculated.pointsUsed >= 2) {
          gpsTrip = {
            ...gpsTrip,
            milesByState: recalculated.milesByState,
            totalMiles: recalculated.totalMiles,
            adjustedToLogWindow: { startMin: edited.startMin, endMin: edited.endMin, pointsUsed: recalculated.pointsUsed },
          };
        } else {
          gpsTrip = {
            ...gpsTrip,
            adjustedToLogWindow: edited ? { startMin: edited.startMin, endMin: edited.endMin, pointsUsed: 0, note:'No GPS points in edited window; original miles kept for review.' } : gpsTrip.adjustedToLogWindow,
          };
        }
      }

      const eventsByDay = { ...s.eventsByDay, [s.activeDay]: evs };
      const editedEvent = evs.find(e => e.id === id);
      let routeLegsByDay = syncRouteLegTimes(s.routeLegsByDay || {}, eventsByDay);
      if (editedEvent && (isPickupReason(editedEvent.note) || isDeliveryReason(editedEvent.note))) {
        routeLegsByDay = updateRouteLegsForStatus(routeLegsByDay, s.activeDay, {
          status:editedEvent.status,
          reason:editedEvent.note,
          city:editedEvent.city,
          state:editedEvent.state,
          shippingDocs:editedEvent.shippingDocs || editedEvent.loadNo || '',
          loadNo:editedEvent.loadNo || editedEvent.shippingDocs || '',
          destination:editedEvent.destination || '',
          destinationState:editedEvent.destinationState || '',
        }, editedEvent.id, editedEvent.startMin);
        routeLegsByDay = syncRouteLegTimes(routeLegsByDay, eventsByDay);
      }
      let next = { ...s, gpsTrip, routeLegsByDay, eventsByDay };
      next = withAcceptedPreTripInspection(next, s.activeDay, editedEvent, acceptedInspection);
      next = reconcilePreTripInspections(next, [s.activeDay]);
      return markRecert(next);
    });
  }

  function deleteEvent(id) {
    setState(s => {
      const baseEvents = continuousBaseForDay(s, s.activeDay);
      const deleted = baseEvents.find(e => e.id === id) || null;
      const evs = commitTimelineForDay(baseEvents.filter(e => e.id !== id), s.activeDay, s);
      let loadInfo = s.loadInfo || {};
      if (loadInfo.sourceEventId === id || deleted?.loadLinkId === id) {
        const { sourceEventId, sourceEventReason, shippingDocs, loadNo, pickupCity, pickupState, deliveryCity, deliveryState, updatedAt, ...rest } = loadInfo;
        loadInfo = { ...rest, shippingDocs:'', loadNo:'', pickupCity:'', pickupState:'', deliveryCity:'', deliveryState:'' };
      }
      const eventsByDay = { ...s.eventsByDay, [s.activeDay]: evs };
      const routeLegsByDay = syncRouteLegTimes(removeOrUnlinkRouteLegForEvent(s.routeLegsByDay || {}, id), eventsByDay);
      let next = { ...s, loadInfo, routeLegsByDay, eventsByDay, selectedEventId:null, sheet:null };
      next = reconcilePreTripInspections(next, [s.activeDay]);
      return markRecert(next);
    });
  }

  function applyShift(delta) {
    setState(s => {
      const selected = new Set(s.selectedIds);
      const baseEvents = continuousBaseForDay(s, s.activeDay);
      const selectedEvents = baseEvents.filter(e => selected.has(e.id));
      if (!selectedEvents.length || !delta) return { ...s, sheet:null };

      const minStart = Math.min(...selectedEvents.map(e => Number(e.startMin || 0)));
      const maxEnd = Math.max(...selectedEvents.map(e => Number(e.endMin || 0)));
      const boundedDelta = Math.max(-minStart, Math.min(1440 - maxEnd, delta));
      if (!boundedDelta) return { ...s, sheet:null };

      const shifted = selectedEvents.map(e => ({ ...e, startMin:e.startMin + boundedDelta, endMin:e.endMin + boundedDelta }));
      const remaining = baseEvents.filter(e => !selected.has(e.id));
      const evs = commitTimelineForDay(insertManyOverride(remaining, shifted), s.activeDay, s);
      let next = { ...s, eventsByDay:{ ...s.eventsByDay, [s.activeDay]: sorted(evs) }, sheet:null };
      next = reconcilePreTripInspections(next, [s.activeDay]);
      return markRecert(next);
    });
  }

  function moveSelectedEventInline(id, delta) {
    const dayEvents = displayEventsForDay(state.eventsByDay?.[state.activeDay] || [], isToday(state.activeDay));
    const event = dayEvents.find(e => e.id === id);
    if (!event || !delta) return;
    const boundedDelta = Math.max(-event.startMin, Math.min(1440 - event.endMin, delta));
    if (!boundedDelta) return;
    updateEvent(id, { startMin:event.startMin + boundedDelta, endMin:event.endMin + boundedDelta });
  }

  function saveTrailerAction(payload) {
    setState(s => ({
      ...s,
      currentTrailer: payload.currentTrailer || s.currentTrailer,
      sheet: null,
    }));
  }


  function saveEquipment(payload) {
    setState(s => {
      let currentTrailer = 'No trailer';
      if (payload.type === 'intermodal') {
        currentTrailer = payload.chassis ? `Chassis ${payload.chassis}` : 'Intermodal missing chassis';
      } else if (payload.type === 'bobtail') {
        currentTrailer = 'No trailer';
      } else {
        currentTrailer = payload.trailer || 'Trailer';
      }
      return { ...s, equipment: payload, currentTrailer, sheet:null };
    });
  }


  function nowMinute() {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  }

  function loadLocation(s, kind) {
    const l = s.loadInfo || {};
    if (kind === 'pickup') {
      return {
        city: l.pickupCity || s.currentLocation?.city || 'Chicago',
        state: l.pickupState || s.currentLocation?.state || 'IL',
      };
    }
    if (kind === 'delivery') {
      return {
        city: l.deliveryCity || s.currentLocation?.city || 'Chicago',
        state: l.deliveryState || s.currentLocation?.state || 'IL',
      };
    }
    return { city:s.currentLocation?.city || 'Chicago', state:s.currentLocation?.state || 'IL' };
  }

  function parseCityStateInput(value = '', fallbackState = '') {
    const raw = String(value || '').trim();
    if (!raw) return { city:'', state:'' };
    const parts = raw.split(',');
    if (parts.length >= 2) {
      const state = parts.pop().trim().toUpperCase().slice(0, 2);
      return { city:parts.join(',').trim(), state };
    }
    const trailing = raw.match(/^(.+?)\s+([A-Za-z]{2})$/);
    if (trailing) return { city:trailing[1].trim(), state:trailing[2].toUpperCase() };
    return { city:raw, state:fallbackState || '' };
  }

  function routeLegArray(routeLegsByDay = {}) {
    return Object.entries(routeLegsByDay || {}).flatMap(([day, legs]) => (legs || []).map(leg => ({ ...leg, day: leg.day || day })));
  }

  function normalizeRouteLeg(leg = {}) {
    return {
      id: leg.id || `leg_${Date.now()}`,
      day: leg.day || leg.pickupDay || localDayKey(),
      pickupDay: leg.pickupDay || leg.day || '',
      pickupEventId: leg.pickupEventId || '',
      pickupMin: Number.isFinite(Number(leg.pickupMin)) ? Number(leg.pickupMin) : null,
      deliveryDay: leg.deliveryDay || '',
      deliveryEventId: leg.deliveryEventId || '',
      deliveryMin: Number.isFinite(Number(leg.deliveryMin)) ? Number(leg.deliveryMin) : null,
      fromCity: leg.fromCity || '',
      fromState: leg.fromState || '',
      toCity: leg.toCity || '',
      toState: leg.toState || '',
      shippingDocs: leg.shippingDocs || leg.loadNo || '',
      loadNo: leg.loadNo || leg.shippingDocs || '',
      kind: leg.kind || 'loaded',
      status: leg.status || (leg.deliveryEventId ? 'delivered' : 'open'),
      source: leg.source || 'route_leg',
      updatedAt: leg.updatedAt || Date.now(),
    };
  }

  function isPickupReason(reason = '') {
    return /pickup|loading/i.test(String(reason || ''));
  }

  function isDeliveryReason(reason = '') {
    return /delivery|unloading/i.test(String(reason || ''));
  }

  function findOpenRouteLeg(routeLegsByDay = {}, day, shippingDocs = '') {
    const docs = String(shippingDocs || '').trim().toLowerCase();
    return routeLegArray(routeLegsByDay)
      .filter(leg => leg.status !== 'delivered' && leg.status !== 'cancelled')
      .filter(leg => !docs || String(leg.shippingDocs || leg.loadNo || '').trim().toLowerCase() === docs)
      .sort((a, b) => String(a.pickupDay || a.day).localeCompare(String(b.pickupDay || b.day)) || Number(a.pickupMin || 0) - Number(b.pickupMin || 0))
      .at(-1) || null;
  }

  function upsertRouteLeg(routeLegsByDay = {}, day, leg) {
    const next = { ...(routeLegsByDay || {}) };
    const homeDay = leg.day || day;
    const list = [...(next[homeDay] || [])];
    const normalized = normalizeRouteLeg({ ...leg, day: homeDay });
    const idx = list.findIndex(item => item.id === normalized.id || (normalized.pickupEventId && item.pickupEventId === normalized.pickupEventId));
    if (idx >= 0) list[idx] = { ...list[idx], ...normalized, updatedAt:Date.now() };
    else list.push(normalized);
    next[homeDay] = list.sort((a,b)=>(a.pickupMin ?? 9999)-(b.pickupMin ?? 9999));
    return next;
  }

  function removeOrUnlinkRouteLegForEvent(routeLegsByDay = {}, eventId = '') {
    if (!eventId) return routeLegsByDay || {};
    const next = {};
    for (const [day, legs] of Object.entries(routeLegsByDay || {})) {
      const kept = [];
      for (const leg of legs || []) {
        if (leg.pickupEventId === eventId || leg.id === eventId || leg.id === `leg_${eventId}`) {
          // Pickup created the route leg; deleting that event removes the leg entirely.
          continue;
        }
        if (leg.deliveryEventId === eventId) {
          kept.push({ ...leg, deliveryEventId:'', deliveryDay:'', deliveryMin:null, status:'open', updatedAt:Date.now() });
          continue;
        }
        kept.push(leg);
      }
      if (kept.length) next[day] = kept;
    }
    return next;
  }

  function syncRouteLegTimes(routeLegsByDay = {}, eventsByDay = {}) {
    const eventIndex = new Map();
    Object.entries(eventsByDay || {}).forEach(([day, events]) => {
      (events || []).forEach(event => event?.id && eventIndex.set(event.id, { day, event }));
    });
    const next = {};
    for (const [day, legs] of Object.entries(routeLegsByDay || {})) {
      const synced = (legs || []).map(leg => {
        let out = { ...leg };
        const pickup = leg.pickupEventId ? eventIndex.get(leg.pickupEventId) : null;
        const delivery = leg.deliveryEventId ? eventIndex.get(leg.deliveryEventId) : null;
        if (pickup) out = { ...out, pickupDay:pickup.day, pickupMin:pickup.event.startMin, fromCity:pickup.event.city || out.fromCity, fromState:pickup.event.state || out.fromState };
        if (delivery) out = { ...out, deliveryDay:delivery.day, deliveryMin:delivery.event.startMin, status:'delivered' };
        return out;
      });
      if (synced.length) next[day] = synced;
    }
    return next;
  }

  function updateRouteLegsForStatus(routeLegsByDay = {}, day, payload = {}, eventId = '', startMin = 0) {
    const reason = String(payload.reason || '');
    const shippingDocs = String(payload.shippingDocs || payload.loadNo || '').trim();
    const origin = { city:payload.city || '', state:payload.state || '' };
    const destination = parseCityStateInput(payload.destination || '', payload.destinationState || '');

    if (isPickupReason(reason)) {
      const leg = normalizeRouteLeg({
        id:`leg_${eventId}`,
        day,
        pickupDay:day,
        pickupEventId:eventId,
        pickupMin:startMin,
        fromCity:origin.city,
        fromState:origin.state,
        toCity:destination.city,
        toState:destination.state,
        shippingDocs,
        loadNo:shippingDocs,
        status:'open',
        source:'pickup_event',
      });
      return upsertRouteLeg(routeLegsByDay, day, leg);
    }

    if (isDeliveryReason(reason)) {
      const existing = findOpenRouteLeg(routeLegsByDay, day, shippingDocs);
      if (existing) {
        return upsertRouteLeg(routeLegsByDay, existing.day || existing.pickupDay || day, {
          ...existing,
          deliveryDay:day,
          deliveryEventId:eventId,
          deliveryMin:startMin,
          toCity:existing.toCity || origin.city || destination.city,
          toState:existing.toState || origin.state || destination.state,
          status:'delivered',
          updatedAt:Date.now(),
        });
      }
      const leg = normalizeRouteLeg({
        id:`leg_${eventId}`,
        day,
        pickupDay:day,
        pickupEventId:'',
        pickupMin:null,
        fromCity:'',
        fromState:'',
        toCity:origin.city || destination.city,
        toState:origin.state || destination.state,
        shippingDocs,
        loadNo:shippingDocs,
        deliveryDay:day,
        deliveryEventId:eventId,
        deliveryMin:startMin,
        status:'delivered',
        source:'delivery_event',
      });
      return upsertRouteLeg(routeLegsByDay, day, leg);
    }

    return routeLegsByDay || {};
  }

  function buildLoadPatchForStatusPayload(payload = {}, eventId = '') {
    const reason = String(payload.reason || '');
    const pickupLike = /pickup|loading/i.test(reason);
    const deliveryLike = /delivery|unloading/i.test(reason);
    if (!pickupLike && !deliveryLike) return null;

    const shippingDocs = String(payload.shippingDocs || payload.loadNo || '').trim();
    const destination = parseCityStateInput(payload.destination || '', payload.destinationState || '');
    const origin = { city:payload.city || '', state:payload.state || '' };
    const patch = {
      sourceEventId:eventId,
      sourceEventReason:reason,
      updatedAt:Date.now(),
    };

    if (shippingDocs) {
      patch.shippingDocs = shippingDocs;
      patch.loadNo = shippingDocs;
    }
    if (pickupLike) {
      patch.pickupCity = origin.city || payload.pickupCity || '';
      patch.pickupState = origin.state || payload.pickupState || '';
      if (destination.city) patch.deliveryCity = destination.city;
      if (destination.state) patch.deliveryState = destination.state;
    }
    if (deliveryLike) {
      if (destination.city || destination.state) {
        patch.deliveryCity = destination.city || origin.city || '';
        patch.deliveryState = destination.state || origin.state || '';
      } else {
        patch.deliveryCity = origin.city || payload.deliveryCity || '';
        patch.deliveryState = origin.state || payload.deliveryState || '';
      }
    }
    return patch;
  }

  function loadDescriptionForStatusPayload(payload = {}) {
    const reason = String(payload.reason || '');
    const parts = [];
    const ref = String(payload.shippingDocs || payload.loadNo || '').trim();
    const dest = parseCityStateInput(payload.destination || '', payload.destinationState || '');
    if (ref) parts.push(`BOL ${ref}`);
    if (/pickup|loading/i.test(reason) && (dest.city || dest.state)) parts.push(`To ${[dest.city, dest.state].filter(Boolean).join(', ')}`);
    if (/delivery|unloading/i.test(reason) && (dest.city || dest.state)) parts.push(`At ${[dest.city, dest.state].filter(Boolean).join(', ')}`);
    return parts.join(' · ');
  }

  function addDriverWorkflowEvents(kind) {
    const acceptedWorkflowInspection = kind === 'pretrip_drive'
      ? maybeAcceptInspectionForEvent(state, state.activeDay, { status:'ON', note:'Pre-trip inspection', city:state.currentLocation?.city, state:state.currentLocation?.state })
      : false;
    setState(s => {
      const day = s.activeDay;
      const existing = [...(s.eventsByDay[day] || [])].sort((a,b)=>a.startMin-b.startMin);
      const now = Math.max(1, Math.min(1439, nowMinute()));
      const stamp = Date.now();
      const load = s.loadInfo || {};
      const pu = loadLocation(s, 'pickup');
      const de = loadLocation(s, 'delivery');
      const here = loadLocation(s, 'current');
      const loadText = load.loadNo ? `Load #${load.loadNo}` : '';
      let eventsToAdd = [];
      let currentStatus = s.currentStatus;
      let currentReason = s.currentReason;
      let currentLocation = s.currentLocation || here;

      if (kind === 'pretrip_drive') {
        const start = Math.max(0, now - 15);
        eventsToAdd = [
          { status:'ON', startMin:start, endMin:now, city:here.city, state:here.state, note:'Pre-trip inspection', description:loadText, source:'driver_workflow' },
          { status:'D', startMin:now, endMin:Math.min(1439, now + 1), city:here.city, state:here.state, note:'Driving', description:loadText, source:'gps_drive' },
        ];
        currentStatus = 'D';
        currentReason = 'Driving';
        currentLocation = here;
      }

      if (kind === 'arrive_pickup_15' || kind === 'arrive_pickup_20') {
        const ago = kind === 'arrive_pickup_15' ? 15 : 20;
        const start = Math.max(0, now - ago);
        eventsToAdd = [
          { status:'ON', startMin:start, endMin:Math.min(1439, now + 1), city:pu.city, state:pu.state, note:'Pickup / Loading', description:`Arrived pickup ${ago} min ago${loadText ? ` · ${loadText}` : ''}`, source:'driver_workflow' },
        ];
        currentStatus = 'ON';
        currentReason = 'Pickup / Loading';
        currentLocation = pu;
      }

      if (kind === 'loading_waiting') {
        eventsToAdd = [
          { status:'ON', startMin:now, endMin:Math.min(1439, now + 1), city:pu.city, state:pu.state, note:'Pickup / Loading', description:`Waiting/loading${loadText ? ` · ${loadText}` : ''}`, source:'driver_workflow' },
        ];
        currentStatus = 'ON';
        currentReason = 'Pickup / Loading';
        currentLocation = pu;
      }

      if (kind === 'depart_loaded') {
        eventsToAdd = [
          { status:'D', startMin:now, endMin:Math.min(1439, now + 1), city:pu.city, state:pu.state, note:'Driving', description:`Depart loaded${loadText ? ` · ${loadText}` : ''}`, source:'gps_drive' },
        ];
        currentStatus = 'D';
        currentReason = 'Driving';
        currentLocation = pu;
      }

      if (kind === 'delivery_15') {
        const start = Math.max(0, now - 15);
        eventsToAdd = [
          { status:'ON', startMin:start, endMin:Math.min(1439, now + 1), city:de.city || here.city, state:de.state || here.state, note:'Delivery / Unloading', description:`Arrived delivery 15 min ago${loadText ? ` · ${loadText}` : ''}`, source:'driver_workflow' },
        ];
        currentStatus = 'ON';
        currentReason = 'Delivery / Unloading';
        currentLocation = { city:de.city || here.city, state:de.state || here.state };
      }

      const toAdd = eventsToAdd.map((e,i)=>({ id:`flow_${stamp}_${i}`, ...e }));
      const merged = insertManyOverride(existing, toAdd);
      const eventsByDay = { ...s.eventsByDay, [day]: merged };
      let routeLegsByDay = s.routeLegsByDay || {};
      for (const event of toAdd) {
        if (isPickupReason(event.note) || isDeliveryReason(event.note)) {
          routeLegsByDay = updateRouteLegsForStatus(routeLegsByDay, day, {
            status:event.status,
            reason:event.note,
            city:event.city,
            state:event.state,
            shippingDocs:load.loadNo || load.shippingDocs || '',
            loadNo:load.loadNo || load.shippingDocs || '',
            destination:[load.deliveryCity, load.deliveryState].filter(Boolean).join(', '),
          }, event.id, event.startMin);
        }
      }
      routeLegsByDay = syncRouteLegTimes(routeLegsByDay, eventsByDay);

      let next = {
        ...s,
        currentStatus,
        currentReason,
        currentLocation,
        routeLegsByDay,
        selectedEventId: toAdd[toAdd.length - 1]?.id || s.selectedEventId,
        eventsByDay,
      };
      const workflowPreTrip = toAdd.find(e => isPreTripStatus(e.status, `${e.note || ''} ${e.description || ''}`));
      next = withAcceptedPreTripInspection(next, day, workflowPreTrip, acceptedWorkflowInspection);
      next = reconcilePreTripInspections(next, [day]);
      return markDayRecert(next, day);
    });
  }

  function saveLoadInfo(payload = {}) {
    setState(s => {
      const next = {
        ...s,
        loadInfo: { ...(s.loadInfo || {}), ...payload },
        ...(payload.routeLegsByDay ? { routeLegsByDay: payload.routeLegsByDay } : {}),
      };
      if (payload.driverName !== undefined) {
        next.driverProfile = { ...(s.driverProfile || {}), name:String(payload.driverName || '').trim() };
      }
      if (payload.carrierName !== undefined) next.carrierName = String(payload.carrierName || '').trim();
      if (payload.mainOfficeAddress !== undefined) next.mainOfficeAddress = String(payload.mainOfficeAddress || '').trim();
      if (payload.homeTerminalAddress !== undefined) next.homeTerminalAddress = String(payload.homeTerminalAddress || '').trim();
      if (payload.coDrivers !== undefined) next.coDrivers = String(payload.coDrivers || '').trim();
      if (payload.truck !== undefined) next.driver = { ...(s.driver || {}), truck:String(payload.truck || '').trim() };
      if (payload.trailer !== undefined) {
        const trailer = String(payload.trailer || '').trim();
        next.driver = { ...(next.driver || s.driver || {}), trailer };
        next.currentTrailer = trailer || 'No trailer';
      }
      if (payload.pickupCity || payload.pickupState) {
        next.currentLocation = {
          city: payload.pickupCity || s.currentLocation?.city || 'Chicago',
          state: payload.pickupState || s.currentLocation?.state || 'IL',
          locationSource: s.currentLocation?.locationSource || 'manual',
        };
      }
      return next;
    });
  }

  function startDrivingFromMotion(fix) {
    setState(s => {
      const now = new Date();
      const today = localDayKey(now);
      const activeDay = s.activeDay === today ? s.activeDay : today;
      const startMin = now.getHours() * 60 + now.getMinutes();
      const stateCode = fix?.state || detectState(fix?.lat || 0, fix?.lng || 0);
      const ev = {
        id: `gps_drive_${Date.now()}`,
        status:'D',
        startMin,
        endMin: Math.min(1439, startMin + 1),
        city: s.currentLocation?.city || 'GPS',
        state: stateCode,
        description: s.equipment?.type === 'intermodal'
          ? `Intermodal ${s.equipment.chassis || ''} ${s.equipment.container || ''}`.trim()
          : '',
        note:'Driving started by motion',
        source:'gps_drive',
      };
      const existing = s.eventsByDay[activeDay] || [];
      const updated = normalizeLogEvents(closePreviousAndStart(existing, ev));
      return {
        ...s,
        currentStatus:'D',
        currentReason:'Driving',
        currentLocation:{ city:s.currentLocation?.city || 'GPS', state:stateCode },
        selectedEventId: ev.id,
        activeDay,
        eventsByDay:{ ...s.eventsByDay, [activeDay]: updated },
        gpsTrip:{
          status:'active',
          startedAt: Date.now(),
          eventId: ev.id,
          points: fix ? [fix] : [],
          lastPoint: fix || null,
          milesByState:{},
          totalMiles:0,
          startTrigger:'motion',
        }
      };
    });
  }

  function startGpsDriving() {
    setState(s => {
      const now = new Date();
      const today = localDayKey(now);
      const activeDay = s.activeDay === today ? s.activeDay : today;
      const startMin = now.getHours() * 60 + now.getMinutes();
      const ev = {
        id: `gps_drive_${Date.now()}`,
        status:'D',
        startMin,
        endMin: Math.min(1439, startMin + 1),
        city: s.currentLocation?.city || 'Chicago',
        state: s.currentLocation?.state || 'IL',
        description: s.equipment?.type === 'intermodal'
          ? `Intermodal ${s.equipment.chassis || ''} ${s.equipment.container || ''}`.trim()
          : '',
        note:'Driving',
        source:'gps_drive',
      };
      const existing = s.eventsByDay[activeDay] || [];
      const updated = normalizeLogEvents(closePreviousAndStart(existing, ev));
      return {
        ...s,
        currentStatus:'D',
        currentReason:'Driving',
        selectedEventId: ev.id,
        activeDay,
        eventsByDay:{ ...s.eventsByDay, [activeDay]: updated },
        gpsTrip:{
          status:'active',
          startedAt: Date.now(),
          eventId: ev.id,
          points:[],
          lastPoint:null,
          milesByState:{},
          totalMiles:0,
        }
      };
    });
  }

  function updateGpsTrip(fix) {
    setState(s => {
      let base = rolloverActiveDrivingIfNeeded(s, new Date());
      if (!base.gpsTrip || base.gpsTrip.status !== 'active') return base;
      const last = base.gpsTrip.lastPoint;
      let miles = 0;
      if (last) {
        const raw = haversineMiles(last, fix);
        if (raw >= 0.005 && raw <= 5) miles = raw;
      }
      const stateCode = fix.state || detectState(fix.lat, fix.lng);
      const milesByState = miles ? addMilesByState(base.gpsTrip.milesByState || {}, stateCode, miles) : (base.gpsTrip.milesByState || {});
      const nowMinValue = minuteFromDate(new Date());
      const activeDay = base.activeDay || localDayKey();
      const dayEvents = normalizeLogEvents((base.eventsByDay[activeDay] || []).map(e =>
        e.id === base.gpsTrip.eventId ? { ...e, endMin: Math.max(e.startMin + 1, nowMinValue), state: e.state || stateCode } : e
      ));
      return {
        ...base,
        gpsTrip:{
          ...base.gpsTrip,
          lastPoint: fix,
          points: [...(base.gpsTrip.points || []), fix].slice(-1000),
          milesByState,
          totalMiles: Number(((base.gpsTrip.totalMiles || 0) + miles).toFixed(2)),
        },
        currentLocation:{ city:base.currentLocation?.city || 'GPS', state:stateCode },
        eventsByDay:{ ...base.eventsByDay, [activeDay]: dayEvents },
      };
    });
  }

  function stopGpsDriving() {
    setState(s => {
      if (!s.gpsTrip) return s;
      const rolled = rolloverActiveDrivingIfNeeded(s, new Date());
      return {
        ...rolled,
        gpsTrip:{ ...rolled.gpsTrip, status:'stopped', stoppedAt:Date.now() },
        sheet:{ type:'status' },
      };
    });
  }

  function signLogDay(day = state.activeDay, payload = {}) {
    try {
      const existingSignature = state.driverSignature || null;
      const dataUrl = payload.signatureDataUrl || existingSignature?.dataUrl;
      const driverName = payload.driverName || existingSignature?.driverName || state.signatureByDay?.[day]?.driverName || 'Driver';

      if (!dataUrl) {
        window.alert?.('Add your driver signature first. After it is saved once, signing future logs is one tap.');
        return;
      }

      const blockMessage = signBlockMessage(state, day);
      if (blockMessage) {
        window.alert?.(blockMessage);
        return;
      }

      const confirmMessage = signConfirmMessage(state, day);
      if (confirmMessage && !window.confirm(confirmMessage)) return;

      setState(s => {
        const latestSignature = payload.signatureDataUrl
          ? { dataUrl: payload.signatureDataUrl, driverName, savedAt: Date.now() }
          : (s.driverSignature || existingSignature || { dataUrl, driverName, savedAt: Date.now() });

        const existingDaySignature = (s.signatureByDay || {})[day] || {};
        const { signatureDataUrl, ...compactDaySignature } = existingDaySignature;

        return {
          ...s,
          // Store the signature image once globally. Each signed day keeps a
          // reference + signed metadata. This avoids duplicating a base64 image
          // across many days, which can crash iPhone/Safari after tapping Sign.
          driverSignature: latestSignature,
          signatureByDay:{
            ...(s.signatureByDay || {}),
            [day]: {
              ...compactDaySignature,
              driverName,
              signatureRef:'driverSignature',
              signed: true,
              signedAt: Date.now(),
            },
          },
          certifyStatus:{ ...s.certifyStatus, [day]:'Certified' },
        };
      });
    } catch (error) {
      console.error('signLogDay failed', error);
      window.alert?.('Signing failed. Please reload and try again. Your log was not changed.');
    }
  }

  function certify(day = state.activeDay) {
    signLogDay(day, {});
  }

  function saveInspection(payload) {
    setState(s => ({
      ...s,
      inspectionByDay:{
        ...(s.inspectionByDay || {}),
        [s.activeDay]: {
          ...((s.inspectionByDay || {})[s.activeDay] || {}),
          ...payload,
          updatedAt: Date.now(),
        },
      },
    }));
  }

  function saveSignature(payload = {}) {
    signLogDay(state.activeDay, payload);
  }

  function applyRoadGuardFix(action, payload = {}) {
    if (!action) return;

    if (action === 'OPEN_SHIPPING_DOCS') {
      const existing = state.loadInfo?.shippingDocs || state.loadInfo?.bol || state.loadInfo?.loadNo || '';
      const value = window.prompt('Enter BOL / load reference, or type Empty / bobtail / no load only if accurate:', existing || '');
      if (value == null) return;
      setState(s => ({
        ...s,
        loadInfo: { ...(s.loadInfo || {}), shippingDocs: String(value || '').trim() },
        ...(!payload.silent ? { roadGuardTabRequest: { tab:'form', at:Date.now() } } : {}),
      }));
      return;
    }

    if (action === 'APPLY_CHATGPT_FIX') {
      const fix = payload.fix || {};
      const appAction = String(fix.appAction || '').trim().toUpperCase();
      const value = String(fix.value || '').trim();
      if (!appAction || appAction === 'REVIEW_ONLY' || appAction === 'NO_CHANGE_TRUE_RECORD' || appAction === 'REVIEW_HOS_ONLY') {
        setState(s => ({ ...s, roadGuardTabRequest:{ tab:'log', at:Date.now() } }));
        return;
      }
      if (/OPEN_DAY|CREATE_MISSING_DAY/.test(appAction)) {
        const day = findDateInText(value) || findDateInText(fix.raw) || payload.day;
        if (day) setState(s => ({ ...s, activeDay: day, view:'day', roadGuardTabRequest:{ tab:'log', at:Date.now() } }));
        return;
      }
      if (/SET_DRIVER_NAME/.test(appAction) && value) {
        setState(s => ({ ...s, driverProfile:{ ...(s.driverProfile || {}), name:value }, roadGuardTabRequest:{ tab:'form', at:Date.now() } }));
        return;
      }
      if (/SET_CARRIER_NAME/.test(appAction) && value) {
        setState(s => ({ ...s, carrierName:value, roadGuardTabRequest:{ tab:'form', at:Date.now() } }));
        return;
      }
      if (/SET_MAIN_OFFICE/.test(appAction) && value) {
        setState(s => ({ ...s, mainOfficeAddress:value, roadGuardTabRequest:{ tab:'form', at:Date.now() } }));
        return;
      }
      if (/SET_SHIPPING_DOCS/.test(appAction) && value) {
        setState(s => ({ ...s, loadInfo:{ ...(s.loadInfo || {}), shippingDocs:value }, roadGuardTabRequest:{ tab:'form', at:Date.now() } }));
        return;
      }
      if (/SET_TRAILER_STATUS/.test(appAction) && value) {
        setState(s => ({ ...s, currentTrailer:value, driver:{ ...(s.driver || {}), trailer:value }, roadGuardTabRequest:{ tab:'form', at:Date.now() } }));
        return;
      }
      setState(s => ({ ...s, roadGuardTabRequest:{ tab:'log', at:Date.now() } }));
      return;
    }

    if (action === 'APPLY_SAVED_PROFILE') {
      setState(s => ({
        ...s,
        driverProfile:{ ...(s.driverProfile || {}), name:s.driverProfile?.name || s.driverSignature?.driverName || ROADGUARD_DEFAULT_PROFILE.driverName },
        carrierName:s.carrierName || ROADGUARD_DEFAULT_PROFILE.carrierName,
        mainOfficeAddress:s.mainOfficeAddress || ROADGUARD_DEFAULT_PROFILE.mainOffice,
        driver:{ ...(s.driver || {}), truck:s.driver?.truck || 'Unit 12' },
        ...(!payload.silent ? { roadGuardTabRequest:{ tab:'form', at:Date.now() } } : {}),
      }));
      return;
    }

    if (action === 'OPEN_DAY') {
      const day = payload.day || payload.issue?.day || findDateInText(payload.issue?.code) || findDateInText(payload.issue?.title);
      if (!day) return;
      setState(s => ({ ...s, activeDay:day, view:'day', selectedEventId:null, roadGuardTabRequest:{ tab:'log', at:Date.now() } }));
      return;
    }

    if (action === 'OPEN_INSPECTION') {
      setState(s => ({ ...s, roadGuardTabRequest:{ tab:'inspection', at:Date.now() } }));
      return;
    }

    if (action === 'OPEN_EQUIPMENT') {
      setState(s => ({ ...s, sheet:{ type:'equipment' }, roadGuardTabRequest:{ tab:'form', at:Date.now() } }));
      return;
    }

    if (action === 'OPEN_LOG') {
      setState(s => ({ ...s, roadGuardTabRequest:{ tab:'log', at:Date.now() } }));
      return;
    }
  }

  function reset() {
    clearAppSnapshot(APP_STATE_KEY).finally(() => {
      const next = defaultInitialState();
      lastEventsByDayRef.current = next.eventsByDay || {};
      lastInspectionByDayRef.current = next.inspectionByDay || {};
      setState(next);
    });
  }

  function clearTestDates() {
    if (typeof window !== 'undefined') {
      const ok = window.confirm?.('Clear all test dates and start fresh?');
      if (!ok) return;
    }

    clearAppSnapshot(APP_STATE_KEY).finally(() => {
      const today = localDayKey();
      setState(s => {
        const next = normalizeState({
          ...s,
          view:'logs',
          activeDay:today,
          selectedEventId:null,
          selectedIds:[],
          selectMode:false,
          sheet:null,
          eventsByDay:{},
          certifyStatus:{},
          inspectionByDay:{},
          signatureByDay:{},
          routeLegsByDay:{},
          loadInfo:{ loadNo:'', broker:'', pickupCity:'', pickupState:'', deliveryCity:'', deliveryState:'', appointment:'', shippingDocs:'', bol:'', po:'' },
          gpsTrip:null,
          gpsPanelOpen:false,
          currentStatus:'OFF',
          currentReason:'Off Duty',
        });

        lastEventsByDayRef.current = s.eventsByDay || {};
        lastInspectionByDayRef.current = s.inspectionByDay || {};
        return next;
      });
    });
  }


  function closeLastAndAddStatus({ status, reason, city, state: st, description='', droppedTrailer='', hookedTrailer='', lat=null, lng=null, gpsAccuracy=null, locationSource='manual', shippingDocs='', loadNo='', destination='', destinationState='', backdateMinutes=0 }) {
    const acceptedLiveInspection = maybeAcceptInspectionForEvent(state, state.activeDay, { status, note:reason, description, city, state:st });
    setState(s => {
      const nowLiveMin = Math.max(0, Math.min(1439, new Date().getHours() * 60 + new Date().getMinutes()));
      const backdate = Math.max(0, Math.min(240, Number(backdateMinutes || 0)));
      const changeAt = Math.max(0, nowLiveMin - backdate);
      const day = s.activeDay;
      const existing = continuousBaseForDay(s, day);
      let note = reason;
      let trailer = s.currentTrailer;
      if (reason === 'Drop Trailer') {
        note = `Drop Trailer · ${droppedTrailer || trailer}`;
        trailer = 'No trailer';
      }
      if (reason === 'Drop & Hook') {
        note = `Drop & Hook · dropped ${droppedTrailer || trailer}${hookedTrailer ? ` / hooked ${hookedTrailer}` : ''}`;
        trailer = hookedTrailer || 'New trailer';
      }
      const eventId = `live_${Date.now()}`;
      const loadDescription = loadDescriptionForStatusPayload({ status, reason, city, state:st, shippingDocs, loadNo, destination, destinationState });
      const ev = {
        id: eventId,
        status,
        specialMode: reason === 'Yard Move' ? 'yard_move' : (reason === 'Personal Conveyance' ? 'personal_conveyance' : 'none'),
        startMin: changeAt,
        // Live status changes are current until now. If the driver says the
        // pickup/pre-trip started 15 minutes ago, the new status overrides the
        // old status for that whole backdated window instead of creating an
        // ON block followed by stale OFF time.
        endMin: Math.max(changeAt + 1, Math.min(1439, nowLiveMin || changeAt + 1)),
        city,
        state: st,
        description: description || loadDescription,
        note,
        shippingDocs: String(shippingDocs || loadNo || '').trim(),
        loadNo: String(loadNo || shippingDocs || '').trim(),
        destination,
        destinationState,
        loadLinkId: eventId,
        lat,
        lng,
        gpsAccuracy,
        locationSource,
        source: 'live_status',
      };
      const loadPayload = { status, reason, city, state:st, shippingDocs, loadNo, destination, destinationState };
      const loadInfoPatch = buildLoadPatchForStatusPayload(loadPayload, eventId);
      const continuous = normalizeLogEvents(closePreviousAndStart(existing, ev));
      const eventsByDay = { ...s.eventsByDay, [day]: continuous };
      const routeLegsByDay = syncRouteLegTimes(
        updateRouteLegsForStatus(s.routeLegsByDay || {}, day, loadPayload, eventId, changeAt),
        eventsByDay
      );
      let next = {
        ...s,
        currentStatus: status,
        currentReason: reason,
        currentLocation: { city, state: st, lat, lng, gpsAccuracy, locationSource },
        currentTrailer: trailer,
        selectedEventId: ev.id,
        sheet: null,
        eventsByDay,
        routeLegsByDay,
        ...(loadInfoPatch ? { loadInfo:{ ...(s.loadInfo || {}), ...loadInfoPatch } } : {}),
      };
      next = withAcceptedPreTripInspection(next, day, ev, acceptedLiveInspection);
      next = reconcilePreTripInspections(next, [day]);
      return markDayRecert(next, day);
    });
  }

  function startDrivingFromStatus({ city, state: st, lat=null, lng=null, gpsAccuracy=null, locationSource='manual' }) {
    closeLastAndAddStatus({ status:'D', reason:'Driving started', city, state:st, description:'', droppedTrailer:'', hookedTrailer:'', lat, lng, gpsAccuracy, locationSource });
  }


  function stopDrivingToOnDuty(fix = null) {
    setState(s => {
      const now = new Date();
      const base = rolloverActiveDrivingIfNeeded(s, now);
      const day = localDayKey(now);
      const changeAt = minuteFromDate(now);
      const stateCode = fix?.state || base.currentLocation?.state || detectState(fix?.lat || 0, fix?.lng || 0);
      const city = base.currentLocation?.city || 'GPS';
      const existing = continuousBaseForDay(base, day);

      const ev = {
        id: `auto_on_${Date.now()}`,
        status:'ON',
        startMin: changeAt,
        endMin: Math.min(1440, changeAt + 1),
        city,
        state: stateCode,
        description:'',
        note:'Stopped / On Duty',
        lat: fix?.lat ?? null,
        lng: fix?.lng ?? null,
        gpsAccuracy: fix?.accuracy ?? null,
        locationSource: fix ? 'gps' : (base.currentLocation?.locationSource || 'manual'),
        source:'auto_stop',
      };

      const updated = commitTimelineForDay(closePreviousAndStart(existing, ev), day, base);

      return {
        ...base,
        activeDay: day,
        currentStatus:'ON',
        currentReason:'Stopped / On Duty',
        currentLocation:{ city, state:stateCode, lat:fix?.lat ?? base.currentLocation?.lat, lng:fix?.lng ?? base.currentLocation?.lng, locationSource: fix ? 'gps' : (base.currentLocation?.locationSource || 'manual') },
        selectedEventId: ev.id,
        gpsTrip: base.gpsTrip ? { ...base.gpsTrip, status:'stopped', stoppedAt:Date.now() } : base.gpsTrip,
        eventsByDay:{ ...base.eventsByDay, [day]: updated },
        sheet:null,
      };
    });
  }

  if (state.view === 'logs') return (
    <>
      <HomeScreen
        state={state}
        onOpenDay={openDay}
        onReset={reset}
        onOpenStatus={()=>setState(s=>({ ...s, sheet:{ type:'status' } }))}
        onOpenTrailer={()=>setState(s=>({ ...s, sheet:{ type:'equipment' } }))}
        onOpenGps={()=>setState(s=>({ ...s, gpsPanelOpen:true }))}
        onOpenUnsigned={()=>setState(s=>({ ...s, view:'unsigned', sheet:null }))}
        onOpenDot={()=>setState(s=>({ ...s, view:'dot', sheet:null }))}
      />
      <DriveTrackerSheet state={state} open={!!state.gpsPanelOpen} onClose={()=>setState(s=>({ ...s, gpsPanelOpen:false }))} onStartDriving={startGpsDriving} onStopDriving={stopGpsDriving} onUpdateTrip={updateGpsTrip} onMotionDetected={startDrivingFromMotion} onAutoStopped={stopDrivingToOnDuty} />
      <DrivingFocusScreen
        open={!state.sheet && liveCurrent.status === 'D' && state.gpsTrip?.status === 'active'}
        state={state}
        liveCurrent={liveCurrent}
        onStopDriving={stopGpsDriving}
        onStopToOnDuty={stopDrivingToOnDuty}
        onOpenLog={()=>setState(s=>({ ...s, view:'day', gpsPanelOpen:false }))}
      />
      {state.sheet?.type === 'equipment' && <EquipmentSheet equipment={state.equipment || {}} onClose={()=>setState(s=>({ ...s, sheet:null }))} onSave={saveEquipment} />}
      {state.sheet?.type === 'status' && <StatusWorkflowSheet state={{...state, currentStatus: state.currentStatus || 'OFF', currentReason: state.currentReason || 'Off Duty', currentLocation: state.currentLocation}} onClose={()=>setState(s=>({ ...s, sheet:null }))} onApplyStatus={closeLastAndAddStatus} onStartDriving={startDrivingFromStatus} />}
    </>
  );
  if (state.view === 'unsigned') return (
    <UnsignedLogsScreen
      state={state}
      days={signableLogDays(state)}
      onBack={()=>setState(s=>({ ...s, view:'logs', sheet:null }))}
      onOpenDay={openDay}
      onSignDay={(day)=>signLogDay(day, {})}
    />
  );

  if (state.view === 'dot') return <DotMode state={state} onBack={() => setState(s => ({ ...s, view:'day' }))} />;

  return (
    <>
      <DayLogScreen
        state={state}
        onToggleGps={()=>setState(s=>({ ...s, gpsPanelOpen: !s.gpsPanelOpen }))}
        liveCurrent={liveCurrent}
        events={events}
        selectedEvent={selectedEvent}
        onBack={backToLogs}
        onSelect={(id)=>setState(s=>({ ...s, selectedEventId:id }))}
        onOpenAdd={(defaults={})=>setState(s=>({ ...s, sheet:{ type:'add', defaults } }))}
        onOpenEdit={(id)=>setState(s=>({ ...s, selectedEventId:id, sheet:{ type:'edit', id } }))}
        onDelete={deleteEvent}
        onToggleSelectMode={()=>setState(s=>({ ...s, selectMode:!s.selectMode, selectedIds:!s.selectMode?[]:s.selectedIds }))}
        onToggleSelectedId={(id)=>setState(s=>({ ...s, selectedIds:s.selectedIds.includes(id)?s.selectedIds.filter(x=>x!==id):[...s.selectedIds,id] }))}
        onSelectAll={()=>setState(s=>({ ...s, selectMode:true, selectedIds:events.map(e=>e.id) }))}
        onClearSelection={()=>setState(s=>({ ...s, selectedIds:[] }))}
        onOpenShift={()=>setState(s=>({ ...s, sheet:{ type:'shift' }, selectMode:true }))}
        onMoveSelected={moveSelectedEventInline}
        onCertify={certify}
        onTools={()=>setState(s=>({ ...s, sheet:{ type:'tools' } }))}
        onOpenStatus={()=>setState(s=>({ ...s, sheet:{ type:'status' } }))}
        onOpenTrailer={()=>setState(s=>({ ...s, sheet:{ type:'equipment' } }))}
        onDriverFlow={addDriverWorkflowEvents}
        onSaveLoad={saveLoadInfo}
        onSaveInspection={saveInspection}
        onSaveSignature={saveSignature}
        onRoadGuardFix={applyRoadGuardFix}
        onSaveManualMiles={(id, patch)=>updateEvent(id, patch)}
      />
      <DriveTrackerSheet state={state} open={!!state.gpsPanelOpen} onClose={()=>setState(s=>({ ...s, gpsPanelOpen:false }))} onStartDriving={startGpsDriving} onStopDriving={stopGpsDriving} onUpdateTrip={updateGpsTrip} onMotionDetected={startDrivingFromMotion} onAutoStopped={stopDrivingToOnDuty} />
      <DrivingFocusScreen
        open={!state.sheet && liveCurrent.status === 'D' && state.gpsTrip?.status === 'active'}
        state={state}
        liveCurrent={liveCurrent}
        onStopDriving={stopGpsDriving}
        onStopToOnDuty={stopDrivingToOnDuty}
        onOpenLog={()=>setState(s=>({ ...s, view:'day', gpsPanelOpen:false }))}
      />
      {state.sheet?.type === 'add' && <InsertEditEventSheet defaults={state.sheet.defaults} events={events} onClose={()=>setState(s=>({ ...s, sheet:null }))} onCreate={addEvent} onSave={addEvent} onUpdate={updateEvent} />}
      {state.sheet?.type === 'edit' && selectedEvent && <EditEventSheet event={selectedEvent} events={events} onClose={()=>setState(s=>({ ...s, sheet:null }))} onSave={(patch)=>updateEvent(selectedEvent.id, patch)} onDelete={()=>deleteEvent(selectedEvent.id)} />}
      {state.sheet?.type === 'shift' && <ShiftSheet events={events} selectedIds={state.selectedIds} onApply={applyShift} onClose={()=>setState(s=>({ ...s, sheet:null }))} />}
      {state.sheet?.type === 'equipment' && <EquipmentSheet equipment={state.equipment || {}} onClose={()=>setState(s=>({ ...s, sheet:null }))} onSave={saveEquipment} />}
      {state.sheet?.type === 'trailer' && <TrailerSheet currentTrailer={state.currentTrailer} onClose={()=>setState(s=>({ ...s, sheet:null }))} onSave={saveTrailerAction} />}
      {state.sheet?.type === 'status' && <StatusWorkflowSheet state={{...state, currentStatus: liveCurrent.status, currentReason: liveCurrent.reason, currentLocation: liveCurrent.location}} onClose={()=>setState(s=>({ ...s, sheet:null }))} onApplyStatus={closeLastAndAddStatus} onStartDriving={startDrivingFromStatus} />}
      {state.sheet?.type === 'tools' && <ToolsSheet onClose={()=>setState(s=>({ ...s, sheet:null }))} onMove={()=>setState(s=>({ ...s, sheet:{ type:'shift' }, selectMode:true }))} onDot={()=>setState(s=>({ ...s, sheet:null, view:'dot' }))} onClearTestDates={clearTestDates} />}
    </>
  );
}
