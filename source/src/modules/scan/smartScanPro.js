import {
  SMART_DOCUMENT_TYPES,
  analyzeScanFile,
  classifyDocument,
  documentTypeMeta,
  extractDocumentFields,
} from './smartScan.js';
import { renderDocumentFileV985 } from './documentQualityV985.js';
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

function cleanText(value = '') {
  return String(value || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function validIdentifier(value = '', options = {}) {
  const normalized = String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .replace(/^[-_]+|[-_]+$/g, '');
  const min = Number(options.min || 3);
  const max = Number(options.max || 24);
  if (normalized.length < min || normalized.length > max) return '';
  if (options.requireDigit !== false && !/\d/.test(normalized)) return '';
  if (/^(?:ACCOUNT|BILL|CARRIER|CUSTOMER|LOAD|LOADED|LOADES|NAME|NUMBER|ORDER|SEAL|SHIP|TOTAL|TRAILER|WEIGHT)$/i.test(normalized)) return '';
  return normalized;
}

function validRoute(value = '') {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length < 4 || normalized.length > 230) return '';
  if (!/[A-Za-z]{2}/.test(normalized)) return '';
  if (/^(?:BE|FROM|TO|SHIP|SHIP FROM|SHIP TO|CITY,? ST|ACCOUNT|NUMBER|LOADES?)$/i.test(normalized)) return '';
  return normalized;
}

function validNumber(value, min = 1, max = 100_000_000) {
  const parsed = Number(String(value ?? '').replace(/[, ]/g, ''));
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : 0;
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

async function runOcrPass(file, options = {}) {
  try {
    return await recognizeDocumentText(file, {
      pageSegMode:String(options.pageSegMode || '11'),
      onProgress(progress, status) {
        const start = Number(options.progressStart || 0);
        const span = Number(options.progressSpan || 0);
        options.onProgress?.(
          start + (Number(progress || 0) * span),
          `${String(options.label || status || 'Reading text').replace(/_/g, ' ')}…`
        );
      },
    });
  } catch {
    return null;
  }
}

async function cropRegionFile(file, region = {}, name = 'region') {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return null;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const x = Math.max(0, Math.min(.98, Number(region.x || 0)));
    const y = Math.max(0, Math.min(.98, Number(region.y || 0)));
    const widthRatio = Math.max(.02, Math.min(1 - x, Number(region.width || 1)));
    const heightRatio = Math.max(.02, Math.min(1 - y, Number(region.height || 1)));
    const sx = Math.max(0, Math.floor(bitmap.width * x));
    const sy = Math.max(0, Math.floor(bitmap.height * y));
    const sw = Math.max(2, Math.floor(bitmap.width * widthRatio));
    const sh = Math.max(2, Math.floor(bitmap.height * heightRatio));
    const targetWidth = Math.max(1100, Math.min(2200, Number(region.targetWidth || 1700)));
    const scale = targetWidth / sw;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(sw * scale));
    canvas.height = Math.max(2, Math.round(sh * scale));
    const context = canvas.getContext('2d', { alpha:false });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .98));
    return blob ? new File([blob], `road-ready-ocr-${name}-${Date.now()}.jpg`, { type:'image/jpeg' }) : null;
  } catch {
    return null;
  } finally {
    try { bitmap?.close?.(); } catch {}
  }
}

function appendUniqueText(parts, value, marker = '') {
  const clean = cleanText(value);
  if (!clean) return;
  const body = marker ? `${marker}\n${clean}` : clean;
  if (!parts.includes(body)) parts.push(body);
}

async function runBolRegionOcr(cleanFile, onProgress) {
  const regions = [
    {
      name:'HEADER',
      box:{ x:0, y:0, width:1, height:.34, targetWidth:1900 },
      pageSegMode:'6',
      progressStart:.57,
      progressSpan:.08,
      label:'Reading BOL numbers',
    },
    {
      name:'ROUTE',
      box:{ x:0, y:.03, width:.61, height:.39, targetWidth:1800 },
      pageSegMode:'6',
      progressStart:.65,
      progressSpan:.08,
      label:'Reading shipper and receiver',
    },
    {
      name:'TOTALS',
      box:{ x:0, y:.37, width:1, height:.34, targetWidth:2000 },
      pageSegMode:'6',
      progressStart:.73,
      progressSpan:.07,
      label:'Reading pieces and weight',
    },
    {
      name:'FOOTER',
      box:{ x:0, y:.67, width:1, height:.33, targetWidth:1900 },
      pageSegMode:'6',
      progressStart:.80,
      progressSpan:.07,
      label:'Reading handwritten times',
    },
  ];
  const results = [];
  for (const region of regions) {
    const regionFile = await cropRegionFile(cleanFile, region.box, region.name.toLowerCase());
    if (!regionFile) continue;
    const result = await runOcrPass(regionFile, {
      pageSegMode:region.pageSegMode,
      progressStart:region.progressStart,
      progressSpan:region.progressSpan,
      label:region.label,
      onProgress,
    });
    if (result?.text) results.push({ ...result, region:region.name });
  }
  return results;
}

async function runWebOcr(file, preferredType, onProgress) {
  if (!String(file?.type || '').startsWith('image/')) return { best:null, texts:[], passes:[] };
  const passes = [];
  let cleanFile = file;
  try {
    onProgress?.(.24, 'Building high-resolution text image…');
    cleanFile = await renderDocumentFileV985(file, {
      filter:'auto',
      maxDimension:3400,
      quality:.99,
      name:`road-ready-ocr-clean-${Date.now()}.jpg`,
    });
  } catch {}

  const cleanPass = await runOcrPass(cleanFile, {
    pageSegMode:'11',
    progressStart:.27,
    progressSpan:.22,
    label:'Reading full document',
    onProgress,
  });
  if (cleanPass?.text) passes.push({ ...cleanPass, pass:'clean-full' });

  const truckingForm = ['bol','pod'].includes(preferredType);
  if (truckingForm) {
    let grayFile = cleanFile;
    try {
      grayFile = await renderDocumentFileV985(file, {
        filter:'gray',
        maxDimension:3300,
        quality:.99,
        name:`road-ready-ocr-gray-${Date.now()}.jpg`,
      });
    } catch {}
    const grayPass = await runOcrPass(grayFile, {
      pageSegMode:'6',
      progressStart:.49,
      progressSpan:.08,
      label:'Reading table layout',
      onProgress,
    });
    if (grayPass?.text) passes.push({ ...grayPass, pass:'gray-block' });
    passes.push(...await runBolRegionOcr(cleanFile, onProgress));
  } else {
    const firstText = String(cleanPass?.text || '').trim();
    const firstClass = firstText ? classifyDocument(firstText, file?.name || '') : null;
    const needsRetry = !firstText
      || firstText.length < 90
      || Number(cleanPass?.confidence || 0) < .52
      || (preferredType !== 'auto' && firstClass?.type?.id !== preferredType && Number(firstClass?.confidence || 0) < .9);
    if (needsRetry) {
      let blackAndWhite = file;
      try {
        onProgress?.(.62, 'Trying high-contrast OCR…');
        blackAndWhite = await renderDocumentFileV985(file, {
          filter:'bw',
          maxDimension:2800,
          quality:.98,
          name:`road-ready-ocr-bw-${Date.now()}.jpg`,
        });
      } catch {}
      const retry = await runOcrPass(blackAndWhite, {
        pageSegMode:'6',
        progressStart:.65,
        progressSpan:.18,
        label:'Reading high contrast',
        onProgress,
      });
      if (retry?.text) passes.push({ ...retry, pass:'bw-block' });
    }
  }

  const best = [...passes].sort((a, b) => ocrCandidateScore(b, preferredType) - ocrCandidateScore(a, preferredType))[0] || null;
  const texts = [];
  for (const pass of passes) {
    appendUniqueText(texts, pass.text, pass.region ? `[[REGION:${pass.region}]]` : '');
  }
  return { best, texts, passes };
}

function sanitizeFields(fields = {}, typeId = 'other', proFields = {}, barcodes = []) {
  const next = { ...fields };
  if (!['bol','pod'].includes(typeId)) return next;

  const barcodeBol = barcodes
    .map(value => validIdentifier(value, { min:3, max:24, requireDigit:true }))
    .find(value => /[A-Z]/.test(value) && /\d/.test(value)) || '';

  next.bolNo = validIdentifier(proFields.bolNo || '', { min:3, max:24, requireDigit:true }) || barcodeBol;
  next.loadNo = next.bolNo;
  next.poNumber = validIdentifier(proFields.poNumber || '', { min:5, max:24, requireDigit:true });
  next.trailerNo = validIdentifier(proFields.trailerNo || '', { min:3, max:18, requireDigit:true });
  next.seal = validIdentifier(proFields.seal || '', { min:3, max:18, requireDigit:true });
  next.carrierName = String(proFields.carrierName || '').trim();
  next.origin = validRoute(proFields.origin || next.origin);
  next.destination = validRoute(proFields.destination || next.destination);
  next.weight = validNumber(proFields.weight || next.weight, 1, 200_000);
  next.totalPieces = validNumber(proFields.totalPieces || next.totalPieces, 1, 1_000_000);
  next.checkIn = String(proFields.checkIn || '').trim();
  next.appointmentTime = String(proFields.appointmentTime || '').trim();
  next.checkOut = String(proFields.checkOut || '').trim();
  next.commodity = String(proFields.commodity || '').trim();
  next.date = String(proFields.date || next.date || '').trim();

  // BOL and POD weights are operational data. Never present a line-item weight as money.
  next.total = '';
  next.grossPay = '';
  next.netPay = '';
  next.deductions = '';

  return next;
}

function fieldCoverage(typeId = 'other', fields = {}) {
  if (!['bol','pod'].includes(typeId)) return 1;
  const required = ['date','loadNo','origin','destination','poNumber','weight'];
  return required.filter(key => meaningful(fields[key])).length / required.length;
}

export async function analyzeDocumentFilePro(file, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const preferredType = options.preferredType || 'auto';
  onProgress(.03, 'Preparing enhanced scan…');

  let base;
  try {
    base = await analyzeScanFile(file, {
      onProgress(value, text) {
        onProgress(.04 + (Number(value || 0) * .16), text);
      },
    });
  } catch {
    base = {
      type:documentTypeMeta('other'),
      confidence:.2,
      alternatives:SMART_DOCUMENT_TYPES.slice(0, 5),
      text:'',
      method:'smart-review',
      fields:{},
      needsReview:true,
    };
  }

  const baseText = String(base?.text || '').trim();
  let webOcr = { best:null, texts:[], passes:[] };
  const shouldRunWebOcr = String(file?.type || '').startsWith('image/')
    && base?.method !== 'native'
    && (['bol','pod'].includes(preferredType) || baseText.length < 180 || Number(base?.confidence || 0) < .9 || preferredType !== 'auto');
  if (shouldRunWebOcr) {
    onProgress(.21, 'Starting professional text detection…');
    webOcr = await runWebOcr(file, preferredType, onProgress);
  }

  onProgress(.89, 'Reading barcodes and validating fields…');
  let barcodes = await readBarcodes(file);
  if (!barcodes.length && String(file?.type || '').startsWith('image/')) {
    try {
      const cleanBarcodeFile = await renderDocumentFileV985(file, {
        filter:'color',
        maxDimension:3000,
        quality:.99,
        name:`road-ready-barcode-${Date.now()}.jpg`,
      });
      barcodes = await readBarcodes(cleanBarcodeFile);
    } catch {}
  }

  const textParts = [];
  appendUniqueText(textParts, baseText);
  for (const value of webOcr.texts || []) appendUniqueText(textParts, value);
  if (barcodes.length) appendUniqueText(textParts, barcodes.join('\n'), 'Detected barcode values:');
  const text = textParts.join('\n').trim();

  const detected = classifyDocument(text, file?.name || '');
  const selected = preferredTypeResult(preferredType, detected, Boolean(text));
  const standardFields = extractDocumentFields(text, selected.type.id);
  const proFields = extractProDocumentFields(text, selected.type.id);
  const merged = mergeFields(base?.fields, standardFields, proFields);
  const fields = sanitizeFields(merged, selected.type.id, proFields, barcodes);

  const coverage = fieldCoverage(selected.type.id, fields);
  const rawConfidence = Math.max(
    Number(selected.confidence || 0),
    Number(webOcr.best?.confidence || 0) * .78,
    preferredType !== 'auto' ? (text ? .84 : .73) : 0
  );
  const confidence = ['bol','pod'].includes(selected.type.id)
    ? Math.min(rawConfidence, .58 + (coverage * .41))
    : rawConfidence;

  const method = base?.method === 'native'
    ? 'native'
    : webOcr.best?.method
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
    confidence:Math.min(.99, confidence),
    ocrConfidence:Number(webOcr.best?.confidence || 0),
    fieldCoverage:coverage,
    ocrPasses:(webOcr.passes || []).map(pass => ({
      pass:pass.pass || pass.region || 'ocr',
      confidence:Number(pass.confidence || 0),
      textLength:String(pass.text || '').length,
    })),
    alternatives,
    text,
    method,
    fields,
    barcodes,
    preferredType,
    hinted:Boolean(selected.hinted),
    needsReview:!text || confidence < .8 || coverage < .67 || selected.type?.id === 'other',
  };
}
