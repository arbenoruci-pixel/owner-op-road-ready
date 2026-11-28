import {recordsFrom, same} from './accountCoreV110455.js';

export const pendingDaysKey = uid => 'driver-logbook-pending-v1:' + uid;
const isDay = key => JSON.parse(key)[0] === 'day';

function recorded(day) {
  if (!day) return false;
  return Object.entries(day).some(([field, value]) => {
    if (field === 'certifyStatus') return false;
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') return Object.keys(value).length > 0;
    return Boolean(value);
  });
}

// Called inside the transaction that stores the phone snapshot.
export async function queueDayChanges(db, uid, previous, next, now) {
  if (!uid) return;
  const before = recordsFrom({state: previous || {}});
  const after = recordsFrom({state: next});
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(key =>
    isDay(key) && (recorded(before[key]) || recorded(after[key])) && !same(before[key], after[key]));
  if (!changed.length) return;
  const key = pendingDaysKey(uid);
  const entries = {...(await db.sync_meta.get(key))?.value};
  for (const day of changed) entries[day] = {id: crypto.randomUUID(), day: after[day] ?? null};
  await db.sync_meta.put({key, value: entries, updated_at: now});
}

// Snapshot and account changes use different clocks. Only an exact, captured
// queue entry can be retired; an edit made during a network round trip survives.
export async function acknowledgeDays(db, uid, captured, local, localEncoded, confirmed, reviewed) {
  const keys = Object.keys(captured);
  if (!keys.length) return;
  await db.transaction('rw', db.sync_meta, async () => {
    const key = pendingDaysKey(uid);
    const entries = {...(await db.sync_meta.get(key))?.value};
    let changed = false;
    for (const day of keys) {
      if (entries[day]?.id !== captured[day].id || !same(captured[day].day, local[day] ?? null)) continue;
      if (!same(localEncoded[day], confirmed[day]) && reviewed?.[day] !== 'remote') continue;
      delete entries[day];
      changed = true;
    }
    if (!changed) return;
    if (Object.keys(entries).length) await db.sync_meta.put({key, value: entries, updated_at: new Date().toISOString()});
    else await db.sync_meta.delete(key);
  });
}

// Empty default days are a UI convenience on this installation.
export function omitNewEmptyDays(records, remote, pending) {
  const outgoing = {...records};
  for (const [key, day] of Object.entries(records)) {
    if (isDay(key) && !(key in remote) && !(key in pending) && !recorded(day)) delete outgoing[key];
  }
  return outgoing;
}

export function reviewDriverDays(merge, local, remote, pending, receiving) {
  const conflicts = new Map(merge.conflicts.map(c => [c.key, c]));
  const records = {...merge.records};
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(pending)])) {
    if (!isDay(key) || same(local[key], remote[key])) continue;
    if (local[key] && !recorded(local[key]) && !(key in remote) && !(key in pending)) {
      records[key] = local[key];
      continue;
    }
    const hasLocal = recorded(local[key]);
    const hasRemote = recorded(remote[key]);
    const replacesLocal = (hasLocal || key in pending) && !same(records[key], local[key]);
    const emptiesRemote = hasRemote && !recorded(records[key]);
    if (!(receiving && (hasLocal || key in pending)) && !replacesLocal && !emptiesRemote) continue;
    if (!conflicts.has(key)) conflicts.set(key, {key, local: local[key], remote: remote[key]});
    if (local[key] === undefined) delete records[key];
    else records[key] = local[key];
  }
  // A conflicting duty day may also have an open driving session or route
  // captured in a separate legacy record. Show its two versions as well.
  if (receiving && [...conflicts.keys()].some(isDay)) {
    for (const [key, value] of Object.entries(local)) {
      const [kind, field, bookField] = JSON.parse(key);
      const relevant = kind === 'book' && ['manualDrivingSession','currentStatus','currentReason','currentLocation'].includes(bookField)
        || kind === 'state' && ['routeByDay','routeLegsByDay','activeStatusSession','liveDutySession','manualDrivingSession'].includes(field);
      if (relevant && value != null && !same(value, remote[key])) {
        conflicts.set(key, {key, local: value, remote: remote[key]});
        records[key] = value;
      }
    }
  }
  return {records, conflicts: [...conflicts.values()]};
}
