export const DOCUMENT_KIND = Object.freeze({
  UNKNOWN: 'UNKNOWN',
  RATE_CONFIRMATION: 'RATE_CONFIRMATION',
  BOL: 'BOL',
  POD: 'POD',
  FUEL_RECEIPT: 'FUEL_RECEIPT',
  TOLL_RECEIPT: 'TOLL_RECEIPT',
  SCALE_TICKET: 'SCALE_TICKET',
  LUMPER_RECEIPT: 'LUMPER_RECEIPT',
  INSPECTION: 'INSPECTION',
  LOGBOOK_EXPORT: 'LOGBOOK_EXPORT',
});

export const PIPELINE_STAGE = Object.freeze({
  IMPORTED: 'IMPORTED',
  SCANNED: 'SCANNED',
  ROUTED: 'ROUTED',
  READ: 'READ',
  STORED: 'STORED',
  FAILED: 'FAILED',
});

export function createDocumentInput({
  documentId,
  originalFile,
  normalizedFile = null,
  explicitKind = DOCUMENT_KIND.UNKNOWN,
  source = 'IMPORT',
  capturedAt = new Date().toISOString(),
  metadata = {},
}) {
  if (!documentId) throw new Error('documentId is required');
  if (!originalFile) throw new Error('originalFile is required');

  return Object.freeze({
    documentId,
    originalFile,
    normalizedFile,
    explicitKind,
    source,
    capturedAt,
    metadata: Object.freeze({ ...metadata }),
  });
}

export function createReaderResult({
  documentId,
  kind,
  readerName,
  readerVersion,
  confidence = 0,
  fields = {},
  warnings = [],
  evidence = [],
}) {
  return Object.freeze({
    documentId,
    kind,
    readerName,
    readerVersion,
    confidence: Math.max(0, Math.min(1, Number(confidence) || 0)),
    fields: Object.freeze({ ...fields }),
    warnings: Object.freeze([...warnings]),
    evidence: Object.freeze([...evidence]),
    readAt: new Date().toISOString(),
  });
}

export function createReaderFailure({ documentId, kind, readerName, readerVersion, error }) {
  return Object.freeze({
    documentId,
    kind,
    readerName,
    readerVersion,
    error: String(error?.message || error || 'Reader failed'),
    failedAt: new Date().toISOString(),
  });
}
