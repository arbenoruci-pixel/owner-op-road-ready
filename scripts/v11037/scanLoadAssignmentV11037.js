import { collectLoadCandidatesV105, matchDocumentToLoadV105, normalizeCanonicalLoadNoV105, referencesFromDocumentV105 } from '../documents/documentFoundationV105.js';

const shippingKinds = new Set(['load_number','order_number','leg_number','bol_number','po_number','pickup_number','sales_order','delivery_number']);
const loadFolderTypes = new Set(['rate_confirmation','load_tender','bol','pod','delivery_receipt','gate_pass','lumper_receipt','scale_ticket','detention_approval','layover_approval','tonu','osd_report','claim_notice','load_invoice']);
const norm = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function referenceIsOnDocumentV11037(value, text = '') {
  const token = norm(value);
  if (token.length < 4) return false;
  const haystack = String(text).toUpperCase().replace(/[._-]/g, '');
  return new RegExp(`(^|[^A-Z0-9])${token}([^A-Z0-9]|$)`).test(haystack);
}

// Active work, dates and broker names cannot establish a document's load identity.
export function matchScanDocumentToLoadV11037(options = {}) {
  const base = matchDocumentToLoadV105(options);
  const text = options.analysis?.text || options.analysis?.rawText || '';
  const references = referencesFromDocumentV105(options.fields, options.analysis)
    .filter(ref => shippingKinds.has(ref.kind) && referenceIsOnDocumentV11037(ref.value, text));
  const proofs = collectLoadCandidatesV105(options.state, options.businessStore).filter(candidate => references.some(ref => {
    const value = norm(ref.value);
    if (['load_number','order_number'].includes(ref.kind) && value === norm(candidate.loadNo)) return true;
    if ((candidate.aliases || []).some(alias => norm(alias.value) === value &&
      (alias.kind === ref.kind || ['load_number','order_number'].includes(ref.kind) && ['load_number','order_number'].includes(alias.kind)))) return true;
    return (candidate.stops || []).some(stop =>
      ref.kind === 'bol_number' && value === norm(stop.bolNumber) ||
      ref.kind === 'po_number' && value === norm(stop.poNumber));
  }));
  const chosen = proofs.length === 1 ? proofs[0] : null;
  const ranked = chosen && base.candidates.find(candidate => candidate.loadNo === chosen.loadNo);
  if (!chosen || !ranked || ranked.brokerIdentityConflict) return {
    ...base, matched:false, loadNo:'', canonicalLoadId:'', broker:'', stop:null,
    stopSequence:0, score:0, confidence:0, automatic:false, requiresConfirmation:true,
    reason:proofs.length > 1 ? 'This reference belongs to multiple loads. Choose the correct folder.' :
      ranked?.brokerIdentityConflict ? 'Broker identity conflicts. Choose the correct folder.' :
      'No matching load reference found. Choose a folder or save for review.',
  };
  return {
    ...base, matched:true, loadNo:chosen.loadNo, canonicalLoadId:chosen.id,
    broker:chosen.broker, stop:ranked.stopMatch || null,
    stopSequence:Number(ranked.stopMatch?.deliverySequence || ranked.stopMatch?.sequence || 0),
    automatic:true, requiresConfirmation:false, confidence:.95,
    reason:'A reference read from this document matches this load.',
  };
}

export function initialScanLoadV11037(result, match, preferredLoadNo = '', preserveChoice = false) {
  if (!loadFolderTypes.has(result.type?.id)) return '';
  if (preserveChoice) return normalizeCanonicalLoadNoV105(preferredLoadNo);
  if (result.type?.id === 'rate_confirmation') {
    const ref = result.fields?.loadNo || result.fields?.orderNo || '';
    if (/broker identity conflicts/i.test(match.reason || '')) return '';
    return referenceIsOnDocumentV11037(ref, result.text || result.rawText) ? normalizeCanonicalLoadNoV105(ref) : '';
  }
  return match.automatic && match.matched ? match.loadNo : '';
}
