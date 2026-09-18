/**
 * Reuse a person's saved confirmation only for the same immutable document,
 * document kind and exact page set. New OCR observations remain untouched.
 * The caller must obtain both readings from the same saved document record.
 */
import {validateInvoice, validateUnloadingReceipt} from './validation.js';

const copy = value => structuredClone(value);
const pagesKey = pages => Array.isArray(pages) && pages.length && pages.every(n => Number.isInteger(n) && n > 0)
  && new Set(pages).size === pages.length ? [...pages].sort((a, b) => a - b).join(',') : null;
const scopeKey = (kind, pages) => kind && kind !== 'unknown' && pagesKey(pages) ? JSON.stringify([kind, pagesKey(pages)]) : null;
const confirmed = field => field?.correction?.confirmed === true && field.value != null;

export function confirmedFieldCount(summary) {
  return (summary?.documents || []).reduce((n, group) => n + Object.values(group.fields || {}).filter(confirmed).length, 0);
}

export function restoreConfirmedReading(result, previous) {
  if (!result || !previous || !confirmedFieldCount(previous)) return result;
  const next = copy(result);
  if (previous.pageCount !== next.pageCount) {
    next.continuityWarning = 'Page count changed. Previous confirmations are preserved in the saved reading.';
    return next;
  }
  const groups = new Map();
  for (const group of previous.documents || []) {
    const key = scopeKey(group.kind, group.pages);
    if (key) groups.set(key, groups.has(key) ? null : group);
  }
  const scopeCounts = new Map();
  const scopes = next.documents.map(group => {
    const pages = group.pageIds.map(id => next.pages.find(page => page.id === id)?.number);
    const key = scopeKey(group.kind, pages);
    if (key) scopeCounts.set(key, (scopeCounts.get(key) || 0) + 1);
    return key;
  });
  let restored = 0, matched = 0;
  next.documents.forEach((group, index) => {
    const key = scopes[index], saved = key && scopeCounts.get(key) === 1 ? groups.get(key) : null;
    if (!saved) return;
    for (const [name, old] of Object.entries(saved.fields || {})) {
      const field = group.fields[name];
      if (!field || !confirmed(old)) continue;
      matched++;
      if (field.status === 'confirmed') continue;
      // Preserve the historical correction and its original evidence identities.
      // Never manufacture a quote, confidence, box or new human confirmation.
      group.fields[name] = {...field, value:copy(old.value), status:'confirmed', issues:[],
        correction:copy(old.correction), retainedConfirmation:{engineVersion:previous.engineVersion || null,
          reviewRevision:previous.reviewRevision ?? null, previousGroupId:saved.id || null}};
      restored++;
    }
    // A restored confirmation is never permission to reassign a load or auto-file.
    if (Object.values(group.fields).some(field => field.retainedConfirmation)) {
      group.canAutoFile = false;
      group.requiresReview = true;
      if (group.kind === 'invoice') group.checks = validateInvoice(group.fields);
      if (group.kind === 'unloading_receipt') group.checks = validateUnloadingReceipt(group.fields);
    }
  });
  next.restoredConfirmationCount = (next.restoredConfirmationCount || 0) + restored;
  if (matched < confirmedFieldCount(previous)) {
    next.continuityWarning = 'Some previous confirmations could not be matched to these document pages. The saved reading remains available.';
  }
  return next;
}

/** Reject a save that would silently lose a confirmed value or page scope. */
export function assertConfirmedReadingPreserved(previous, summary) {
  if (!confirmedFieldCount(previous)) return;
  if (previous.pageCount !== summary?.pageCount) throw new Error('Page count changed. Your previous confirmed reading has been kept.');
  for (const old of previous.documents || []) {
    if (!Object.values(old.fields || {}).some(confirmed)) continue;
    const key = scopeKey(old.kind, old.pages);
    const matches = (summary.documents || []).filter(group => key && scopeKey(group.kind, group.pages) === key);
    if (matches.length !== 1) throw new Error('Document type or pages changed. Your previous confirmed reading has been kept.');
    for (const [name, field] of Object.entries(old.fields || {})) {
      if (!confirmed(field)) continue;
      const replacement = matches[0].fields?.[name];
      if (!confirmed(replacement)) throw new Error('A saved confirmation is missing. Review this field before replacing the reading.');
      // A genuinely new confirmation may change the value. Keeping an old
      // correction object with a different value is not a new confirmation.
      if (JSON.stringify(replacement.value) !== JSON.stringify(field.value)
          && JSON.stringify(replacement.correction) === JSON.stringify(field.correction)) {
        throw new Error('Confirm the changed value against its source before saving.');
      }
    }
  }
}
