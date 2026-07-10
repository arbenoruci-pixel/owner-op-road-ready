import { normalizeLogEvents, sortEvents } from './timelineEngine.js';

function minute(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1440, Math.round(n)));
}

function currentDayRaw(events = []) {
  return sortEvents(events || [])
    .filter(Boolean)
    .filter(event => !event.voided)
    .map(event => ({
      ...event,
      startMin: minute(event.startMin, 0),
      endMin: Math.max(minute(event.startMin, 0) + 1, minute(event.endMin, minute(event.startMin, 0) + 1)),
    }))
    .filter(event => event.endMin > event.startMin);
}

function suspiciousMidnightDrivingParts(events = [], nowMinute = null) {
  const raw = currentDayRaw(events);
  if (!raw.length || raw.length > 3) return null;
  const event = raw[0];
  if (event.status !== 'D') return null;
  if (event.startMin > 1) return null;
  if (event.endMin < 60) return null;

  const source = String(event.source || '').toLowerCase();
  const id = String(event.id || '').toLowerCase();
  const rolloverTagged = source.includes('gps_drive_rollover')
    || source.includes('driving_rollover')
    || id.includes('gps_drive_');
  if (!rolloverTagged) return null;

  const trailing = raw.slice(1);
  const trailingLooksLikeStop = trailing.every(item => {
    const itemSource = String(item.source || '').toLowerCase();
    const startsAfterDrive = item.startMin >= event.endMin - 1;
    const isShort = item.endMin - item.startMin <= 15;
    return startsAfterDrive
      && isShort
      && (itemSource.includes('auto_stop') || itemSource.includes('live_status'));
  });
  if (!trailingLooksLikeStop) return null;

  if (nowMinute !== null && nowMinute !== undefined && Number.isFinite(Number(nowMinute))) {
    const finalEnd = trailing.at(-1)?.endMin || event.endMin;
    const delta = Math.abs(minute(nowMinute, finalEnd) - finalEnd);
    if (delta > 180) return null;
  }

  return { broad:event, trailing };
}

export function isSuspiciousMidnightDrivingOverwrite(events = [], nowMinute = null) {
  return Boolean(suspiciousMidnightDrivingParts(events, nowMinute));
}

export function applyLiveStatusTransition(events = [], newEvent = {}) {
  const insert = normalizeLogEvents([newEvent])[0];
  if (!insert) return normalizeLogEvents(events || []);

  const preserved = [];
  for (const event of currentDayRaw(events)) {
    if (event.id === insert.id) continue;

    if (event.endMin <= insert.startMin) {
      preserved.push(event);
      continue;
    }

    if (event.startMin < insert.startMin) {
      const trimmedEnd = Math.max(event.startMin + 1, insert.startMin);
      if (trimmedEnd > event.startMin) preserved.push({ ...event, endMin: trimmedEnd });
    }
    // Anything beginning at/after the new live status start is future coverage
    // and is replaced by the new status. Historical rows remain untouched.
  }

  const previous = preserved[preserved.length - 1] || null;
  if (previous && previous.endMin < insert.startMin) {
    preserved[preserved.length - 1] = {
      ...previous,
      endMin: Math.max(previous.startMin + 1, insert.startMin),
    };
  }

  preserved.push(insert);
  return normalizeLogEvents(preserved);
}

export function safeInsertRolloverDriving(existingEvents = [], rolloverEvent = {}) {
  const existing = currentDayRaw(existingEvents);
  const rollover = normalizeLogEvents([rolloverEvent])[0];
  if (!rollover) return normalizeLogEvents(existing);
  if (!existing.length) return normalizeLogEvents([rollover]);

  const first = existing[0];
  const firstStart = minute(first.startMin, 0);

  // A rollover may only fill an uncovered start-of-day gap. It may never
  // overwrite duty-status changes that already exist on the new day.
  if (firstStart <= 0) return normalizeLogEvents(existing);

  const safeEnd = Math.min(minute(rollover.endMin, firstStart), firstStart);
  if (safeEnd <= 0) return normalizeLogEvents(existing);

  return normalizeLogEvents([
    {
      ...rollover,
      startMin: 0,
      endMin: safeEnd,
      source: 'gps_drive_rollover_safe_gap',
    },
    ...existing,
  ]);
}

function rowTimestamp(row = {}) {
  const ts = Date.parse(row.created_at || row.updated_at || '');
  return Number.isFinite(ts) ? ts : 0;
}

function rowToEvent(row = {}, idMap = new Map()) {
  const chainId = row.event_chain_id || '';
  const originalId = idMap.get(chainId) || `recovered_${chainId || row.local_id || Math.random().toString(36).slice(2)}`;
  return {
    id: originalId,
    status: row.status || 'OFF',
    specialMode: row.special_mode || 'none',
    startMin: minute(row.start_min, 0),
    endMin: Math.max(minute(row.start_min, 0) + 1, minute(row.end_min, minute(row.start_min, 0) + 1)),
    city: row.location?.city || '',
    state: row.location?.state || '',
    lat: row.location?.lat ?? null,
    lng: row.location?.lng ?? null,
    locationSource: row.location?.source || 'manual',
    note: row.note || '',
    description: '',
    source: 'recovered_local_history',
    recoveredFromRevisionAt: row.created_at || null,
  };
}

export function recoverEventsFromLocalRevisions({
  currentEvents = [],
  revisionRows = [],
  idMapRows = [],
  nowMinute = null,
} = {}) {
  if (!isSuspiciousMidnightDrivingOverwrite(currentEvents, nowMinute)) return [];

  const suspicious = currentDayRaw(currentEvents)[0];
  const reverseIdMap = new Map();
  for (const row of idMapRows || []) {
    if (row?.mapped_id && row?.source_id) reverseIdMap.set(row.mapped_id, row.source_id);
  }

  const suspiciousChain = [...reverseIdMap.entries()]
    .find(([, sourceId]) => sourceId === suspicious.id)?.[0] || '';

  const sameDayRows = (revisionRows || []).filter(row => row && row.log_date);
  let suspiciousRow = null;
  if (suspiciousChain) {
    suspiciousRow = sameDayRows
      .filter(row => row.event_chain_id === suspiciousChain && row.status === 'D' && minute(row.start_min, 0) <= 1)
      .sort((a, b) => rowTimestamp(b) - rowTimestamp(a))[0] || null;
  }
  if (!suspiciousRow) {
    suspiciousRow = sameDayRows
      .filter(row => row.status === 'D' && minute(row.start_min, 0) <= 1)
      .sort((a, b) => rowTimestamp(b) - rowTimestamp(a))[0] || null;
  }
  if (!suspiciousRow) return [];

  // The broad rollover create and the mass voids it caused are queued almost
  // together. Reconstruct the latest state from before that mutation burst.
  const cutoffMs = Math.max(0, rowTimestamp(suspiciousRow) - 1500);
  const rowsBeforeCorruption = sameDayRows.filter(row => rowTimestamp(row) > 0 && rowTimestamp(row) <= cutoffMs);
  const byChain = new Map();
  for (const row of rowsBeforeCorruption) {
    const chain = row.event_chain_id || row.local_id || row.client_event_id;
    if (!chain || chain === suspiciousChain) continue;
    const prior = byChain.get(chain);
    if (!prior || rowTimestamp(row) > rowTimestamp(prior)) byChain.set(chain, row);
  }

  const recovered = [];
  for (const row of byChain.values()) {
    if (String(row.action || '').toLowerCase() === 'void') continue;
    recovered.push(rowToEvent(row, reverseIdMap));
  }

  const normalized = normalizeLogEvents(recovered);
  const hasNonDriving = normalized.some(event => event.status !== 'D');
  if (normalized.length < 2 || !hasNonDriving) return [];
  return normalized;
}

export function chooseRecoveryCandidate(candidates = []) {
  const usable = (candidates || [])
    .filter(Array.isArray)
    .map(events => normalizeLogEvents(events))
    .filter(events => events.length >= 2)
    .filter(events => events.some(event => event.status !== 'D'));

  if (!usable.length) return [];

  return usable.sort((a, b) => {
    const diversityA = new Set(a.map(event => event.status)).size;
    const diversityB = new Set(b.map(event => event.status)).size;
    const endA = Math.max(...a.map(event => Number(event.endMin || 0)));
    const endB = Math.max(...b.map(event => Number(event.endMin || 0)));
    return (diversityB * 100 + b.length * 10 + endB / 1440)
      - (diversityA * 100 + a.length * 10 + endA / 1440);
  })[0];
}

export function appendRecoveredLiveTail(recoveredEvents = [], suspiciousEvents = [], currentStatus = 'D') {
  let recovered = normalizeLogEvents(recoveredEvents);
  const parts = suspiciousMidnightDrivingParts(suspiciousEvents, null);
  if (!recovered.length || !parts) return recovered;

  const broad = parts.broad;
  const last = recovered[recovered.length - 1];
  const tailStart = minute(last.endMin, 0);
  const driveEnd = minute(broad.endMin, tailStart);

  if (driveEnd > tailStart) {
    recovered = applyLiveStatusTransition(recovered, {
      id:`recovered_live_drive_${Date.now()}`,
      status:'D',
      startMin:tailStart,
      endMin:driveEnd,
      city:broad.city || last.city || '',
      state:broad.state || last.state || '',
      note:'Driving',
      description:'',
      source:'recovered_manual_driving_tail',
      locationSource:broad.locationSource || last.locationSource || 'manual',
    });
  }

  for (const trailing of parts.trailing) {
    recovered = applyLiveStatusTransition(recovered, {
      ...trailing,
      id:trailing.id || `recovered_tail_status_${Date.now()}`,
      source:trailing.source || 'recovered_tail_status',
    });
  }

  // currentStatus remains an input for backward compatibility with the load
  // recovery call. The recovered stored timeline is derived from actual event
  // boundaries rather than a stale status flag.
  void currentStatus;
  return normalizeLogEvents(recovered);
}
