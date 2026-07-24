import { createReaderFailure, createReaderResult, DOCUMENT_KIND } from '../../document-pipeline/contracts.js';

export const BOL_READER_VERSION = '1.0.0';
export const BOL_READER_NAME = 'bol-reader';

export async function readBol(input, engine) {
  try {
    if (!input?.documentId) throw new Error('documentId is required');
    if (typeof engine !== 'function') throw new Error('BOL engine is required');

    const output = await engine({
      file: input.normalizedFile || input.originalFile,
      allowedFields: [
        'bolNumber', 'loadNumber', 'shipperName', 'consigneeName',
        'origin', 'destination', 'pickupDate', 'commodity', 'pieceCount',
        'weight', 'sealNumber', 'specialInstructions',
      ],
    });

    return createReaderResult({
      documentId: input.documentId,
      kind: DOCUMENT_KIND.BOL,
      readerName: BOL_READER_NAME,
      readerVersion: BOL_READER_VERSION,
      confidence: output?.confidence,
      fields: output?.fields,
      warnings: output?.warnings,
      evidence: output?.evidence,
    });
  } catch (error) {
    return createReaderFailure({
      documentId: input?.documentId,
      kind: DOCUMENT_KIND.BOL,
      readerName: BOL_READER_NAME,
      readerVersion: BOL_READER_VERSION,
      error,
    });
  }
}

export const bolReader = Object.freeze({ name: BOL_READER_NAME, version: BOL_READER_VERSION, read: readBol });
