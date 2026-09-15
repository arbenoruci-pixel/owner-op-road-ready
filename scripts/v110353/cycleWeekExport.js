const DAY_MINUTES = 1440;
const RESET_MINUTES = 34 * 60;
const WEEK_MINUTES = 7 * DAY_MINUTES;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MAP_KEYS = [
  'eventsByDay','certifyStatus','inspectionByDay','signatureByDay','routeLegsByDay',
  'documentsByDay','fuelReceiptsByDay','manualMilesByDay','formByDay'
];

function dayBaseMinute(day) {
  if (!DATE_KEY.test(String(day || ''))) return null;
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 60000) : null;
}

function absoluteMinute(day, minute = 0) {
  const base = dayBaseMinute(day);
  if (base == null) return null;
  const value = Number(minute);
  if (!Number.isFinite(value)) return null;
  return base + Math.max(0, Math.min(DAY_MINUTES, value));
}

function absoluteToDayMinute(value) {
  const ms = Number(value) * 60000;
  const date = new Date(ms);
  const day = date.toISOString().slice(0, 10);
  const minute = date.getUTCHours() * 60 + date.getUTCMinutes();
  return { day, minute };
}

function restSegments(state = {}) {
  const rows = [];
  for (const [day, events] of Object.entries(state.eventsByDay || {})) {
    if (!DATE_KEY.test(day)) continue;
    for (const event of Array.isArray(events) ? events : []) {
      if (!['OFF','SB'].includes(String(event?.status || '').toUpperCase())) continue;
      const start = absoluteMinute(day, event?.startMin);
      const end = absoluteMinute(day, event?.endMin);
      if (start == null || end == null || end <= start) continue;
      rows.push({ start, end, day, id:event?.id || '', status:event?.status || '' });
    }
  }
  rows.sort((a,b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const row of rows) {
    const last = merged.at(-1);
    if (last && row.start <= last.end + 1) {
      last.end = Math.max(last.end, row.end);
      last.parts.push(row);
    } else {
      merged.push({ start:row.start, end:row.end, parts:[row] });
    }
  }
  return merged;
}

export function latest34HourReset(state = {}, now = new Date()) {
  const nowAbs = Math.floor(now.getTime() / 60000);
  let best = null;
  for (const block of restSegments(state)) {
    if (block.end - block.start < RESET_MINUTES) continue;
    const completed = block.start + RESET_MINUTES;
    if (completed > nowAbs) continue;
    if (!best || completed > best.completed) best = { ...block, completed };
  }
  if (!best) return null;
  const completed = absoluteToDayMinute(best.completed);
  const end = absoluteToDayMinute(best.completed + WEEK_MINUTES);
  return {
    completedAbsoluteMinute:best.completed,
    completedDay:completed.day,
    completedMinute:completed.minute,
    weekEndAbsoluteMinute:best.completed + WEEK_MINUTES,
    weekEndDay:end.day,
    weekEndMinute:end.minute,
    restStart:absoluteToDayMinute(best.start),
    restEnd:absoluteToDayMinute(best.end),
    qualifyingRestMinutes:best.end - best.start,
  };
}

function dayTouchesWindow(day, startAbs, endAbs) {
  const base = dayBaseMinute(day);
  return base != null && base < endAbs && base + DAY_MINUTES > startAbs;
}

function eventTouchesWindow(day, event, startAbs, endAbs) {
  const start = absoluteMinute(day, event?.startMin ?? 0);
  const end = absoluteMinute(day, event?.endMin ?? DAY_MINUTES);
  return start != null && end != null && start < endAbs && end > startAbs;
}

function filterDayMap(key, value, startAbs, endAbs) {
  const out = {};
  for (const [day, row] of Object.entries(value || {})) {
    if (!dayTouchesWindow(day, startAbs, endAbs)) continue;
    if (key === 'eventsByDay') {
      out[day] = (Array.isArray(row) ? row : []).filter(event => eventTouchesWindow(day, event, startAbs, endAbs));
    } else {
      out[day] = row;
    }
  }
  return out;
}

function routeLegTouchesWindow(leg = {}, bucketDay = '', startAbs, endAbs) {
  const candidates = [bucketDay, leg.day, leg.pickupDay, leg.deliveryDay].filter(Boolean);
  return candidates.some(day => dayTouchesWindow(day, startAbs, endAbs));
}

function filterRouteLegs(routeLegsByDay = {}, startAbs, endAbs) {
  const out = {};
  for (const [bucketDay, legs] of Object.entries(routeLegsByDay || {})) {
    const keep = (Array.isArray(legs) ? legs : []).filter(leg => routeLegTouchesWindow(leg, bucketDay, startAbs, endAbs));
    if (keep.length || dayTouchesWindow(bucketDay, startAbs, endAbs)) out[bucketDay] = keep;
  }
  return out;
}

function allRecordedDays(state = {}) {
  return [...new Set(DAY_MAP_KEYS.flatMap(key => Object.keys(state?.[key] || {})).filter(day => DATE_KEY.test(day)))].sort();
}

function fallbackWindow(state = {}) {
  const days = allRecordedDays(state);
  if (!days.length) throw new Error('No dated logbook records were found to export.');
  const lastDay = days.at(-1);
  const end = dayBaseMinute(lastDay) + DAY_MINUTES;
  return { startAbs:end - WEEK_MINUTES, endAbs:end, source:'latest_recorded_7_days', reset:null };
}

export function buildCycleWeekExport(state = {}, meta = {}) {
  const now = meta.now instanceof Date ? meta.now : new Date(meta.now || Date.now());
  const reset = latest34HourReset(state, now);
  const window = reset
    ? { startAbs:reset.completedAbsoluteMinute, endAbs:reset.weekEndAbsoluteMinute, source:'latest_completed_34h_reset', reset }
    : fallbackWindow(state);

  const filtered = { ...state };
  for (const key of DAY_MAP_KEYS) filtered[key] = filterDayMap(key, state[key] || {}, window.startAbs, window.endAbs);
  filtered.routeLegsByDay = filterRouteLegs(state.routeLegsByDay || {}, window.startAbs, window.endAbs);
  if (filtered.loadInfo?.routeLegsByDay) {
    filtered.loadInfo = {
      ...filtered.loadInfo,
      routeLegsByDay:filterRouteLegs(filtered.loadInfo.routeLegsByDay, window.startAbs, window.endAbs),
    };
  }
  filtered.sheet = null;
  filtered.selectedEventId = null;
  filtered.selectedIds = [];
  filtered.selectMode = false;
  filtered.gpsPanelOpen = false;

  const start = absoluteToDayMinute(window.startAbs);
  const end = absoluteToDayMinute(window.endAbs);
  const includedDays = allRecordedDays(filtered);
  const routeLegCount = Object.values(filtered.routeLegsByDay || {}).reduce((n, rows) => n + (Array.isArray(rows) ? rows.length : 0), 0);
  const eventCount = Object.values(filtered.eventsByDay || {}).reduce((n, rows) => n + (Array.isArray(rows) ? rows.length : 0), 0);

  return {
    kind:'owner_op_road_ready_cycle_week_export',
    schemaVersion:1,
    app:'Owner-Op Road Ready',
    appVersion:String(meta.appVersion || ''),
    createdAt:new Date().toISOString(),
    scope:'one_cycle_week',
    window:{
      source:window.source,
      resetDetected:!!reset,
      startDay:start.day,
      startMinute:start.minute,
      endDay:end.day,
      endMinute:end.minute,
      durationMinutes:WEEK_MINUTES,
      latest34HourReset:reset,
    },
    summary:{ includedDays, logDays:includedDays.length, events:eventCount, routeLegs:routeLegCount },
    diagnostics:{
      currentLoadInfo:state.loadInfo || {},
      routeBuckets:Object.keys(state.routeLegsByDay || {}).sort(),
      allRecordedDays:allRecordedDays(state),
    },
    state:filtered,
  };
}

export function cycleWeekFileName(payload = {}, date = new Date()) {
  const start = payload?.window?.startDay || 'week';
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T','-');
  return `road-ready-one-week-${start}-${stamp}.json`;
}
