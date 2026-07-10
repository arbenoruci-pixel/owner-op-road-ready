import { rawStoredEventsForDay } from '../compliance/rawRodsChecks.js';
import { normalizeLogEvents } from '../timeline/timelineEngine.js';
import { localDayKey } from '../../shared/utils/date.js';
import { getHomeTerminalTimeZone } from '../time/homeTerminalTime.js';

export const DAY_BACKUP_KIND = 'owner_op_road_ready_day_backup';
export const DAY_BACKUP_SCHEMA_VERSION = 1;

const DAY_BUCKETS = [
  ['signatureByDay', 'signature'],
  ['inspectionByDay', 'inspection'],
  ['routeLegsByDay', 'routeLegs'],
  ['routeByDay', 'route'],
  ['formByDay', 'form'],
  ['manualMilesByDay', 'manualMiles'],
];

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch {}
  }
  return JSON.parse(JSON.stringify(value));
}

function isDayKey(value = '') {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function safeStatus(status = '') {
  return ['OFF', 'SB', 'D', 'ON'].includes(status) ? status : 'OFF';
}

function defaultReason(status = 'OFF') {
  if (status === 'SB') return 'Sleeper Berth';
  if (status === 'D') return 'Driving';
  if (status === 'ON') return 'On Duty';
  return 'Off Duty';
}

function copyDayValue(state = {}, bucket = '', day = '') {
  return clone(state?.[bucket]?.[day]);
}

export function dayBackupSummary(payload = {}) {
  const dayData = payload?.dayData || {};
  return {
    sourceDay: payload?.sourceDay || payload?.day || '',
    events: Array.isArray(dayData.events) ? dayData.events.length : 0,
    certified: dayData.certifyStatus === 'Certified',
    signed: !!(dayData.signature?.signed || dayData.signature?.signatureDataUrl || dayData.signature?.signatureRef),
    inspected: !!(dayData.inspection?.complete || dayData.inspection?.status === 'complete'),
    routeLegs: Array.isArray(dayData.routeLegs) ? dayData.routeLegs.length : 0,
    manualMiles: Math.max(0, Number(dayData.manualMiles || 0)),
  };
}

export function buildDayBackupPayload(state = {}, day = state.activeDay, appVersion = '') {
  if (!isDayKey(day)) throw new Error('Choose a valid log day before exporting.');
  const events = rawStoredEventsForDay(state.eventsByDay || {}, day).map(event => clone(event));
  const dayData = {
    events,
    certifyStatus: state.certifyStatus?.[day] || '',
  };

  for (const [bucket, key] of DAY_BUCKETS) {
    const value = copyDayValue(state, bucket, day);
    if (value !== undefined) dayData[key] = value;
  }

  return {
    kind: DAY_BACKUP_KIND,
    schemaVersion: DAY_BACKUP_SCHEMA_VERSION,
    app: 'Owner-Op Road Ready',
    appVersion: String(appVersion || '').trim(),
    createdAt: new Date().toISOString(),
    sourceDay: day,
    homeTerminalTimeZone: getHomeTerminalTimeZone(state),
    driverSignature: clone(state.driverSignature || null),
    summary: dayBackupSummary({ sourceDay:day, dayData }),
    dayData,
  };
}

export function extractDayBackupPayload(payload = {}) {
  if (payload?.kind === DAY_BACKUP_KIND && payload?.dayData && isDayKey(payload?.sourceDay)) {
    return payload;
  }
  throw new Error('This is not a Road Ready single-day backup file.');
}

function remapEventReferences(event = {}, idMap = new Map(), chainMap = new Map()) {
  const next = { ...event };
  const idFields = ['sourceEventId', 'previousEventId', 'nextEventId', 'parentEventId', 'linkedEventId'];
  for (const field of idFields) {
    if (next[field] && idMap.has(next[field])) next[field] = idMap.get(next[field]);
  }
  const chainFields = ['event_chain_id', 'eventChainId'];
  for (const field of chainFields) {
    if (next[field] && chainMap.has(next[field])) next[field] = chainMap.get(next[field]);
  }
  return next;
}

function importedEventsForTarget(events = [], sourceDay = '', targetDay = '') {
  const clean = normalizeLogEvents((events || []).filter(Boolean).map(event => ({ ...event })));
  if (sourceDay === targetDay) return clean;

  const stamp = Date.now().toString(36);
  const dayToken = targetDay.replace(/-/g, '');
  const idMap = new Map();
  const chainMap = new Map();

  clean.forEach((event, index) => {
    const originalId = String(event.id || `event_${index}`);
    idMap.set(originalId, `import_${dayToken}_${stamp}_${index + 1}`);
    const chain = event.event_chain_id || event.eventChainId;
    if (chain && !chainMap.has(chain)) chainMap.set(chain, `import_chain_${dayToken}_${stamp}_${chainMap.size + 1}`);
  });

  return normalizeLogEvents(clean.map((event, index) => {
    const originalId = String(event.id || `event_${index}`);
    return remapEventReferences({
      ...event,
      id: idMap.get(originalId),
      originalEventId: originalId,
      importedFromDay: sourceDay,
      importedAt: Date.now(),
      source: event.source || 'day_import',
    }, idMap, chainMap);
  }));
}

function replaceDayValue(state = {}, bucket = '', day = '', value) {
  const nextBucket = { ...(state?.[bucket] || {}) };
  if (value === undefined || value === null || value === '') delete nextBucket[day];
  else nextBucket[day] = clone(value);
  return nextBucket;
}

function backupCurrentTargetDay(state = {}, targetDay = '', meta = {}) {
  const backup = {
    createdAt: Date.now(),
    reason: 'before_single_day_import',
    filename: meta?.filename || '',
    sourceDay: meta?.sourceDay || '',
    events: rawStoredEventsForDay(state.eventsByDay || {}, targetDay).map(event => clone(event)),
    certifyStatus: state.certifyStatus?.[targetDay] || '',
  };
  for (const [bucket, key] of DAY_BUCKETS) {
    const value = copyDayValue(state, bucket, targetDay);
    if (value !== undefined) backup[key] = value;
  }
  return backup;
}

function inspectionForTarget(inspection, sourceDay, targetDay, idMap = null) {
  if (!inspection || sourceDay !== targetDay) return undefined;
  const next = clone(inspection);
  if (idMap && next?.sourceEventId && idMap.has(next.sourceEventId)) next.sourceEventId = idMap.get(next.sourceEventId);
  return next;
}

export function applyDayBackupToState(state = {}, payloadInput = {}, targetDay = state.activeDay, meta = {}) {
  const payload = extractDayBackupPayload(payloadInput);
  if (!isDayKey(targetDay)) throw new Error('Open the log day you want to import into.');

  const sourceDay = payload.sourceDay;
  const dayData = payload.dayData || {};
  const importedEvents = importedEventsForTarget(dayData.events || [], sourceDay, targetDay);
  if (!importedEvents.length) throw new Error('The day backup has no duty events.');

  const sameDay = sourceDay === targetDay;
  const backupByDay = {
    ...(state.dayImportBackupByDay || {}),
    [targetDay]: backupCurrentTargetDay(state, targetDay, { ...meta, sourceDay }),
  };

  const eventsByDay = { ...(state.eventsByDay || {}), [targetDay]: importedEvents };
  const certification = sameDay
    ? (dayData.certifyStatus || (targetDay === localDayKey(new Date(), getHomeTerminalTimeZone(state)) ? 'Active day / Not certified yet' : 'Needs signature'))
    : (targetDay === localDayKey(new Date(), getHomeTerminalTimeZone(state)) ? 'Active day / Not certified yet' : 'Needs signature');

  let next = {
    ...state,
    activeDay: targetDay,
    view: 'day',
    sheet: null,
    selectedEventId: null,
    selectedIds: [],
    selectMode: false,
    eventsByDay,
    certifyStatus: { ...(state.certifyStatus || {}), [targetDay]: certification },
    signatureByDay: replaceDayValue(state, 'signatureByDay', targetDay, sameDay ? dayData.signature : undefined),
    inspectionByDay: replaceDayValue(state, 'inspectionByDay', targetDay, inspectionForTarget(dayData.inspection, sourceDay, targetDay)),
    routeLegsByDay: replaceDayValue(state, 'routeLegsByDay', targetDay, dayData.routeLegs || []),
    routeByDay: replaceDayValue(state, 'routeByDay', targetDay, dayData.route),
    formByDay: replaceDayValue(state, 'formByDay', targetDay, dayData.form),
    manualMilesByDay: replaceDayValue(state, 'manualMilesByDay', targetDay, dayData.manualMiles),
    dayImportBackupByDay: backupByDay,
    lastDayImportMeta: {
      importedAt: new Date().toISOString(),
      filename: meta?.filename || '',
      sourceDay,
      targetDay,
      eventCount: importedEvents.length,
      sameDay,
    },
  };

  if (sameDay && payload.driverSignature && !state.driverSignature) {
    next.driverSignature = clone(payload.driverSignature);
  }

  const today = localDayKey(new Date(), getHomeTerminalTimeZone(next));
  if (targetDay === today) {
    const last = [...importedEvents].sort((a, b) => Number(a.startMin || 0) - Number(b.startMin || 0)).at(-1);
    if (last) {
      const status = safeStatus(last.status);
      next = {
        ...next,
        currentStatus: status,
        currentReason: last.note || last.description || defaultReason(status),
        currentLocation: {
          city: last.city || state.currentLocation?.city || 'GPS',
          state: last.state || state.currentLocation?.state || 'UNK',
          locationSource: last.locationSource || 'manual',
        },
        gpsTrip: null,
      };
    }
  }

  return next;
}
