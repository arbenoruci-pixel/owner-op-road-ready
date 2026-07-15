import { sortEvents } from './timelineEngine.js';

function minute(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1440, Math.round(parsed)));
}

function cleanEvent(event = {}) {
  const startMin = minute(event.startMin, 0);
  const endMin = Math.max(startMin + 1, minute(event.endMin, startMin + 1));
  return { ...event, startMin, endMin:Math.min(1440, endMin) };
}

function overlap(a = {}, b = {}) {
  return Number(a.startMin || 0) < Number(b.endMin || 0)
    && Number(a.endMin || 0) > Number(b.startMin || 0);
}

/**
 * EventList renders a continuous/normalized timeline. One displayed row can
 * represent more than one raw stored row, and display-only coverage rows have
 * IDs that do not exist in storage. Resolve the driver's visible selection back
 * to the exact raw event IDs before previewing or saving a shift.
 */
export function resolveRawShiftSelectionV101(rawEvents = [], displayEvents = [], selectedIds = []) {
  const raw = sortEvents(rawEvents || []).filter(Boolean).filter(event => !event.voided).map(cleanEvent);
  const rawById = new Map(raw.map(event => [event.id, event]));
  const displayById = new Map((displayEvents || []).filter(Boolean).map(event => [event.id, event]));
  const chosen = new Set();

  for (const id of selectedIds || []) {
    if (!id) continue;
    const exact = rawById.get(id);
    const displayed = displayById.get(id);
    if (exact) chosen.add(exact.id);

    if (!displayed) continue;
    for (const event of raw) {
      if (event.status !== displayed.status) continue;
      if (!overlap(event, displayed)) continue;
      chosen.add(event.id);
    }
  }

  return raw.filter(event => chosen.has(event.id)).map(event => event.id);
}

function warningsForTimeline(events = []) {
  const warnings = [];
  const ordered = sortEvents(events || []);
  for (const event of ordered) {
    if (event.startMin < 0 || event.endMin > 1440) warnings.push({ code:'outside_day', text:'Would pass midnight' });
    if (event.endMin <= event.startMin) warnings.push({ code:'zero_event', text:'Would remove an event' });
  }
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const gap = Number(ordered[index + 1].startMin || 0) - Number(ordered[index].endMin || 0);
    if (gap < 0) warnings.push({ code:'overlap', text:'Would overlap another event' });
    if (gap > 0) warnings.push({ code:'gap', text:'Timeline has uncovered time' });
  }
  return warnings;
}

function selectedGroups(events = [], selectedSet = new Set()) {
  const indexes = events.map((event, index) => selectedSet.has(event.id) ? index : -1).filter(index => index >= 0);
  const groups = [];
  let current = [];
  for (const index of indexes) {
    if (!current.length || index === current[current.length - 1] + 1) current.push(index);
    else {
      groups.push(current);
      current = [index];
    }
  }
  if (current.length) groups.push(current);
  return { indexes, groups };
}

function shiftFullDayBoundaries(events = [], selectedSet = new Set(), requestedDelta = 0) {
  const ordered = sortEvents(events).map(cleanEvent);
  const boundaries = ordered.slice(0, -1).map(event => Number(event.endMin || 0));
  if (!boundaries.length) {
    return { events:ordered, appliedDeltaMin:0, changedEventIds:[], adjustedNeighborIds:[], warnings:[], blockedReason:'No duty changes to shift' };
  }
  const minDelta = 1 - Math.min(...boundaries);
  const maxDelta = 1439 - Math.max(...boundaries);
  const appliedDeltaMin = Math.max(minDelta, Math.min(maxDelta, requestedDelta));
  if (!appliedDeltaMin) {
    return { events:ordered, appliedDeltaMin:0, changedEventIds:[], adjustedNeighborIds:[], warnings:[], blockedReason:'Shift would move a duty change outside this log day' };
  }
  const shifted = boundaries.map(boundary => boundary + appliedDeltaMin);
  const next = ordered.map((event, index) => ({
    ...event,
    startMin:index === 0 ? 0 : shifted[index - 1],
    endMin:index === ordered.length - 1 ? 1440 : shifted[index],
    shiftedAt:Date.now(),
    shiftedByMin:appliedDeltaMin,
    shiftedSource:'manual_full_day_boundary_shift_v101',
  }));
  return {
    events:next,
    appliedDeltaMin,
    changedEventIds:ordered.map(event => event.id).filter(id => selectedSet.has(id)),
    adjustedNeighborIds:[],
    warnings:appliedDeltaMin === requestedDelta ? [] : [{ code:'clamped', text:'Moved as far as this log day allows' }],
    blockedReason:'',
    mode:'duty_changes',
  };
}

function simulateExactDelta(original = [], groups = [], delta = 0) {
  const later = delta > 0;
  const orderedGroups = later ? [...groups].reverse() : [...groups];
  let working = original.map(event => ({ ...event }));
  const changedEventIds = [];
  const adjustedNeighborIds = [];

  for (const originalGroup of orderedGroups) {
    const groupIds = originalGroup.map(index => original[index]?.id).filter(Boolean);
    const indexes = working.map((event, index) => groupIds.includes(event.id) ? index : -1).filter(index => index >= 0);
    if (!indexes.length) return null;

    const firstIndex = indexes[0];
    const lastIndex = indexes[indexes.length - 1];
    const previous = working[firstIndex - 1] || null;
    const next = working[lastIndex + 1] || null;
    const blockStart = Number(working[firstIndex].startMin || 0);
    const blockEnd = Number(working[lastIndex].endMin || 0);

    let minDelta = -blockStart;
    let maxDelta = 1440 - blockEnd;
    if (previous) minDelta = Math.max(minDelta, Number(previous.startMin || 0) + 1 - blockStart);
    if (next) maxDelta = Math.min(maxDelta, Number(next.endMin || 0) - 1 - blockEnd);
    if (delta < minDelta || delta > maxDelta) return null;

    const shiftedStart = blockStart + delta;
    const shiftedEnd = blockEnd + delta;
    working = working.map((event, index) => {
      if (groupIds.includes(event.id)) {
        changedEventIds.push(event.id);
        return {
          ...event,
          startMin:Number(event.startMin || 0) + delta,
          endMin:Number(event.endMin || 0) + delta,
          shiftedAt:Date.now(),
          shiftedByMin:delta,
          shiftedSource:'manual_multi_event_shift_v101',
        };
      }
      if (previous && index === firstIndex - 1) {
        adjustedNeighborIds.push(event.id);
        return { ...event, endMin:shiftedStart, adjustedForShift:true, adjustedForShiftAt:Date.now() };
      }
      if (next && index === lastIndex + 1) {
        adjustedNeighborIds.push(event.id);
        return { ...event, startMin:shiftedEnd, adjustedForShift:true, adjustedForShiftAt:Date.now() };
      }
      return { ...event };
    });
    working = sortEvents(working);
  }

  const validation = warningsForTimeline(working);
  if (validation.some(item => ['overlap','zero_event','outside_day'].includes(item.code))) return null;
  return {
    events:working,
    changedEventIds:[...new Set(changedEventIds)],
    adjustedNeighborIds:[...new Set(adjustedNeighborIds)],
    warnings:validation.filter(item => item.code === 'gap'),
  };
}

/**
 * Moves all selected raw rows as one or more groups. It preserves every selected
 * duration, adjusts only the neighboring boundaries, and tries a smaller delta
 * when the full requested amount does not fit instead of silently doing nothing.
 */
export function shiftSelectedEventsV101(rawEvents = [], selectedIds = [], deltaMin = 0) {
  const original = sortEvents(rawEvents || []).filter(Boolean).filter(event => !event.voided).map(cleanEvent);
  const selectedSet = new Set((selectedIds || []).filter(Boolean));
  const requested = Math.round(Number(deltaMin || 0));
  const empty = { events:original, appliedDeltaMin:0, changedEventIds:[], adjustedNeighborIds:[], warnings:[] };

  if (!original.length) return { ...empty, blockedReason:'No events on this day' };
  if (!selectedSet.size) return { ...empty, blockedReason:'Select real stored events first' };
  if (!requested) return { ...empty, blockedReason:'Choose a shift amount' };

  const { indexes, groups } = selectedGroups(original, selectedSet);
  if (!indexes.length) return { ...empty, blockedReason:'Selected rows could not be matched to stored events' };

  const allSelected = indexes.length === original.length;
  const fullDayCoverage = Number(original[0]?.startMin || 0) === 0
    && Number(original[original.length - 1]?.endMin || 0) === 1440;
  if (allSelected && fullDayCoverage) return shiftFullDayBoundaries(original, selectedSet, requested);

  const sign = requested < 0 ? -1 : 1;
  const requestedMagnitude = Math.min(1439, Math.abs(requested));
  let simulation = null;
  let appliedMagnitude = 0;
  for (let magnitude = requestedMagnitude; magnitude >= 1; magnitude -= 1) {
    simulation = simulateExactDelta(original, groups, sign * magnitude);
    if (simulation) {
      appliedMagnitude = magnitude;
      break;
    }
  }

  if (!simulation || !appliedMagnitude) {
    return { ...empty, blockedReason:requested < 0 ? 'These events cannot move any earlier' : 'These events cannot move any later' };
  }

  const appliedDeltaMin = sign * appliedMagnitude;
  const warnings = [...(simulation.warnings || [])];
  if (appliedDeltaMin !== requested) warnings.unshift({ code:'clamped', text:`Moved ${appliedMagnitude} minute${appliedMagnitude === 1 ? '' : 's'}, the maximum available` });
  return {
    events:simulation.events,
    appliedDeltaMin,
    changedEventIds:simulation.changedEventIds,
    adjustedNeighborIds:simulation.adjustedNeighborIds,
    warnings,
    blockedReason:'',
    mode:groups.length > 1 ? 'disjoint_selected_groups_v101' : 'selected_block_v101',
  };
}
