import { truckDocumentTypeMetaV1040 } from './truckDocumentCatalogV1040.js';

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function clean(value = '') {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanLine(value = '') {
  return String(value || '')
    .replace(/^[\s:#\-–—|]+|[\s|]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function sourceLines(value = '') {
  return String(value || '').split(/\r?\n/).map(cleanLine).filter(Boolean);
}

function firstCapture(text = '', patterns = [], group = 1) {
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    if (match?.[group]) return cleanLine(match[group]);
  }
  return '';
}

function numberValue(value = '') {
  const normalized = String(value || '')
    .replace(/[OoQqDd]/g, '0')
    .replace(/[Il|!]/g, '1')
    .replace(/[$,\s]/g, '')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeOperationalId(value = '') {
  const normalized = String(value || '')
    .toUpperCase()
    .replace(/[OoQqDd](?=\d)|(?<=\d)[OoQqDd]/g, '0')
    .replace(/[Il|!](?=\d)|(?<=\d)[Il|!]/g, '1')
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9._/-]/g, '')
    .replace(/^[._/-]+|[._/-]+$/g, '');
  if (normalized.length < 4 || normalized.length > 30) return '';
  if (!/\d/.test(normalized)) return '';
  if (/^(?:EFOR|BEFORE|TOTAL|CARRIER|CUSTOMER|DELIVERY|SHIPPER|CONSIGNEE|PAGE)$/i.test(normalized)) return '';
  return normalized;
}

function allDates(text = '') {
  const values = [];
  const regex = /\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\b/g;
  let match;
  while ((match = regex.exec(String(text || '')))) {
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    const month = Number(match[1]);
    const day = Number(match[2]);
    const date = new Date(year, month - 1, day, 12);
    if (Number.isNaN(date.getTime()) || date.getMonth() !== month - 1 || date.getDate() !== day) continue;
    values.push({
      raw:match[0],
      value:`${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`,
      time:date.getTime(),
      index:match.index,
    });
  }
  return values;
}

function blockAfterLabel(text = '', labelPattern, stopPattern, maxLines = 5) {
  const lines = sourceLines(text);
  for (let index = 0; index < lines.length; index += 1) {
    if (!labelPattern.test(lines[index])) continue;
    labelPattern.lastIndex = 0;
    const output = [];
    const sameLine = lines[index].replace(labelPattern, '').replace(/^\s*[:#-]\s*/, '').trim();
    if (sameLine && !/^[-–—]+$/.test(sameLine)) output.push(sameLine);
    for (let cursor = index + 1; cursor < lines.length && output.length < maxLines; cursor += 1) {
      const line = lines[cursor];
      if (stopPattern?.test(line)) break;
      if (/^(?:PAGE|PRINTED|ARRIVAL|SALES ORDER|DELIVERY|DRIVERS|PERMANENT ADDRESS|ROUTE CAR|PRODUCT CODE|TOTAL UNITS|FO#)/i.test(line)) break;
      if (!/^[-–—]+$/.test(line)) output.push(line);
    }
    return output.join(', ').replace(/(?:,\s*){2,}/g, ', ').trim();
  }
  return '';
}

function cityStateFromBlock(value = '') {
  const matches = [...String(value || '').matchAll(/([A-Za-z][A-Za-z .'\-]{1,45}),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/g)];
  const match = matches.at(-1);
  return match ? `${cleanLine(match[1])}, ${match[2].toUpperCase()}` : '';
}

function companyFromBlock(value = '') {
  const parts = String(value || '').split(',').map(cleanLine).filter(Boolean);
  return parts.find(part => /[A-Za-z]{3}/.test(part) && !/^\d/.test(part) && !/\b[A-Z]{2}\s+\d{5}/.test(part)) || '';
}

function actualExceptionText(text = '') {
  const source = clean(text);
  const labeled = firstCapture(source, [
    /(?:damage|exception|shortage|overage)\s*(?:description|details|notes?)\s*[:#-]\s*([^\n]{3,220})/i,
    /(?:freight\s+)?claim\s+reason\s*[:#-]\s*([^\n]{3,220})/i,
    /(?:refused|damaged|short|over)\s+freight\s*[:#-]\s*([^\n]{3,220})/i,
  ]);
  if (labeled) return labeled;
  const line = sourceLines(source).find(item => (
    /\b(?:damaged|shortage|overage|refused)\b/i.test(item)
    && !/to\s+report\s+any\s+OS\s*&?\s*D|claims?\s+department|over\s*,?\s*short\s*,?\s*damaged/i.test(item)
  ));
  return line || '';
}

function claimAmount(text = '') {
  return numberValue(firstCapture(text, [
    /(?:claim\s+amount|amount\s+claimed|estimated\s+damage|approved\s+claim)\s*[:#-]?\s*\$\s*([\d,]+(?:\.\d{2})?)/i,
  ]));
}

export function inspectBolPodDocumentV1041(text = '') {
  const source = clean(text);
  const bolNumber = normalizeOperationalId(firstCapture(source, [
    /\bB\s*\/\s*L\s*(?:NO\.?|NUMBER|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9 ._/-]{4,30})/i,
    /\bBILL\s+OF\s+LADING\s*(?:NO\.?|NUMBER|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9 ._/-]{4,30})/i,
  ]));
  const bolHeader = /\bbill\s+of\s+lading\b/i.test(source) || /\bB\s*\/\s*L\s*(?:NO\.?|NUMBER|#)/i.test(source);
  const partyStructure = /\bCARRIER\s*:/i.test(source)
    && /\bFROM\s*:/i.test(source)
    && /\b(?:CONSIGNED\s*(?:-|\s)*TO|CONSIGNEE)\s*:/i.test(source);
  const itemTable = /\bPRODUCT\s+CODE\b/i.test(source)
    && /\b(?:QTY|QUANTITY)\s+SHIPPED\b/i.test(source)
    && /\bNET\s+WEIGHT\b/i.test(source);
  const totals = /\bTOTAL\s+UNITS\b/i.test(source) && /\bTOTAL\s+(?:NET\s+)?WEIGHT\b/i.test(source);
  const freightTerms = /\bPREPAID\b/i.test(source) && /\bCOLLECT\b/i.test(source);
  const salesOrder = /\bSALES\s+ORDER\b/i.test(source);
  const customerCopy = /\bCUSTOMER\s+COPY\b/i.test(source);
  const osdInstruction = /to\s+report\s+any\s+OS\s*&?\s*D|OS\s*&?\s*D\s+claims?\s+department|over\s*,?\s*short\s*,?\s*damag(?:e|ed)/i.test(source);
  const claimSpecific = /\bOS\s*&?\s*D\s+(?:REPORT|FORM|CLAIM)\b|exception\s+report|freight\s+claim|claim\s*(?:no\.?|number|#)|amount\s+claimed|damage\s+(?:description|details)|shortage\s+(?:qty|quantity)|overage\s+(?:qty|quantity)|disposition\s+of\s+freight|refused\s+freight/i.test(source);
  const explicitSignature = /(?:receiver|consignee|customer)\s+signature\s*[:#-]?\s*[^\n]{1,80}|(?:received|signed)\s+by\s*[:#-]\s*[^\n]{2,80}/i.test(source);
  const signedConsigneeFooter = /original\s+bill\s+of\s+lading[\s\S]{0,220}accepted\s+and\s+signed\s+by\s+consignee[\s\S]{0,220}presented/i.test(source);
  const perSignatureArea = /\bPER\b/i.test(source) && customerCopy;
  const dates = allDates(source);
  const latestDate = dates.slice().sort((a, b) => b.time - a.time || b.index - a.index)[0]?.value || '';
  const earliestDate = dates.slice().sort((a, b) => a.time - b.time || a.index - b.index)[0]?.value || '';
  const laterDeliveryDate = latestDate && earliestDate && latestDate !== earliestDate ? latestDate : '';
  const podEvidence = explicitSignature || (customerCopy && signedConsigneeFooter) || (customerCopy && perSignatureArea && Boolean(laterDeliveryDate));
  const bolScore = (bolHeader ? 3 : 0)
    + (bolNumber ? 3 : 0)
    + (partyStructure ? 2 : 0)
    + (itemTable ? 3 : 0)
    + (totals ? 1 : 0)
    + (freightTerms ? 1 : 0)
    + (salesOrder ? 1 : 0)
    + (customerCopy ? 1 : 0);
  return {
    source,
    bolNumber,
    bolHeader,
    partyStructure,
    itemTable,
    totals,
    freightTerms,
    salesOrder,
    customerCopy,
    osdInstruction,
    claimSpecific,
    onlyOsdDisclaimer:osdInstruction && !claimSpecific,
    explicitSignature,
    signedConsigneeFooter,
    perSignatureArea,
    podEvidence,
    laterDeliveryDate,
    bolScore,
    bolDominant:bolScore >= 7,
  };
}

export function arbitrateBolPodOsdV1041(classification = {}, options = {}) {
  const preferredType = String(options.preferredType || 'auto');
  if (preferredType !== 'auto') return classification;
  const profile = inspectBolPodDocumentV1041(options.text || '');
  const currentId = classification?.type?.id || 'other';
  let nextId = currentId;
  let reason = '';

  if (profile.bolDominant && profile.onlyOsdDisclaimer && ['osd_report','claim_notice','other'].includes(currentId)) {
    nextId = profile.podEvidence ? 'pod' : 'bol';
    reason = 'OS&D wording is a printed driver instruction inside a structurally verified BOL, not an exception report.';
  } else if (profile.bolDominant && currentId === 'bol' && profile.podEvidence) {
    nextId = 'pod';
    reason = 'Customer-copy and signed-consignee evidence make this a signed BOL used as POD.';
  } else if (profile.bolDominant && currentId === 'other') {
    nextId = profile.podEvidence ? 'pod' : 'bol';
    reason = 'B/L number, carrier parties, freight table and total-weight structure identify this shipping document.';
  }

  if (nextId === currentId) return { ...classification, bolPodProfileV1041:profile };
  const type = truckDocumentTypeMetaV1040(nextId);
  const structuralConfidence = clamp(.72 + profile.bolScore * .018 + (profile.podEvidence ? .06 : 0), .78, .985);
  const alternatives = [type, classification.type, ...(classification.alternatives || [])]
    .filter(Boolean)
    .filter((item, index, list) => list.findIndex(other => other.id === item.id) === index)
    .slice(0, 8);
  return {
    ...classification,
    type,
    confidence:Math.max(Number(classification.confidence || 0), structuralConfidence),
    alternatives,
    lowEvidence:false,
    autoCorrected:true,
    arbitration:{ version:'104.1', from:currentId, to:nextId, reason },
    bolPodProfileV1041:profile,
  };
}

export function sanitizeBolPodFieldsV1041(typeId = 'other', text = '', fields = {}) {
  const source = clean(text);
  const profile = inspectBolPodDocumentV1041(source);
  if (!['bol','pod','delivery_receipt','osd_report','claim_notice'].includes(typeId) && !profile.bolDominant) return fields;

  const carrierName = firstCapture(source, [/\bCARRIER\s*:\s*([^\n]{2,90})/i]);
  const fromBlock = blockAfterLabel(
    source,
    /^FROM\s*:/i,
    /^(?:CONSIGNED\s*(?:-|\s)*TO|CONSIGNEE|PERMANENT ADDRESS|DRIVERS|SALES ORDER|DELIVERY)\b/i,
    5,
  );
  const toBlock = blockAfterLabel(
    source,
    /^(?:CONSIGNED\s*(?:-|\s)*TO|CONSIGNEE)\s*:/i,
    /^(?:PERMANENT ADDRESS|DRIVERS|SALES ORDER|DELIVERY|ROUTE CAR|PRODUCT CODE)\b/i,
    6,
  );
  const exactBol = profile.bolNumber;
  const existingLoad = normalizeOperationalId(fields.loadNo || fields.bolNo || '');
  const salesOrder = normalizeOperationalId(firstCapture(source, [/\bSALES\s+ORDER\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{3,30})/i]));
  const deliveryNumber = normalizeOperationalId(firstCapture(source, [/\bDELIVERY\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{3,30})/i]));
  const poNumber = normalizeOperationalId(firstCapture(source, [
    /\bP\.?O\.?\s*(?:NO\.?|NUMBER|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{3,30})/i,
  ])) || normalizeOperationalId(fields.poNumber || '');
  const routeCarNo = normalizeOperationalId(firstCapture(source, [/\bROUTE\s+CAR\s+NO\.?\s*[:#-]?\s*([A-Z0-9._/-]{2,20})/i]));
  const dropNumber = cleanLine(firstCapture(source, [/\bDROP\s+NUMBER\s*[:#-]?\s*([0-9.]{1,12})/i]));
  const foNumber = normalizeOperationalId(firstCapture(source, [/\bFO\s*#\s*[:#-]?\s*([A-Z0-9._/-]{3,30})/i]));
  const sealBlock = firstCapture(source, [/\bSEALS?\s+NOS?\.?\s*[:#-]?\s*([0-9\s-]{5,100})/i]);
  const sealNumbers = [...new Set((sealBlock.match(/\b\d{5,12}\b/g) || []))].join(', ');
  const totalUnits = numberValue(firstCapture(source, [/\bTOTAL\s+UNITS\s*[:#-]?\s*([\d,]+(?:\.\d+)?)/i]));
  const totalTare = numberValue(firstCapture(source, [/\bTOTAL\s+TARE\s*[:#-]?\s*([\d,]+(?:\.\d+)?)/i]));
  const netWeight = numberValue(firstCapture(source, [/\bTOTAL\s+NET\s+WEIGHT\s*[:#-]?\s*([\d,]+(?:\.\d+)?)/i]));
  const grossWeight = numberValue(firstCapture(source, [/\bTOTAL\s+WEIGHT\s*[:#-]?\s*([\d,]+(?:\.\d+)?)/i]));
  const documentDate = firstCapture(source, [/\bDATE\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i]);
  const temperatureMatch = source.match(/(?:use\s+temp(?:erature)?\s+setting\s+of|set\s*point|temperature)\s*(?:[:#]\s*)?(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([FC])?/i);
  const temperatureRaw = String(temperatureMatch?.[1] || '').trim();
  const temperatureUnit = String(temperatureMatch?.[2] || '').toUpperCase();
  const temperature = temperatureRaw ? `${temperatureRaw}${temperatureUnit ? `°${temperatureUnit}` : ''}` : '';
  const actualException = actualExceptionText(source);
  const isShippingCopy = ['bol','pod','delivery_receipt'].includes(typeId) || profile.bolDominant;
  const explicitSignature = profile.explicitSignature;
  const claimTotal = claimAmount(source);

  const next = {
    ...fields,
    bolNo:exactBol || normalizeOperationalId(fields.bolNo || '') || existingLoad,
    loadNo:exactBol || existingLoad || salesOrder || deliveryNumber || poNumber,
    poNumber,
    salesOrder,
    deliveryNumber,
    routeCarNo,
    dropNumber,
    foNumber,
    sealNumbers,
    carrierName:carrierName || fields.carrierName || '',
    shipper:companyFromBlock(fromBlock) || fields.shipper || '',
    consignee:companyFromBlock(toBlock) || fields.consignee || '',
    shipFromDetails:fromBlock || fields.shipFromDetails || '',
    shipToDetails:toBlock || fields.shipToDetails || '',
    origin:cityStateFromBlock(fromBlock) || fields.origin || '',
    destination:cityStateFromBlock(toBlock) || fields.destination || '',
    date:documentDate || fields.date || '',
    deliverySignedDate:profile.laterDeliveryDate || fields.deliverySignedDate || '',
    totalUnits:totalUnits || fields.totalUnits || fields.totalPieces || 0,
    totalPieces:totalUnits || fields.totalPieces || 0,
    totalTare:totalTare || fields.totalTare || 0,
    netWeight:netWeight || fields.netWeight || 0,
    grossWeight:grossWeight || fields.grossWeight || fields.weight || 0,
    weight:grossWeight || fields.weight || netWeight || 0,
    temperature:temperature || fields.temperature || '',
    exceptionText:actualException,
    signatureLikely:typeId === 'pod' && profile.podEvidence,
    signaturePresent:explicitSignature || (fields.signaturePresent === true && !profile.signedConsigneeFooter),
  };

  if (isShippingCopy) {
    next.total = '';
    next.gross = '';
    next.grossPay = '';
    next.netPay = '';
    next.deductions = '';
    next.merchant = '';
  }
  if (['osd_report','claim_notice'].includes(typeId)) {
    next.total = claimTotal || '';
    next.gross = '';
    next.merchant = '';
    next.exceptionText = actualException;
  }
  next.cleanPod = typeId === 'pod' && next.signaturePresent === true && !next.exceptionText;
  return next;
}
