import { sanitizeLogText, combineLogText } from '../../shared/utils/logText.js';

export function sortEvents(events) {
  return [...(events || [])].filter(Boolean).sort((a, b) => Number(a.startMin || 0) - Number(b.startMin || 0));
}

function cleanEvent(e) {
  const start = Math.max(0, Math.min(1439, Math.round(Number(e.startMin || 0))));
  const end = Math.max(start + 1, Math.min(1440, Math.round(Number(e.endMin ?? start + 1))));
  return {
    ...e,
    startMin: start,
    endMin: end,
    note: sanitizeLogText(e.note || ''),
    description: sanitizeLogText(e.description || ''),
  };
}

function hasText(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function hasEventSpecificRouteData(event = {}) {
  return !!(
    event.shippingDocs || event.loadNo || event.bol || event.po ||
    event.destination || event.destinationState || event.loadLinkId ||
    event.deliveredLoadNo || event.pickedUpLoadNo ||
    (Array.isArray(event.transitionLoadNos) && event.transitionLoadNos.length)
  );
}

function onDutyActivityKey(event = {}) {
  const text = normalizeTextPart(`${event.note || ''} ${event.description || ''}`).toLowerCase();
  if (/pickup|pick up|loading/.test(text)) return 'pickup';
  if (/delivery|unloading|drop\s*off|delivered/.test(text)) return 'delivery';
  if (/drop\s*&\s*hook|drop and hook|hook empty|reposition/.test(text)) return 'equipment';
  if (/pre[- ]?trip|inspection/.test(text)) return 'inspection';
  if (/fuel/.test(text)) return 'fuel';
  if (/waiting/.test(text)) return 'waiting';
  return text.replace(/\s+/g, ' ').trim() || 'on-duty';
}

function mergeableSameStatus(last, current) {
  if (!last || !current || last.status !== current.status) return false;
  const touches = Number(current.startMin || 0) === Number(last.endMin || 0);
  const overlaps = Number(current.startMin || 0) < Number(last.endMin || 0);
  if (!touches && !overlaps) return false;

  // Overlap cleanup still collapses duplicate/invalid rows. For clean touching
  // ON DUTY rows, preserve separate activities (Pre-trip, Pickup, Fuel, etc.)
  // and preserve event-specific load/route metadata on the exact event.
  if (last.status === 'ON' && touches && !overlaps) {
    if (hasEventSpecificRouteData(last) || hasEventSpecificRouteData(current)) {
      return last.id === current.id;
    }
    return onDutyActivityKey(last) === onDutyActivityKey(current);
  }

  return true;
}

function normalizeTextPart(value) {
  return sanitizeLogText(typeof value === 'string' ? value.trim() : '');
}

function sameText(a, b) {
  return normalizeTextPart(a).toLowerCase() === normalizeTextPart(b).toLowerCase();
}

function splitTextParts(value) {
  return normalizeTextPart(value)
    .split(/\s+[·•|]\s+|\s*\n\s*/g)
    .map(part => part.trim())
    .filter(Boolean);
}

function combineText(lastText, currentText) {
  return combineLogText(lastText, currentText);
}

function latestText(lastText, currentText) {
  return hasText(currentText) ? currentText.trim() : (hasText(lastText) ? lastText.trim() : '');
}

function latestLocation(last, current) {
  return {
    city: current.city || last.city,
    state: current.state || last.state,
    lat: current.lat ?? last.lat ?? null,
    lng: current.lng ?? last.lng ?? null,
    gpsAccuracy: current.gpsAccuracy ?? last.gpsAccuracy ?? null,
    locationSource: current.locationSource || last.locationSource || 'manual',
  };
}

export function normalizeLogEvents(events = []) {
  const ordered = sortEvents((events || []).filter(Boolean))
    .map(e => cleanEvent({ ...e }))
    .filter(e => e.endMin > e.startMin && !e.voided);

  const merged = [];

  for (const ev of ordered) {
    const last = merged[merged.length - 1];

    // Same duty status and touching/overlapping time should be one continuous block.
    // This removes exact duplicates too.
    if (mergeableSameStatus(last, ev)) {
      const manualMiles = Math.max(0, Number(last.manualMiles || 0)) + Math.max(0, Number(ev.manualMiles || 0));
      merged[merged.length - 1] = {
        ...last,
        endMin: Math.max(last.endMin, ev.endMin),
        // A RODS location belongs to the duty-status change at the START of
        // the continuous block. A later same-status row must never rewrite a
        // historical OFF/SB/ON location on this or another day.
        city: last.city || ev.city,
        state: last.state || ev.state,
        lat: last.lat ?? ev.lat ?? null,
        lng: last.lng ?? ev.lng ?? null,
        gpsAccuracy: last.gpsAccuracy ?? ev.gpsAccuracy ?? null,
        locationSource: last.locationSource || ev.locationSource || 'manual',
        note: combineText(last.note, ev.note),
        description: combineText(last.description, ev.description),
        source: last.source === ev.source ? last.source : (last.source || ev.source),
        shippingDocs: last.shippingDocs || ev.shippingDocs || '',
        loadNo: last.loadNo || ev.loadNo || '',
        bol: last.bol || ev.bol || '',
        po: last.po || ev.po || '',
        destination: last.destination || ev.destination || '',
        destinationState: last.destinationState || ev.destinationState || '',
        loadLinkId: last.loadLinkId || ev.loadLinkId || '',
        noLoadDeclared: !!(last.noLoadDeclared || ev.noLoadDeclared),
        noLoadNote: last.noLoadNote || ev.noLoadNote || '',
        ...(manualMiles > 0 ? {
          manualMiles: Number(manualMiles.toFixed(2)),
          manualMilesState: last.manualMilesState || ev.manualMilesState,
          manualMilesReviewedAt: Math.max(Number(last.manualMilesReviewedAt || 0), Number(ev.manualMilesReviewedAt || 0)) || undefined,
          manualMilesSource: last.manualMilesSource || ev.manualMilesSource,
          manualMilesSuggestion: last.manualMilesSuggestion || ev.manualMilesSuggestion,
        } : {}),
      };
      continue;
    }

    merged.push(ev);
  }

  return merged;
}


export function targetEndForDay(isCurrentDay = false, nowMinute = null) {
  const currentMinute = nowMinute == null ? null : Number(nowMinute);
  if (!isCurrentDay) return 1440;
  if (!Number.isFinite(currentMinute)) return 1440;
  return Math.max(0, Math.min(1440, Math.round(currentMinute)));
}

export function makeContinuousLogEvents(events = [], options = {}) {
  const {
    isCurrentDay = false,
    nowMinute = null,
    fillStartWith = null,
    startLocation = null,
  } = options || {};

  const evs = normalizeLogEvents(events).map(e => ({ ...e }));
  if (!evs.length) return evs;

  const targetEnd = targetEndForDay(isCurrentDay, nowMinute);
  const out = [];
  const first = evs[0];

  if (fillStartWith && Number(first.startMin || 0) > 0) {
    const sameAsFirst = fillStartWith === first.status;
    out.push({
      id: sameAsFirst ? (first.id || 'coverage_start_first') : `coverage_start_${first.id || 'first'}`,
      status: fillStartWith,
      startMin: 0,
      endMin: Math.max(1, Math.min(1440, Number(first.startMin || 0))),
      city: startLocation?.city || first.city || '',
      state: startLocation?.state || first.state || '',
      // If the start-of-day bridge is the same duty status as the first real
      // event, use the same text so normalizeLogEvents merges it into one clean
      // continuous row instead of showing an artificial duplicate segment.
      note: sameAsFirst ? (first.note || '') : 'Carry-forward coverage',
      description: sameAsFirst ? (first.description || '') : 'Review actual status if this is not correct',
      source: sameAsFirst ? (first.source || 'timeline_continuity') : 'timeline_continuity',
      syntheticCoverage: !sameAsFirst,
    });
  }

  for (let i = 0; i < evs.length; i += 1) {
    const current = { ...evs[i] };
    const next = evs[i + 1];

    if (next) {
      // A duty status remains in effect until the next duty-status change.
      // Raw endMin values that stop early create illegal visual/log gaps, so
      // the display/compliance timeline carries the current status to next.startMin.
      const nextStart = Math.max(current.startMin + 1, Math.min(1440, Number(next.startMin || current.endMin || current.startMin + 1)));
      current.endMin = nextStart;
    } else {
      const carriedEnd = Math.max(Number(current.endMin || 0), targetEnd);
      current.endMin = Math.max(current.startMin + 1, Math.min(1440, carriedEnd));
      if (isCurrentDay && targetEnd < Number(current.endMin || 0)) {
        current.endMin = Math.max(current.startMin + 1, targetEnd);
      }
    }

    if (current.endMin > current.startMin) out.push(current);
  }

  return normalizeLogEvents(out);
}


// v95.54 duty-status override guard.
// A manual insert must never silently delete the day's last stored event when
// the new event has a DIFFERENT duty status and reaches past its end. This is
// the "ON Pre-trip turned into DRIVING" bug: live status changes store a short
// raw row (start..start+1) and the display extends it to now, so a Driving
// insert defaulted to "15 min ago" fully covered the raw ON row and
// insertEventOverride deleted it. The guard keeps the previous event and
// starts the new status where the previous stored row ends ("Pre-trip kept").
// An EXACT cover (same startMin and endMin) is still allowed to replace the
// event, because that is an explicit overwrite of that precise block.
export function protectLiveTailFromInsert(baseEvents = [], incoming = []) {
  const ordered = sortEvents((baseEvents || []).filter(Boolean));
  const tail = ordered[ordered.length - 1] || null;
  if (!tail) return (incoming || []).filter(Boolean);

  const tailStart = Number(tail.startMin || 0);
  const tailEnd = Number(tail.endMin || 0);

  return (incoming || []).filter(Boolean).map(ev => {
    if (!ev || ev.status === tail.status) return ev;
    const s = Number(ev.startMin || 0);
    const e = Number(ev.endMin || 0);
    const coversWholeTail = s <= tailStart && e >= tailEnd;
    const exactCover = s === tailStart && e === tailEnd;
    const extendsPastTail = e > tailEnd;
    if (coversWholeTail && !exactCover && extendsPastTail) {
      return { ...ev, startMin: Math.min(tailEnd, Math.max(0, e - 1)) };
    }
    return ev;
  });
}

export function insertEventOverride(events, newEvent) {
  const insert = cleanEvent(newEvent);
  const out = [];

  for (const original of sortEvents(events)) {
    const e = cleanEvent(original);

    if (e.id === insert.id) continue;

    if (e.endMin <= insert.startMin || e.startMin >= insert.endMin) {
      out.push(e);
      continue;
    }

    // Full cover: inserted event replaces/deletes old event.
    if (insert.startMin <= e.startMin && insert.endMin >= e.endMin) {
      continue;
    }

    // Middle cut: split old event around inserted event.
    if (e.startMin < insert.startMin && e.endMin > insert.endMin) {
      out.push({ ...e, id:`${e.id}_left_${insert.id}`, endMin: insert.startMin });
      out.push({ ...e, id:`${e.id}_right_${insert.id}`, startMin: insert.endMin });
      continue;
    }

    // Right side covered: trim end.
    if (e.startMin < insert.startMin && e.endMin > insert.startMin) {
      out.push({ ...e, endMin: insert.startMin });
      continue;
    }

    // Left side covered: trim start.
    if (e.startMin < insert.endMin && e.endMin > insert.endMin) {
      out.push({ ...e, startMin: insert.endMin });
      continue;
    }
  }

  out.push(insert);
  return normalizeLogEvents(out);
}

export function insertManyOverride(events, newEvents) {
  return normalizeLogEvents((newEvents || []).reduce((acc, ev) => insertEventOverride(acc, ev), events || []));
}

export function applyEditOverride(events, id, patch) {
  const original = events.find(e => e.id === id);
  if (!original) return normalizeLogEvents(events);

  const edited = cleanEvent({ ...original, ...patch, id });
  const others = sortEvents(events).filter(e => e.id !== id);
  return normalizeLogEvents(insertEventOverride(others, edited));
}

export function applyPatchWithNeighbors(events, id, patch) {
  let evs = sortEvents(events).map(e => e.id === id ? { ...e, ...patch } : { ...e });
  let idx = evs.findIndex(e => e.id === id);
  if (idx < 0) return normalizeLogEvents(evs);

  evs = sortEvents(evs);
  idx = evs.findIndex(e => e.id === id);
  const current = evs[idx];

  if (patch.startMin !== undefined && idx > 0) {
    evs[idx - 1].endMin = Math.max(evs[idx - 1].startMin + 1, current.startMin);
  }

  if (patch.endMin !== undefined && idx < evs.length - 1) {
    evs[idx + 1].startMin = Math.max(current.endMin, current.startMin + 1);
  }

  return normalizeLogEvents(evs);
}

export function closePreviousAndStart(events, newEvent) {
  const insert = cleanEvent(newEvent);
  const evs = sortEvents(events).map(e => cleanEvent({ ...e }));
  const previous = [...evs].reverse().find(e => e.id !== insert.id && Number(e.startMin || 0) < insert.startMin);

  // Status changes are start-time based. If the previous raw event ended early,
  // carry it forward to the new status start so the stored timeline does not
  // develop a gap before the new event.
  if (previous && Number(previous.endMin || 0) < insert.startMin) {
    previous.endMin = Math.max(previous.startMin + 1, insert.startMin);
  }

  return normalizeLogEvents(insertEventOverride(evs, insert));
}


function clampShiftDelta(delta, minDelta, maxDelta) {
  const requested = Math.round(Number(delta || 0));
  if (!Number.isFinite(requested)) return 0;
  return Math.max(minDelta, Math.min(maxDelta, requested));
}

function cleanShiftEvent(event = {}) {
  return cleanEvent({ ...event });
}

function selectedIndexList(events = [], selectedSet = new Set()) {
  return events
    .map((event, index) => selectedSet.has(event.id) ? index : -1)
    .filter(index => index >= 0);
}

function hasOnlyContiguousIndexes(indexes = []) {
  if (indexes.length <= 1) return true;
  for (let i = 1; i < indexes.length; i += 1) {
    if (indexes[i] !== indexes[i - 1] + 1) return false;
  }
  return true;
}

function makeShiftWarning(code, text) {
  return { code, text };
}

function validateShiftedTimeline(events = []) {
  const warnings = [];
  const ordered = sortEvents(events);
  for (const event of ordered) {
    if (Number(event.startMin || 0) < 0 || Number(event.endMin || 0) > 1440) {
      warnings.push(makeShiftWarning('outside_day', 'Would pass midnight'));
    }
    if (Number(event.endMin || 0) <= Number(event.startMin || 0)) {
      warnings.push(makeShiftWarning('zero_event', 'Would remove an event'));
    }
  }
  for (let i = 0; i < ordered.length - 1; i += 1) {
    const a = ordered[i];
    const b = ordered[i + 1];
    const gap = Number(b.startMin || 0) - Number(a.endMin || 0);
    if (gap < 0) warnings.push(makeShiftWarning('overlap', 'Would overlap another event'));
    if (gap > 0) warnings.push(makeShiftWarning('gap', 'Would create a gap'));
  }
  return warnings;
}

function shiftAllDayDutyChanges(events = [], selectedSet = new Set(), deltaMin = 0) {
  const ordered = sortEvents(events).map(cleanShiftEvent);
  const warnings = [];
  if (ordered.length < 2) {
    return { events: ordered, appliedDeltaMin: 0, changedEventIds: [], adjustedNeighborIds: [], warnings, blockedReason: 'No duty changes to shift' };
  }

  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const startsAtMidnight = Number(first.startMin || 0) === 0;
  const endsAtMidnight = Number(last.endMin || 0) === 1440;
  if (!startsAtMidnight || !endsAtMidnight) {
    return { events: ordered, appliedDeltaMin: 0, changedEventIds: [], adjustedNeighborIds: [], warnings, blockedReason: 'All selected events do not cover the full day' };
  }

  const boundaries = ordered.slice(0, -1).map(event => Number(event.endMin || 0));
  const minDelta = 1 - Math.min(...boundaries);
  const maxDelta = 1439 - Math.max(...boundaries);
  const appliedDeltaMin = clampShiftDelta(deltaMin, minDelta, maxDelta);
  if (!appliedDeltaMin) {
    return { events: ordered, appliedDeltaMin: 0, changedEventIds: [], adjustedNeighborIds: [], warnings, blockedReason: 'Shift would move a duty change outside this log day' };
  }
  if (appliedDeltaMin !== Math.round(Number(deltaMin || 0))) {
    warnings.push(makeShiftWarning('clamped', 'Shift limited to keep this log day valid'));
  }

  const shiftedBoundaries = boundaries.map(boundary => boundary + appliedDeltaMin);
  const next = ordered.map((event, index) => {
    const startMin = index === 0 ? 0 : shiftedBoundaries[index - 1];
    const endMin = index === ordered.length - 1 ? 1440 : shiftedBoundaries[index];
    return {
      ...event,
      startMin,
      endMin,
      shiftedAt:Date.now(),
      shiftedByMin:appliedDeltaMin,
      shiftedSource:'manual_duty_change_shift',
    };
  });

  warnings.push(makeShiftWarning('duty_changes', 'Shift duty changes kept 12:00 AM and 12:00 AM fixed'));
  return {
    events: next,
    appliedDeltaMin,
    changedEventIds: ordered.map(event => event.id).filter(id => selectedSet.has(id)),
    adjustedNeighborIds: [],
    warnings: [...warnings, ...validateShiftedTimeline(next).filter(w => w.code === 'overlap' || w.code === 'zero_event')],
    blockedReason: '',
    mode: 'duty_changes',
  };
}

export function shiftSelectedEventsForDay(rawEvents = [], selectedIds = [], deltaMin = 0, options = {}) {
  const preserveCoverage = options.preserveCoverage !== false;
  const requestedDelta = Math.round(Number(deltaMin || 0));
  const selectedSet = new Set((selectedIds || []).filter(Boolean));
  const events = sortEvents(rawEvents || [])
    .filter(Boolean)
    .filter(event => !event.voided)
    .map(cleanShiftEvent);
  const warnings = [];

  if (!events.length) {
    return { events, appliedDeltaMin: 0, changedEventIds: [], adjustedNeighborIds: [], warnings, blockedReason: 'No events on this day' };
  }
  if (!selectedSet.size) {
    return { events, appliedDeltaMin: 0, changedEventIds: [], adjustedNeighborIds: [], warnings, blockedReason: 'Select events first' };
  }
  if (!requestedDelta) {
    return { events, appliedDeltaMin: 0, changedEventIds: [], adjustedNeighborIds: [], warnings, blockedReason: 'Choose a shift amount' };
  }

  const indexes = selectedIndexList(events, selectedSet);
  if (!indexes.length) {
    return { events, appliedDeltaMin: 0, changedEventIds: [], adjustedNeighborIds: [], warnings, blockedReason: 'Selected events were not found' };
  }

  const allSelected = indexes.length === events.length;
  if (allSelected) {
    return shiftAllDayDutyChanges(events, selectedSet, requestedDelta);
  }

  if (!hasOnlyContiguousIndexes(indexes)) {
    return { events, appliedDeltaMin: 0, changedEventIds: [], adjustedNeighborIds: [], warnings, blockedReason: 'Select one continuous block' };
  }

  const firstIdx = indexes[0];
  const lastIdx = indexes[indexes.length - 1];
  const previous = events[firstIdx - 1] || null;
  const nextNeighbor = events[lastIdx + 1] || null;
  const blockStart = Number(events[firstIdx].startMin || 0);
  const blockEnd = Number(events[lastIdx].endMin || 0);

  let minDelta = -blockStart;
  let maxDelta = 1440 - blockEnd;

  if (previous) {
    minDelta = Math.max(minDelta, Number(previous.startMin || 0) + 1 - blockStart);
  } else if (preserveCoverage && blockStart === 0 && requestedDelta > 0) {
    maxDelta = Math.min(maxDelta, 0);
  }

  if (nextNeighbor) {
    maxDelta = Math.min(maxDelta, Number(nextNeighbor.endMin || 0) - 1 - blockEnd);
  } else if (preserveCoverage && blockEnd === 1440 && requestedDelta < 0) {
    minDelta = Math.max(minDelta, 0);
  }

  const appliedDeltaMin = clampShiftDelta(requestedDelta, minDelta, maxDelta);
  if (!appliedDeltaMin) {
    const blockedReason = requestedDelta < 0 ? 'Cannot shift earlier without breaking this log day' : 'Cannot shift later without breaking this log day';
    return { events, appliedDeltaMin: 0, changedEventIds: [], adjustedNeighborIds: [], warnings, blockedReason };
  }
  if (appliedDeltaMin !== requestedDelta) {
    warnings.push(makeShiftWarning('clamped', 'Shift limited to keep this log day valid'));
  }

  const shiftedBlockStart = blockStart + appliedDeltaMin;
  const shiftedBlockEnd = blockEnd + appliedDeltaMin;
  const changedEventIds = [];
  const adjustedNeighborIds = [];

  const nextEvents = events.map((event, index) => {
    if (index >= firstIdx && index <= lastIdx && selectedSet.has(event.id)) {
      changedEventIds.push(event.id);
      return {
        ...event,
        startMin: Number(event.startMin || 0) + appliedDeltaMin,
        endMin: Number(event.endMin || 0) + appliedDeltaMin,
        shiftedAt:Date.now(),
        shiftedByMin:appliedDeltaMin,
        shiftedSource:'manual_day_shift',
      };
    }
    if (previous && index === firstIdx - 1) {
      adjustedNeighborIds.push(event.id);
      return { ...event, endMin: shiftedBlockStart, adjustedForShift:true };
    }
    if (nextNeighbor && index === lastIdx + 1) {
      adjustedNeighborIds.push(event.id);
      return { ...event, startMin: shiftedBlockEnd, adjustedForShift:true };
    }
    return { ...event };
  });

  const validationWarnings = validateShiftedTimeline(nextEvents);
  const hard = validationWarnings.find(w => w.code === 'overlap' || w.code === 'zero_event' || w.code === 'outside_day');
  if (hard) {
    return { events, appliedDeltaMin: 0, changedEventIds: [], adjustedNeighborIds: [], warnings: validationWarnings, blockedReason: hard.text };
  }

  return {
    events: sortEvents(nextEvents),
    appliedDeltaMin,
    changedEventIds,
    adjustedNeighborIds,
    warnings: [...warnings, ...validationWarnings.filter(w => w.code === 'gap')],
    blockedReason: '',
    mode: 'selected_block',
  };
}

export function previewInsertOverride(events, newEventOrEvents) {
  const incoming = Array.isArray(newEventOrEvents) ? newEventOrEvents : [newEventOrEvents];
  return insertManyOverride(events, incoming);
}
