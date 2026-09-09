import { truckDocumentTypeMetaV1040 } from './truckDocumentCatalogV1040.js';

// One list owns the scanner selector, persistence and load matching contract.
export const LOAD_SCAN_TYPES_V11039 = new Set([
  'rate_confirmation','load_tender','bol','pod','delivery_receipt','packing_list',
  'gate_pass','lumper_receipt','scale_ticket','detention_approval','layover_approval',
  'tonu','osd_report','claim_notice','load_invoice',
]);
export function scanNeedsLoadV11039(type) { return LOAD_SCAN_TYPES_V11039.has(type); }

export function scanFolderV11039(typeId = 'other', record = {}) {
  if (record.archivedAt || record.status === 'archived') return 'archived';
  if (record.status === 'needs_review' || typeId === 'other' ||
    scanNeedsLoadV11039(typeId) && !record.canonicalLoadNo) return 'needs_review';
  if (record.canonicalLoadNo) return `load:${record.canonicalLoadNo}`;
  const meta = truckDocumentTypeMetaV1040(typeId);
  if (meta.target === 'fuel') return 'ifta';
  if (meta.target === 'maintenance' || typeId === 'annual_inspection') return 'maintenance';
  if (meta.target === 'expenses') return 'expenses';
  if (meta.stacks?.some(stack => ['driver_wallet','truck_wallet'].includes(stack))) return 'compliance';
  return 'documents';
}

export function scanDestinationV11039(record = {}) {
  const folder = scanFolderV11039(record.type, record);
  if (folder.startsWith('load:')) return {
    label:`Load ${record.canonicalLoadNo}`,
    detail:record.stopSequence ? `Stop ${record.stopSequence} · ${record.stopCompany || record.stopLocation || ''}` : record.broker || 'Load paperwork',
    tone:'good',
  };
  const labels = {ifta:'Fuel & IFTA',maintenance:'Maintenance',expenses:'Expenses',compliance:'Compliance Wallet',documents:'Documents',archived:'Archive',needs_review:'Needs Review'};
  return {label:labels[folder] || 'Documents',tone:folder === 'needs_review' ? 'review' : 'good',
    detail:folder === 'needs_review' ? 'Original saved. Confirm the type, date and destination in Documents.' : 'Original saved in Document Vault'};
}

export function normalizeScanPreferenceV11039(value) {
  return typeof value === 'string' && (value === 'auto' || truckDocumentTypeMetaV1040(value).id === value) ? value : 'auto';
}

// Keep an independently qualified POD or Rate Con. The old BOL fallback ran
// after all readers and overwrote their result solely because shipping fields existed.
export function preserveDocumentDecisionV11039(result, bolFallback) {
  if (result.userSelectedTypeV11036 || ['pod','delivery_receipt','rate_confirmation'].includes(result.type?.id)) return result;
  if (!['other','bol'].includes(result.type?.id || 'other')) return result;
  const fallback = bolFallback(result);
  // Structural recovery remains a review suggestion, not 96% certainty.
  return fallback === result ? result : {...fallback,confidence:Math.min(.84,Number(fallback.confidence || .8)),needsReview:true};
}
