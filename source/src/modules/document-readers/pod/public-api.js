import { createReaderFailure, createReaderResult, DOCUMENT_KIND } from '../../document-pipeline/contracts.js';

export const POD_READER_VERSION = '1.0.0';
export const POD_READER_NAME = 'pod-reader';

export async function readPod(input, engine) {
  try {
    if (!input?.documentId) throw new Error('documentId is required');
    if (typeof engine !== 'function') throw new Error('POD engine is required');

    const output = await engine({
      file: input.normalizedFile || input.originalFile,
      allowedFields: [
        'loadNumber', 'deliveryDate', 'deliveryTime', 'receiverName',
        'deliveryLocation', 'signed', 'signaturePresent', 'exceptions',
        'pieceCount', 'sealNumber',
      ],
    });

    return createReaderResult({
      documentId: input.documentId,
      kind: DOCUMENT_KIND.POD,
      readerName: POD_READER_NAME,
      readerVersion: POD_READER_VERSION,
      confidence: output?.confidence,
      fields: output?.fields,
      warnings: output?.warnings,
      evidence: output?.evidence,
    });
  } catch (error) {
    return createReaderFailure({
      documentId: input?.documentId,
      kind: DOCUMENT_KIND.POD,
      readerName: POD_READER_NAME,
      readerVersion: POD_READER_VERSION,
      error,
    });
  }
}

export const podReader = Object.freeze({ name: POD_READER_NAME, version: POD_READER_VERSION, read: readPod });
