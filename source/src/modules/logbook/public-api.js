// Versioned Logbook boundary. Integrations use references; they do not own RODS.
export const LOGBOOK_CONTRACT_VERSION = 1;
export const LOGBOOK_DAY_BUCKETS = Object.freeze(['eventsByDay','certifyStatus','signatureByDay','inspectionByDay','formByDay','manualMilesByDay','routeByDay','routeLegsByDay','dayImportBackupByDay','dutySafetyBackupByDay','manualMidnightContinuityBackupByDay','manualMidnightContinuityByDay','userConfirmedStopRepairBackupByDay']);
export const LOGBOOK_PROTECTED_KEYS = Object.freeze([...LOGBOOK_DAY_BUCKETS,'driverSignature','currentStatus','currentReason','currentLocation','manualDrivingSession','gpsTrip','driver','driverProfile','carrierName','mainOfficeAddress','homeTerminalTimeZone','homeTerminalAddress','settings','currentTrailer','equipment']);
const clone = value => structuredClone(value);
const text = value => String(value ?? '').slice(0,180);
export function runExternalCommand(state, transform, source, detail = {}) {
  if (!['documents','loads','scanner','wallet'].includes(source)) throw new Error('Unknown integration source');
  // A legacy function may mutate a nested array before returning. Work on a
  // private copy first so restoring references really preserves the original.
  const next = transform(clone(state));
  if (!next || typeof next !== 'object' || typeof next.then === 'function') throw new Error('Integration must return a synchronous state object');
  const result = { ...next };
  for (const key of LOGBOOK_PROTECTED_KEYS) {
    if (Object.hasOwn(state,key)) result[key] = state[key]; else delete result[key];
  }
  const id = text(detail.documentId || detail.clientDocumentId || detail.document?.id || detail.id);
  if (source === 'documents' && id) {
    result.logbookDocumentReferences = { ...(state.logbookDocumentReferences || {}), [id]:{
      contractVersion:1, documentId:id, day:text(detail.day || detail.logDate || ''),
      eventId:text(detail.eventId || ''), loadNo:text(detail.loadNo || ''),
      // User applies any resulting change through the existing log editor.
      status:'reference_only',
    } };
  }
  return result;
}
export function preserveRecordedDays(before, after, today) {
  const next = { ...after };
  for (const key of LOGBOOK_DAY_BUCKETS) {
    const prior = before[key]; if (!prior || typeof prior !== 'object') continue;
    let value = after[key];
    for (const day of Object.keys(prior)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !(day < today || before.signatureByDay?.[day]?.signed === true)) continue;
      if (value === after[key]) value = { ...(value || {}) };
      value[day] = prior[day];
    }
    if (value !== after[key]) next[key] = value;
  }
  return next;
}
