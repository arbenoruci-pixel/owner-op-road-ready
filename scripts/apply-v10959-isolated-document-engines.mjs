import fs from 'node:fs';
import path from 'node:path';

const VERSION = '109.5.9';
const BUILD = 'v10959-isolated-document-engines';

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive:true });
  fs.writeFileSync(filePath, content);
}

function replaceRequired(source, pattern, replacement, label) {
  if (typeof pattern === 'string') {
    if (source.includes(replacement)) return source;
    if (!source.includes(pattern)) throw new Error('v109.5.9 missing ' + label);
    return source.replace(pattern, replacement);
  }
  if (pattern.test(source)) return source.replace(pattern, replacement);
  if (source.includes(replacement)) return source;
  throw new Error('v109.5.9 missing ' + label);
}

function writeJson(filePath, transform) {
  const value = JSON.parse(read(filePath));
  transform(value);
  write(filePath, JSON.stringify(value, null, 2) + '\n');
}

write('source/src/modules/scan/engines/documentEngineContractV1.js', String.raw`export const DOCUMENT_ENGINE_CONTRACT_VERSION_V1 = '1.0.0';

export function cleanTextV1(value = '') {
  return String(value ?? '')
    .replace(/\[\[PAGE\s*:\s*\d+\]\]/gi, ' ')
    .replace(/\u0000/g, ' ')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function compactTextV1(value = '') {
  return cleanTextV1(value).replace(/\s+/g, ' ').trim();
}

export function lowerTextV1(value = '') {
  return compactTextV1(value).toLowerCase();
}

export function clampV1(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function scalarFieldLinesV1(value = {}, prefix = '', depth = 0) {
  if (!value || typeof value !== 'object' || depth > 2) return [];
  return Object.entries(value).flatMap(([key, item]) => {
    const name = prefix ? prefix + '.' + key : key;
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      const scalar = cleanTextV1(item);
      return scalar ? [name + ': ' + scalar] : [];
    }
    if (Array.isArray(item)) {
      const scalars = item.filter(entry => ['string','number','boolean'].includes(typeof entry)).map(entry => cleanTextV1(entry)).filter(Boolean);
      return scalars.length ? [name + ': ' + scalars.join(' | ')] : [];
    }
    return scalarFieldLinesV1(item, name, depth + 1);
  });
}

export function normalizeEngineInputV1(file = null, generic = {}, options = {}) {
  const fields = generic?.fields && typeof generic.fields === 'object' ? generic.fields : {};
  const textParts = [
    generic?.text,
    generic?.rawText,
    generic?.ocrText,
    generic?.sourceText,
    generic?.analysisText,
    generic?.analysis?.text,
    generic?.extractedText,
    options?.text,
    options?.rawText,
    options?.ocrText,
    options?.sourceText,
  ].map(cleanTextV1).filter(Boolean);
  const fieldLines = scalarFieldLinesV1(fields);
  const text = cleanTextV1([...textParts, ...fieldLines].join('\n'));
  const fileName = cleanTextV1(file?.name || generic?.fileName || generic?.originalFileName || generic?.scanMeta?.fileName || options?.fileName || '');
  return Object.freeze({
    file,
    fileName,
    fileNameLower:fileName.toLowerCase(),
    mimeType:cleanTextV1(file?.type || generic?.mimeType || options?.mimeType || ''),
    text,
    textLower:text.toLowerCase(),
    compact:compactTextV1(text),
    fields:Object.freeze({ ...fields }),
    preferredType:cleanTextV1(options?.preferredType || generic?.preferredType || ''),
    scanMeta:generic?.scanMeta || options?.scanMeta || {},
    generic,
  });
}

export function addEvidenceGroupV1(groups, id, weight, matched, detail = '') {
  if (!matched) return;
  if (groups.some(group => group.id === id)) return;
  groups.push(Object.freeze({ id, weight:Number(weight || 0), detail:cleanTextV1(detail || id) }));
}

export function evidenceScoreV1(groups = [], penalties = []) {
  const positive = groups.reduce((sum, group) => sum + Number(group.weight || 0), 0);
  const negative = penalties.reduce((sum, penalty) => sum + Math.abs(Number(penalty.weight || 0)), 0);
  return { positive, negative, score:positive - negative };
}

export function firstCaptureV1(source = '', patterns = []) {
  const text = String(source || '');
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = text.match(pattern);
    if (match?.[1]) return cleanTextV1(match[1]);
  }
  return '';
}

export function firstLineV1(source = '', predicate = () => false) {
  return cleanTextV1(source).split(/\n+/).map(cleanTextV1).find(predicate) || '';
}

export function canonicalReferenceV1(value = '') {
  const raw = cleanTextV1(value).toUpperCase()
    .replace(/^(?:LOAD|ORDER|TRIP|SHIPMENT|CONFIRMATION|BOL|P\.O\.|PO)\s*(?:NUMBER|NO\.?|#)?\s*[:#-]*/i, '')
    .replace(/^[^A-Z0-9]+|[^A-Z0-9._/-]+$/g, '');
  if (!raw || !/\d/.test(raw)) return '';
  if (raw.length < 3 || raw.length > 32) return '';
  if (/^(?:PAGE|REJECTION|RATED|ADES|TRUE|FALSE|NUMBER|INVOICE|DATE|TOTAL|CARRIER|BROKER)$/i.test(raw)) return '';
  if (/^(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}$/.test(raw)) return '';
  if (/^\d{1,2}[-/]\d{1,2}[-/](?:19|20)?\d{2}$/.test(raw)) return '';
  return raw;
}

export function canonicalMoneyV1(value = '') {
  const raw = String(value ?? '').replace(/[^0-9.-]/g, '');
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function moneyCaptureV1(source = '', labels = []) {
  const text = String(source || '');
  for (const label of labels) {
    const pattern = new RegExp('(?:' + label + ')\\s*[:#-]?\\s*\\$?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)', 'i');
    const match = text.match(pattern);
    const value = canonicalMoneyV1(match?.[1] || '');
    if (value) return value;
  }
  return 0;
}

export function dateCaptureV1(source = '') {
  const match = String(source || '').match(/\b(0?[1-9]|1[0-2])[\/-](0?[1-9]|[12]\d|3[01])[\/-]((?:19|20)?\d{2})\b/);
  if (!match) return '';
  const year = match[3].length === 2 ? '20' + match[3] : match[3];
  return year + '-' + String(match[1]).padStart(2, '0') + '-' + String(match[2]).padStart(2, '0');
}

export function cityStateAfterV1(source = '', headings = []) {
  const rows = cleanTextV1(source).split(/\n+/).map(cleanTextV1).filter(Boolean);
  for (let index = 0; index < rows.length; index += 1) {
    if (!headings.some(pattern => pattern.test(rows[index]))) continue;
    const block = rows.slice(index, index + 8).join(' | ');
    const match = block.match(/\b([A-Z][A-Za-z.' -]{1,48},\s*[A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\b/i);
    if (match?.[1]) return cleanTextV1(match[1]);
  }
  return '';
}

export function nonEmptyV1(...values) {
  return values.map(cleanTextV1).find(Boolean) || '';
}

export function engineResultV1({ engineId, version, typeId, qualified, score, confidence, groups = [], penalties = [], fields = {}, missingFields = [], reasons = [] }) {
  return Object.freeze({
    engineId,
    version,
    contractVersion:DOCUMENT_ENGINE_CONTRACT_VERSION_V1,
    typeId,
    qualified:qualified === true,
    score:Number(score || 0),
    confidence:clampV1(confidence),
    groups:Object.freeze([...groups]),
    penalties:Object.freeze([...penalties]),
    fields:Object.freeze({ ...fields }),
    missingFields:Object.freeze([...missingFields]),
    needsReview:missingFields.length > 0 || qualified !== true,
    reasons:Object.freeze([...reasons]),
  });
}
`);

write('source/src/modules/scan/engines/rateConfirmationEngineV1.js', String.raw`import {
  addEvidenceGroupV1,
  canonicalReferenceV1,
  cityStateAfterV1,
  engineResultV1,
  evidenceScoreV1,
  firstCaptureV1,
  firstLineV1,
  moneyCaptureV1,
  nonEmptyV1,
} from './documentEngineContractV1.js';

export const RATE_CONFIRMATION_ENGINE_V1 = Object.freeze({
  id:'rate-confirmation-engine',
  typeId:'rate_confirmation',
  version:'1.0.0',
  locked:true,
});

function validEmail(value = '') {
  const text = String(value || '').trim();
  return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text) ? text : '';
}

function validPhone(value = '') {
  const text = String(value || '').trim();
  return text.replace(/\D/g, '').length >= 10 ? text : '';
}

function explicitReference(source = '', label) {
  return canonicalReferenceV1(firstCaptureV1(source, [
    new RegExp('\\b' + label + '\\s*(?:NUMBER|NO\\.?|#)\\s*[:#-]*\\s*([A-Z0-9][A-Z0-9._/-]{2,31})', 'i'),
  ]));
}

export function analyzeRateConfirmationV1(input = {}) {
  const source = String(input.text || '');
  const lower = String(input.textLower || source.toLowerCase());
  const fields = input.fields || {};
  const groups = [];
  const penalties = [];

  const heading = /load\s+confirmation\s+and\s+payment\s+agreement|carrier\s+rate\s+confirmation|rate\s+confirmation(?:\s+agreement)?|broker\s*\/\s*carrier\s+agreement/i.test(source);
  const payTerms = /flat\s+rate|total\s+(?:carrier\s+)?pay|all[- ]?in\s+rate|agreed\s+rate|line\s*haul|linehaul|fuel\s+surcharge|carrier\s+compensation/i.test(source);
  const signReturn = /please\s+sign\s*(?:&|and)\s*return|confirmation.{0,90}signed.{0,60}return|broker\s+signature.{0,180}carrier\s+signature/is.test(source);
  const routeTerms = (/(?:pickup|shipper|origin)/i.test(source) && /(?:delivery|deliver\s+to|consignee|destination)/i.test(source)) || Boolean(fields.origin && fields.destination);
  const brokerText = String(fields.broker || '');
  const carrierText = String(fields.carrierName || fields.carrier || '');
  const brokerParty = /broker|logistics|freight|transportation|brokerage/i.test(brokerText + ' ' + source);
  const carrierParty = /carrier|MC\s*#?|DOT\s*#?|motor\s+carrier/i.test(carrierText + ' ' + source) || Boolean(fields.mcNumber);
  const partyPair = brokerParty && carrierParty;
  const equipment = Boolean(fields.equipment) || /power\s+only|dry\s+van|reefer|refrigerated|flatbed|step\s*deck|53\s*(?:ft|foot)|trailer\s+type/i.test(source);
  const tracking = Boolean(fields.trackingProvider) || /fourkites|macro(?:point|\s+point)|trucker\s+tools|tracking\s+(?:is\s+)?required/i.test(source);
  const contact = Boolean(validPhone(fields.brokerPhone || fields.dispatchPhone) || validEmail(fields.brokerEmail || fields.billingEmail || fields.dispatchEmail));
  const billing = Boolean(validEmail(fields.billingEmail)) || /billing\s+(?:email|contact)|invoice\s+submission|submit.{0,80}(?:pod|bol)/i.test(source);
  const rateFile = /(?:carrier|freight)[-_ ]*confirmation|carrierconfirmation|rate[-_ ]?con(?:firmation)?|load[-_ ]?confirmation|ready[-_ ]*to[-_ ]*sign/i.test(input.fileNameLower || '');

  addEvidenceGroupV1(groups, 'contract-heading', 34, heading, 'Rate Confirmation contract heading');
  addEvidenceGroupV1(groups, 'carrier-pay', 24, payTerms, 'Carrier compensation or rate terms');
  addEvidenceGroupV1(groups, 'signature-return', 16, signReturn, 'Broker/carrier signature or sign-and-return language');
  addEvidenceGroupV1(groups, 'pickup-delivery-structure', 15, routeTerms, 'Pickup and delivery structure');
  addEvidenceGroupV1(groups, 'broker-carrier-parties', 22, partyPair, 'Broker and motor carrier are both identified');
  addEvidenceGroupV1(groups, 'equipment', 12, equipment, 'Truck/trailer equipment is specified');
  addEvidenceGroupV1(groups, 'tracking', 12, tracking, 'Load tracking provider or requirement');
  addEvidenceGroupV1(groups, 'broker-contact', 8, contact, 'Broker/dispatch phone or email');
  addEvidenceGroupV1(groups, 'billing-instructions', 7, billing, 'Billing or paperwork submission instructions');
  addEvidenceGroupV1(groups, 'filename', 18, rateFile, 'Rate Confirmation filename evidence');

  const receiverSignature = /receiver\s+signature|consignee\s+signature|signature\s+of\s+(?:receiver|consignee)|received\s+by\s*[:#-]/i.test(source);
  const deliveryCompletion = /date\s+delivered|delivery\s+(?:date|time)\s*[:#-]|received\s+in\s+good\s+order|delivered\s+at\s*[:#-]/i.test(source);
  const realPod = receiverSignature && deliveryCompletion;
  const fuelCore = /\b(?:gallons?|gal)\b/i.test(source) && /price\s*(?:per|\/)?\s*(?:gal|gallon)|ppu|unit\s+price/i.test(source);
  const bolCore = /bill\s+of\s+lading|straight\s+bill\s+of\s+lading/i.test(source) && /shipper/i.test(source) && /consignee/i.test(source) && !payTerms;

  if (realPod) penalties.push({ id:'real-pod', weight:72, detail:'Receiver signature and completed-delivery evidence' });
  if (fuelCore) penalties.push({ id:'fuel-receipt', weight:82, detail:'Gallons and unit-price fuel evidence' });
  if (bolCore) penalties.push({ id:'bol-structure', weight:46, detail:'BOL structure without carrier-rate evidence' });

  const totals = evidenceScoreV1(groups, penalties);
  const fieldContract = partyPair && equipment && tracking && contact;
  const core = heading || payTerms || signReturn || rateFile || fieldContract;
  const qualified = core && groups.length >= 3 && totals.score >= 56 && !realPod && !fuelCore;
  const confidence = Math.max(0, Math.min(0.99, totals.score / 100));

  const loadNo = explicitReference(source, 'LOAD')
    || explicitReference(source, 'CONFIRMATION')
    || canonicalReferenceV1(fields.loadNo)
    || canonicalReferenceV1(fields.orderNo);
  const bolNo = explicitReference(source, 'BOL');
  const poNumber = explicitReference(source, 'P\\.?O\\.?');
  const broker = nonEmptyV1(
    fields.broker,
    firstLineV1(source, line => /\b(?:logistics|freight|transportation|brokerage)\b/i.test(line) && /\b(?:LLC|INC\.?|CORP\.?|CO\.?)\b/i.test(line) && !/^carrier\b/i.test(line)),
  );
  const total = Number(fields.total || fields.gross || fields.amount || 0)
    || moneyCaptureV1(source, ['flat\\s+rate', 'total\\s+(?:carrier\\s+)?pay', 'all[- ]?in\\s+rate', 'agreed\\s+rate', 'total\\s+rate']);
  const origin = nonEmptyV1(fields.origin, cityStateAfterV1(source, [/^(?:initial\s+pickup|pickup|origin|shipper)\b/i]));
  const destination = nonEmptyV1(fields.destination, cityStateAfterV1(source, [/^(?:first\s+delivery|delivery|destination|consignee|stop\s*#?\s*1)\b/i]));
  const trackingProvider = nonEmptyV1(fields.trackingProvider, /fourkites/i.test(lower) ? 'FourKites' : /macro(?:point|\s+point)/i.test(lower) ? 'MacroPoint' : '');
  const missingFields = [
    !loadNo ? 'loadNo' : '',
    !broker ? 'broker' : '',
    !origin ? 'origin' : '',
    !destination ? 'destination' : '',
    !total ? 'total' : '',
  ].filter(Boolean);

  return engineResultV1({
    engineId:RATE_CONFIRMATION_ENGINE_V1.id,
    version:RATE_CONFIRMATION_ENGINE_V1.version,
    typeId:RATE_CONFIRMATION_ENGINE_V1.typeId,
    qualified,
    score:totals.score,
    confidence,
    groups,
    penalties,
    missingFields,
    reasons:[qualified ? 'Independent Rate Confirmation evidence passed.' : 'Rate Confirmation evidence did not meet the locked threshold.'],
    fields:{
      loadNo,
      orderNo:loadNo,
      bolNo,
      poNumber,
      broker,
      carrierName:nonEmptyV1(fields.carrierName, fields.carrier),
      mcNumber:nonEmptyV1(fields.mcNumber, firstCaptureV1(source, [/\bMC\s*#?\s*[:#-]?\s*(\d{5,10})\b/i])),
      total,
      gross:total,
      origin,
      destination,
      equipment:nonEmptyV1(fields.equipment, firstCaptureV1(source, [/\b(Power\s+Only|Dry\s+Van|Reefer|Refrigerated|Flatbed|Step\s*Deck)\b/i])),
      trackingProvider,
      brokerContactName:nonEmptyV1(fields.brokerContactName, fields.dispatcherName),
      dispatcherName:nonEmptyV1(fields.dispatcherName, fields.brokerContactName),
      brokerPhone:validPhone(fields.brokerPhone || fields.dispatchPhone),
      dispatchPhone:validPhone(fields.dispatchPhone || fields.brokerPhone),
      brokerEmail:validEmail(fields.brokerEmail || fields.dispatchEmail),
      dispatchEmail:validEmail(fields.dispatchEmail || fields.brokerEmail),
      billingEmail:validEmail(fields.billingEmail),
      merchant:'',
      invoiceNo:'',
      podSignedEvidence:false,
      podSigned:false,
      signaturePresent:false,
    },
  });
}
`);

write('source/src/modules/scan/engines/podEngineV1.js', String.raw`import {
  addEvidenceGroupV1,
  canonicalReferenceV1,
  dateCaptureV1,
  engineResultV1,
  evidenceScoreV1,
  firstCaptureV1,
  nonEmptyV1,
} from './documentEngineContractV1.js';

export const POD_ENGINE_V1 = Object.freeze({
  id:'pod-engine',
  typeId:'pod',
  version:'1.0.0',
  locked:true,
});

export function analyzePodV1(input = {}) {
  const source = String(input.text || '');
  const fields = input.fields || {};
  const groups = [];
  const penalties = [];

  const heading = /proof\s+of\s+delivery|delivery\s+receipt|customer\s+delivery\s+copy/i.test(source);
  const receiverSignature = /receiver\s+signature|consignee\s+signature|signature\s+of\s+(?:receiver|consignee)|received\s+by\s*[:#-]|signed\s+by\s+(?:receiver|consignee)/i.test(source);
  const delivered = /date\s+delivered|delivery\s+(?:date|time)\s*[:#-]|received\s+in\s+good\s+order|delivered\s+at\s*[:#-]|actual\s+delivery/i.test(source);
  const consignee = /consignee|receiver|delivered\s+to/i.test(source);
  const reference = canonicalReferenceV1(firstCaptureV1(source, [
    /\bBOL\s*(?:NUMBER|NO\.?|#)\s*[:#-]*\s*([A-Z0-9][A-Z0-9._/-]{2,31})/i,
    /\bLOAD\s*(?:NUMBER|NO\.?|#)\s*[:#-]*\s*([A-Z0-9][A-Z0-9._/-]{2,31})/i,
  ])) || canonicalReferenceV1(fields.bolNo) || canonicalReferenceV1(fields.loadNo);
  const podFile = /\bpod\b|proof[-_ ]*of[-_ ]*delivery|signed[-_ ]*bol/i.test(input.fileNameLower || '');

  addEvidenceGroupV1(groups, 'pod-heading', 30, heading, 'Proof of Delivery heading');
  addEvidenceGroupV1(groups, 'receiver-signature', 34, receiverSignature, 'Receiver or consignee signature label');
  addEvidenceGroupV1(groups, 'delivery-completion', 22, delivered, 'Completed delivery date/time evidence');
  addEvidenceGroupV1(groups, 'consignee', 10, consignee, 'Consignee/receiver section');
  addEvidenceGroupV1(groups, 'load-reference', 14, Boolean(reference), 'Labeled BOL or load reference');
  addEvidenceGroupV1(groups, 'filename', 12, podFile, 'POD filename evidence');

  const rateContract = /rate\s+confirmation|load\s+confirmation\s+and\s+payment\s+agreement|total\s+carrier\s+pay|flat\s+rate|please\s+sign\s*(?:&|and)\s*return|fourkites|macropoint/i.test(source);
  const paperworkMention = /(?:required\s+documentation|must\s+be\s+submitted|failure\s+to\s+submit).{0,220}(?:signed\s+pod|proof\s+of\s+delivery|pod\s*\/\s*bol)/is.test(source);
  const fuelCore = /\b(?:gallons?|gal)\b/i.test(source) && /price\s*(?:per|\/)?\s*(?:gal|gallon)|ppu/i.test(source);
  if (rateContract) penalties.push({ id:'rate-contract', weight:58, detail:'Rate Confirmation contract evidence' });
  if (paperworkMention) penalties.push({ id:'paperwork-mention-only', weight:62, detail:'POD appears only in submission instructions' });
  if (fuelCore) penalties.push({ id:'fuel-receipt', weight:90, detail:'Fuel receipt evidence' });

  const totals = evidenceScoreV1(groups, penalties);
  const qualified = receiverSignature && Boolean(reference) && (heading || delivered) && totals.score >= 62 && !paperworkMention;
  const confidence = Math.max(0, Math.min(0.99, totals.score / 100));
  const bolNo = canonicalReferenceV1(fields.bolNo) || reference;
  const loadNo = canonicalReferenceV1(fields.loadNo) || reference;
  const deliveryDate = nonEmptyV1(fields.deliveryDate, fields.date, dateCaptureV1(source));
  const missingFields = [!reference ? 'loadNo' : '', !receiverSignature ? 'signaturePresent' : '', !deliveryDate ? 'deliveryDate' : ''].filter(Boolean);

  return engineResultV1({
    engineId:POD_ENGINE_V1.id,
    version:POD_ENGINE_V1.version,
    typeId:POD_ENGINE_V1.typeId,
    qualified,
    score:totals.score,
    confidence,
    groups,
    penalties,
    missingFields,
    reasons:[qualified ? 'Independent POD evidence passed.' : 'POD requires real receiver-signature and delivery-completion evidence.'],
    fields:{
      loadNo,
      bolNo,
      deliveryDate,
      date:deliveryDate,
      signaturePresent:receiverSignature,
      podSignedEvidence:receiverSignature,
      podSigned:receiverSignature,
    },
  });
}
`);

write('source/src/modules/scan/engines/bolEngineV1.js', String.raw`import {
  addEvidenceGroupV1,
  canonicalReferenceV1,
  engineResultV1,
  evidenceScoreV1,
  firstCaptureV1,
  nonEmptyV1,
} from './documentEngineContractV1.js';

export const BOL_ENGINE_V1 = Object.freeze({
  id:'bol-engine',
  typeId:'bol',
  version:'1.0.0',
  locked:true,
});

export function analyzeBolV1(input = {}) {
  const source = String(input.text || '');
  const fields = input.fields || {};
  const groups = [];
  const penalties = [];

  const heading = /bill\s+of\s+lading|straight\s+bill\s+of\s+lading|uniform\s+straight\s+bill/i.test(source);
  const parties = /shipper/i.test(source) && /consignee/i.test(source);
  const freight = /(?:pieces|packages|pallets|cases|quantity|weight|commodity|description\s+of\s+articles|freight\s+class)/i.test(source);
  const reference = canonicalReferenceV1(firstCaptureV1(source, [
    /\b(?:BOL|BILL\s+OF\s+LADING)\s*(?:NUMBER|NO\.?|#)\s*[:#-]*\s*([A-Z0-9][A-Z0-9._/-]{2,31})/i,
    /\bPRO\s*(?:NUMBER|NO\.?|#)\s*[:#-]*\s*([A-Z0-9][A-Z0-9._/-]{2,31})/i,
  ])) || canonicalReferenceV1(fields.bolNo);
  const carrier = /carrier\s+name|motor\s+carrier|SCAC|trailer\s*(?:number|no\.?|#)|seal\s*(?:number|no\.?|#)/i.test(source);
  const bolFile = /\bbol\b|bill[-_ ]*of[-_ ]*lading/i.test(input.fileNameLower || '');

  addEvidenceGroupV1(groups, 'bol-heading', 36, heading, 'Bill of Lading heading');
  addEvidenceGroupV1(groups, 'shipper-consignee', 22, parties, 'Shipper and consignee sections');
  addEvidenceGroupV1(groups, 'freight-details', 20, freight, 'Pieces, weight or commodity details');
  addEvidenceGroupV1(groups, 'bol-reference', 16, Boolean(reference), 'Labeled BOL/PRO number');
  addEvidenceGroupV1(groups, 'carrier-equipment', 10, carrier, 'Carrier, trailer or seal section');
  addEvidenceGroupV1(groups, 'filename', 10, bolFile, 'BOL filename evidence');

  const rateContract = /rate\s+confirmation|total\s+carrier\s+pay|flat\s+rate|all[- ]?in\s+rate|please\s+sign\s*(?:&|and)\s*return/i.test(source);
  const completedPod = /receiver\s+signature|consignee\s+signature|received\s+by\s*[:#-]/i.test(source) && /date\s+delivered|delivery\s+(?:date|time)|received\s+in\s+good\s+order/i.test(source);
  const fuelCore = /\b(?:gallons?|gal)\b/i.test(source) && /price\s*(?:per|\/)?\s*(?:gal|gallon)|ppu/i.test(source);
  if (rateContract) penalties.push({ id:'rate-contract', weight:65, detail:'Carrier-rate contract evidence' });
  if (completedPod) penalties.push({ id:'completed-pod', weight:34, detail:'Completed receiver-signed delivery evidence' });
  if (fuelCore) penalties.push({ id:'fuel-receipt', weight:90, detail:'Fuel receipt evidence' });

  const totals = evidenceScoreV1(groups, penalties);
  const qualified = (heading || bolFile) && Boolean(reference) && parties && freight && totals.score >= 62 && !rateContract;
  const confidence = Math.max(0, Math.min(0.99, totals.score / 100));
  const loadNo = canonicalReferenceV1(fields.loadNo) || reference;
  const missingFields = [!reference ? 'bolNo' : '', !parties ? 'shipper/consignee' : '', !freight ? 'freightDetails' : ''].filter(Boolean);

  return engineResultV1({
    engineId:BOL_ENGINE_V1.id,
    version:BOL_ENGINE_V1.version,
    typeId:BOL_ENGINE_V1.typeId,
    qualified,
    score:totals.score,
    confidence,
    groups,
    penalties,
    missingFields,
    reasons:[qualified ? 'Independent BOL evidence passed.' : 'BOL evidence did not meet the locked threshold.'],
    fields:{
      bolNo:reference,
      loadNo,
      shipper:nonEmptyV1(fields.shipper, fields.originCompany),
      consignee:nonEmptyV1(fields.consignee, fields.destinationCompany),
      pieces:Number(fields.pieces || fields.totalPieces || 0),
      weight:Number(fields.weight || 0),
      commodity:nonEmptyV1(fields.commodity, fields.description),
      signaturePresent:false,
      podSignedEvidence:false,
      podSigned:false,
    },
  });
}
`);

write('source/src/modules/scan/engines/fuelReceiptEngineV1.js', String.raw`import {
  addEvidenceGroupV1,
  canonicalMoneyV1,
  dateCaptureV1,
  engineResultV1,
  evidenceScoreV1,
  firstCaptureV1,
  firstLineV1,
  moneyCaptureV1,
  nonEmptyV1,
} from './documentEngineContractV1.js';

export const FUEL_RECEIPT_ENGINE_V1 = Object.freeze({
  id:'fuel-receipt-engine',
  typeId:'fuel_receipt',
  version:'1.0.0',
  locked:true,
});

function numberCapture(source = '', patterns = []) {
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = String(source || '').match(pattern);
    const value = Number(String(match?.[1] || '').replace(/,/g, ''));
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

export function analyzeFuelReceiptV1(input = {}) {
  const source = String(input.text || '');
  const fields = input.fields || {};
  const groups = [];
  const penalties = [];

  const merchantSignal = /pilot|flying\s*j|love'?s|travelcenters?\s+of\s+america|\bTA\b|petro|mudflap|speedway|shell|bp|marathon|kwik\s+trip|casey'?s|fuel\s+station|truck\s+stop/i.test(source + ' ' + String(fields.merchant || ''));
  const diesel = /diesel|ulsd|def|tractor\s+fuel|pump\s*#?/i.test(source);
  const gallons = Number(fields.gallons || fields.fuelGallons || 0) || numberCapture(source, [
    /(?:gallons?|gal)\s*[:#-]?\s*([0-9]+(?:\.[0-9]+)?)/i,
    /([0-9]+(?:\.[0-9]+)?)\s*(?:gallons?|gal)\b/i,
  ]);
  const unitPrice = Number(fields.pricePerGallon || fields.unitPrice || 0) || numberCapture(source, [
    /(?:price\s*(?:per|\/)?\s*(?:gal|gallon)|ppu|unit\s+price)\s*[:#-]?\s*\$?\s*([0-9]+(?:\.[0-9]+)?)/i,
    /\$\s*([0-9]+(?:\.[0-9]{2,3})?)\s*\/\s*(?:gal|gallon)/i,
  ]);
  const total = Number(fields.total || fields.amount || fields.fuelCost || 0) || moneyCaptureV1(source, ['fuel\s+total', 'sale\s+total', 'amount\s+paid', 'total']);
  const transaction = /receipt\s*(?:number|no\.?|#)|transaction\s*(?:number|no\.?|#)|approval\s*(?:number|no\.?|#)|auth\s*(?:number|no\.?|#)/i.test(source);
  const locationDate = /\b[A-Z][A-Za-z .'-]+,\s*[A-Z]{2}\b/.test(source) && Boolean(dateCaptureV1(source) || fields.date);
  const fuelFile = /fuel|diesel|mudflap|pilot|flying[-_ ]*j|loves|petro|truck[-_ ]*stop/i.test(input.fileNameLower || '');

  addEvidenceGroupV1(groups, 'fuel-merchant', 18, merchantSignal, 'Fuel merchant or truck-stop identity');
  addEvidenceGroupV1(groups, 'diesel-product', 12, diesel, 'Diesel/ULSD/DEF product evidence');
  addEvidenceGroupV1(groups, 'gallons', 32, gallons > 0, 'Fuel gallons');
  addEvidenceGroupV1(groups, 'unit-price', 22, unitPrice > 0, 'Price per gallon');
  addEvidenceGroupV1(groups, 'fuel-total', 16, total > 0, 'Fuel purchase total');
  addEvidenceGroupV1(groups, 'transaction', 8, transaction, 'Receipt/transaction/approval number');
  addEvidenceGroupV1(groups, 'location-date', 8, locationDate, 'Station location and transaction date');
  addEvidenceGroupV1(groups, 'filename', 10, fuelFile, 'Fuel filename evidence');

  const rateContract = /rate\s+confirmation|total\s+carrier\s+pay|flat\s+rate|pickup.{0,120}delivery/is.test(source);
  const shipping = /bill\s+of\s+lading|proof\s+of\s+delivery|shipper.{0,120}consignee/is.test(source);
  if (rateContract) penalties.push({ id:'rate-contract', weight:82, detail:'Rate Confirmation evidence' });
  if (shipping) penalties.push({ id:'shipping-document', weight:72, detail:'BOL/POD shipping structure' });

  const totals = evidenceScoreV1(groups, penalties);
  const qualified = gallons > 0 && (unitPrice > 0 || total > 0) && (merchantSignal || diesel || fuelFile) && totals.score >= 62;
  const confidence = Math.max(0, Math.min(0.99, totals.score / 100));
  const merchant = nonEmptyV1(fields.merchant, firstLineV1(source, line => /pilot|flying\s*j|love'?s|travelcenters?|petro|mudflap|speedway|shell|bp|marathon|kwik\s+trip|casey'?s/i.test(line)));
  const date = nonEmptyV1(fields.date, dateCaptureV1(source));
  const missingFields = [!merchant ? 'merchant' : '', !gallons ? 'gallons' : '', !total ? 'total' : '', !date ? 'date' : ''].filter(Boolean);

  return engineResultV1({
    engineId:FUEL_RECEIPT_ENGINE_V1.id,
    version:FUEL_RECEIPT_ENGINE_V1.version,
    typeId:FUEL_RECEIPT_ENGINE_V1.typeId,
    qualified,
    score:totals.score,
    confidence,
    groups,
    penalties,
    missingFields,
    reasons:[qualified ? 'Independent fuel-receipt evidence passed.' : 'Fuel receipt requires gallons plus price/total evidence.'],
    fields:{
      merchant,
      gallons,
      fuelGallons:gallons,
      pricePerGallon:unitPrice,
      unitPrice,
      total:canonicalMoneyV1(total),
      amount:canonicalMoneyV1(total),
      date,
      fuelType:nonEmptyV1(fields.fuelType, diesel ? 'Diesel' : ''),
      receiptNo:nonEmptyV1(fields.receiptNo, firstCaptureV1(source, [/(?:receipt|transaction|approval|auth)\s*(?:number|no\.?|#)\s*[:#-]*\s*([A-Z0-9-]{3,30})/i])),
      state:nonEmptyV1(fields.state, firstCaptureV1(source, [/\b[A-Z][A-Za-z .'-]+,\s*([A-Z]{2})\b/])),
    },
  });
}
`);

write('source/src/modules/scan/engines/documentEngineRegistryV10959.js', String.raw`import { RATE_CONFIRMATION_ENGINE_V1 } from './rateConfirmationEngineV1.js';
import { POD_ENGINE_V1 } from './podEngineV1.js';
import { BOL_ENGINE_V1 } from './bolEngineV1.js';
import { FUEL_RECEIPT_ENGINE_V1 } from './fuelReceiptEngineV1.js';

export const DOCUMENT_ENGINE_REGISTRY_V10959 = Object.freeze({
  registryVersion:'109.5.9',
  contractVersion:'1.0.0',
  isolationPolicy:'Each document type owns one versioned module. A stable module is never edited; improvements require a new module version and full cross-engine regression.',
  active:Object.freeze({
    rate_confirmation:RATE_CONFIRMATION_ENGINE_V1,
    pod:POD_ENGINE_V1,
    bol:BOL_ENGINE_V1,
    fuel_receipt:FUEL_RECEIPT_ENGINE_V1,
  }),
});

export const OWNED_DOCUMENT_TYPES_V10959 = Object.freeze(Object.keys(DOCUMENT_ENGINE_REGISTRY_V10959.active));
`);

write('source/src/modules/scan/engines/isolatedDocumentRouterV10959.js', String.raw`import {
  analyzeTruckDocumentV1040 as analyzeGenericTruckDocumentV1040,
  documentIntelligencePayloadV1040 as genericDocumentIntelligencePayloadV1040,
  reanalyzeTruckDocumentTypeV1040 as reanalyzeGenericTruckDocumentTypeV1040,
} from '../truckDocumentEngineV1040.js';
import { truckDocumentTypeMetaV1040 } from '../truckDocumentCatalogV1040.js';
import { normalizeEngineInputV1, canonicalReferenceV1 } from './documentEngineContractV1.js';
import { analyzeRateConfirmationV1 } from './rateConfirmationEngineV1.js';
import { analyzePodV1 } from './podEngineV1.js';
import { analyzeBolV1 } from './bolEngineV1.js';
import { analyzeFuelReceiptV1 } from './fuelReceiptEngineV1.js';
import { DOCUMENT_ENGINE_REGISTRY_V10959, OWNED_DOCUMENT_TYPES_V10959 } from './documentEngineRegistryV10959.js';

const RUNNERS_V10959 = Object.freeze({
  rate_confirmation:analyzeRateConfirmationV1,
  pod:analyzePodV1,
  bol:analyzeBolV1,
  fuel_receipt:analyzeFuelReceiptV1,
});

const TIE_PRIORITY_V10959 = Object.freeze({ pod:40, fuel_receipt:30, rate_confirmation:20, bol:10 });

function typeIdV10959(value = {}) {
  return String(value?.type?.id || value?.detectedType?.id || value?.typeId || value?.selectedType || '').trim();
}

function traceCandidateV10959(candidate = {}) {
  return {
    engineId:candidate.engineId,
    version:candidate.version,
    typeId:candidate.typeId,
    qualified:candidate.qualified === true,
    score:Number(candidate.score || 0),
    confidence:Number(candidate.confidence || 0),
    groups:(candidate.groups || []).map(group => group.id),
    penalties:(candidate.penalties || []).map(penalty => penalty.id),
    missingFields:[...(candidate.missingFields || [])],
  };
}

export function routeIsolatedDocumentV10959(input = {}) {
  const candidates = Object.entries(RUNNERS_V10959).map(([typeId, runner]) => runner(input));
  const qualified = candidates.filter(candidate => candidate.qualified).sort((a, b) => (
    Number(b.confidence || 0) - Number(a.confidence || 0)
    || Number(b.score || 0) - Number(a.score || 0)
    || Number(TIE_PRIORITY_V10959[b.typeId] || 0) - Number(TIE_PRIORITY_V10959[a.typeId] || 0)
    || String(a.typeId).localeCompare(String(b.typeId))
  ));
  return Object.freeze({
    winner:qualified[0] || null,
    candidates:Object.freeze(candidates),
    trace:Object.freeze({
      registryVersion:DOCUMENT_ENGINE_REGISTRY_V10959.registryVersion,
      contractVersion:DOCUMENT_ENGINE_REGISTRY_V10959.contractVersion,
      winner:qualified[0] ? traceCandidateV10959(qualified[0]) : null,
      candidates:candidates.map(traceCandidateV10959),
    }),
  });
}

function sanitizeForTypeV10959(typeId, genericFields = {}, engineFields = {}) {
  const fields = { ...(genericFields || {}), ...(engineFields || {}) };
  fields.loadNo = canonicalReferenceV1(fields.loadNo);
  fields.orderNo = canonicalReferenceV1(fields.orderNo || fields.loadNo);
  fields.bolNo = canonicalReferenceV1(fields.bolNo);
  fields.poNumber = canonicalReferenceV1(fields.poNumber);

  if (typeId === 'rate_confirmation') {
    fields.merchant = '';
    fields.invoiceNo = '';
    fields.podSignedEvidence = false;
    fields.podSigned = false;
    fields.signaturePresent = false;
  }
  if (typeId === 'bol') {
    fields.podSignedEvidence = false;
    fields.podSigned = false;
    fields.signaturePresent = false;
  }
  if (typeId === 'fuel_receipt') {
    fields.loadNo = canonicalReferenceV1(engineFields.loadNo || '');
    fields.orderNo = fields.loadNo;
    fields.bolNo = '';
    fields.poNumber = '';
    fields.podSignedEvidence = false;
    fields.podSigned = false;
    fields.signaturePresent = false;
  }
  return fields;
}

function applyWinnerV10959(generic = {}, routed = {}, options = {}) {
  const winner = routed.winner;
  const genericTypeId = typeIdV10959(generic);
  const manualType = String(options.manualType || '').trim();
  const candidate = manualType && RUNNERS_V10959[manualType]
    ? routed.candidates.find(item => item.typeId === manualType) || null
    : winner;

  if (manualType && candidate) {
    const meta = truckDocumentTypeMetaV1040(manualType);
    return {
      ...generic,
      type:meta,
      detectedType:candidate.qualified ? meta : (generic.detectedType || generic.type || meta),
      fields:sanitizeForTypeV10959(manualType, generic.fields, candidate.fields),
      confidence:candidate.qualified ? candidate.confidence : Math.max(0.35, Number(candidate.confidence || 0)),
      method:'isolated-engine-manual:' + candidate.engineId + '@' + candidate.version,
      needsReview:candidate.needsReview,
      needsFieldReview:candidate.needsReview,
      engineTrace:routed.trace,
      engineRegistry:DOCUMENT_ENGINE_REGISTRY_V10959,
    };
  }

  if (winner) {
    const meta = truckDocumentTypeMetaV1040(winner.typeId);
    return {
      ...generic,
      type:meta,
      detectedType:meta,
      genericDetectedType:generic.detectedType || generic.type || null,
      fields:sanitizeForTypeV10959(winner.typeId, generic.fields, winner.fields),
      confidence:winner.confidence,
      method:'isolated-engine:' + winner.engineId + '@' + winner.version,
      needsReview:winner.needsReview,
      needsFieldReview:winner.needsReview,
      engineTrace:routed.trace,
      engineRegistry:DOCUMENT_ENGINE_REGISTRY_V10959,
    };
  }

  if (OWNED_DOCUMENT_TYPES_V10959.includes(genericTypeId)) {
    const other = truckDocumentTypeMetaV1040('other');
    return {
      ...generic,
      type:other,
      detectedType:generic.detectedType || generic.type || other,
      confidence:Math.min(0.49, Number(generic.confidence || 0)),
      method:'isolated-engine-router:needs-review',
      needsReview:true,
      needsFieldReview:true,
      engineTrace:routed.trace,
      engineRegistry:DOCUMENT_ENGINE_REGISTRY_V10959,
    };
  }

  return {
    ...generic,
    engineTrace:routed.trace,
    engineRegistry:DOCUMENT_ENGINE_REGISTRY_V10959,
  };
}

export async function analyzeTruckDocumentIsolatedV10959(file, options = {}) {
  const generic = await analyzeGenericTruckDocumentV1040(file, options);
  const input = normalizeEngineInputV1(file, generic, options);
  const routed = routeIsolatedDocumentV10959(input);
  return applyWinnerV10959(generic, routed);
}

export function reanalyzeTruckDocumentTypeIsolatedV10959(analysis = {}, typeId = 'other', context = {}) {
  const generic = reanalyzeGenericTruckDocumentTypeV1040(analysis, typeId, context);
  const input = normalizeEngineInputV1(null, { ...analysis, ...generic, text:analysis.text || generic.text, fields:{ ...(analysis.fields || {}), ...(generic.fields || {}) } }, { ...context, preferredType:typeId });
  const routed = routeIsolatedDocumentV10959(input);
  if (!RUNNERS_V10959[typeId]) return { ...generic, engineTrace:routed.trace, engineRegistry:DOCUMENT_ENGINE_REGISTRY_V10959 };
  return applyWinnerV10959(generic, routed, { manualType:typeId });
}

export function documentIntelligencePayloadIsolatedV10959(analysis = {}) {
  let base = {};
  try {
    base = genericDocumentIntelligencePayloadV1040(analysis) || {};
  } catch {
    base = {};
  }
  return {
    ...base,
    engineIsolation:analysis.engineTrace || null,
    engineRegistryVersion:DOCUMENT_ENGINE_REGISTRY_V10959.registryVersion,
    engineContractVersion:DOCUMENT_ENGINE_REGISTRY_V10959.contractVersion,
  };
}
`);

const sheetPath = 'source/src/modules/scan/SmartScanSheetV100.jsx';
let sheet = read(sheetPath);
const genericImportPattern = /import \{ analyzeTruckDocumentV1040, documentIntelligencePayloadV1040, reanalyzeTruckDocumentTypeV1040 \} from '\.\/truckDocumentEngineV1040\.js';/;
const isolatedImport = "import { analyzeTruckDocumentIsolatedV10959 as analyzeTruckDocumentV1040, documentIntelligencePayloadIsolatedV10959 as documentIntelligencePayloadV1040, reanalyzeTruckDocumentTypeIsolatedV10959 as reanalyzeTruckDocumentTypeV1040 } from './engines/isolatedDocumentRouterV10959.js';";
if (!sheet.includes(isolatedImport)) {
  if (!genericImportPattern.test(sheet)) throw new Error('v109.5.9 missing production document-engine import');
  sheet = sheet.replace(genericImportPattern, isolatedImport);
}
if (!sheet.includes("isolated-engine:rate-confirmation-engine")) {
  sheet = replaceRequired(
    sheet,
    "function methodLabel(method = '') {",
    "function methodLabel(method = '') {\n  if (/isolated-engine(?:-manual)?:rate-confirmation-engine/.test(method)) return 'Rate Confirmation Engine 1.0';\n  if (/isolated-engine(?:-manual)?:pod-engine/.test(method)) return 'POD Engine 1.0';\n  if (/isolated-engine(?:-manual)?:bol-engine/.test(method)) return 'BOL Engine 1.0';\n  if (/isolated-engine(?:-manual)?:fuel-receipt-engine/.test(method)) return 'Fuel Receipt Engine 1.0';\n  if (/isolated-engine-router:needs-review/.test(method)) return 'Isolated engine review';",
    'isolated engine reader labels',
  );
}
write(sheetPath, sheet);

writeJson('package.json', pkg => {
  pkg.version = VERSION;
  pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
});
if (fs.existsSync('package-lock.json')) {
  writeJson('package-lock.json', lock => {
    lock.version = VERSION;
    if (lock.packages?.['']) {
      lock.packages[''].version = VERSION;
      lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
    }
  });
}

const releasedAt = new Date().toISOString();
write('public/app-version.json', JSON.stringify({
  version:VERSION,
  build:BUILD,
  releasedAt,
  updatedAt:releasedAt,
  label:'v109.5.9 Isolated Document Engines',
  force:true,
  notes:[
    'Adds separate locked engines for Rate Confirmation, POD, BOL and Fuel Receipt classification.',
    'Runs all four engines independently through a versioned router so a change to one engine cannot modify another engine module.',
    'Makes the Rate Confirmation engine authoritative for broker/carrier contracts and rejects false POD evidence found only in paperwork instructions.',
    'Requires receiver-signature plus completed-delivery evidence for POD, shipping structure for BOL, and gallons plus price or total for fuel receipts.',
    'Adds cross-engine golden regression tests and requires a new engine version file for future behavior changes.'
  ],
}, null, 2) + '\n');

let sw = read('public/sw.js');
sw = sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/, "const OWNER_OP_SW_VERSION = '" + VERSION + "';");
sw = sw.replace(/const OWNER_OP_SW_BUILD = '[^']+';/, "const OWNER_OP_SW_BUILD = '" + BUILD + "';");
write('public/sw.js', sw);

let update = read('source/src/core/update/appUpdate.js');
update = update.replace(/const FALLBACK_APP_VERSION = '[^']+';/, "const FALLBACK_APP_VERSION = '" + VERSION + "';");
update = update.replace(/const FALLBACK_APP_BUILD = '[^']+';/, "const FALLBACK_APP_BUILD = '" + BUILD + "';");
write('source/src/core/update/appUpdate.js', update);

console.log('PASS — v109.5.9 isolated Rate Confirmation, POD, BOL and Fuel engines applied');
