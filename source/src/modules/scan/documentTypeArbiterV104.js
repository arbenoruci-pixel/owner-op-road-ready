import { classifyDocument, documentTypeMeta } from './smartScan.js';

function text(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function count(value = '', pattern, cap = 4) {
  const matches = String(value || '').match(pattern) || [];
  return Math.min(cap, matches.length);
}

function pageText(fullText = '', pageNumber = 1) {
  const source = String(fullText || '');
  const marker = `[[PAGE:${pageNumber}]]`;
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const next = source.indexOf('[[PAGE:', start + marker.length);
  return source.slice(start + marker.length, next < 0 ? source.length : next).trim();
}

function addReason(target, condition, score, reason) {
  if (!condition) return 0;
  target.push(reason);
  return score;
}

export function rateConfirmationEvidenceV104(fullText = '', fileName = '', pages = []) {
  const source = String(fullText || '');
  const name = String(fileName || '');
  const early = [pageText(source, 1), pageText(source, 2), pageText(source, 3)]
    .filter(Boolean)
    .join('\n') || source.slice(0, 18000);
  const reasons = [];
  let score = 0;

  score += addReason(reasons, /(?:rate|load)[-_ ]?(?:confirmation|confirm|con)\b/i.test(name), 42, 'filename says load/rate confirmation');
  score += addReason(reasons, /\bOrder\s*(?:Number|No\.?|#)\s*[:#-]?\s*[A-Z0-9-]{3,30}/i.test(early), 24, 'Order number header');
  score += addReason(reasons, /\bLeg\s*(?:Number|No\.?|#)\s*[:#-]?\s*[A-Z0-9-]{3,30}/i.test(early), 20, 'Leg number header');
  score += addReason(reasons, /rateconfirmations?@[A-Z0-9.-]+/i.test(early), 16, 'rate confirmation email');
  score += addReason(reasons, /\bStop\s+Information\b/i.test(early), 14, 'stop information section');
  score += addReason(reasons, /\bLoad\s+At\b/i.test(early), 13, 'pickup section');
  score += addReason(reasons, /\bDeliver\s+To\b/i.test(early), 13, 'delivery section');
  score += addReason(reasons, /\bCarrier\s+Information\b/i.test(early), 10, 'carrier information section');
  score += addReason(reasons, /\bReference\s+Numbers\b/i.test(early), 8, 'reference numbers section');
  score += addReason(reasons, /\bTrailer\s+Type\s*:/i.test(early), 7, 'trailer type field');
  score += addReason(reasons, /\bPickup\s*#\s*:/i.test(early), 7, 'pickup reference field');
  score += addReason(reasons, /\bMC\s+Number\s*:/i.test(early), 6, 'carrier MC field');
  score += addReason(reasons, /Total\s+Pay\s*(?:\(US\$\))?\s*:/i.test(source), 28, 'total carrier pay section');
  score += addReason(reasons, /Confirmation\s+of\s+Contract\s+Carrier\s+Verbal\s+Rate\s+Agreement/i.test(source), 30, 'carrier rate agreement title');
  score += addReason(reasons, /Load\s+Broker\s+Line\s+Haul/i.test(source), 15, 'line haul pay row');
  score += addReason(reasons, /\b(?:FourKites|MacroPoint)\b/i.test(source) && /tracking/i.test(source), 5, 'load tracking requirements');

  const stopMarkers = count(early, /\b(?:Load\s+At|Deliver\s+To)\b/gi, 8);
  if (stopMarkers >= 2) {
    score += Math.min(18, stopMarkers * 3);
    reasons.push(`${stopMarkers} pickup/delivery section markers`);
  }

  if (/\bBILL\s+OF\s+LADING\s*(?:-|–)?\s*NOT\s+NEGOTIABLE\b/i.test(pageText(source, 1))) {
    score -= 45;
    reasons.push('first page is an actual BOL title');
  }

  return { id:'rate_confirmation', score:Math.max(0, score), reasons };
}

export function bolEvidenceV104(fullText = '', fileName = '') {
  const source = String(fullText || '');
  const firstTwo = [pageText(source, 1), pageText(source, 2)].filter(Boolean).join('\n') || source.slice(0, 9000);
  const reasons = [];
  let score = 0;

  score += addReason(reasons, /\bBILL\s+OF\s+LADING\s*(?:-|–)?\s*NOT\s+NEGOTIABLE\b/i.test(firstTwo), 48, 'BOL title near the front');
  score += addReason(reasons, /Bill\s+of\s+Lading\s+(?:Number|No\.?|#)/i.test(firstTwo), 26, 'BOL number field');
  score += addReason(reasons, /\bSHIP\s+FROM\b/i.test(firstTwo), 12, 'ship from block');
  score += addReason(reasons, /\bSHIP\s+TO\b/i.test(firstTwo), 12, 'ship to block');
  score += addReason(reasons, /Customer\s+P\.?\s*O\.?\s+(?:Number|No\.?|#)/i.test(firstTwo), 8, 'customer PO field');
  score += addReason(reasons, /\bTotal\s+(?:Qty\s+)?Pieces\b/i.test(firstTwo), 6, 'total pieces field');
  score += addReason(reasons, /\bTotal\s+Weight\b/i.test(firstTwo), 6, 'total weight field');
  score += addReason(reasons, /\b(?:bol|bill[-_ ]?of[-_ ]?lading)\b/i.test(String(fileName || '')), 24, 'filename says BOL');

  // Legal terms inside a Rate Confirmation often mention bills of lading many
  // times. Those later references are weak evidence and are intentionally capped.
  const genericMentions = count(firstTwo, /\bbills?\s+of\s+lading\b/gi, 2);
  score += genericMentions * 2;

  return { id:'bol', score, reasons };
}

export function arbitrateDocumentTypeV104({
  fullText = '',
  fileName = '',
  pages = [],
  preferredType = 'auto',
  genericClassification = null,
} = {}) {
  const generic = genericClassification || classifyDocument(fullText, fileName);
  const rate = rateConfirmationEvidenceV104(fullText, fileName, pages);
  const bol = bolEvidenceV104(fullText, fileName);
  const preferred = preferredType && preferredType !== 'auto' ? preferredType : '';

  const strongRate = rate.score >= 52 && rate.score >= bol.score + 10;
  const strongBol = bol.score >= 50 && bol.score >= rate.score + 8;

  let id = generic?.type?.id || 'other';
  let reason = 'generic document classifier';
  let autoCorrected = false;

  if (strongRate) {
    id = 'rate_confirmation';
    reason = rate.reasons.slice(0, 6).join(' · ');
    autoCorrected = preferred === 'bol' || preferred === 'pod' || (generic?.type?.id && generic.type.id !== id);
  } else if (strongBol) {
    id = 'bol';
    reason = bol.reasons.slice(0, 6).join(' · ');
    autoCorrected = preferred === 'rate_confirmation' || (generic?.type?.id && generic.type.id !== id);
  } else if (preferred) {
    id = preferred;
    reason = 'driver-selected document type';
  }

  return {
    type:documentTypeMeta(id),
    id,
    reason:text(reason),
    autoCorrected,
    preferredType:preferredType || 'auto',
    genericType:generic?.type?.id || 'other',
    scores:{ rate_confirmation:rate.score, bol:bol.score, generic:generic?.scores || [] },
    evidence:{ rate, bol },
  };
}
