import { analyzeSmartDocumentV102 } from './smartDocumentReaderV102.js';
import { classifyDocument, documentTypeMeta, extractDocumentFields } from './smartScan.js';
import { parseBolFieldsV100, parseFuelReceiptFieldsV100 } from './smartDocumentReaderV100.js';
import { parseRateConfirmationV102 } from './rateConfirmationParserV102.js';
import { isPdfFileV102 } from './pdfTextV102.js';
import { recognizeDocumentText } from './webOcr.js';
import { buildOcrVariantsV1030 } from './scannerIntelligenceV1030.js';

function meaningful(value) {
  if (value == null || value === '') return false;
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return String(value).trim() !== '';
}

function cleanText(value = '') {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function numeric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? '')
    .replace(/[OoQqDd]/g, '0')
    .replace(/[Il|!]/g, '1')
    .replace(/[$, ]/g, '')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDate(value = '') {
  const match = String(value || '').match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
  if (!match) return String(value || '').trim();
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${String(match[1]).padStart(2, '0')}/${String(match[2]).padStart(2, '0')}/${year}`;
}

function canonicalValue(field, value) {
  if (!meaningful(value)) return '';
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'object') return JSON.stringify(value);
  if (/date/i.test(field)) return normalizeDate(value).replace(/\D/g, '');
  if (/^(?:gross|total|linehaul|fuelSurcharge|gallons|pricePerGallon|discount|weight|totalPieces|odometer|grossPay|netPay|deductions|loadedMiles|deadheadMiles|stopCount)$/i.test(field)) {
    const number = numeric(value);
    return number ? number.toFixed(Math.abs(number) < 100 ? 3 : 2) : '';
  }
  return String(value)
    .toUpperCase()
    .replace(/[OoQqDd](?=\d)|(?<=\d)[OoQqDd]/g, '0')
    .replace(/[Il|!](?=\d)|(?<=\d)[Il|!]/g, '1')
    .replace(/[^A-Z0-9]/g, '');
}

function mergeMeaningful(...sources) {
  const output = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source || {})) if (meaningful(value)) output[key] = value;
  }
  return output;
}

function parseByType(typeId = 'other', text = '', baseFields = {}, now = new Date()) {
  const standard = mergeMeaningful(baseFields, extractDocumentFields(text, typeId));
  if (typeId === 'rate_confirmation') return parseRateConfirmationV102(text, standard, now);
  if (typeId === 'bol' || typeId === 'pod') return parseBolFieldsV100(text, standard, now);
  if (typeId === 'fuel_receipt') return parseFuelReceiptFieldsV100(text, standard, now);
  return standard;
}

function requiredGroups(typeId = 'other') {
  if (typeId === 'rate_confirmation') return [
    ['loadNo','orderNo'],
    ['broker'],
    ['gross','total'],
    ['origin'],
    ['destination','nextStop'],
    ['pickupDate','date'],
    ['deliveryDate','stops'],
  ];
  if (typeId === 'bol' || typeId === 'pod') return [
    ['loadNo','bolNo'],
    ['origin','shipFromDetails'],
    ['destination','shipToDetails'],
    ['date'],
    ['weight','totalPieces'],
  ];
  if (typeId === 'fuel_receipt') return [
    ['merchant','fuelProvider'],
    ['date'],
    ['gallons'],
    ['total'],
    ['cityState'],
  ];
  if (typeId === 'carrier_settlement') return [
    ['date'],
    ['grossPay','gross'],
    ['netPay','total'],
  ];
  if (typeId === 'repair_invoice') return [
    ['merchant'],
    ['date'],
    ['invoiceNo'],
    ['total'],
  ];
  return [['date'],['merchant','broker'],['total','loadNo','invoiceNo']];
}

export function criticalFieldCoverageV1030(typeId = 'other', fields = {}) {
  const groups = requiredGroups(typeId);
  const hit = groups.filter(group => group.some(key => meaningful(fields?.[key]))).length;
  return groups.length ? hit / groups.length : 0;
}

function chooseArray(field, values = []) {
  if (!values.length) return null;
  if (field === 'stops') return values.sort((a, b) => Number(b.value?.length || 0) - Number(a.value?.length || 0))[0];
  return values.sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0))[0];
}

export function consensusFieldsV1030(sources = [], typeId = 'other') {
  const fields = new Set();
  sources.forEach(source => Object.keys(source?.fields || {}).forEach(field => {
    if (!['fieldConfidence','documentEvidence','needsFieldReview'].includes(field)) fields.add(field);
  }));
  const output = {};
  const confidence = {};
  const evidence = {};

  for (const field of fields) {
    const values = sources
      .map(source => ({
        source:source.id || 'source',
        value:source.fields?.[field],
        weight:Math.max(.05, Math.min(.99, Number(source.weight || 0))),
      }))
      .filter(item => meaningful(item.value));
    if (!values.length) continue;

    if (values.some(item => Array.isArray(item.value) || typeof item.value === 'object')) {
      const selected = chooseArray(field, values);
      if (!selected) continue;
      output[field] = selected.value;
      confidence[field] = Math.min(.98, selected.weight);
      evidence[field] = values.map(item => item.source);
      continue;
    }

    const groups = new Map();
    for (const item of values) {
      const canonical = canonicalValue(field, item.value);
      if (!canonical) continue;
      const group = groups.get(canonical) || { canonical, values:[], score:0, weightTotal:0 };
      group.values.push(item);
      group.weightTotal += item.weight;
      group.score += item.weight;
      groups.set(canonical, group);
    }
    const ranked = [...groups.values()].map(group => ({
      ...group,
      score:group.score + Math.max(0, group.values.length - 1) * .17,
    })).sort((a, b) => b.score - a.score || b.values.length - a.values.length);
    const selected = ranked[0];
    if (!selected) continue;
    const representative = selected.values.sort((a, b) => b.weight - a.weight)[0];
    const agreement = selected.values.length / Math.max(1, values.length);
    const averageWeight = selected.weightTotal / Math.max(1, selected.values.length);
    output[field] = representative.value;
    confidence[field] = Math.min(.99, averageWeight * .64 + agreement * .25 + Math.min(.1, (selected.values.length - 1) * .05));
    evidence[field] = selected.values.map(item => item.source);
  }

  const groupConfidence = requiredGroups(typeId).map(group => Math.max(0, ...group.map(key => Number(confidence[key] || 0))));
  const criticalConfidence = groupConfidence.length
    ? groupConfidence.reduce((sum, value) => sum + value, 0) / groupConfidence.length
    : 0;
  return { fields:output, fieldConfidence:confidence, fieldEvidence:evidence, criticalConfidence };
}

function validDocumentDate(value = '', now = new Date()) {
  const normalized = normalizeDate(value);
  const match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;
  const date = new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]), 12);
  if (Number.isNaN(date.getTime())) return false;
  if (date.getMonth() !== Number(match[1]) - 1 || date.getDate() !== Number(match[2])) return false;
  return date.getFullYear() >= now.getFullYear() - 8 && date.getTime() <= now.getTime() + (370 * 86400000);
}

export function validateDocumentFieldsV1030(typeId = 'other', fields = {}, now = new Date()) {
  const checks = [];
  const add = (id, ok, detail, severity = 'warning') => checks.push({ id, ok:Boolean(ok), detail, severity });
  const loadNo = String(fields.loadNo || fields.orderNo || fields.bolNo || '').trim();
  if (['rate_confirmation','bol','pod'].includes(typeId)) add('load-number', /^[A-Z0-9][A-Z0-9_-]{3,24}$/i.test(loadNo), 'Load/BOL number format', 'critical');
  if (fields.date) add('document-date', validDocumentDate(fields.date, now), 'Document date is valid', 'critical');

  if (typeId === 'fuel_receipt') {
    const gallons = numeric(fields.gallons);
    const price = numeric(fields.pricePerGallon);
    const total = numeric(fields.total);
    add('fuel-gallons', gallons > 0 && gallons < 1000, 'Gallons are in a valid range', 'critical');
    if (gallons > 0 && price > 0 && total > 0) {
      const expected = gallons * price;
      const tolerance = Math.max(2.5, total * .035);
      add('fuel-math', Math.abs(expected - total) <= tolerance, 'Gallons × price agrees with total', 'critical');
    }
  }

  if (typeId === 'rate_confirmation') {
    const total = numeric(fields.gross || fields.total);
    const linehaul = numeric(fields.linehaul);
    const fuel = numeric(fields.fuelSurcharge);
    add('rate-total', total > 0 && total < 1_000_000, 'Carrier rate is in a valid range', 'critical');
    if (total > 0 && (linehaul > 0 || fuel > 0)) {
      const expected = linehaul + fuel;
      add('rate-math', Math.abs(expected - total) <= Math.max(1, total * .01), 'Linehaul plus fuel agrees with total rate', 'critical');
    }
    if (Array.isArray(fields.stops) && fields.stops.length) add('route-stops', fields.stops.some(stop => /delivery/i.test(stop?.type || '')), 'Route includes a delivery stop', 'critical');
  }

  if (typeId === 'bol' || typeId === 'pod') {
    const weight = numeric(fields.weight);
    const pieces = numeric(fields.totalPieces);
    if (weight) add('weight-range', weight >= 100 && weight <= 200000, 'Weight is in a trucking range', 'warning');
    if (pieces) add('pieces-range', pieces >= 1 && pieces <= 1_000_000, 'Piece count is in a valid range', 'warning');
  }

  const criticalFailures = checks.filter(check => !check.ok && check.severity === 'critical').length;
  const warningFailures = checks.filter(check => !check.ok && check.severity !== 'critical').length;
  return {
    checks,
    valid:criticalFailures === 0,
    criticalFailures,
    warningFailures,
    penalty:Math.min(.34, criticalFailures * .11 + warningFailures * .035),
  };
}

function selectedType(preferredType = 'auto', classification = {}, base = {}) {
  if (preferredType && preferredType !== 'auto') return documentTypeMeta(preferredType);
  const detected = classification?.type;
  if (detected?.id && detected.id !== 'other') return detected;
  return base?.type || detected || documentTypeMeta('other');
}

async function runOcrPass(file, options = {}) {
  if (!file) return null;
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  try {
    const result = await recognizeDocumentText(file, {
      pageSegMode:String(options.pageSegMode || '6'),
      returnLayout:true,
      dpi:options.dpi || 350,
      preserveSpaces:true,
      onProgress(value, text) {
        const start = Number(options.progressStart || 0);
        const span = Number(options.progressSpan || 0);
        onProgress(start + Number(value || 0) * span, `${options.label || String(text || 'Reading text').replace(/_/g, ' ')}…`);
      },
    });
    return result?.text ? {
      ...result,
      id:options.id || 'ocr',
      page:Number(options.page || 1),
      variant:options.variant || 'normalized',
    } : null;
  } catch {
    return null;
  }
}

function textTokenSet(value = '') {
  return new Set(String(value || '').toUpperCase().match(/[A-Z0-9]{2,}/g) || []);
}

function textAgreement(a = '', b = '') {
  const left = textTokenSet(a);
  const right = textTokenSet(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  left.forEach(token => { if (right.has(token)) intersection += 1; });
  return intersection / Math.max(1, Math.min(left.size, right.size));
}

async function readPageWithConsensus(file, page, options = {}) {
  const onProgress = options.onProgress || (() => {});
  const pageStart = Number(options.progressStart || 0);
  const pageSpan = Number(options.progressSpan || 0);
  const variants = await buildOcrVariantsV1030(file, {
    onStatus:text => onProgress(pageStart + pageSpan * .08, text),
  });
  const normalized = variants.find(item => item.id === 'normalized') || variants[0];
  const adaptive = variants.find(item => item.id === 'adaptive');
  const color = variants.find(item => item.id === 'color');
  const passes = [];
  const first = await runOcrPass(normalized?.file || file, {
    id:`page-${page}-normalized`,
    page,
    variant:'normalized',
    pageSegMode:'6',
    progressStart:pageStart + pageSpan * .10,
    progressSpan:pageSpan * .43,
    label:`Reading page ${page} clean text`,
    onProgress,
  });
  if (first) passes.push(first);

  const needAdaptive = !first || Number(first.confidence || 0) < .86 || String(first.text || '').length < 90;
  if (needAdaptive && adaptive?.file) {
    const second = await runOcrPass(adaptive.file, {
      id:`page-${page}-adaptive`,
      page,
      variant:'adaptive',
      pageSegMode:'11',
      progressStart:pageStart + pageSpan * .54,
      progressSpan:pageSpan * .34,
      label:`Verifying page ${page} difficult text`,
      onProgress,
    });
    if (second) passes.push(second);
  }

  const bestConfidence = Math.max(0, ...passes.map(pass => Number(pass.confidence || 0)));
  const agreement = passes.length >= 2 ? textAgreement(passes[0]?.text, passes[1]?.text) : 1;
  if ((bestConfidence < .66 || agreement < .42) && color?.file) {
    const third = await runOcrPass(color.file, {
      id:`page-${page}-color`,
      page,
      variant:'color',
      pageSegMode:'3',
      progressStart:pageStart + pageSpan * .89,
      progressSpan:pageSpan * .10,
      label:`Resolving page ${page} text`,
      onProgress,
    });
    if (third) passes.push(third);
  }

  const ranked = [...passes].sort((a, b) => (
    Number(b.confidence || 0) - Number(a.confidence || 0)
    || String(b.text || '').length - String(a.text || '').length
  ));
  return {
    page,
    passes,
    best:ranked[0] || null,
    variants:variants.map(item => ({ id:item.id, method:item.method, quality:item.quality || null })),
  };
}

function combinePageText(pageResults = [], baseText = '') {
  const sections = [];
  if (cleanText(baseText)) sections.push(`[[BASE READER]]\n${cleanText(baseText)}`);
  for (const page of pageResults) {
    const unique = [];
    for (const pass of page.passes || []) {
      const body = cleanText(pass.text);
      if (!body || unique.some(existing => textAgreement(existing, body) > .96)) continue;
      unique.push(body);
    }
    if (unique.length) sections.push(`[[PAGE ${page.page}]]\n${unique.join('\n[[OCR VERIFY]]\n')}`);
  }
  return sections.join('\n\n').trim();
}

function sourceWeight(value, fallback = .55) {
  return Math.max(.18, Math.min(.99, Number(value || fallback)));
}

export async function analyzeSmartDocumentV1030(file, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const preferredType = options.preferredType || 'auto';
  const now = options.now instanceof Date ? options.now : new Date();
  const pageFiles = (Array.isArray(options.scanMeta?.pageFiles) ? options.scanMeta.pageFiles : [])
    .filter(page => String(page?.type || '').startsWith('image/'))
    .slice(0, 12);

  if (isPdfFileV102(file) || !String(file?.type || '').startsWith('image/')) {
    return analyzeSmartDocumentV102(file, options);
  }

  const sourcePages = pageFiles.length ? pageFiles : [file];
  onProgress(.02, sourcePages.length > 1 ? `Preparing ${sourcePages.length} pages separately…` : 'Preparing Scanner Intelligence…');
  const baseSource = sourcePages[0] || file;
  const base = await analyzeSmartDocumentV102(baseSource, {
    ...options,
    onProgress:(value, text) => onProgress(.03 + Number(value || 0) * (sourcePages.length > 1 ? .31 : .51), text),
  });

  const baseCoverage = criticalFieldCoverageV1030(base?.type?.id || 'other', base?.fields || {});
  const pageResults = [];
  const pageAreaStart = sourcePages.length > 1 ? .36 : .56;
  const pageAreaSpan = sourcePages.length > 1 ? .56 : .34;
  const perPage = pageAreaSpan / Math.max(1, sourcePages.length);

  const skipExtraForStrongSingleBol = sourcePages.length === 1
    && ['bol','pod'].includes(base?.type?.id)
    && Number(base?.confidence || 0) >= .91
    && baseCoverage >= .82;

  if (!skipExtraForStrongSingleBol) {
    for (let index = 0; index < sourcePages.length; index += 1) {
      const page = await readPageWithConsensus(sourcePages[index], index + 1, {
        progressStart:pageAreaStart + index * perPage,
        progressSpan:perPage,
        onProgress,
      });
      pageResults.push(page);
    }
  }

  const text = combinePageText(pageResults, base?.text || '');
  const classification = classifyDocument(text || base?.text || '', file?.name || 'scan.jpg');
  const type = selectedType(preferredType, classification, base);
  const sources = [{ id:'base-reader', fields:base?.fields || {}, weight:sourceWeight(base?.confidence, .62) }];

  for (const page of pageResults) {
    for (const pass of page.passes || []) {
      const fields = parseByType(type.id, pass.text || '', {}, now);
      sources.push({
        id:pass.id,
        fields,
        weight:sourceWeight(pass.confidence, .48),
      });
    }
  }

  if (text) {
    const combinedFields = parseByType(type.id, text, base?.fields || {}, now);
    const passConfidence = pageResults.flatMap(page => page.passes || []).map(pass => Number(pass.confidence || 0));
    const averagePass = passConfidence.length ? passConfidence.reduce((sum, value) => sum + value, 0) / passConfidence.length : Number(base?.confidence || .5);
    sources.push({ id:'combined-pages', fields:combinedFields, weight:sourceWeight(Math.max(.68, averagePass), .7) });
  }

  const consensus = consensusFieldsV1030(sources, type.id);
  const fields = mergeMeaningful(base?.fields, consensus.fields, {
    fieldConfidence:{ ...(base?.fields?.fieldConfidence || {}), ...consensus.fieldConfidence },
    fieldEvidence:consensus.fieldEvidence,
  });
  const coverage = criticalFieldCoverageV1030(type.id, fields);
  const validation = validateDocumentFieldsV1030(type.id, fields, now);
  const passConfidence = pageResults.flatMap(page => page.passes || []).map(pass => Number(pass.confidence || 0));
  const bestPassConfidence = passConfidence.length ? Math.max(...passConfidence) : 0;
  const confidence = Math.max(.12, Math.min(.995,
    Number(base?.confidence || .2) * .42
    + bestPassConfidence * .18
    + coverage * .22
    + consensus.criticalConfidence * .24
    - validation.penalty
  ));
  const criticalFloor = type.id === 'other' ? .72 : .80;
  const needsReview = (
    !text
    || type.id === 'other'
    || coverage < .72
    || consensus.criticalConfidence < criticalFloor
    || !validation.valid
    || confidence < .84
    || fields.needsFieldReview === true
  );

  onProgress(1, needsReview ? 'Smart scan ready — verify highlighted fields' : 'Smart scan verified and ready');
  return {
    ...base,
    type,
    detectedType:classification.type,
    confidence,
    text:text || base?.text || '',
    fields,
    fieldCoverage:coverage,
    fieldConfidence:fields.fieldConfidence || {},
    fieldEvidence:consensus.fieldEvidence,
    criticalConfidence:consensus.criticalConfidence,
    validation,
    method:`scanner-intelligence-v1030:${base?.method || 'ocr'}`,
    needsReview,
    pageCount:sourcePages.length,
    pages:pageResults.map(page => ({
      page:page.page,
      bestConfidence:Number(page.best?.confidence || 0),
      passCount:page.passes.length,
      passes:page.passes.map(pass => ({ id:pass.id, variant:pass.variant, confidence:Number(pass.confidence || 0), textLength:String(pass.text || '').length })),
      variants:page.variants,
    })),
    ocrPasses:[
      ...(base?.ocrPasses || []),
      ...pageResults.flatMap(page => page.passes.map(pass => ({
        pass:pass.id,
        confidence:Number(pass.confidence || 0),
        textLength:String(pass.text || '').length,
      }))),
    ],
    scannerIntelligenceVersion:'103.0.0',
  };
}

export const analyzeDocumentFilePro = analyzeSmartDocumentV1030;
