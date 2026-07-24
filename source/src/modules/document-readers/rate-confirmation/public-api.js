import { createReaderFailure, createReaderResult, DOCUMENT_KIND } from '../../document-pipeline/contracts.js';

export const RATE_CONFIRMATION_READER_VERSION = '1.0.0';
export const RATE_CONFIRMATION_READER_NAME = 'rate-confirmation-reader';

export async function readRateConfirmation(input, engine) {
  try {
    if (!input?.documentId) throw new Error('documentId is required');
    if (typeof engine !== 'function') throw new Error('rate confirmation engine is required');

    const output = await engine({
      file: input.normalizedFile || input.originalFile,
      allowedFields: [
        'brokerName', 'brokerPhone', 'brokerEmail', 'loadNumber', 'rate',
        'currency', 'pickupStops', 'deliveryStops', 'commodity', 'weight',
        'equipmentType', 'specialInstructions',
      ],
    });

    return createReaderResult({
      documentId: input.documentId,
      kind: DOCUMENT_KIND.RATE_CONFIRMATION,
      readerName: RATE_CONFIRMATION_READER_NAME,
      readerVersion: RATE_CONFIRMATION_READER_VERSION,
      confidence: output?.confidence,
      fields: output?.fields,
      warnings: output?.warnings,
      evidence: output?.evidence,
    });
  } catch (error) {
    return createReaderFailure({
      documentId: input?.documentId,
      kind: DOCUMENT_KIND.RATE_CONFIRMATION,
      readerName: RATE_CONFIRMATION_READER_NAME,
      readerVersion: RATE_CONFIRMATION_READER_VERSION,
      error,
    });
  }
}

export const rateConfirmationReader = Object.freeze({
  name: RATE_CONFIRMATION_READER_NAME,
  version: RATE_CONFIRMATION_READER_VERSION,
  read: readRateConfirmation,
});
