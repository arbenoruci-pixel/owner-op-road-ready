import {
  SMART_DOCUMENT_TYPES,
  analyzeScanFile,
  classifyDocument,
  documentTypeMeta,
  extractDocumentFields,
} from './smartScan.js';

let tesseractLoadPromise = null;
let tesseractWorkerPromise = null;
let tesseractProgress = null;

function uniqueTypes(values = []) {
  const seen = new Set();
  return values.filter(Boolean).filter(type => {
    if (!type?.id || seen.has(type.id)) return false;
    seen.add(type.id);
    return true;
  });
}

function loadScript(src, id) {
  if (typeof document === 'undefined') return Promise.reject(new Error('document_unavailable'));
  const existing = document.getElementById(id);
  if (existing?.dataset.loaded === 'true') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = existing || document.createElement('script');
    script.id = id;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = src;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error('web_ocr_script_failed'));
    if (!existing) document.head.appendChild(script);
  });
}

async function loadTesseract() {
  if (typeof window === 'undefined') return null;
  if (window.Tesseract?.createWorker) return window.Tesseract;
  if (!tesseractLoadPromise) {
    tesseractLoadPromise = loadScript(
      'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
      'road-ready-tesseract-v5'
    ).then(() => window.Tesseract || null);
  }
  return tesseractLoadPromise;
}

async function webOcrWorker(onProgress) {
  tesseractProgress = onProgress;
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = (async () => {
      const Tesseract = await loadTesseract();
      if (!Tesseract?.createWorker) throw new Error('web_ocr_unavailable');
      const worker = await Tesseract.createWorker('eng', 1, {
        logger(message = {}) {
          if (typeof tesseractProgress === 'function') tesseractProgress(message);
        },
      });
      try {
        await worker.setParameters({
          preserve_interword_spaces:'1',
          tessedit_pageseg_mode:'6',
        });
      } catch {}
      return worker;
    })();
  }
  return tesseractWorkerPromise;
}

async function readWithWebOcr(file, onProgress) {
  if (typeof window === 'undefined' || !String(file?.type || '').startsWith('image/')) return null;
  try {
    const worker = await webOcrWorker(message => {
      const progress = Number(message?.progress || 0);
      const status = String(message?.status || 'Reading document').replace(/_/g, ' ');
      onProgress?.(0.32 + (progress * 0.48), `${status.charAt(0).toUpperCase()}${status.slice(1)}…`);
    });
    const result = await worker.recognize(file, { rotateAuto:true });
    const text = String(result?.data?.text || '').trim();
    return text ? { text, method:'web-ocr', confidence:Number(result?.data?.confidence || 0) / 100 } : null;
  } catch {
    return null;
  }
}

async function readBarcodes(file) {
  if (typeof window === 'undefined' || typeof window.BarcodeDetector !== 'function' || !String(file?.type || '').startsWith('image/')) return [];
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
    return { ...detected, type:preferred, confidence:Math.max(detected.confidence || 0, hasText ? 0.88 : 0.76) };
  }
  const detectedStrong = hasText && Number(detected?.confidence || 0) >= 0.94 && detected?.type?.id !== 'other';
  if (detectedStrong) return detected;
  return {
    ...detected,
    type:preferred,
    confidence:Math.max(hasText ? 0.82 : 0.72, Math.min(0.9, Number(detected?.confidence || 0))),
    alternatives:uniqueTypes([preferred, detected?.type, ...(detected?.alternatives || [])]),
    hinted:true,
  };
}

export async function analyzeDocumentFilePro(file, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const preferredType = options.preferredType || 'auto';
  onProgress(0.04, 'Preparing enhanced scan…');

  let base;
  try {
    base = await analyzeScanFile(file, {
      onProgress(value, text) {
        onProgress(0.05 + (Number(value || 0) * 0.2), text);
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
  if (baseText.length < 24 && String(file?.type || '').startsWith('image/')) {
    onProgress(0.27, 'Starting enhanced on-device OCR…');
    webOcr = await readWithWebOcr(file, onProgress);
  }

  onProgress(0.83, 'Reading barcodes and document numbers…');
  const barcodes = await readBarcodes(file);
  const textParts = [baseText, webOcr?.text || '', barcodes.length ? `Detected barcode values:\n${barcodes.join('\n')}` : ''].filter(Boolean);
  const text = textParts.join('\n').trim();
  const detected = classifyDocument(text, file?.name || '');
  const selected = preferredTypeResult(preferredType, detected, Boolean(text));
  const extracted = extractDocumentFields(text, selected.type.id);
  const fields = {
    ...(base?.fields || {}),
    ...extracted,
  };
  if (!fields.loadNo && barcodes.length) fields.loadNo = barcodes[0].toUpperCase();

  const confidence = Math.max(
    Number(selected.confidence || 0),
    Number(webOcr?.confidence || 0) * 0.75,
    preferredType !== 'auto' ? (text ? 0.82 : 0.72) : 0
  );
  const method = base?.method === 'native'
    ? 'native'
    : base?.method === 'on-device'
      ? 'on-device'
      : webOcr?.method || base?.method || 'smart-review';
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
    alternatives,
    text,
    method,
    fields,
    barcodes,
    preferredType,
    hinted:Boolean(selected.hinted),
    needsReview:!text || confidence < 0.78,
  };
}
