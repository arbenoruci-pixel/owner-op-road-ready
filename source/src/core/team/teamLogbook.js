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
  const coDrivers = teamDrivers.filter(driver => driver.id !== activeDriver.id).map(driver => driver.name).join(', ');

  return {
    ...state,
    teamDriverSchemaVersion:TEAM_DRIVER_SCHEMA_VERSION,
    teamDrivers,
    activeDriverId:activeDriver.id,
    teamLogbooksByDriverId,
    driverProfile:{ ...(state.driverProfile || {}), name:activeDriver.name },
    coDrivers,
  };
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
  return {
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
  };
}

export function switchTeamDriver(state = {}, targetDriverId = '', today = '') {
  const normalized = sealActiveDriverLogbook(state, today);
  const target = normalized.teamDrivers.find(driver => driver.id === targetDriverId);
  if (!target || target.id === normalized.activeDriverId) return normalized;

  const savedTarget = normalized.teamLogbooksByDriverId?.[target.id] || defaultLogbook(today);
  const next = {
    ...normalized,
    ...clonePlain(savedTarget, defaultLogbook(today)),
    activeDriverId:target.id,
    driverProfile:{ ...(normalized.driverProfile || {}), name:target.name },
    coDrivers:normalized.teamDrivers.filter(driver => driver.id !== target.id).map(driver => driver.name).join(', '),
    selectedEventId:null,
    selectedIds:[],
    selectMode:false,
    sheet:null,
    gpsPanelOpen:false,
  };
  return next;
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
  const sourceDays = Object.entries(source.eventsByDay || {})
    .map(([day, rows]) => [day, realImportedEvents(rows).length])
    .filter(([, count]) => count > 0);
  const missing = [];
  for (const [day, count] of sourceDays) {
    const restoredCount = realImportedEvents(restored.eventsByDay?.[day]).length;
    if (restoredCount < count) missing.push({ day, sourceCount:count, restoredCount });
  }
  return {
    ok:missing.length === 0,
    sourceEventDays:sourceDays.length,
    sourceEvents:sourceDays.reduce((sum, [, count]) => sum + count, 0),
    missing,
  };
}
