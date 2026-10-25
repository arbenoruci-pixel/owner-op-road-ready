import { buildFullBackupPayloadV105, extractFullBackupV105 } from './fullBackupV105.js';

const DAY_FIELDS = ['eventsByDay','signatureByDay','inspectionByDay','routeLegsByDay','documentsByDay','fuelReceiptsByDay','certifyStatus'];
const validDay = day => /^\d{4}-\d{2}-\d{2}$/.test(String(day || '')) && !Number.isNaN(Date.parse(day + 'T12:00:00Z'));
const within = (day, from, to) => validDay(day) && day >= from && day <= to;
const entries = value => value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value) : [];
const identity = row => String(row?.id || row?.eventId || row?.sha256 || row?.localDocumentId || row?.clientDocumentId || JSON.stringify(row));
function mergeRows(existing, incoming) {
  const out = Array.isArray(existing) ? [...existing] : [];
  const seen = new Set(out.map(identity));
  for (const row of Array.isArray(incoming) ? incoming : []) {
    const key = identity(row);
    if (!seen.has(key)) { out.push(row); seen.add(key); }
  }
  return out;
}
export function buildDateRangeBackup(state, businessStore, from, to, appVersion = '') {
  if (!validDay(from) || !validDay(to) || from > to) throw new Error('Choose a valid start and end date.');
  const payload = buildFullBackupPayloadV105(state, businessStore, { appVersion, source:'manual_date_range_export' });
  const selected = { ...payload.state };
  for (const field of DAY_FIELDS) selected[field] = Object.fromEntries(entries(payload.state[field]).filter(([day]) => within(day, from, to)));
  // Preserve the original load records and documents referenced by the selected days.
  const loadRefs = new Set();
  for (const field of ['eventsByDay','routeLegsByDay','documentsByDay']) {
    for (const rows of Object.values(selected[field] || {})) for (const row of Array.isArray(rows) ? rows : []) {
      for (const key of ['loadNo','load_no','canonicalLoadNo','shippingDocs','orderNo']) {
        if (row?.[key]) loadRefs.add(String(row[key]).trim());
      }
    }
  }
  selected.loadGuidesById = Object.fromEntries(entries(payload.state.loadGuidesById).filter(([id, guide]) => loadRefs.has(String(guide?.loadNo || guide?.orderNo || id))));
  const store = { ...payload.businessStore };
  for (const field of ['loads','documents','fuel','maintenance','expenses']) {
    if (!Array.isArray(store[field])) continue;
    store[field] = store[field].filter(row => within(String(row?.date || row?.documentDate || row?.pickupDate || '').slice(0,10),from,to) || loadRefs.has(String(row?.loadNo || row?.load_no || '')));
  }
  return { ...payload, kind:'owner_op_road_ready_date_range_backup', scope:'date_range', window:{from,to}, state:selected, businessStore:store };
}
export function mergeDateRangeBackup(payload, currentState, currentBusinessStore) {
  const extracted = extractFullBackupV105(payload);
  if (!extracted?.state) throw new Error('This file does not contain Road Ready log data.');
  if (payload?.scope !== 'date_range' || !validDay(payload?.window?.from) || !validDay(payload?.window?.to)) throw new Error('Choose a Road Ready date-range backup.');
  const {from,to} = payload.window;
  const state = { ...currentState };
  for (const field of DAY_FIELDS) {
    const merged = { ...(currentState[field] || {}) };
    for (const [day,value] of entries(extracted.state[field])) {
      if (!within(day,from,to)) throw new Error('Backup contains records outside its date range.');
      if (Array.isArray(value)) merged[day] = mergeRows(merged[day],value);
      else if (merged[day] == null || merged[day] === '' || merged[day] === false) merged[day] = value;
      // Existing signed logs, inspections and certifications remain authoritative.
    }
    state[field] = merged;
  }
  state.loadGuidesById = { ...(extracted.state.loadGuidesById || {}), ...(currentState.loadGuidesById || {}) };
  const businessStore = { ...currentBusinessStore };
  for (const field of ['loads','documents','fuel','maintenance','expenses']) {
    businessStore[field] = mergeRows(currentBusinessStore?.[field],extracted.businessStore?.[field]);
  }
  return buildFullBackupPayloadV105(state,businessStore,{source:'date_range_merge_import'});
}
