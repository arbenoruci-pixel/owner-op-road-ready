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
import { displayEventsForDay, currentFromEvents } from '../core/timeline/displayTimeline.js';
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
    eventsByDay[day] = normalizeLogEvents((eventsByDay[day] || []).map(sanitizeCarryoverEvent));
  });

  ensureTodayCarryover(eventsByDay, certifyStatus, today);
  refreshCarryoverIfOnlyPlaceholder(eventsByDay, today);
  const currentFromCarry = (eventsByDay[today] || []).length ? sorted(eventsByDay[today])[0] : null;

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
    signatureByDay: s.signatureByDay || {},
    driverSignature: s.driverSignature || null,
    equipment: s.equipment || { type:'intermodal', chassis:'', container:'', seal:'', rail:'', note:'' },
    gpsTrip: s.gpsTrip || null,
    loadInfo: s.loadInfo || { loadNo:'', broker:'', pickupCity:'Chicago', pickupState:'IL', deliveryCity:'', deliveryState:'', appointment:'' },
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
        const eventsByDay = { ...s.eventsByDay };
        const certifyStatus = { ...s.certifyStatus };
        const before = JSON.stringify(eventsByDay[today] || []);
        ensureTodayCarryover(eventsByDay, certifyStatus, today);
        refreshCarryoverIfOnlyPlaceholder(eventsByDay, today);
        const after = JSON.stringify(eventsByDay[today] || []);
        if (before !== after || !s.eventsByDay?.[today]) return { ...s, eventsByDay, certifyStatus };
        return s;
      });
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const rawEvents = useMemo(() => normalizeLogEvents(state.eventsByDay[state.activeDay] || []), [state.eventsByDay, state.activeDay]);
  const events = useMemo(() => displayEventsForDay(rawEvents, isToday(state.activeDay)), [rawEvents, state.activeDay]);
  const liveCurrent = useMemo(() => currentFromEvents(events, state.currentStatus || 'OFF', state.currentLocation || { city:'GPS', state:'UNK' }, state.currentReason || 'Off Duty'), [events, state.currentStatus, state.currentLocation, state.currentReason]);
  const selectedEvent = events.find(e => e.id === state.selectedEventId) || null;

  function updateDay(day, eventsNext) {
    return { ...state, eventsByDay: { ...state.eventsByDay, [day]: normalizeLogEvents(eventsNext) } };
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

      return { ...s, view:'day', activeDay:day, eventsByDay, certifyStatus, selectedEventId:null, selectMode:false, selectedIds:[], sheet:null };
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
      const toAdd = incoming.map((e,i)=>({ id:`ev_${stamp}_${i}`, city:s.currentLocation?.city || 'GPS', state:s.currentLocation?.state || 'UNK', description:'', note:'Other', source:'manual', ...e }));
      const dayEvents = (s.eventsByDay[s.activeDay] || []).filter(e => !e.carriedFromPreviousDay);
      let merged = normalizeLogEvents(insertManyOverride(dayEvents, toAdd));
      let next = { ...s, eventsByDay:{ ...s.eventsByDay, [s.activeDay]: merged }, selectedEventId: toAdd[toAdd.length-1]?.id || null, sheet:null };
      const preTripAdded = toAdd.find(e => isPreTripStatus(e.status, `${e.note || ''} ${e.description || ''}`));
      next = withAcceptedPreTripInspection(next, s.activeDay, preTripAdded, acceptedInspection);
      next = reconcilePreTripInspections(next, [s.activeDay]);
      return markRecert(next);
    });
  }

  function updateEvent(id, patch) {
    const currentEvent = (state.eventsByDay?.[state.activeDay] || []).find(event => event.id === id) || {};
    const previewEventForPrompt = { ...currentEvent, ...patch };
    const acceptedInspection = maybeAcceptInspectionForEvent(state, state.activeDay, previewEventForPrompt);
    setState(s => {
      const evs = normalizeLogEvents(applyEditOverride((s.eventsByDay[s.activeDay] || []), id, patch));
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

      let next = { ...s, gpsTrip, eventsByDay:{ ...s.eventsByDay, [s.activeDay]: evs } };
      const editedEvent = evs.find(e => e.id === id);
      next = withAcceptedPreTripInspection(next, s.activeDay, editedEvent, acceptedInspection);
      next = reconcilePreTripInspections(next, [s.activeDay]);
      return markRecert(next);
    });
  }

  function deleteEvent(id) {
    setState(s => {
      const evs = normalizeLogEvents((s.eventsByDay[s.activeDay] || []).filter(e => e.id !== id));
      let next = { ...s, eventsByDay:{ ...s.eventsByDay, [s.activeDay]: evs }, selectedEventId:null, sheet:null };
      next = reconcilePreTripInspections(next, [s.activeDay]);
      return markRecert(next);
    });
  }

  function applyShift(delta) {
    setState(s => {
      const selected = new Set(s.selectedIds);
      const evs = normalizeLogEvents((s.eventsByDay[s.activeDay] || []).map(e => selected.has(e.id) ? { ...e, startMin:e.startMin+delta, endMin:e.endMin+delta } : e));
      let next = { ...s, eventsByDay:{ ...s.eventsByDay, [s.activeDay]: sorted(evs) }, sheet:null };
      next = reconcilePreTripInspections(next, [s.activeDay]);
      return markRecert(next);
    });
  }

  function moveSelectedEventInline(id, delta) {
    const dayEvents = state.eventsByDay?.[state.activeDay] || [];
    const event = dayEvents.find(e => e.id === id);
    if (!event || !delta) return;
    const boundedDelta = Math.max(-event.startMin, Math.min(1439 - event.endMin, delta));
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

      let next = {
        ...s,
        currentStatus,
        currentReason,
        currentLocation,
        selectedEventId: toAdd[toAdd.length - 1]?.id || s.selectedEventId,
        eventsByDay:{ ...s.eventsByDay, [day]: merged },
      };
      const workflowPreTrip = toAdd.find(e => isPreTripStatus(e.status, `${e.note || ''} ${e.description || ''}`));
      next = withAcceptedPreTripInspection(next, day, workflowPreTrip, acceptedWorkflowInspection);
      next = reconcilePreTripInspections(next, [day]);
      return markDayRecert(next, day);
    });
  }

  function saveLoadInfo(payload) {
    setState(s => ({
      ...s,
      loadInfo: { ...(s.loadInfo || {}), ...payload },
      currentLocation: {
        city: payload.pickupCity || s.currentLocation?.city || 'Chicago',
        state: payload.pickupState || s.currentLocation?.state || 'IL',
      },
    }));
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
      if (!s.gpsTrip || s.gpsTrip.status !== 'active') return s;
      const last = s.gpsTrip.lastPoint;
      let miles = 0;
      if (last) {
        const raw = haversineMiles(last, fix);
        if (raw >= 0.005 && raw <= 5) miles = raw;
      }
      const stateCode = fix.state || detectState(fix.lat, fix.lng);
      const milesByState = miles ? addMilesByState(s.gpsTrip.milesByState || {}, stateCode, miles) : (s.gpsTrip.milesByState || {});
      const nowMinValue = new Date().getHours() * 60 + new Date().getMinutes();
      const dayEvents = normalizeLogEvents((s.eventsByDay[s.activeDay] || []).map(e =>
        e.id === s.gpsTrip.eventId ? { ...e, endMin: Math.max(e.startMin + 1, nowMinValue), state: e.state || stateCode } : e
      ));
      return {
        ...s,
        gpsTrip:{
          ...s.gpsTrip,
          lastPoint: fix,
          points: [...(s.gpsTrip.points || []), fix].slice(-1000),
          milesByState,
          totalMiles: Number(((s.gpsTrip.totalMiles || 0) + miles).toFixed(2)),
        },
        currentLocation:{ city:s.currentLocation?.city || 'GPS', state:stateCode },
        eventsByDay:{ ...s.eventsByDay, [s.activeDay]: dayEvents },
      };
    });
  }

  function stopGpsDriving() {
    setState(s => {
      if (!s.gpsTrip) return s;
      return {
        ...s,
        gpsTrip:{ ...s.gpsTrip, status:'stopped', stoppedAt:Date.now() },
        sheet:{ type:'status' },
      };
    });
  }

  function signLogDay(day = state.activeDay, payload = {}) {
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

      return {
        ...s,
        driverSignature: latestSignature,
        signatureByDay:{
          ...(s.signatureByDay || {}),
          [day]: {
            ...((s.signatureByDay || {})[day] || {}),
            driverName,
            signatureDataUrl: latestSignature.dataUrl,
            signed: true,
            signedAt: Date.now(),
          },
        },
        certifyStatus:{ ...s.certifyStatus, [day]:'Certified' },
      };
    });
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
        roadGuardTabRequest: { tab:'form', at:Date.now() },
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
        roadGuardTabRequest:{ tab:'form', at:Date.now() },
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


  function closeLastAndAddStatus({ status, reason, city, state: st, description='', droppedTrailer='', hookedTrailer='', lat=null, lng=null, gpsAccuracy=null, locationSource='manual' }) {
    const acceptedLiveInspection = maybeAcceptInspectionForEvent(state, state.activeDay, { status, note:reason, description, city, state:st });
    setState(s => {
      const changeAt = Math.max(0, Math.min(1439, new Date().getHours() * 60 + new Date().getMinutes()));
      const day = s.activeDay;
      const existing = [...(s.eventsByDay[day] || [])].sort((a,b)=>a.startMin-b.startMin);
      const closed = existing.map((e, idx) => idx === existing.length - 1 ? { ...e, endMin: Math.max(e.startMin + 5, changeAt) } : e);
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
      const ev = {
        id: `live_${Date.now()}`,
        status,
        specialMode: reason === 'Yard Move' ? 'yard_move' : (reason === 'Personal Conveyance' ? 'personal_conveyance' : 'none'),
        startMin: changeAt,
        endMin: Math.min(1439, changeAt + 1),
        city,
        state: st,
        description,
        note,
        lat,
        lng,
        gpsAccuracy,
        locationSource,
        source: 'live_status',
      };
      const continuous = normalizeLogEvents(closePreviousAndStart(existing, ev));
      let next = {
        ...s,
        currentStatus: status,
        currentReason: reason,
        currentLocation: { city, state: st, lat, lng, gpsAccuracy, locationSource },
        currentTrailer: trailer,
        selectedEventId: ev.id,
        sheet: null,
        eventsByDay: { ...s.eventsByDay, [day]: continuous },
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
      const today = localDayKey(now);
      const day = s.activeDay === today ? s.activeDay : today;
      const changeAt = Math.max(0, Math.min(1439, now.getHours() * 60 + now.getMinutes()));
      const stateCode = fix?.state || s.currentLocation?.state || detectState(fix?.lat || 0, fix?.lng || 0);
      const city = s.currentLocation?.city || 'GPS';
      const existing = s.eventsByDay[day] || [];

      const ev = {
        id: `auto_on_${Date.now()}`,
        status:'ON',
        startMin: changeAt,
        endMin: Math.min(1439, changeAt + 1),
        city,
        state: stateCode,
        description:'',
        note:'Stopped / On Duty',
        lat: fix?.lat ?? null,
        lng: fix?.lng ?? null,
        gpsAccuracy: fix?.accuracy ?? null,
        locationSource: fix ? 'gps' : (s.currentLocation?.locationSource || 'manual'),
        source:'auto_stop',
      };

      const updated = normalizeLogEvents(closePreviousAndStart(existing, ev));

      return {
        ...s,
        activeDay: day,
        currentStatus:'ON',
        currentReason:'Stopped / On Duty',
        currentLocation:{ city, state:stateCode, lat:fix?.lat ?? s.currentLocation?.lat, lng:fix?.lng ?? s.currentLocation?.lng, locationSource: fix ? 'gps' : (s.currentLocation?.locationSource || 'manual') },
        selectedEventId: ev.id,
        gpsTrip: s.gpsTrip ? { ...s.gpsTrip, status:'stopped', stoppedAt:Date.now() } : s.gpsTrip,
        eventsByDay:{ ...s.eventsByDay, [day]: updated },
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
      <DrivingFocusScreen open={!state.sheet && liveCurrent.status === 'D'} state={state} liveCurrent={liveCurrent} onStopDriving={stopGpsDriving} onStopToOnDuty={stopDrivingToOnDuty} onOpenLog={()=>setState(s=>({ ...s, view:'day', gpsPanelOpen:false }))} />
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
      />
      <DriveTrackerSheet state={state} open={!!state.gpsPanelOpen} onClose={()=>setState(s=>({ ...s, gpsPanelOpen:false }))} onStartDriving={startGpsDriving} onStopDriving={stopGpsDriving} onUpdateTrip={updateGpsTrip} onMotionDetected={startDrivingFromMotion} onAutoStopped={stopDrivingToOnDuty} />
      <DrivingFocusScreen open={!state.sheet && liveCurrent.status === 'D'} state={state} liveCurrent={liveCurrent} onStopDriving={stopGpsDriving} onStopToOnDuty={stopDrivingToOnDuty} onOpenLog={()=>setState(s=>({ ...s, view:'day', gpsPanelOpen:false }))} />
      {state.sheet?.type === 'add' && <InsertEditEventSheet defaults={state.sheet.defaults} events={events} onClose={()=>setState(s=>({ ...s, sheet:null }))} onCreate={addEvent} onSave={addEvent} onUpdate={updateEvent} />}
      {state.sheet?.type === 'edit' && selectedEvent && <EditEventSheet event={selectedEvent} events={events} onClose={()=>setState(s=>({ ...s, sheet:null }))} onSave={(patch)=>updateEvent(selectedEvent.id, patch)} onDelete={()=>deleteEvent(selectedEvent.id)} />}
      {state.sheet?.type === 'shift' && <ShiftSheet events={events} selectedIds={state.selectedIds} onApply={applyShift} onClose={()=>setState(s=>({ ...s, sheet:null }))} />}
      {state.sheet?.type === 'equipment' && <EquipmentSheet equipment={state.equipment || {}} onClose={()=>setState(s=>({ ...s, sheet:null }))} onSave={saveEquipment} />}
      {state.sheet?.type === 'trailer' && <TrailerSheet currentTrailer={state.currentTrailer} onClose={()=>setState(s=>({ ...s, sheet:null }))} onSave={saveTrailerAction} />}
      {state.sheet?.type === 'status' && <StatusWorkflowSheet state={{...state, currentStatus: liveCurrent.status, currentReason: liveCurrent.reason, currentLocation: liveCurrent.location}} onClose={()=>setState(s=>({ ...s, sheet:null }))} onApplyStatus={closeLastAndAddStatus} onStartDriving={startDrivingFromStatus} />}
      {state.sheet?.type === 'tools' && <ToolsSheet onClose={()=>setState(s=>({ ...s, sheet:null }))} onMove={()=>setState(s=>({ ...s, sheet:{ type:'shift' }, selectMode:true }))} onDot={()=>setState(s=>({ ...s, sheet:null, view:'dot' }))} />}
    </>
  );
}
