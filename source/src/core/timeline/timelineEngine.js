export function sortEvents(events) {
  return [...(events || [])].filter(Boolean).sort((a, b) => Number(a.startMin || 0) - Number(b.startMin || 0));
}

function cleanEvent(e) {
  const start = Math.max(0, Math.min(1439, Math.round(Number(e.startMin || 0))));
  const end = Math.max(start + 1, Math.min(1439, Math.round(Number(e.endMin ?? start + 1))));
  return { ...e, startMin: start, endMin: end };
}

function hasText(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function combineText(a, b) {
  const parts = [a, b].filter(hasText).map(v => v.trim());
  return [...new Set(parts)].join(' / ');
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
    if (
      last &&
      last.status === ev.status &&
      !last.voided &&
      !ev.voided &&
      ev.startMin <= last.endMin
    ) {
      const notes = [last.note, ev.note]
        .filter(Boolean)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .join(' / ');

      const descriptions = [last.description, ev.description]
        .filter(Boolean)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .join(' / ');

      merged[merged.length - 1] = {
        ...last,
        endMin: Math.max(last.endMin, ev.endMin),
        city: ev.city || last.city,
        state: ev.state || last.state,
        lat: ev.lat ?? last.lat,
        lng: ev.lng ?? last.lng,
        gpsAccuracy: ev.gpsAccuracy ?? last.gpsAccuracy,
        locationSource: ev.locationSource || last.locationSource,
        note: notes || last.note || ev.note || '',
        description: descriptions || last.description || ev.description || '',
        source: last.source === ev.source ? last.source : (ev.source || last.source),
      };
      continue;
    }

    merged.push(ev);
  }

  return merged;
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
  const evs = sortEvents(events).map(e => ({ ...e }));
  const insert = cleanEvent(newEvent);
  if (evs.length) {
    const last = evs[evs.length - 1];
    last.endMin = Math.max(last.startMin + 1, insert.startMin);
  }
  evs.push(insert);
  return normalizeLogEvents(evs);
}

export function previewInsertOverride(events, newEventOrEvents) {
  const incoming = Array.isArray(newEventOrEvents) ? newEventOrEvents : [newEventOrEvents];
  return insertManyOverride(events, incoming);
}
