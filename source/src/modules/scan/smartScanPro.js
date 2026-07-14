import {
  SMART_DOCUMENT_TYPES,
  analyzeScanFile,
  classifyDocument,
  documentTypeMeta,
  extractDocumentFields,
} from './smartScan.js';
import { renderDocumentFile } from './documentScannerEngine.js';
import { recognizeDocumentText } from './webOcr.js';
import { extractProDocumentFields } from './smartScanExtractionPro.js';

function uniqueTypes(values = []) {
  const seen = new Set();
  return values.filter(Boolean).filter(type => {
    if (!type?.id || seen.has(type.id)) return false;
    seen.add(type.id);
    return true;
  });
}

function meaningful(value) {
  if (value == null || value === '') return false;
  if (typeof value === 'number' && value === 0) return false;
  return true;
}

function mergeFields(...sources) {
  const out = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source || {})) {
      if (meaningful(value)) out[key] = value;
    }
  }
  return out;
}

async function readBarcodes(file) {
  if (
    typeof window === 'undefined'
    || typeof window.BarcodeDetector !== 'function'
    || typeof createImageBitmap !== 'function'
    || !String(file?.type || '').startsWith('image/')
  ) return [];
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    let formats;
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats?.();
      formats = (supported || []).filter(format => ['code_128','code_39','qr_code','data_matrix','pdf417','aztec'].includes(format));
    } catch {}
    const detector = new window.BarcodeDetector(formats?.length ? { formats } : undefined);
    const results = await detector.detect(bitmap);
    return [...new Set((results || []).map(item => String(item.rawValue || '').trim()).filter(Boolean))].slice(0, 8);
  } catch {
    return [];
  } finally {
    try { bitmap?.close?.(); } catch {}
  }
}

function preferredTypeResult(preferredType, detected, hasText) {
  if (!preferredType || preferredType === 'auto') return detected;
  const preferred = documentTypeMeta(preferredType);
  if (!preferred?.id || preferred.id === 'other') return detected;
  if (detected?.type?.id === preferred.id) {
    return {
      ...detected,
      type:preferred,
      confidence:Math.max(Number(detected.confidence || 0), hasText ? 0.91 : 0.78),
    };
  }
  const detectedStrong = hasText && Number(detected?.confidence || 0) >= 0.96 && detected?.type?.id !== 'other';
  if (detectedStrong) return detected;
  return {
    ...detected,
    type:preferred,
    confidence:Math.max(hasText ? 0.84 : 0.73, Math.min(0.91, Number(detected?.confidence || 0))),
    alternatives:uniqueTypes([preferred, detected?.type, ...(detected?.alternatives || [])]),
    hinted:true,
  };
}

function ocrCandidateScore(result, preferredType = 'auto') {
  if (!result?.text) return -1;
  const classification = classifyDocument(result.text, 'scan.jpg');
  let score = Number(result.confidence || 0) * 100;
  score += Math.min(34, String(result.text).length / 28);
  score += Number(classification.confidence || 0) * 22;
  if (preferredType !== 'auto' && classification.type?.id === preferredType) score += 22;
  return score;
}

async function runWebOcr(file, preferredType, onProgress) {
  if (!String(file?.type || '').startsWith('image/')) return null;
  let first = null;
  try {
    first = await recognizeDocumentText(file, {
      onProgress(progress, status) {
        onProgress?.(0.28 + (Number(progress || 0) * 0.39), `${String(status || 'Reading text').replace(/_/g, ' ')}…`);
      },
    });
  } catch {}

  const firstText = String(first?.text || '').trim();
  const firstClass = firstText ? classifyDocument(firstText, file?.name || '') : null;
  const needsSecondPass = !firstText
    || firstText.length < 90
    || Number(first?.confidence || 0) < 0.52
    || (preferredType !== 'auto' && firstClass?.type?.id !== preferredType && Number(firstClass?.confidence || 0) < 0.9);

  if (!needsSecondPass) return first;

  let second = null;
  try {
    onProgress?.(0.69, 'Trying high-contrast OCR…');
    const blackAndWhite = await renderDocumentFile(file, {
      filter:'bw',
      maxDimension:2500,
      quality:.96,
      name:`road-ready-ocr-bw-${Date.now()}.jpg`,
    });
    second = await recognizeDocumentText(blackAndWhite, {
      onProgress(progress, status) {
        onProgress?.(0.7 + (Number(progress || 0) * 0.18), `${String(status || 'Reading high contrast').replace(/_/g, ' ')}…`);
      },
    });
  } catch {}

  return ocrCandidateScore(second, preferredType) > ocrCandidateScore(first, preferredType) ? second : first;
}

export async function analyzeDocumentFilePro(file, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const preferredType = options.preferredType || 'auto';
  onProgress(0.03, 'Preparing enhanced scan…');

  let base;
  try {
    base = await analyzeScanFile(file, {
      onProgress(value, text) {
        onProgress(0.04 + (Number(value || 0) * 0.19), text);
      },
    });
  } catch {
    base = {
      type:documentTypeMeta('other'),
      confidence:0.2,
      alternatives:SMART_DOCUMENT_TYPES.slice(0, 5),
      text:'',
      method:'smart-review',
      fields:{},
      needsReview:true,
    };
  }

  const baseText = String(base?.text || '').trim();
  let webOcr = null;
  const shouldRunWebOcr = String(file?.type || '').startsWith('image/')
    && base?.method !== 'native'
    && (baseText.length < 130 || Number(base?.confidence || 0) < 0.88 || preferredType !== 'auto');
  if (shouldRunWebOcr) {
    onProgress(0.25, 'Starting document OCR…');
    webOcr = await runWebOcr(file, preferredType, onProgress);
  }

  onProgress(0.9, 'Reading barcodes and document numbers…');
  const barcodes = await readBarcodes(file);
  const textParts = [];
  for (const value of [baseText, webOcr?.text || '', barcodes.length ? `Detected barcode values:\n${barcodes.join('\n')}` : '']) {
    const clean = String(value || '').trim();
    if (clean && !textParts.includes(clean)) textParts.push(clean);
  }
  const text = textParts.join('\n').trim();
  const detected = classifyDocument(text, file?.name || '');
  const selected = preferredTypeResult(preferredType, detected, Boolean(text));
  const standardFields = extractDocumentFields(text, selected.type.id);
  const proFields = extractProDocumentFields(text, selected.type.id);
  const fields = mergeFields(base?.fields, standardFields, proFields);
  if (!fields.loadNo && barcodes.length) fields.loadNo = barcodes[0].toUpperCase();
  if (barcodes.length) fields.barcodeValues = barcodes;

  const confidence = Math.max(
    Number(selected.confidence || 0),
    Number(webOcr?.confidence || 0) * 0.78,
    preferredType !== 'auto' ? (text ? 0.84 : 0.73) : 0
  );
  const method = base?.method === 'native'
    ? 'native'
    : webOcr?.method
      || (base?.method === 'on-device' ? 'on-device' : base?.method || 'smart-review');
  const alternatives = uniqueTypes([
    selected.type,
    ...(selected.alternatives || []),
    ...(base?.alternatives || []),
    documentTypeMeta('other'),
  ]).slice(0, 8);

  onProgress(1, 'Ready to review');
  return {
    type:selected.type,
    detectedType:detected.type,
    confidence:Math.min(0.99, confidence),
    ocrConfidence:Number(webOcr?.confidence || 0),
    alternatives,
    text,
    method,
    fields,
    barcodes,
    preferredType,
    hinted:Boolean(selected.hinted),
    needsReview:!text || confidence < 0.8 || selected.type?.id === 'other',
  };
}
