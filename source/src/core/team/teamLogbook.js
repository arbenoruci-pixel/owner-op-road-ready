const PRIMARY_DRIVER_ID = 'driver_primary';

export const TEAM_DRIVER_SCHEMA_VERSION = 1;

const DRIVER_LOG_FIELDS = [
  'eventsByDay',
  'certifyStatus',
  'inspectionByDay',
  'signatureByDay',
  'driverSignature',
  'currentStatus',
  'currentReason',
  'currentLocation',
  'gpsTrip',
  'manualDrivingSession',
  'dutySafetyBackupByDay',
  'formByDay',
];

function cleanName(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function clonePlain(value, fallback) {
  if (value === undefined) return fallback;
  if (value === null) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function driverId(seed = '') {
  const safe = cleanName(seed).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
  const random = Math.random().toString(36).slice(2, 8);
  return `driver_${safe || 'team'}_${Date.now().toString(36)}_${random}`;
}

function defaultLogbook(day = '') {
  const activeDay = day || new Date().toISOString().slice(0, 10);
  return {
    activeDay,
    eventsByDay:{ [activeDay]:[] },
    certifyStatus:{ [activeDay]:'Active day / Not certified yet' },
    inspectionByDay:{},
    signatureByDay:{},
    driverSignature:null,
    currentStatus:'OFF',
    currentReason:'Off Duty',
    currentLocation:{ city:'GPS', state:'UNK', locationSource:'pending' },
    gpsTrip:null,
    manualDrivingSession:null,
    dutySafetyBackupByDay:{},
    formByDay:{},
  };
}

export function snapshotDriverLogbook(state = {}) {
  const snapshot = {
    activeDay:String(state.activeDay || ''),
  };
  for (const field of DRIVER_LOG_FIELDS) {
    snapshot[field] = clonePlain(state[field], defaultLogbook(snapshot.activeDay)[field]);
  }
  return snapshot;
}

function normalizeDrivers(rows = [], fallbackName = 'Driver') {
  const seen = new Set();
  const normalized = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue;
    const id = String(row.id || '').trim();
    const name = cleanName(row.name);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    normalized.push({
      id,
      name,
      createdAt:row.createdAt || null,
      updatedAt:Number(row.updatedAt || 0),
    });
  }
  if (!normalized.length) {
    normalized.push({
      id:PRIMARY_DRIVER_ID,
      name:cleanName(fallbackName) || 'Driver',
      createdAt:null,
      updatedAt:0,
    });
  }
  return normalized;
}

export function normalizeTeamDriverState(state = {}, today = '') {
  const fallbackName = state.driverProfile?.name || state.driverSignature?.driverName || 'Driver';
  const teamDrivers = normalizeDrivers(state.teamDrivers, fallbackName);
  const requestedId = String(state.activeDriverId || '').trim();
  const activeDriver = teamDrivers.find(driver => driver.id === requestedId) || teamDrivers[0];
  const teamLogbooksByDriverId = state.teamLogbooksByDriverId && typeof state.teamLogbooksByDriverId === 'object'
    ? { ...state.teamLogbooksByDriverId }
    : {};
  // Preserve the old free-text field verbatim; commas are not a safe driver-ID migration.
  const legacyCoDrivers = typeof state.legacyCoDrivers === 'string'
    ? state.legacyCoDrivers
    : (!Array.isArray(state.teamDrivers) || !state.teamDrivers.length ? String(state.coDrivers || '') : '');
  const names = teamDrivers.filter(driver => driver.id !== activeDriver.id).map(driver => driver.name);
  if (legacyCoDrivers && !teamDrivers.some(driver => cleanName(driver.name) === cleanName(legacyCoDrivers))) names.push(legacyCoDrivers);
  const coDrivers = names.join(', ');

  return {
    ...state,
    teamDriverSchemaVersion:TEAM_DRIVER_SCHEMA_VERSION,
    teamDrivers,
    activeDriverId:activeDriver.id,
    teamLogbooksByDriverId,
    driverProfile:{ ...(state.driverProfile || {}), name:activeDriver.name },
    legacyCoDrivers,
    coDrivers,
  };
}

// Profile changes have one authority. Signed/daily Form names are not rewritten.
export function updateActiveTeamDriverName(state = {}, name = '') {
  const normalized = normalizeTeamDriverState(state);
  const clean = cleanName(name);
  if (!clean) return normalized;
  return normalizeTeamDriverState({
    ...normalized,
    teamDrivers:normalized.teamDrivers.map(driver => driver.id === normalized.activeDriverId
      ? { ...driver, name:clean, updatedAt:Date.now() } : driver),
    driverProfile:{ ...normalized.driverProfile, name:clean },
  });
}

// Top-level fields are authoritative for the active driver; its sealed copy may be stale.
export function driverLogbookEntries(state = {}) {
  const activeId = String(state.activeDriverId || state.teamDrivers?.[0]?.id || PRIMARY_DRIVER_ID);
  const saved = state.teamLogbooksByDriverId || {};
  const active = DRIVER_LOG_FIELDS.some(field => state[field] !== undefined) ? state : (saved[activeId] || state);
  return [[activeId, active], ...Object.entries(saved).filter(([id, value]) => id !== activeId && value && typeof value === 'object')];
}

export function sealActiveDriverLogbook(state = {}, today = '') {
  const normalized = normalizeTeamDriverState(state, today);
  const activeId = normalized.activeDriverId;
  return {
    ...normalized,
    teamLogbooksByDriverId:{
      ...(normalized.teamLogbooksByDriverId || {}),
      [activeId]:snapshotDriverLogbook(normalized),
    },
  };
}

export function addTeamDriver(state = {}, name = '', today = '') {
  const normalized = sealActiveDriverLogbook(state, today);
  const clean = cleanName(name);
  if (!clean) return normalized;
  const existing = normalized.teamDrivers.find(driver => driver.name.toLowerCase() === clean.toLowerCase());
  if (existing) return normalized;

  const id = driverId(clean);
  const now = Date.now();
  return normalizeTeamDriverState({
    ...normalized,
    teamDrivers:[
      ...normalized.teamDrivers,
      { id, name:clean, createdAt:new Date(now).toISOString(), updatedAt:now },
    ],
    teamLogbooksByDriverId:{
      ...(normalized.teamLogbooksByDriverId || {}),
      [id]:defaultLogbook(today),
    },
    coDrivers:[...normalized.teamDrivers.map(driver => driver.name), clean]
      .filter(nameValue => nameValue !== normalized.driverProfile?.name)
      .join(', '),
  });
}

export function switchTeamDriver(state = {}, targetDriverId = '', today = '') {
  const normalized = sealActiveDriverLogbook(state, today);
  const target = normalized.teamDrivers.find(driver => driver.id === targetDriverId);
  if (!target || target.id === normalized.activeDriverId) return normalized;

  const savedTarget = normalized.teamLogbooksByDriverId?.[target.id] || defaultLogbook(today);
  const next = {
    ...normalized,
    ...snapshotDriverLogbook(savedTarget),
    activeDriverId:target.id,
    driverProfile:{ ...(normalized.driverProfile || {}), name:target.name },
    coDrivers:normalized.teamDrivers.filter(driver => driver.id !== target.id).map(driver => driver.name).join(', '),
    selectedEventId:null,
    selectedIds:[],
    selectMode:false,
    sheet:null,
    gpsPanelOpen:false,
  };
  return normalizeTeamDriverState(next, today);
}

export function teamDriverSummary(state = {}) {
  const normalized = normalizeTeamDriverState(state);
  return {
    drivers:normalized.teamDrivers,
    activeDriverId:normalized.activeDriverId,
    activeDriver:normalized.teamDrivers.find(driver => driver.id === normalized.activeDriverId) || normalized.teamDrivers[0],
  };
}

function realImportedEvents(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter(row => {
    if (!row || typeof row !== 'object') return false;
    if (row.carriedFromPreviousDay) return false;
    if (String(row.source || '').toLowerCase() === 'carryover') return false;
    if (row.synthetic === true || row._synthetic === true) return false;
    return true;
  });
}

export function importedLogbookIntegrity(source = {}, restored = {}) {
  const missing = [];
  let sourceEventDays = 0;
  let sourceEvents = 0;
  const restoredBooks = new Map(driverLogbookEntries(restored));
  const restoredIds = new Set((restored.teamDrivers || []).map(driver => driver.id));
  for (const driver of source.teamDrivers || []) {
    if (!restoredIds.has(driver.id)) missing.push({ driverId:driver.id, reason:'driver missing' });
  }
  for (const [driverId, book] of driverLogbookEntries(source)) {
    const target = restoredBooks.get(driverId);
    if (!target) missing.push({ driverId, reason:'logbook missing' });
    for (const [day, rows] of Object.entries(book.eventsByDay || {})) {
      const expected = realImportedEvents(rows);
      if (!expected.length) continue;
      sourceEventDays += 1;
      sourceEvents += expected.length;
      const candidates = [...realImportedEvents(target?.eventsByDay?.[day])];
      for (const event of expected) {
        const index = candidates.findIndex(row => importedEventMatches(event, row));
        if (index < 0) missing.push({ driverId, day, eventId:event.id || '', reason:'event missing or changed', sourceCount:expected.length, restoredCount:candidates.length });
        else candidates.splice(index, 1);
      }
    }
    for (const field of ['signatureByDay','inspectionByDay','formByDay','dutySafetyBackupByDay']) {
      for (const [day, value] of Object.entries(book[field] || {})) {
        if (!containsRecordedValue(value, target?.[field]?.[day])) missing.push({ driverId, day, field, reason:'record missing or changed' });
      }
    }
    if (book.driverSignature && !containsRecordedValue(book.driverSignature, target?.driverSignature)) {
      missing.push({ driverId, field:'driverSignature', reason:'signature missing or changed' });
    }
  }
  return {
    ok:missing.length === 0,
    sourceEventDays,
    sourceEvents,
    missing,
  };
}

function containsRecordedValue(expected, actual) {
  if (expected === undefined) return true;
  if (expected === null || typeof expected !== 'object') return Object.is(expected, actual);
  if (!actual || typeof actual !== 'object' || Array.isArray(expected) !== Array.isArray(actual)) return false;
  if (Array.isArray(expected) && expected.length !== actual.length) return false;
  return Object.entries(expected).every(([key, value]) => containsRecordedValue(value, actual[key]));
}

function importedEventMatches(expected, actual) {
  // Match recorded identity and duty evidence, not just a day's row count.
  const fields = ['id','status','startMin','endMin','city','state','note','description','source',
    'shippingDocs','loadNo','bol','po','truck','trailer','container','chassis','manualMiles','miles','odometer'];
  return fields.every(key => {
    if (expected[key] === undefined) return true;
    if (['startMin','endMin','manualMiles','miles','odometer'].includes(key)) return Number(expected[key]) === Number(actual[key]);
    return containsRecordedValue(expected[key], actual[key]);
  });
}
