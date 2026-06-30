export function sortEvents(events) {
  return [...(events || [])].filter(Boolean).sort((a, b) => Number(a.startMin || 0) - Number(b.startMin || 0));
}

function cleanEvent(e) {
  const start = Math.max(0, Math.min(1439, Math.round(Number(e.startMin || 0))));
  const end = Math.max(start + 1, Math.min(1440, Math.round(Number(e.endMin ?? start + 1))));
  return { ...e, startMin: start, endMin: end };
}

function hasText(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function sameText(a, b) {
  const aa = typeof a === 'string' ? a.trim().toLowerCase() : '';
  const bb = typeof b === 'string' ? b.trim().toLowerCase() : '';
  return aa === bb;
}

function mergeableSameStatus(last, current) {
  if (!last || !current || last.status !== current.status) return false;
  const touches = Number(current.startMin || 0) === Number(last.endMin || 0);
  const overlaps = Number(current.startMin || 0) < Number(last.endMin || 0);
  if (!touches && !overlaps) return false;

  // Only auto-merge adjacent/touching same-status rows when their text is
  // effectively the same or one side is blank. This prevents stale notes from
  // a replaced ON DUTY Pre-trip event being glued onto a new OFF DUTY block.
  const notesCompatible = !hasText(last.note) || !hasText(current.note) || sameText(last.note, current.note);
  const descriptionsCompatible = !hasText(last.description) || !hasText(current.description) || sameText(last.description, current.description);
  return notesCompatible && descriptionsCompatible;
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
      merged[merged.length - 1] = {
        ...last,
        endMin: Math.max(last.endMin, ev.endMin),
        city: ev.city || last.city,
        state: ev.state || last.state,
        lat: ev.lat ?? last.lat,
        lng: ev.lng ?? last.lng,
        gpsAccuracy: ev.gpsAccuracy ?? last.gpsAccuracy,
        locationSource: ev.locationSource || last.locationSource,
        note: latestText(last.note, ev.note),
        description: latestText(last.description, ev.description),
        source: last.source === ev.source ? last.source : (ev.source || last.source),
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

export function previewInsertOverride(events, newEventOrEvents) {
  const incoming = Array.isArray(newEventOrEvents) ? newEventOrEvents : [newEventOrEvents];
  return insertManyOverride(events, incoming);
}
