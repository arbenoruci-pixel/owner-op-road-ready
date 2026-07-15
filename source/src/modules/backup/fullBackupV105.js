import { normalizeRoadReadyState } from '../../core/routes/routeNormalization.js';
import { normalizeBusinessStore } from '../business/businessStore.js';

export const FULL_BACKUP_KIND_V105 = 'owner_op_road_ready_full_backup';
export const FULL_BACKUP_SCHEMA_V105 = 2;

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function mapRowCount(value = {}) {
  return Object.values(value || {}).reduce((sum, rows) => sum + list(rows).length, 0);
}

function signedCount(value = {}) {
  return Object.values(value || {}).filter(row => row?.signed || row?.signatureDataUrl || row?.signatureRef).length;
}

function inspectionCount(value = {}) {
  return Object.values(value || {}).filter(row => row?.complete || row?.status === 'complete').length;
}

function walletDocumentCount(wallet = {}) {
  return Object.values(wallet?.documents || {}).filter(row => row?.present || row?.attachmentDataUrl || row?.clientDocumentId).length;
}

function nestedListCount(value = {}) {
  return Object.values(value || {}).reduce((sum, rows) => sum + list(rows).length, 0);
}

function dayKeys(state = {}) {
  return [...new Set([
    ...Object.keys(state.eventsByDay || {}),
    ...Object.keys(state.signatureByDay || {}),
    ...Object.keys(state.inspectionByDay || {}),
    ...Object.keys(state.routeLegsByDay || {}),
    ...Object.keys(state.documentsByDay || {}),
    ...Object.keys(state.fuelReceiptsByDay || {}),
    ...Object.keys(state.certifyStatus || {}),
  ])].filter(Boolean).sort();
}

function statusesForRows(rows = []) {
  return [...new Set(list(rows).map(row => String(row?.status || '').trim()).filter(Boolean))];
}

export function compactRoadReadyStateV105(state = {}) {
  return normalizeRoadReadyState({
    ...state,
    sheet:null,
    gpsPanelOpen:false,
    selectMode:false,
    selectedIds:[],
    selectedEventId:null,
    roadGuardTabRequest:null,
    updateState:undefined,
  });
}

export function logbookIndexV105(state = {}) {
  return dayKeys(state).map(day => {
    const events = list(state.eventsByDay?.[day]);
    const routeLegs = list(state.routeLegsByDay?.[day]);
    const documents = list(state.documentsByDay?.[day]);
    const fuelReceipts = list(state.fuelReceiptsByDay?.[day]);
    const signature = state.signatureByDay?.[day] || null;
    const inspection = state.inspectionByDay?.[day] || null;
    return {
      day,
      eventCount:events.length,
      statuses:statusesForRows(events),
      signed:!!(signature?.signed || signature?.signatureDataUrl || signature?.signatureRef),
      inspectionComplete:!!(inspection?.complete || inspection?.status === 'complete'),
      certifyStatus:String(state.certifyStatus?.[day] || ''),
      routeLegCount:routeLegs.length,
      documentCount:documents.length,
      fuelReceiptCount:fuelReceipts.length,
      loadReferences:[...new Set([
        ...events.flatMap(row => [row?.loadNo, row?.shippingDocs, row?.bol, row?.po]),
        ...routeLegs.flatMap(row => [row?.loadNo, row?.shippingDocs, row?.bol, row?.po, row?.orderNo, row?.legNo]),
      ].map(value => String(value || '').trim()).filter(Boolean))],
    };
  });
}

export function fullBackupSummaryV105(state = {}, businessStore = {}) {
  const normalizedBusiness = normalizeBusinessStore(businessStore || {});
  const index = logbookIndexV105(state);
  return {
    logDays:index.length,
    eventDays:index.filter(day => day.eventCount > 0).length,
    events:mapRowCount(state.eventsByDay),
    signatures:signedCount(state.signatureByDay),
    inspections:inspectionCount(state.inspectionByDay),
    routeLegs:mapRowCount(state.routeLegsByDay),
    logDocuments:nestedListCount(state.documentsByDay),
    fuelReceipts:nestedListCount(state.fuelReceiptsByDay),
    loadGuides:Object.keys(state.loadGuidesById || {}).length,
    walletDocuments:walletDocumentCount(state.dotWallet),
    businessLoads:normalizedBusiness.loads.length,
    businessFuel:normalizedBusiness.fuel.length,
    businessMaintenance:normalizedBusiness.maintenance.length,
    businessExpenses:normalizedBusiness.expenses.length,
    businessDocuments:normalizedBusiness.documents.length,
  };
}

export function buildFullBackupPayloadV105(state = {}, businessStore = {}, meta = {}) {
  const cleanState = compactRoadReadyStateV105(state);
  const cleanBusiness = normalizeBusinessStore(businessStore || {});
  const createdAt = meta.createdAt || new Date().toISOString();
  return {
    kind:FULL_BACKUP_KIND_V105,
    schemaVersion:FULL_BACKUP_SCHEMA_V105,
    app:'Owner-Op Road Ready',
    appVersion:String(meta.appVersion || ''),
    createdAt,
    source:meta.source || 'manual_full_export',
    scope:'all_logbook_and_app_records',
    summary:fullBackupSummaryV105(cleanState, cleanBusiness),
    logbookIndex:logbookIndexV105(cleanState),
    state:cleanState,
    businessStore:cleanBusiness,
  };
}

function looksLikeState(value = {}) {
  return !!value && typeof value === 'object' && !!(
    value.eventsByDay
    || value.signatureByDay
    || value.inspectionByDay
    || value.routeLegsByDay
    || value.loadInfo
  );
}

export function extractFullBackupV105(payload = {}) {
  const state = looksLikeState(payload?.state)
    ? payload.state
    : (looksLikeState(payload) ? payload : null);
  if (!state) return null;
  const businessStore = payload?.businessStore || payload?.business || null;
  return {
    state,
    businessStore:businessStore ? normalizeBusinessStore(businessStore) : null,
    summary:payload?.summary || fullBackupSummaryV105(state, businessStore || {}),
    logbookIndex:Array.isArray(payload?.logbookIndex) ? payload.logbookIndex : logbookIndexV105(state),
    kind:payload?.kind || 'legacy_road_ready_backup',
    schemaVersion:Number(payload?.schemaVersion || 1),
    createdAt:payload?.createdAt || '',
    appVersion:payload?.appVersion || '',
  };
}

export function fullBackupFileNameV105(date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '-');
  return `road-ready-all-data-${stamp}.json`;
}
