import {
  DOCUMENT_STATUS,
  DOCUMENT_TYPES,
  RECORDS_VAULT_SCHEMA_VERSION,
  WEEK_STATUS,
} from './constants.js';

function requiredText(value, field) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${field} is required`);
  return text;
}

function isoNow(now) {
  const date = now instanceof Date ? now : new Date(now || Date.now());
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
  return date.toISOString();
}

export function weekKeyFromDate(value) {
  const date = new Date(`${requiredText(value, 'date')}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function createOpenWeek({ date, driverId, carrierName, vehicleId = '', trailerId = '' }, now = new Date()) {
  const createdAt = isoNow(now);
  return {
    schemaVersion: RECORDS_VAULT_SCHEMA_VERSION,
    weekId: weekKeyFromDate(date),
    status: WEEK_STATUS.OPEN,
    driverId: requiredText(driverId, 'driverId'),
    carrierName: requiredText(carrierName, 'carrierName'),
    vehicleId: String(vehicleId || '').trim(),
    trailerId: String(trailerId || '').trim(),
    createdAt,
    updatedAt: createdAt,
    sealedAt: null,
    revision: 1,
    documents: [],
    amendments: [],
  };
}

export function createDocument(input, now = new Date()) {
  const type = requiredText(input.type, 'type');
  if (!Object.values(DOCUMENT_TYPES).includes(type)) throw new Error(`Unsupported document type: ${type}`);
  const createdAt = isoNow(now);
  return {
    id: requiredText(input.id, 'id'),
    type,
    status: DOCUMENT_STATUS.ACTIVE,
    date: requiredText(input.date, 'date'),
    time: String(input.time || '').trim(),
    timeZone: String(input.timeZone || 'America/Chicago').trim(),
    driverId: requiredText(input.driverId, 'driverId'),
    vehicleId: String(input.vehicleId || '').trim(),
    trailerId: String(input.trailerId || '').trim(),
    loadId: String(input.loadId || '').trim(),
    city: String(input.city || '').trim(),
    state: String(input.state || '').trim().toUpperCase().slice(0, 2),
    fileName: requiredText(input.fileName, 'fileName'),
    mimeType: String(input.mimeType || 'application/octet-stream').trim(),
    sizeBytes: Math.max(0, Number(input.sizeBytes || 0)),
    checksum: String(input.checksum || '').trim(),
    storageKey: requiredText(input.storageKey, 'storageKey'),
    note: String(input.note || '').trim(),
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    deletedReason: '',
    revision: 1,
  };
}

function assertOpen(week) {
  if (!week || week.status !== WEEK_STATUS.OPEN) throw new Error('Week is sealed');
}

export function addDocument(week, document, now = new Date()) {
  assertOpen(week);
  if (week.documents.some(item => item.id === document.id)) throw new Error('Document already exists');
  return {
    ...week,
    documents: [...week.documents, document],
    updatedAt: isoNow(now),
  };
}

export function softDeleteDocument(week, documentId, reason, now = new Date()) {
  assertOpen(week);
  let found = false;
  const deletedAt = isoNow(now);
  const documents = week.documents.map(document => {
    if (document.id !== documentId) return document;
    found = true;
    return {
      ...document,
      status: DOCUMENT_STATUS.DELETED,
      deletedAt,
      deletedReason: requiredText(reason, 'reason'),
      updatedAt: deletedAt,
      revision: document.revision + 1,
    };
  });
  if (!found) throw new Error('Document not found');
  return { ...week, documents, updatedAt: deletedAt };
}

export function restoreDocument(week, documentId, now = new Date()) {
  assertOpen(week);
  let found = false;
  const updatedAt = isoNow(now);
  const documents = week.documents.map(document => {
    if (document.id !== documentId) return document;
    found = true;
    return {
      ...document,
      status: DOCUMENT_STATUS.ACTIVE,
      deletedAt: null,
      deletedReason: '',
      updatedAt,
      revision: document.revision + 1,
    };
  });
  if (!found) throw new Error('Document not found');
  return { ...week, documents, updatedAt };
}

export function auditReadiness(week) {
  const active = week.documents.filter(document => document.status === DOCUMENT_STATUS.ACTIVE);
  const count = type => active.filter(document => document.type === type).length;
  const loadIds = [...new Set(active.map(document => document.loadId).filter(Boolean))];
  const missing = [];
  if (!count(DOCUMENT_TYPES.LOG)) missing.push('LOG');
  for (const loadId of loadIds) {
    const loadDocuments = active.filter(document => document.loadId === loadId);
    if (!loadDocuments.some(document => document.type === DOCUMENT_TYPES.BOL)) missing.push(`${loadId}:BOL`);
    if (!loadDocuments.some(document => document.type === DOCUMENT_TYPES.POD)) missing.push(`${loadId}:POD`);
  }
  return {
    ready: missing.length === 0,
    missing,
    activeDocumentCount: active.length,
    deletedDocumentCount: week.documents.length - active.length,
    loadCount: loadIds.length,
  };
}

export function sealWeek(week, now = new Date()) {
  assertOpen(week);
  const readiness = auditReadiness(week);
  if (!readiness.ready) throw new Error(`Week is incomplete: ${readiness.missing.join(', ')}`);
  const sealedAt = isoNow(now);
  return {
    ...week,
    status: WEEK_STATUS.SEALED,
    sealedAt,
    updatedAt: sealedAt,
  };
}

export function addAmendment(sealedWeek, { reason, documentIds = [] }, now = new Date()) {
  if (!sealedWeek || sealedWeek.status !== WEEK_STATUS.SEALED) throw new Error('Week must be sealed');
  const createdAt = isoNow(now);
  return {
    ...sealedWeek,
    revision: sealedWeek.revision + 1,
    updatedAt: createdAt,
    amendments: [
      ...sealedWeek.amendments,
      {
        id: `amendment-${sealedWeek.revision + 1}`,
        reason: requiredText(reason, 'reason'),
        documentIds: [...new Set(documentIds.map(String))],
        createdAt,
      },
    ],
  };
}
