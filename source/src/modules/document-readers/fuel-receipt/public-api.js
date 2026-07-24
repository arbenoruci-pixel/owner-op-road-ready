import { createReaderFailure, createReaderResult, DOCUMENT_KIND } from '../../document-pipeline/contracts.js';

export const FUEL_RECEIPT_READER_VERSION = '1.0.0';
export const FUEL_RECEIPT_READER_NAME = 'fuel-receipt-reader';

export async function readFuelReceipt(input, engine) {
  try {
    if (!input?.documentId) throw new Error('documentId is required');
    if (typeof engine !== 'function') throw new Error('fuel receipt engine is required');

    const output = await engine({
      file: input.normalizedFile || input.originalFile,
      allowedFields: [
        'merchantName', 'date', 'time', 'city', 'state', 'gallons',
        'fuelType', 'pricePerGallon', 'subtotal', 'tax', 'total',
        'truckNumber', 'odometer', 'paymentReference',
      ],
    });

    return createReaderResult({
      documentId: input.documentId,
      kind: DOCUMENT_KIND.FUEL_RECEIPT,
      readerName: FUEL_RECEIPT_READER_NAME,
      readerVersion: FUEL_RECEIPT_READER_VERSION,
      confidence: output?.confidence,
      fields: output?.fields,
      warnings: output?.warnings,
      evidence: output?.evidence,
    });
  } catch (error) {
    return createReaderFailure({
      documentId: input?.documentId,
      kind: DOCUMENT_KIND.FUEL_RECEIPT,
      readerName: FUEL_RECEIPT_READER_NAME,
      readerVersion: FUEL_RECEIPT_READER_VERSION,
      error,
    });
  }
}

export const fuelReceiptReader = Object.freeze({
  name: FUEL_RECEIPT_READER_NAME,
  version: FUEL_RECEIPT_READER_VERSION,
  read: readFuelReceipt,
});
