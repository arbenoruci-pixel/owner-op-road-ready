'use client';
import { BUSINESS_STORE_KEY, BUSINESS_STORE_EVENT } from '../business/businessStore.js';
import { readTransferOriginal } from './transferStorageV110412.js';
import { digest } from './transferCoreV110412.js';
import { canonical, sourceHashes, sourceRevision, eligibleRow, validateReview, updateProfileRecord, updateReviewRecord } from './auditReadinessCoreV1.js';

export function readAuditBusiness(storage = window.localStorage) {
  const raw = storage.getItem(BUSINESS_STORE_KEY);
  if (raw === null) return {};
  let value; try { value = JSON.parse(raw); } catch { throw Error('Saved business records could not be read. Restore or repair them before saving an audit review.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Saved business records have an unsupported format.');
  return value;
}
const locked = run => navigator.locks?.request ? navigator.locks.request('road-ready-document-transfer', run) : run();
async function commit(makeNext, { readStore, writeStore } = {}) {
  // A paired adapter keeps a preview/test store completely separate from the
  // real account store. Its writer receives the expected prior value for CAS.
  if (readStore || writeStore) {
    if (typeof readStore !== 'function' || typeof writeStore !== 'function') throw Error('Audit store adapters require both readStore and writeStore.');
    const business = readStore(), before = canonical(business), next = makeNext(business);
    if (canonical(readStore()) !== before) throw Error('Business records changed while saving. Reopen this review.');
    await writeStore(next, business);
    return next;
  }
  return locked(() => {
    if (window.__OWNER_OP_BUSINESS_STORE_VOLATILE_V10963__) throw Error('Device storage is full. Free space before saving an audit review.');
    const storage = window.localStorage, before = storage.getItem(BUSINESS_STORE_KEY), business = readAuditBusiness(storage), next = makeNext(business);
    if (storage.getItem(BUSINESS_STORE_KEY) !== before) throw Error('Business records changed while saving. Reopen this review.');
    storage.setItem(BUSINESS_STORE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(BUSINESS_STORE_EVENT));
    return next;
  });
}
export function saveAuditProfile(input, expected, options) { return commit(business => updateProfileRecord(business, input, expected), options); }
export async function originalForAudit(row) {
  if (row.kind === 'document') return readTransferOriginal(row.source);
  if (row.kind === 'wallet') {
    const value = row.source.attachmentDataUrl || row.source.dataUrl;
    if (!value?.startsWith('data:')) throw Error('This wallet original is unavailable. Open or restore it before confirming evidence.');
    return (await fetch(value)).blob();
  }
  if (row.kind === 'log') return new Blob([JSON.stringify(row.source, null, 2)], { type: 'application/json' });
  throw Error('Unsupported evidence source.');
}
export async function verifyAuditSources(rows, { signal, onProgress = () => {}, readOriginal = originalForAudit } = {}) {
  const proofs = {}, refs = [];
  for (let i = 0; i < rows.length; i++) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const row = rows[i], revision = sourceRevision(row);
    onProgress(`Checking original ${i + 1} of ${rows.length}`);
    const original = await readOriginal(row);
    if (!original?.size) throw Error(`${row.name}: the original is unavailable. Open or restore it first.`);
    const sha256 = await digest(await original.arrayBuffer());
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (sourceHashes(row).some(hash => hash !== sha256)) throw Error(`${row.name}: the original bytes do not match the saved content hash.`);
    proofs[row.id] = { sha256, revision, rowSnapshot: row.kind === 'log' ? canonical(row.source) : row.kind === 'wallet' ? row.source.attachmentDataUrl || row.source.dataUrl : undefined };
    refs.push({ rowId: row.id, sha256, revision, name: row.name, kind: row.kind, bytes: original.size });
  }
  return { proofs, refs };
}
export async function saveAuditReview(instance, input, profile, rows, options) {
  const selected = rows.filter(row => input.sourceIds.includes(row.id));
  if (selected.length !== new Set(input.sourceIds).size) throw Error('A selected source is no longer available. Reopen this review.');
  if (selected.some(row => !eligibleRow(instance.requirement, row, instance.scope))) throw Error('A selected source does not match this vehicle, driver, load or evidence category.');
  const verified = selected.length ? await verifyAuditSources(selected, options) : { proofs: {}, refs: [] };
  const review = validateReview(instance.requirement, input, instance, profile, verified.refs);
  const business = await commit(current => { if (options?.signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); return updateReviewRecord(current, review, instance.review, profile); }, options);
  return { business, proofs: verified.proofs };
}
