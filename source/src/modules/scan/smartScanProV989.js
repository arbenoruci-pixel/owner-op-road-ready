import {
  SMART_DOCUMENT_TYPES,
  analyzeScanFile,
  classifyDocument,
  documentTypeMeta,
  extractDocumentFields,
} from './smartScan.js';
import { renderDocumentFileV985 } from './documentQualityV985.js';
import { recognizeDocumentText } from './webOcr.js';
import { extractProDocumentFieldsV989 } from './smartScanExtractionV989.js';

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
  return String(value || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
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
  score += Math.min(36, String(result.text).length / 26);
  score += Number(classification.confidence || 0) * 22;
  if (preferredType !== 'auto' && classification.type?.id === preferredType) score += 22;
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

function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}

function suppressLongLines(values, width, height, options = {}) {
  const horizontalRatio = Number(options.horizontalRatio || .58);
  const verticalRatio = Number(options.verticalRatio || .72);
  const threshold = Number(options.darkThreshold || 122);
  const horizontal = [];
  const vertical = [];

  for (let y = 0; y < height; y += 1) {
    let dark = 0;
    const offset = y * width;
    for (let x = 0; x < width; x += 1) if (values[offset + x] < threshold) dark += 1;
    if (dark >= width * horizontalRatio) horizontal.push(y);
  }
  for (let x = 0; x < width; x += 1) {
    let dark = 0;
    for (let y = 0; y < height; y += 1) if (values[(y * width) + x] < threshold) dark += 1;
    if (dark >= height * verticalRatio) vertical.push(x);
  }

  for (const y of horizontal) {
    for (let dy = -2; dy <= 2; dy += 1) {
      const row = y + dy;
      if (row < 0 || row >= height) continue;
      values.fill(255, row * width, (row + 1) * width);
    }
  }
  for (const x of vertical) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const column = x + dx;
      if (column < 0 || column >= width) continue;
      for (let y = 0; y < height; y += 1) values[(y * width) + column] = 255;
    }
  }
}

async function fieldCropFromBitmap(bitmap, box = {}, name = 'field', options = {}) {
  const x = Math.max(0, Math.min(.98, Number(box.x || 0)));
  const y = Math.max(0, Math.min(.98, Number(box.y || 0)));
  const widthRatio = Math.max(.02, Math.min(1 - x, Number(box.width || 1)));
  const heightRatio = Math.max(.02, Math.min(1 - y, Number(box.height || 1)));
  const sx = Math.max(0, Math.floor(bitmap.width * x));
  const sy = Math.max(0, Math.floor(bitmap.height * y));
  const sw = Math.max(2, Math.floor(bitmap.width * widthRatio));
  const sh = Math.max(2, Math.floor(bitmap.height * heightRatio));
  const targetWidth = Math.max(1000, Math.min(2400, Number(box.targetWidth || 1900)));
  const scale = targetWidth / sw;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(sw * scale));
  canvas.height = Math.max(2, Math.round(sh * scale));
  const context = canvas.getContext('2d', { alpha:false, willReadFrequently:true });
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const pixels = canvas.width * canvas.height;
  const gray = new Uint8Array(pixels);
  const histogram = new Uint32Array(256);
  let count = 0;

  for (let pixel = 0, index = 0; pixel < pixels; pixel += 1, index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const saturation = maximum - minimum;
    let value = Math.round((red * .299) + (green * .587) + (blue * .114));
    if (options.dropColor && saturation > 18 && maximum > 60) value = Math.min(255, value + 70 + (saturation * .9));
    gray[pixel] = value;
    if (pixel % 3 === 0) {
      histogram[value] += 1;
      count += 1;
    }
  }

  const low = percentile(histogram, count, Number(options.lowPercentile || .008));
  const high = Math.max(low + 36, percentile(histogram, count, Number(options.highPercentile || .995)));
  const range = Math.max(1, high - low);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    let value = ((gray[pixel] - low) * 255) / range;
    value = clamp(value);
    if (value > 184) value = clamp(value + ((value - 184) * .72));
    if (value < 150) value = clamp(value * Number(options.inkStrength || .86));
    gray[pixel] = Math.round(value);
  }

  if (options.removeLines !== false) suppressLongLines(gray, canvas.width, canvas.height, options);

  for (let pixel = 0, index = 0; pixel < pixels; pixel += 1, index += 4) {
    let value = gray[pixel];
    if (options.binary) value = value < Number(options.binaryThreshold || 178) ? 0 : 255;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .995));
  return blob ? new File([blob], `road-ready-v989-${name}-${Date.now()}.jpg`, { type:'image/jpeg' }) : null;
}

async function runOcrPass(file, options = {}) {
  if (!file) return null;
  try {
    const result = await recognizeDocumentText(file, {
      pageSegMode:String(options.pageSegMode || '11'),
      charWhitelist:options.charWhitelist || '',
      charBlacklist:options.charBlacklist || '',
      numericMode:options.numericMode === true,
      returnLayout:options.returnLayout === true,
      dpi:options.dpi || 350,
      onProgress(progress, status) {
        const start = Number(options.progressStart || 0);
        const span = Number(options.progressSpan || 0);
        options.onProgress?.(
          start + (Number(progress || 0) * span),
          `${String(options.label || status || 'Reading text').replace(/_/g, ' ')}…`
        );
      },
    });
    return result?.text ? { ...result, field:options.field || '', variant:options.variant || '' } : null;
  } catch {
    return null;
  }
}

function fieldResultScore(field, result) {
  if (!result?.text) return -1;
  const text = String(result.text || '').replace(/\s+/g, ' ').trim();
  let score = Number(result.confidence || 0) * 100 + Math.min(22, text.length / 3);
  if (field === 'BOL_VALUE' || field === 'BOL_BAR_TEXT') {
    if (/\b[A-Z]{1,5}\s*[- ]?\s*\d{3,14}\b/i.test(text)) score += 80;
    if (/bill\s+of\s+lading/i.test(text)) score += 18;
  }
  if (field === 'CUSTOMER_PO') {
    const digits = text.replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 16) score += 90;
  }
  if (field === 'SEAL') {
    const digits = text.replace(/\D/g, '');
    if (digits.length >= 4 && digits.length <= 10) score += 55;
  }
  if (field === 'SHIP_FROM' || field === 'SHIP_TO') {
    if (/\b(?:inc\.?|llc|corp\.?|dc|warehouse|distribution|logistics)\b/i.test(text)) score += 40;
    if (/\b\d{1,6}\s+[A-Za-z]/.test(text)) score += 35;
    if (/\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(text)) score += 45;
    score -= (text.match(/[^A-Za-z0-9\s.,'#-]/g) || []).length * 2;
  }
  if (field === 'PIECES' && /\b\d{2,6}\b/.test(text)) score += 55;
  if (field === 'WEIGHT' && /\b\d{3,6}(?:[,.]\d{1,2})?\b/.test(text)) score += 65;
  if (field === 'COMMODITY' && /\b[A-Z]{2,}(?:-[A-Z0-9]{2,}){1,}\b/.test(text)) score += 70;
  return score;
}

const FIELD_SPECS = [
  {
    field:'DATE',
    box:{ x:.045, y:.02, width:.28, height:.06, targetWidth:1600 },
    variants:[
      { name:'print', pageSegMode:'7', charWhitelist:'0123456789/-', numericMode:true, dropColor:true, binary:true, binaryThreshold:190 },
    ],
    label:'Reading document date',
  },
  {
    field:'HEADER_RIGHT',
    box:{ x:.47, y:.04, width:.47, height:.19, targetWidth:2200 },
    variants:[
      { name:'print', pageSegMode:'6', dropColor:true, returnLayout:true },
    ],
    label:'Reading header labels',
  },
  {
    field:'BOL_VALUE',
    box:{ x:.49, y:.045, width:.38, height:.067, targetWidth:2200 },
    variants:[
      { name:'print', pageSegMode:'7', charWhitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-:# ', dropColor:true, binary:true, binaryThreshold:188 },
      { name:'gray', pageSegMode:'11', charWhitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-:# ', dropColor:false, removeLines:true },
    ],
    label:'Reading BOL number',
  },
  {
    field:'BOL_BAR_TEXT',
    box:{ x:.54, y:.075, width:.27, height:.06, targetWidth:2100 },
    variants:[
      { name:'gray', pageSegMode:'11', charWhitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-', dropColor:false, removeLines:false },
      { name:'print', pageSegMode:'11', charWhitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-', dropColor:true, removeLines:false },
    ],
    label:'Confirming BOL number',
  },
  {
    field:'CUSTOMER_PO',
    box:{ x:.49, y:.105, width:.42, height:.06, targetWidth:2200 },
    variants:[
      { name:'digits', pageSegMode:'7', charWhitelist:'0123456789', numericMode:true, dropColor:true, binary:true, binaryThreshold:190 },
      { name:'gray', pageSegMode:'11', charWhitelist:'0123456789', numericMode:true, dropColor:false },
    ],
    label:'Reading customer PO',
  },
  {
    field:'SEAL',
    box:{ x:.49, y:.135, width:.31, height:.075, targetWidth:1900 },
    variants:[
      { name:'gray', pageSegMode:'7', charWhitelist:'0123456789', numericMode:true, dropColor:false, inkStrength:.78 },
      { name:'bw', pageSegMode:'11', charWhitelist:'0123456789', numericMode:true, dropColor:false, binary:true, binaryThreshold:196 },
    ],
    label:'Reading seal number',
  },
  {
    field:'TRAILER',
    box:{ x:.49, y:.17, width:.31, height:.055, targetWidth:1800 },
    variants:[
      { name:'print', pageSegMode:'7', charWhitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-', dropColor:true },
    ],
    label:'Reading trailer number',
  },
  {
    field:'SHIP_FROM',
    box:{ x:.045, y:.065, width:.50, height:.115, targetWidth:2200 },
    variants:[
      { name:'print', pageSegMode:'6', dropColor:true, returnLayout:true, horizontalRatio:.52, verticalRatio:.78 },
      { name:'gray', pageSegMode:'11', dropColor:false, returnLayout:true, horizontalRatio:.54, verticalRatio:.78 },
    ],
    label:'Reading ship from',
  },
  {
    field:'SHIP_TO',
    box:{ x:.045, y:.16, width:.50, height:.12, targetWidth:2200 },
    variants:[
      { name:'print', pageSegMode:'6', dropColor:true, returnLayout:true, horizontalRatio:.52, verticalRatio:.78 },
      { name:'gray', pageSegMode:'11', dropColor:false, returnLayout:true, horizontalRatio:.54, verticalRatio:.78 },
    ],
    label:'Reading ship to',
  },
  {
    field:'PIECES',
    box:{ x:.045, y:.545, width:.32, height:.075, targetWidth:2000 },
    variants:[
      { name:'digits', pageSegMode:'11', charWhitelist:'0123456789', numericMode:true, dropColor:true, binary:true, binaryThreshold:190 },
    ],
    label:'Reading total pieces',
  },
  {
    field:'WEIGHT',
    box:{ x:.59, y:.545, width:.36, height:.075, targetWidth:2100 },
    variants:[
      { name:'digits', pageSegMode:'11', charWhitelist:'0123456789.,LBS lbs', numericMode:true, dropColor:true, binary:true, binaryThreshold:190 },
    ],
    label:'Reading total weight',
  },
  {
    field:'COMMODITY',
    box:{ x:.33, y:.30, width:.48, height:.31, targetWidth:2300 },
    variants:[
      { name:'print', pageSegMode:'6', dropColor:true, returnLayout:true, horizontalRatio:.60, verticalRatio:.84 },
    ],
    label:'Reading commodity',
  },
  {
    field:'STOP_TIMES',
    box:{ x:.25, y:.75, width:.56, height:.245, targetWidth:2200 },
    variants:[
      { name:'gray', pageSegMode:'11', dropColor:false, returnLayout:true, horizontalRatio:.62, verticalRatio:.82, inkStrength:.80 },
    ],
    label:'Reading stop times',
  },
];

async function runFocusedFields(file, onProgress) {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return { results:{}, passes:[], headerFile:null };
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const results = {};
    const passes = [];
    let headerFile = null;
    let completed = 0;
    const totalVariants = FIELD_SPECS.reduce((sum, spec) => sum + spec.variants.length, 0);

    for (const spec of FIELD_SPECS) {
      const variants = [];
      for (const variant of spec.variants) {
        const crop = await fieldCropFromBitmap(bitmap, spec.box, `${spec.field.toLowerCase()}-${variant.name}`, variant);
        if (!crop) continue;
        if (spec.field === 'HEADER_RIGHT' && !headerFile) headerFile = crop;
        const progressStart = .35 + ((completed / Math.max(1, totalVariants)) * .52);
        const result = await runOcrPass(crop, {
          ...variant,
          field:spec.field,
          variant:variant.name,
          progressStart,
          progressSpan:.52 / Math.max(1, totalVariants),
          label:spec.label,
          onProgress,
        });
        completed += 1;
        if (result) {
          variants.push(result);
          passes.push(result);
        }
      }
      results[spec.field] = variants.sort((a, b) => fieldResultScore(spec.field, b) - fieldResultScore(spec.field, a))[0] || null;
    }
    return { results, passes, headerFile };
  } catch {
    return { results:{}, passes:[], headerFile:null };
  } finally {
    try { bitmap?.close?.(); } catch {}
  }
}

function validNumber(value, min = 1, max = 100_000_000) {
  const parsed = Number(String(value ?? '').replace(/[, ]/g, ''));
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : 0;
}

function sanitizeFields(baseFields = {}, typeId = 'other', proFields = {}, barcodes = []) {
  if (!['bol','pod'].includes(typeId)) return mergeFields(baseFields, proFields);
  const next = { ...baseFields };
  next.date = String(proFields.date || baseFields.date || '').trim();
  next.bolNo = String(proFields.bolNo || '').trim();
  next.loadNo = next.bolNo;
  next.poNumber = /^\d{7,16}$/.test(String(proFields.poNumber || '')) ? String(proFields.poNumber) : '';
  next.trailerNo = String(proFields.trailerNo || '').trim();
  next.seal = /^\d{4,10}$/.test(String(proFields.seal || '')) ? String(proFields.seal) : '';
  next.carrierName = String(proFields.carrierName || '').trim();
  next.origin = String(proFields.origin || '').trim();
  next.destination = String(proFields.destination || '').trim();
  next.shipFromDetails = String(proFields.shipFromDetails || '').trim();
  next.shipToDetails = String(proFields.shipToDetails || '').trim();
  next.weight = validNumber(proFields.weight, 1, 200_000);
  next.totalPieces = validNumber(proFields.totalPieces, 1, 1_000_000);
  next.checkIn = String(proFields.checkIn || '').trim();
  next.appointmentTime = String(proFields.appointmentTime || '').trim();
  next.checkOut = String(proFields.checkOut || '').trim();
  next.commodity = String(proFields.commodity || '').trim();
  next.fieldConfidence = proFields.fieldConfidence || {};
  next.barcodeValues = barcodes;

  // BOL values must come from the focused, validated field pipeline. Never let
  // generic OCR fragments populate operational or monetary fields.
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
    fields.shipFromDetails,
    fields.shipToDetails,
    fields.poNumber,
    fields.weight,
    fields.totalPieces,
    fields.seal,
  ];
  return required.filter(meaningful).length / required.length;
}

export async function analyzeDocumentFileProV989(file, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const preferredType = options.preferredType || 'auto';
  onProgress(.02, 'Preparing focused Pro OCR…');

  let base;
  try {
    base = await analyzeScanFile(file, {
      onProgress(value, text) {
        onProgress(.03 + (Number(value || 0) * .11), text);
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

  const typeHint = preferredType !== 'auto' ? preferredType : (base?.type?.id || 'auto');
  let cleanFile = file;
  let fullPass = null;
  try {
    onProgress(.15, 'Building high-resolution OCR source…');
    cleanFile = await renderDocumentFileV985(file, {
      filter:'auto',
      maxDimension:4200,
      quality:.995,
      name:`road-ready-v989-clean-${Date.now()}.jpg`,
    });
    fullPass = await runOcrPass(cleanFile, {
      pageSegMode:'11',
      returnLayout:true,
      progressStart:.18,
      progressSpan:.16,
      label:'Reading complete document',
      onProgress,
    });
  } catch {}

  let focused = { results:{}, passes:[], headerFile:null };
  if (['bol','pod'].includes(typeHint)) focused = await runFocusedFields(file, onProgress);

  onProgress(.89, 'Checking barcode and validating fields…');
  const barcodeValues = [];
  for (const source of [file, cleanFile, focused.headerFile].filter(Boolean)) {
    for (const value of await readBarcodes(source)) if (!barcodeValues.includes(value)) barcodeValues.push(value);
    if (barcodeValues.length >= 8) break;
  }

  const textParts = [];
  appendUniqueText(textParts, base?.text || '');
  appendUniqueText(textParts, fullPass?.text || '');
  for (const [name, result] of Object.entries(focused.results || {})) appendUniqueText(textParts, result?.text || '', `[[FIELD:${name}]]`);
  if (barcodeValues.length) appendUniqueText(textParts, barcodeValues.join('\n'), 'Detected barcode values:');
  const text = textParts.join('\n').trim();

  const detected = classifyDocument(text, file?.name || '');
  const selected = preferredTypeResult(preferredType, detected, Boolean(text));
  const standardFields = extractDocumentFields(text, selected.type.id);
  const proFields = extractProDocumentFieldsV989(text, selected.type.id, focused.results, barcodeValues);
  const baseFields = mergeFields(base?.fields, standardFields);
  const fields = sanitizeFields(baseFields, selected.type.id, proFields, barcodeValues);
  const coverage = fieldCoverage(selected.type.id, fields);
  const bestPass = [fullPass, ...(focused.passes || [])].filter(Boolean).sort((a, b) => ocrCandidateScore(b, typeHint) - ocrCandidateScore(a, typeHint))[0] || null;
  const rawConfidence = Math.max(
    Number(selected.confidence || 0),
    Number(bestPass?.confidence || 0) * .78,
    preferredType !== 'auto' ? (text ? .82 : .70) : 0
  );
  const confidence = ['bol','pod'].includes(selected.type.id)
    ? Math.min(rawConfidence, .46 + (coverage * .51))
    : rawConfidence;

  const alternatives = uniqueTypes([
    selected.type,
    ...(selected.alternatives || []),
    ...(base?.alternatives || []),
    documentTypeMeta('other'),
  ]).slice(0, 8);

  onProgress(1, 'Focused Pro OCR ready');
  return {
    type:selected.type,
    detectedType:detected.type,
    confidence:Math.min(.99, confidence),
    ocrConfidence:Number(bestPass?.confidence || 0),
    fieldCoverage:coverage,
    fieldConfidence:fields.fieldConfidence || {},
    alternatives,
    text,
    method:base?.method === 'native' ? 'native' : 'pro-ocr-v989',
    fields,
    barcodes:barcodeValues,
    preferredType,
    hinted:Boolean(selected.hinted),
    ocrPasses:[fullPass, ...(focused.passes || [])].filter(Boolean).map(pass => ({
      pass:pass.field ? `${pass.field}:${pass.variant || 'ocr'}` : 'full',
      confidence:Number(pass.confidence || 0),
      textLength:String(pass.text || '').length,
    })),
    needsReview:!text || confidence < .8 || coverage < .75 || selected.type?.id === 'other',
  };
}

export const analyzeDocumentFilePro = analyzeDocumentFileProV989;
