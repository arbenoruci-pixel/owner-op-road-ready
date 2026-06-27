const DUTY_STATUSES = new Set(['OFF', 'SB', 'D', 'ON']);
const EVENT_ACTIONS = new Set(['create', 'edit', 'void']);
const SPECIAL_MODES = new Set(['none', 'personal_conveyance', 'yard_move']);
const EVENT_SOURCES = new Set(['manual', 'system', 'import', 'gps_assisted']);

function asUuid(value, field) {
  if (!value || typeof value !== 'string') throw new Error(`${field} is required`);
  return value;
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function nullableText(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str || null;
}

function normalizeAction(operation, payload) {
  const action = payload.action || operation;
  if (!EVENT_ACTIONS.has(action)) throw new Error(`Unsupported duty event action: ${action}`);
  return action;
}

function normalizeStatus(payload, action) {
  if (action === 'void' && !payload.status) return null;
  const status = payload.status;
  if (!DUTY_STATUSES.has(status)) throw new Error(`Unsupported duty status: ${status}`);
  return status;
}

function normalizeSpecialMode(payload) {
  const mode = payload.special_mode || payload.specialMode || 'none';
  if (!SPECIAL_MODES.has(mode)) return 'none';
  return mode;
}

function normalizeSource(payload) {
  const source = payload.source || 'manual';
  if (!EVENT_SOURCES.has(source)) return 'manual';
  return source;
}

function normalizeLogDate(payload) {
  const logDate = payload.log_date || payload.logDate;
  if (!logDate) throw new Error('log_date is required');
  return logDate;
}

function normalizeClientEventId(payload) {
  return asUuid(payload.client_event_id || payload.clientEventId, 'client_event_id');
}

function normalizeEventChainId(payload) {
  return asUuid(payload.event_chain_id || payload.eventChainId, 'event_chain_id');
}

function buildTimestampForMinute(logDate, timezone, minute) {
  if (!logDate || minute === null || minute === undefined) return null;
  // The HOS engine remains the authority for minute math. This timestamp is a server-friendly
  // approximation for sorting/searching; exact timezone rendering remains client-side for now.
  const start = new Date(`${logDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + Number(minute) * 60_000).toISOString();
}

export async function ensureLogDay(admin, driver, logDate, timezone) {
  const { data: existing, error: selectError } = await admin
    .from('log_days')
    .select('*')
    .eq('driver_id', driver.id)
    .eq('log_date', logDate)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing;

  const { data, error } = await admin
    .from('log_days')
    .insert({
      driver_id: driver.id,
      log_date: logDate,
      timezone,
      certification_status: 'not_certified'
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function getLatestDutyEventRevision(admin, driverId, eventChainId) {
  const { data, error } = await admin
    .from('duty_events')
    .select('*')
    .eq('driver_id', driverId)
    .eq('event_chain_id', eventChainId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function processDutyEventMutation({ admin, user, driver, operation, payload }) {
  const action = normalizeAction(operation, payload);
  const logDate = normalizeLogDate(payload);
  const timezone = payload.timezone || driver.timezone || 'America/Chicago';
  const logDay = await ensureLogDay(admin, driver, logDate, timezone);
  const eventChainId = normalizeEventChainId(payload);
  const latest = await getLatestDutyEventRevision(admin, driver.id, eventChainId);

  if (action === 'create' && latest) {
    return {
      duplicate: true,
      server_event_id: latest.id,
      event_chain_id: latest.event_chain_id,
      version: latest.version
    };
  }

  if ((action === 'edit' || action === 'void') && !latest) {
    throw new Error(`Cannot ${action} duty event before a create revision exists on the server`);
  }

  const nextVersion = latest ? latest.version + 1 : 1;
  const startMin = nullableNumber(payload.start_min ?? payload.startMin);
  const endMin = nullableNumber(payload.end_min ?? payload.endMin);

  const record = {
    client_event_id: normalizeClientEventId(payload),
    event_chain_id: eventChainId,
    version: nextVersion,
    action,
    driver_id: driver.id,
    log_day_id: logDay.id,
    log_date: logDate,
    timezone,
    status: normalizeStatus(payload, action),
    special_mode: normalizeSpecialMode(payload),
    start_time: payload.start_time || payload.startTime || buildTimestampForMinute(logDate, timezone, startMin),
    end_time: payload.end_time || payload.endTime || buildTimestampForMinute(logDate, timezone, endMin),
    start_min: startMin,
    end_min: endMin,
    location_city: nullableText(payload.location_city ?? payload.city),
    location_state: nullableText(payload.location_state ?? payload.state),
    location_text: nullableText(payload.location_text ?? payload.locationText),
    latitude: nullableNumber(payload.latitude ?? payload.lat),
    longitude: nullableNumber(payload.longitude ?? payload.lng),
    location_source: nullableText(payload.location_source ?? payload.locationSource),
    note: nullableText(payload.note),
    description: nullableText(payload.description),
    source: normalizeSource(payload),
    previous_event_id: latest?.id || null,
    change_reason: nullableText(payload.change_reason ?? payload.changeReason),
    created_by: user.id,
    device_id: nullableText(payload.device_id ?? payload.deviceId),
    client_created_at: payload.client_created_at || payload.clientCreatedAt || null
  };

  const { data, error } = await admin
    .from('duty_events')
    .insert(record)
    .select('*')
    .single();

  if (error) throw error;

  return {
    server_event_id: data.id,
    event_chain_id: data.event_chain_id,
    version: data.version,
    log_day_id: logDay.id,
    certification_status: logDay.certification_status
  };
}
