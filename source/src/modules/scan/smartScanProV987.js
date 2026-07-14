import {
  SMART_DOCUMENT_TYPES,
  analyzeScanFile,
  classifyDocument,
  documentTypeMeta,
  extractDocumentFields,
} from './smartScan.js';
import { renderDocumentFileV985 } from './documentQualityV985.js';
import { recognizeDocumentText } from './webOcr.js';
import { extractProDocumentFieldsV987 } from './smartScanExtractionV987.js';

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

function cleanText(value = '') {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function appendUniqueText(parts, value, marker = '') {
  const cleaned = cleanText(value);
  if (!cleaned) return;
  const body = marker ? `${marker}\n${cleaned}` : cleaned;
  if (!parts.includes(body)) parts.push(body);
}

function mergeFields(...sources) {
  const output = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source || {})) {
      if (meaningful(value)) output[key] = value;
    }
  }
  return output;
}

function normalizeBolIdentifier(value = '') {
  const normalized = String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .replace(/^[-_]+|[-_]+$/g, '');
  if (normalized.length < 4 || normalized.length > 20) return '';
  if (!/[A-Z]/.test(normalized) || !/\d{3,}/.test(normalized)) return '';
  if (/^(?:ACCOUNT|NUMBER|LOADES?|LOADED|TRAILER|CUSTOMER|CARRIER|SHIPPER|FREIGHT)/.test(normalized)) return '';
  return normalized;
}

function validNumber(value, min = 1, max = 100_000_000) {
  const parsed = Number(String(value ?? '').replace(/[, ]/g, ''));
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : 0;
}

function preferredTypeResult(preferredType, detected, hasText) {
  if (!preferredType || preferredType === 'auto') return detected;
  const preferred = documentTypeMeta(preferredType);
  if (!preferred?.id || preferred.id === 'other') return detected;
  if (detected?.type?.id === preferred.id) {
    return {
      ...detected,
      type:preferred,
      confidence:Math.max(Number(detected.confidence || 0), hasText ? .91 : .78),
    };
  }
  const detectedStrong = hasText && Number(detected?.confidence || 0) >= .96 && detected?.type?.id !== 'other';
  if (detectedStrong) return detected;
  return {
    ...detected,
    type:preferred,
    confidence:Math.max(hasText ? .84 : .73, Math.min(.91, Number(detected?.confidence || 0))),
    alternatives:uniqueTypes([preferred, detected?.type, ...(detected?.alternatives || [])]),
    hinted:true,
  };
}

function ocrCandidateScore(result, preferredType = 'auto') {
  if (!result?.text) return -1;
  const classification = classifyDocument(result.text, 'scan.jpg');
  let score = Number(result.confidence || 0) * 100;
  score += Math.min(38, String(result.text).length / 25);
  score += Number(classification.confidence || 0) * 24;
  if (preferredType !== 'auto' && classification.type?.id === preferredType) score += 24;
  if (result.region) score += 3;
  return score;
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

function percentile(histogram, count, ratio) {
  const target = count * ratio;
  let seen = 0;
  for (let index = 0; index < histogram.length; index += 1) {
    seen += histogram[index];
    if (seen >= target) return index;
  }
  return 255;
}

async function renderPrintTextFile(file, maxDimension = 3200) {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > maxDimension ? maxDimension / longest : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(bitmap.width * scale));
    canvas.height = Math.max(2, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { alpha:false, willReadFrequently:true });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    const histogram = new Uint32Array(256);
    let count = 0;
    for (let index = 0; index < data.length; index += 16) {
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const maximum = Math.max(red, green, blue);
      histogram[maximum] += 1;
      count += 1;
    }
    const low = percentile(histogram, count, .008);
    const high = Math.max(low + 42, percentile(histogram, count, .995));
    const range = Math.max(1, high - low);

    for (let index = 0; index < data.length; index += 4) {
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const maximum = Math.max(red, green, blue);
      const minimum = Math.min(red, green, blue);
      const saturation = maximum - minimum;
      let source = maximum;
      if (saturation > 20 && maximum > 72) source = Math.min(255, source + 18 + (saturation * .82));
      let value = ((source - low) * 255) / range;
      value = Math.max(0, Math.min(255, value));
      if (value > 184) value = Math.min(255, value + ((value - 184) * .70));
      if (value < 145) value *= .90;
      value = Math.round(value);
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .99));
    return blob ? new File([blob], `road-ready-pro-print-${Date.now()}.jpg`, { type:'image/jpeg' }) : file;
  } catch {
    return file;
  } finally {
    try { bitmap?.close?.(); } catch {}
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
    const targetWidth = Math.max(1050, Math.min(2300, Number(region.targetWidth || 1750)));
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
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .99));
    return blob ? new File([blob], `road-ready-pro-${name}-${Date.now()}.jpg`, { type:'image/jpeg' }) : null;
  } catch {
    return null;
  } finally {
    try { bitmap?.close?.(); } catch {}
  }
}

async function runOcrPass(file, options = {}) {
  if (!file) return null;
  try {
    const result = await recognizeDocumentText(file, {
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
    return result?.text ? { ...result, region:options.region || '', pass:options.pass || '' } : null;
  } catch {
    return null;
  }
}

async function runRegionPasses(files, onProgress) {
  const regions = [
    { name:'HEADER_RIGHT', source:'clean', box:{ x:.42, y:.01, width:.58, height:.29, targetWidth:2100 }, psm:'11', label:'Reading BOL, PO and seal' },
    { name:'HEADER_RIGHT_PRINT', source:'print', box:{ x:.42, y:.01, width:.58, height:.29, targetWidth:2100 }, psm:'11', label:'Confirming header numbers' },
    { name:'SHIP_FROM', source:'print', box:{ x:0, y:.02, width:.61, height:.21, targetWidth:1900 }, psm:'6', label:'Reading ship from' },
    { name:'SHIP_TO', source:'print', box:{ x:0, y:.14, width:.61, height:.22, targetWidth:1900 }, psm:'6', label:'Reading ship to' },
    { name:'TABLE_PRINT', source:'print', box:{ x:.02, y:.32, width:.96, height:.40, targetWidth:2200 }, psm:'6', label:'Reading pieces and commodity' },
    { name:'TOTALS_ROW', source:'print', box:{ x:.01, y:.50, width:.98, height:.21, targetWidth:2200 }, psm:'11', label:'Reading totals' },
    { name:'FOOTER', source:'clean', box:{ x:.12, y:.66, width:.78, height:.34, targetWidth:1950 }, psm:'11', label:'Reading signatures and times' },
  ];
  const results = [];
  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index];
    const source = files[region.source] || files.clean;
    const regionFile = await cropRegionFile(source, region.box, region.name.toLowerCase());
    if (!regionFile) continue;
    const result = await runOcrPass(regionFile, {
      pageSegMode:region.psm,
      progressStart:.49 + (index * .055),
      progressSpan:.05,
      label:region.label,
      region:region.name,
      pass:`region-${region.name.toLowerCase()}`,
      onProgress,
    });
    if (result) results.push(result);
  }
  return results;
}

async function runProOcr(file, typeHint, onProgress) {
  if (!String(file?.type || '').startsWith('image/')) return { best:null, texts:[], passes:[], files:{} };
  const passes = [];
  let cleanFile = file;
  let grayFile = file;
  let printFile = file;
  try {
    onProgress?.(.20, 'Building clean OCR image…');
    cleanFile = await renderDocumentFileV985(file, {
      filter:'auto',
      maxDimension:3500,
      quality:.99,
      name:`road-ready-pro-clean-${Date.now()}.jpg`,
    });
  } catch {}

  const cleanPass = await runOcrPass(cleanFile, {
    pageSegMode:'11',
    progressStart:.23,
    progressSpan:.17,
    label:'Reading full document',
    pass:'clean-full',
    onProgress,
  });
  if (cleanPass) passes.push(cleanPass);

  const truckingForm = ['bol','pod'].includes(typeHint);
  if (truckingForm) {
    try {
      onProgress?.(.40, 'Removing colored pen marks…');
      printFile = await renderPrintTextFile(file, 3300);
    } catch {}
    try {
      grayFile = await renderDocumentFileV985(file, {
        filter:'gray',
        maxDimension:3300,
        quality:.99,
        name:`road-ready-pro-gray-${Date.now()}.jpg`,
      });
    } catch {}

    const printPass = await runOcrPass(printFile, {
      pageSegMode:'6',
      progressStart:.41,
      progressSpan:.08,
      label:'Reading printed form',
      pass:'print-full',
      onProgress,
    });
    if (printPass) passes.push(printPass);
    passes.push(...await runRegionPasses({ clean:cleanFile, gray:grayFile, print:printFile }, onProgress));
  } else {
    const firstText = String(cleanPass?.text || '').trim();
    const firstClass = firstText ? classifyDocument(firstText, file?.name || '') : null;
    const needsRetry = !firstText
      || firstText.length < 90
      || Number(cleanPass?.confidence || 0) < .52
      || (typeHint !== 'auto' && firstClass?.type?.id !== typeHint && Number(firstClass?.confidence || 0) < .9);
    if (needsRetry) {
      let blackAndWhite = file;
      try {
        blackAndWhite = await renderDocumentFileV985(file, {
          filter:'bw',
          maxDimension:2900,
          quality:.98,
          name:`road-ready-pro-bw-${Date.now()}.jpg`,
        });
      } catch {}
      const retry = await runOcrPass(blackAndWhite, {
        pageSegMode:'6',
        progressStart:.55,
        progressSpan:.25,
        label:'Reading high contrast',
        pass:'bw-block',
        onProgress,
      });
      if (retry) passes.push(retry);
    }
  }

  const best = [...passes].sort((a, b) => ocrCandidateScore(b, typeHint) - ocrCandidateScore(a, typeHint))[0] || null;
  const texts = [];
  for (const pass of passes) appendUniqueText(texts, pass.text, pass.region ? `[[REGION:${pass.region}]]` : '');
  return { best, texts, passes, files:{ clean:cleanFile, gray:grayFile, print:printFile } };
}

function sanitizeFields(fields = {}, typeId = 'other', proFields = {}, barcodes = []) {
  const next = { ...fields };
  if (!['bol','pod'].includes(typeId)) return next;

  const barcodeBol = barcodes.map(normalizeBolIdentifier).find(Boolean) || '';
  next.bolNo = normalizeBolIdentifier(proFields.bolNo || '') || barcodeBol;
  next.loadNo = next.bolNo;
  next.poNumber = /^\d{7,16}$/.test(String(proFields.poNumber || '')) ? String(proFields.poNumber) : '';
  next.trailerNo = String(proFields.trailerNo || '').trim();
  next.seal = /^\d{4,12}$/.test(String(proFields.seal || '')) ? String(proFields.seal) : '';
  next.carrierName = String(proFields.carrierName || '').trim();
  next.origin = String(proFields.origin || '').trim();
  next.destination = String(proFields.destination || '').trim();
  next.shipFromDetails = String(proFields.shipFromDetails || '').trim();
  next.shipToDetails = String(proFields.shipToDetails || '').trim();
  next.weight = validNumber(proFields.weight || next.weight, 1, 200_000);
  next.totalPieces = validNumber(proFields.totalPieces || next.totalPieces, 1, 1_000_000);
  next.checkIn = String(proFields.checkIn || '').trim();
  next.appointmentTime = String(proFields.appointmentTime || '').trim();
  next.checkOut = String(proFields.checkOut || '').trim();
  next.commodity = String(proFields.commodity || '').trim();
  next.date = String(proFields.date || next.date || '').trim();

  next.total = '';
  next.grossPay = '';
  next.netPay = '';
  next.deductions = '';
  return next;
}

function fieldCoverage(typeId = 'other', fields = {}) {
  if (!['bol','pod'].includes(typeId)) return 1;
  const required = [
    fields.date,
    fields.loadNo,
    fields.shipFromDetails || fields.origin,
    fields.shipToDetails || fields.destination,
    fields.poNumber,
    fields.weight,
    fields.totalPieces,
    fields.seal,
  ];
  return required.filter(meaningful).length / required.length;
}

export async function analyzeDocumentFilePro(file, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const preferredType = options.preferredType || 'auto';
  onProgress(.03, 'Preparing Pro OCR…');

  let base;
  try {
    base = await analyzeScanFile(file, {
      onProgress(value, text) {
        onProgress(.04 + (Number(value || 0) * .13), text);
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
  const typeHint = preferredType !== 'auto' ? preferredType : (base?.type?.id || 'auto');
  let webOcr = { best:null, texts:[], passes:[], files:{} };
  const shouldRunWebOcr = String(file?.type || '').startsWith('image/')
    && base?.method !== 'native'
    && (['bol','pod'].includes(typeHint) || baseText.length < 180 || Number(base?.confidence || 0) < .9 || preferredType !== 'auto');
  if (shouldRunWebOcr) {
    onProgress(.18, 'Starting multi-pass Pro OCR…');
    webOcr = await runProOcr(file, typeHint, onProgress);
  }

  onProgress(.90, 'Reading barcode and validating fields…');
  const barcodeSources = [file, webOcr.files?.clean, webOcr.files?.print].filter(Boolean);
  const barcodeValues = [];
  for (const source of barcodeSources) {
    const values = await readBarcodes(source);
    for (const value of values) if (!barcodeValues.includes(value)) barcodeValues.push(value);
    if (barcodeValues.length >= 8) break;
  }
  if (['bol','pod'].includes(typeHint)) {
    const headerCrop = await cropRegionFile(file, { x:.42, y:.01, width:.58, height:.29, targetWidth:2200 }, 'barcode-header');
    if (headerCrop) {
      for (const value of await readBarcodes(headerCrop)) if (!barcodeValues.includes(value)) barcodeValues.push(value);
    }
  }

  const textParts = [];
  appendUniqueText(textParts, baseText);
  for (const value of webOcr.texts || []) appendUniqueText(textParts, value);
  if (barcodeValues.length) appendUniqueText(textParts, barcodeValues.join('\n'), 'Detected barcode values:');
  const text = textParts.join('\n').trim();

  const detected = classifyDocument(text, file?.name || '');
  const selected = preferredTypeResult(preferredType, detected, Boolean(text));
  const standardFields = extractDocumentFields(text, selected.type.id);
  const proFields = extractProDocumentFieldsV987(text, selected.type.id);
  const merged = mergeFields(base?.fields, standardFields, proFields);
  const fields = sanitizeFields(merged, selected.type.id, proFields, barcodeValues);

  const coverage = fieldCoverage(selected.type.id, fields);
  const rawConfidence = Math.max(
    Number(selected.confidence || 0),
    Number(webOcr.best?.confidence || 0) * .78,
    preferredType !== 'auto' ? (text ? .84 : .73) : 0
  );
  const confidence = ['bol','pod'].includes(selected.type.id)
    ? Math.min(rawConfidence, .54 + (coverage * .44))
    : rawConfidence;

  const alternatives = uniqueTypes([
    selected.type,
    ...(selected.alternatives || []),
    ...(base?.alternatives || []),
    documentTypeMeta('other'),
  ]).slice(0, 8);

  onProgress(1, 'Pro OCR ready to review');
  return {
    type:selected.type,
    detectedType:detected.type,
    confidence:Math.min(.99, confidence),
    ocrConfidence:Number(webOcr.best?.confidence || 0),
    fieldCoverage:coverage,
    alternatives,
    text,
    method:base?.method === 'native' ? 'native' : 'pro-ocr',
    fields,
    barcodes:barcodeValues,
    preferredType,
    hinted:Boolean(selected.hinted),
    ocrPasses:(webOcr.passes || []).map(pass => ({
      pass:pass.pass || pass.region || 'ocr',
      confidence:Number(pass.confidence || 0),
      textLength:String(pass.text || '').length,
    })),
    needsReview:!text || confidence < .8 || coverage < .75 || selected.type?.id === 'other',
  };
}
