import { classifyDocument, documentTypeMeta, extractDocumentFields } from './smartScan.js';
import {
  analyzeSmartDocumentV102,
} from './smartDocumentReaderV102.js';
import {
  parseBolFieldsV100,
  parseFuelReceiptFieldsV100,
} from './smartDocumentReaderV100.js';
import { isPdfFileV102, readPdfTextV102 } from './pdfTextV102.js';
import { parseRateConfirmationV102 } from './rateConfirmationParserV102.js';
import { arbitrateDocumentTypeV104 } from './documentTypeArbiterV104.js';

function mergeMeaningful(...sources) {
  const out = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source || {})) {
      if (value !== '' && value !== 0 && value != null) out[key] = value;
    }
  }
  return out;
}

function alternativesWithWinner(winner, generic = {}) {
  const list = [winner, ...(generic.alternatives || [])].filter(Boolean);
  return [...new Map(list.map(item => [item.id, item])).values()].slice(0, 6);
}

export function parseSmartDocumentTextByTypeV104(typeId = 'other', text = '', baseFields = {}, now = new Date()) {
  const standard = extractDocumentFields(text, typeId);
  const seed = mergeMeaningful(standard, baseFields);
  if (typeId === 'rate_confirmation') return parseRateConfirmationV102(text, seed, now);
  if (typeId === 'bol' || typeId === 'pod') return parseBolFieldsV100(text, seed, now);
  if (typeId === 'fuel_receipt') return parseFuelReceiptFieldsV100(text, seed, now);
  return seed;
}

function confidenceFor({ nativeText = false, fields = {}, typeId = 'other', fallback = 0.25 }) {
  const evidence = Math.max(0, Math.min(1, Number(fields.documentEvidence || 0)));
  if (nativeText && typeId === 'rate_confirmation') return Math.min(.99, .64 + evidence * .35);
  if (nativeText) return Math.min(.98, .58 + evidence * .38);
  return Math.min(.96, Math.max(Number(fallback || .25), .35 + evidence * .58));
}

export async function analyzeSmartDocumentV104(file, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const preferredType = options.preferredType || 'auto';
  const now = options.now instanceof Date ? options.now : new Date();

  if (isPdfFileV102(file)) {
    const pdf = await readPdfTextV102(file, {
      onProgress:(value, message) => onProgress(.02 + value * .72, message),
    });
    const text = String(pdf?.text || '');
    const generic = classifyDocument(text, file?.name || '');
    const decision = arbitrateDocumentTypeV104({
      fullText:text,
      fileName:file?.name || '',
      pages:pdf?.pages || [],
      preferredType,
      genericClassification:generic,
    });
    const type = decision.type || documentTypeMeta('other');
    const fields = parseSmartDocumentTextByTypeV104(type.id, text, {}, now);
    const nativeText = pdf?.nativeText === true;
    const confidence = confidenceFor({ nativeText, fields, typeId:type.id, fallback:generic.confidence });
    const needsReview = !text || fields.needsFieldReview === true || confidence < .82;
    onProgress(1, type.id === 'rate_confirmation' ? 'Rate Confirmation route and pay details ready' : 'Document details ready');
    return {
      type,
      detectedType:type,
      genericDetectedType:generic.type,
      typeDecision:decision,
      confidence,
      alternatives:alternativesWithWinner(type, generic),
      text,
      method:`${pdf?.method || 'pdf-import-no-text'}:smart-type-v104`,
      fields,
      pages:pdf?.pages || [],
      pageCount:pdf?.pageCount,
      preferredType,
      needsReview,
      nativePdfText:nativeText,
      wordCount:Number(pdf?.wordCount || 0),
    };
  }

  const base = await analyzeSmartDocumentV102(file, {
    ...options,
    onProgress:(value, message) => onProgress(value * .86, message),
  });
  const text = String(base?.text || '');
  const generic = classifyDocument(text, file?.name || '');
  const decision = arbitrateDocumentTypeV104({
    fullText:text,
    fileName:file?.name || '',
    pages:base?.pages || [],
    preferredType,
    genericClassification:generic,
  });
  const type = decision.type || base?.type || documentTypeMeta('other');
  const sameType = type.id === base?.type?.id;
  const fields = parseSmartDocumentTextByTypeV104(type.id, text, sameType ? (base?.fields || {}) : {}, now);
  const confidence = confidenceFor({ nativeText:false, fields, typeId:type.id, fallback:base?.confidence || generic.confidence });
  onProgress(1, type.id === 'rate_confirmation' ? 'Rate Confirmation details ready' : 'Smart document reader ready');
  return {
    ...base,
    type,
    detectedType:type,
    genericDetectedType:generic.type,
    typeDecision:decision,
    fields,
    confidence,
    alternatives:alternativesWithWinner(type, generic),
    method:`smart-reader-v104:${base?.method || 'ocr'}`,
    needsReview:fields.needsFieldReview === true || confidence < .82,
  };
}

export const analyzeDocumentFilePro = analyzeSmartDocumentV104;
