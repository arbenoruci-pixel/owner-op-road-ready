const DUTY_STATUS_MAP = new Set(['OFF', 'SB', 'D', 'ON']);

export function createUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Last-resort UUID v4 fallback for older WebViews.
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => {
    const n = Number(c);
    return (n ^ (Math.random() * 16 >> (n / 4))).toString(16);
  });
}

export function retryDelayMs(attempts = 0) {
  const schedule = [0, 10_000, 30_000, 120_000, 300_000, 900_000];
  return schedule[Math.min(Math.max(attempts, 0), schedule.length - 1)];
}

export function normalizeDutyEventForSync({ event, day, action = 'create', eventChainId, clientEventId, timezone = 'America/Chicago', changeReason = null }) {
  if (!event || typeof event !== 'object') throw new Error('event is required');
  if (!day) throw new Error('day is required');
  if (!eventChainId) throw new Error('eventChainId is required');

  const status = DUTY_STATUS_MAP.has(event.status) ? event.status : 'OFF';
  const note = String(event.note || event.reason || '').toLowerCase();
  const source = event.source === 'gps_drive' || event.source === 'live_status' ? 'gps_assisted' : 'manual';
  let specialMode = event.specialMode || event.special_mode || 'none';
  if (!['none', 'personal_conveyance', 'yard_move'].includes(specialMode)) specialMode = 'none';
  if (note.includes('yard')) specialMode = 'yard_move';
  if (note.includes('personal conveyance') || note === 'pc') specialMode = 'personal_conveyance';

  return {
    client_event_id: clientEventId || createUuid(),
    event_chain_id: eventChainId,
    action,
    log_date: day,
    timezone,
    status,
    special_mode: specialMode,
    start_min: Number.isFinite(Number(event.startMin)) ? Number(event.startMin) : null,
    end_min: Number.isFinite(Number(event.endMin)) ? Number(event.endMin) : null,
    location_city: event.city || null,
    location_state: event.state || null,
    latitude: event.lat ?? null,
    longitude: event.lng ?? null,
    location_source: event.locationSource || null,
    note: event.note || null,
    description: event.description || null,
    source,
    change_reason: changeReason,
    device_id: getDeviceIdForPayload(),
    client_created_at: new Date().toISOString()
  };
}

export function normalizeInspectionForSync({ inspection, day, clientInspectionId, timezone = 'America/Chicago' }) {
  if (!day) throw new Error('inspection day is required');
  if (!clientInspectionId) throw new Error('clientInspectionId is required');
  const completedAt = inspection?.completedAt || inspection?.completed_at || null;
  const completedIso = typeof completedAt === 'number'
    ? new Date(completedAt).toISOString()
    : completedAt;

  return {
    client_inspection_id: clientInspectionId,
    log_date: day,
    timezone,
    type: inspection?.type || 'pretrip',
    status: inspection?.complete === false ? 'open' : 'completed',
    checked_items: Array.isArray(inspection?.checked) ? inspection.checked : [],
    completed_at: completedIso || new Date().toISOString(),
    source: inspection?.source || 'manual_inspection_form',
    source_event_local_id: inspection?.sourceEventId || inspection?.source_event_local_id || null,
    source_event_chain_id: inspection?.sourceEventChainId || inspection?.source_event_chain_id || null,
    source_start_min: Number.isFinite(Number(inspection?.sourceStartMin)) ? Number(inspection.sourceStartMin) : null,
    source_end_min: Number.isFinite(Number(inspection?.sourceEndMin)) ? Number(inspection.sourceEndMin) : null,
    location_city: inspection?.city || null,
    location_state: inspection?.state || null,
    location_source: inspection?.locationSource || null,
    notes: inspection?.notes || null,
    device_id: getDeviceIdForPayload(),
    client_created_at: new Date().toISOString()
  };
}

export function getDeviceIdForPayload() {
  if (typeof window === 'undefined') return 'server-test';
  if (!window.__OWNER_OP_DEVICE_ID__) {
    window.__OWNER_OP_DEVICE_ID__ = createUuid();
  }
  return window.__OWNER_OP_DEVICE_ID__;
}

export function buildMutation({ entity, operation, payload, entityClientId = null, dependencyIds = [] }) {
  return {
    client_mutation_id: createUuid(),
    entity,
    operation,
    entity_client_id: entityClientId,
    payload,
    dependency_ids: dependencyIds,
    status: 'pending',
    attempts: 0,
    last_error: null,
    created_at: new Date().toISOString(),
    next_retry_at: new Date().toISOString(),
    processed_at: null
  };
}
