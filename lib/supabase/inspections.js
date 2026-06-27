import { ensureLogDay } from './dutyEvents.js';

const INSPECTION_TYPES = new Set(['pretrip', 'posttrip', 'other']);
const INSPECTION_STATUSES = new Set(['open', 'completed', 'voided']);

function nullableText(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str || null;
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeCheckedItems(value) {
  if (Array.isArray(value)) return value.map(item => String(item)).filter(Boolean);
  return [];
}

export async function processInspectionMutation({ admin, user, driver, operation, payload }) {
  if (!payload?.client_inspection_id && !payload?.clientInspectionId) throw new Error('client_inspection_id is required');
  const clientInspectionId = payload.client_inspection_id || payload.clientInspectionId;
  const logDate = payload.log_date || payload.logDate;
  if (!logDate) throw new Error('log_date is required');

  const timezone = payload.timezone || driver.timezone || 'America/Chicago';
  const logDay = await ensureLogDay(admin, driver, logDate, timezone);
  const type = INSPECTION_TYPES.has(payload.type) ? payload.type : 'pretrip';
  const requestedStatus = operation === 'void' ? 'voided' : (payload.status || 'completed');
  const status = INSPECTION_STATUSES.has(requestedStatus) ? requestedStatus : 'completed';

  const record = {
    client_inspection_id: clientInspectionId,
    driver_id: driver.id,
    log_day_id: logDay.id,
    log_date: logDate,
    timezone,
    type,
    status,
    checked_items: normalizeCheckedItems(payload.checked_items || payload.checkedItems),
    completed_at: normalizeDate(payload.completed_at || payload.completedAt),
    source: nullableText(payload.source) || 'manual_inspection_form',
    source_event_local_id: nullableText(payload.source_event_local_id || payload.sourceEventLocalId),
    source_event_chain_id: nullableText(payload.source_event_chain_id || payload.sourceEventChainId),
    source_start_min: nullableNumber(payload.source_start_min ?? payload.sourceStartMin),
    source_end_min: nullableNumber(payload.source_end_min ?? payload.sourceEndMin),
    location_city: nullableText(payload.location_city || payload.city),
    location_state: nullableText(payload.location_state || payload.state),
    location_source: nullableText(payload.location_source || payload.locationSource),
    notes: nullableText(payload.notes),
    created_by: user.id,
    device_id: nullableText(payload.device_id || payload.deviceId),
    client_created_at: payload.client_created_at || payload.clientCreatedAt || null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await admin
    .from('inspections')
    .upsert(record, { onConflict: 'client_inspection_id' })
    .select('*')
    .single();

  if (error) throw error;

  return {
    server_inspection_id: data.id,
    client_inspection_id: data.client_inspection_id,
    log_day_id: data.log_day_id,
    status: data.status
  };
}
