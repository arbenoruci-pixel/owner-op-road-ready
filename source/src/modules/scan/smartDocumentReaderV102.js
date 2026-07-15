import { classifyDocument, documentTypeMeta, extractDocumentFields } from './smartScan.js';
import {
  analyzeSmartDocumentV100,
  parseBolFieldsV100,
  parseFuelReceiptFieldsV100,
} from './smartDocumentReaderV100.js';
import { isPdfFileV102, readPdfTextV102 } from './pdfTextV102.js';
import { parseRateConfirmationV102 } from './rateConfirmationParserV102.js';

function selectedType(preferredType = 'auto', classification = {}) {
  if (preferredType && preferredType !== 'auto') return documentTypeMeta(preferredType);
  return classification.type || documentTypeMeta('other');
}

function mergeMeaningful(...sources) {
  const out = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source || {})) {
      if (value !== '' && value !== 0 && value != null) out[key] = value;
    }
  }
  return out;
}

function parseByType(typeId = 'other', text = '', baseFields = {}, now = new Date()) {
  if (typeId === 'rate_confirmation') return parseRateConfirmationV102(text, baseFields, now);
  if (typeId === 'bol' || typeId === 'pod') return parseBolFieldsV100(text, baseFields, now);
  if (typeId === 'fuel_receipt') return parseFuelReceiptFieldsV100(text, baseFields, now);
  return baseFields;
}

export async function analyzeSmartDocumentV102(file, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const preferredType = options.preferredType || 'auto';
  const now = options.now instanceof Date ? options.now : new Date();

  if (isPdfFileV102(file)) {
    const pdf = await readPdfTextV102(file, {
      onProgress:(value, text) => onProgress(.02 + value * .72, text),
    });
    const text = String(pdf?.text || '');
    const classification = classifyDocument(text, file?.name || '');
    const type = selectedType(preferredType, classification);
    const standard = extractDocumentFields(text, type.id);
    const fields = parseByType(type.id, text, standard, now);
    const evidence = Number(fields.documentEvidence || 0);
    const nativeText = pdf?.nativeText === true;
    const confidence = text
      ? Math.min(nativeText ? .99 : .93, (nativeText ? .62 : .48) + evidence * (nativeText ? .36 : .44))
      : .18;
    const needsReview = !text || fields.needsFieldReview === true || confidence < .82;
    onProgress(1, nativeText ? 'Native PDF text and load details ready' : 'PDF ready for review');
    return {
      type,
      detectedType:classification.type,
      confidence,
      alternatives:classification.alternatives || [],
      text,
      method:pdf?.method || 'pdf-import-no-text',
      fields,
      pages:pdf?.pages || [],
      pageCount:pdf?.pageCount,
      preferredType,
      needsReview,
      nativePdfText:nativeText,
      wordCount:Number(pdf?.wordCount || 0),
    };
  }

  const base = await analyzeSmartDocumentV100(file, {
    ...options,
    onProgress:(value, text) => onProgress(value * .86, text),
  });
  const type = selectedType(preferredType, base || {});
  const text = String(base?.text || '');
  const reparsed = parseByType(type.id, text, base?.fields || {}, now);
  const fields = mergeMeaningful(base?.fields, reparsed);
  const evidence = Number(fields.documentEvidence || base?.fieldCoverage || 0);
  const confidence = Math.min(.96, Math.max(Number(base?.confidence || .28), .36 + evidence * .58));
  onProgress(1, type.id === 'rate_confirmation' ? 'Rate confirmation details ready' : 'Document reader ready');
  return {
    ...base,
    type,
    fields,
    confidence,
    method:`pro-reader-v102:${base?.method || 'ocr'}`,
    needsReview:fields.needsFieldReview === true || confidence < .82,
  };
}

export const analyzeDocumentFilePro = analyzeSmartDocumentV102;
