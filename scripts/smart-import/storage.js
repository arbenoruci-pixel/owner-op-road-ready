'use client';
import {getOwnerOpDb} from '../../../../lib/local-db/dexie.js';
import {BUSINESS_STORE_KEY, BUSINESS_STORE_EVENT, readBusinessStore} from '../business/businessStore.js';
import {OWNER_OPS_STORE_KEY_V102, OWNER_OPS_STORE_EVENT_V102, readOwnerOpsStoreV102} from '../owneros/ownerOpsStoreV102.js';
import {canonicalFuel, canonicalTolls, importDate, previewStatement, text} from './core.js';

const OWNER_KEY = 'owner-op-account-data-owner-v1';
const owner = () => localStorage.getItem(OWNER_KEY) || '';
const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
const hashText = value => hash(new TextEncoder().encode(value));
const announce = () => window.dispatchEvent(new Event('road-ready-evidence-filed'));

export function importContext(state = {}) {
  const driverId = state.activeDriverId || state.teamDrivers?.[0]?.id || 'driver_primary';
  return {workspaceId: owner(), driverId, driverName: state.teamDrivers?.find(driver => driver.id === driverId)?.name || state.driverProfile?.name || ''};
}

export function readImportSnapshot(kind) {
  const business = readBusinessStore(), ops = readOwnerOpsStoreV102();
  const targetKey = kind === 'mileage' ? OWNER_OPS_STORE_KEY_V102 : BUSINESS_STORE_KEY;
  // Include both legacy and canonical stores in the reviewed identity snapshot.
  const serialized = JSON.stringify([localStorage.getItem(BUSINESS_STORE_KEY), localStorage.getItem(OWNER_OPS_STORE_KEY_V102), owner()]);
  const existing = kind === 'fuel' ? canonicalFuel(ops, business) : kind === 'tolls' ? canonicalTolls(ops, business) : {rows: ops.mileageImports, conflicts: []};
  return {business, ops, targetKey, serialized, existing: existing.rows.map(row => row.workspaceId ? row : {...row, workspaceId: owner()}), existingConflicts: existing.conflicts, owner: owner()};
}

export async function prepareStatementReview(file, parsed, context) {
  const snapshot = readImportSnapshot(parsed.kind);
  if (snapshot.owner !== context.workspaceId) throw Error('The account changed. Reopen Import before continuing.');
  const plan = previewStatement(parsed, snapshot.existing);
  // A legacy conflict must be resolved before a new import can hide it.
  if (snapshot.existingConflicts.length) {
    plan.conflicts.push(...snapshot.existingConflicts);
    plan.canSave = false;
  }
  return {file, plan, snapshot, context, fileHash: await hash(await file.arrayBuffer())};
}

export async function prepareLogbookReview(file, input, context) {
  if (!file?.size || file.size > 50 * 1024 * 1024 || !/\.pdf$/i.test(file.name)) throw Error('Choose a logbook PDF under 50 MB.');
  const bytes = await file.arrayBuffer();
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw Error('This file does not contain a PDF original.');
  const periodStart = importDate(input.periodStart), periodEnd = importDate(input.periodEnd);
  if (!periodStart || !periodEnd || periodStart > periodEnd) throw Error('Enter the report’s first and last calendar dates.');
  if (!text(input.provider) || input.provider === 'auto') throw Error('Choose the provider printed on the report.');
  if (!text(input.timezone)) throw Error('Choose the home-terminal timezone shown on the report.');
  try { new Intl.DateTimeFormat('en-US', {timeZone: input.timezone}).format(); } catch { throw Error('Choose a valid report timezone.'); }
  if (!text(context.driverName) || !text(context.driverId)) throw Error('Select the driver whose report this is.');
  return {file, fileHash: await hash(bytes), context, plan: {kind: 'logs', provider: input.provider, providerAccount: text(input.providerAccount), periodStart, periodEnd, timezone: input.timezone, rows: [], added: [], duplicates: [], conflicts: [], issues: [], valid: true, canSave: true, readOnly: true}};
}

// The original and a recoverable staging record commit together. Financial rows
// are projected only afterward. A failed projection leaves the original intact;
// an interrupted retry uses the same identities and never overwrites a record.
export async function stageStatementOriginal(review, db = getOwnerOpDb()) {
  if (!db) throw Error('Device storage is unavailable. Nothing was imported.');
  const {file, fileHash, plan, context} = review;
  const scopeHash = await hashText(JSON.stringify([context.workspaceId, plan.kind, plan.provider, plan.providerAccount || plan.rows[0]?.providerAccount || '', plan.kind === 'logs' ? context.driverId : '']));
  const id = `statement-${scopeHash.slice(0, 32)}-${fileHash}`;
  const client = `statement-source-${context.workspaceId || 'local'}-${fileHash}`;
  const blobId = 'blob-' + client;
  const types = {fuel: 'fuel_receipt', mileage: 'mileage_statement', tolls: 'toll_statement', logs: 'logbook_archive'};
  const type = types[plan.kind], at = new Date().toISOString();
  const fields = {type, date: plan.periodEnd, periodStart: plan.periodStart, periodEnd: plan.periodEnd, provider: plan.provider, timezone: plan.timezone || plan.rows[0]?.timezone || '', driverId: context.driverId, driverName: context.driverName, loadNo: '', documentScope: plan.kind === 'logs' ? 'logbook_archive' : 'statement', transactions: plan.rows, readOnlyLogbook: plan.kind === 'logs', rangeReviewedByDriver: plan.kind === 'logs'};
  let document;
  await db.transaction('rw', db.documents_local, db.document_blobs, async () => {
    const existing = await db.documents_local.get(id);
    if (existing) {
      // A renamed reimport cannot silently change the earlier filing.
      if (existing.extracted?.periodStart !== fields.periodStart || existing.extracted?.periodEnd !== fields.periodEnd || existing.extracted?.timezone !== fields.timezone) throw Error('This original is already saved with different dates or timezone. Review its saved filing first.');
      document = existing;
    } else {
      document = {local_id: id, client_document_id: client, driver_id: context.driverId, type, document_type: type, title: `${plan.provider} · ${plan.kind === 'logs' ? 'Logbook report' : plan.kind + ' statement'}`, original_file_name: file.name, mime_type: plan.kind === 'logs' ? 'application/pdf' : 'text/csv', file_size_bytes: file.size, sha256: fileHash, load_no: '', document_date: plan.periodEnd, status: 'saved', reviewStatus: 'needs_review', local_blob_state: 'local', sync_state: 'local_only', created_at: at, updated_at: at, extracted: fields, statementImportV1: {status: 'staged', kind: plan.kind, sha256: fileHash, scopeHash, stagedAt: at, rowCount: plan.rows.length, newRows: plan.added.length, readOnly: plan.kind === 'logs'}};
      await db.documents_local.add(document);
    }
    const original = await db.document_blobs.get(blobId);
    if (!original) await db.document_blobs.add({local_blob_id: blobId, client_document_id: client, blob: file, sha256: fileHash, created_at: at});
    else if (original.sha256 !== fileHash || original.blob?.size !== file.size) throw Error('The saved original needs verification before this import can continue.');
  });
  return document;
}

export function projectStatementRows(snapshot, plan, additions) {
  const now = Date.now();
  if (plan.kind === 'mileage') return {...snapshot.ops, mileageImports: [...additions, ...snapshot.ops.mileageImports], updatedAt: now};
  const bucket = plan.kind === 'fuel' ? 'fuel' : 'expenses';
  return {...snapshot.business, [bucket]: [...additions, ...snapshot.business[bucket]], updatedAt: now};
}

export async function commitStatementReview(review, dependencies = {}) {
  const db = dependencies.db || getOwnerOpDb();
  const lock = dependencies.lock || ((name, work) => {
    if (!navigator.locks?.request) throw Error('This browser cannot safely coordinate imports. Update the browser and try again.');
    return navigator.locks.request(name, work);
  });
  const read = dependencies.read || readImportSnapshot;
  const stage = dependencies.stage || (value => stageStatementOriginal(value, db));
  const write = dependencies.write || ((key, value) => localStorage.setItem(key, JSON.stringify(value)));
  const account = dependencies.account || owner;
  const notify = dependencies.notify || ((kind, value) => {
    if (kind !== 'logs') window.dispatchEvent(new CustomEvent(kind === 'mileage' ? OWNER_OPS_STORE_EVENT_V102 : BUSINESS_STORE_EVENT, {detail: value}));
    announce();
  });
  if (!review.plan.canSave) throw Error('Review the invalid rows and conflicting transactions before saving.');
  return lock('road-ready-statement-import-v1', async () => {
    if (account() !== review.context.workspaceId) throw Error('The account changed. Reopen Import.');
    if (review.plan.kind !== 'logs' && read(review.plan.kind).serialized !== review.snapshot.serialized) throw Error('Saved records changed after preview. Review the import again.');
    const document = await stage(review);
    const additions = [];
    for (const row of review.plan.added) additions.push({...row, id: 'statement-row-' + await hashText(row.importKey), sourceDocumentId: document.local_id, documentId: document.local_id, sourceSha256: review.fileHash, receiptAttached: true, createdAt: Date.now(), updatedAt: Date.now()});
    if (account() !== review.context.workspaceId) throw Error('The account changed. The source is staged; no transaction was added.');
    let next;
    if (review.plan.kind !== 'logs') {
      const latest = read(review.plan.kind);
      if (latest.serialized !== review.snapshot.serialized) throw Error('Saved records changed while saving the source. Review the import again.');
      next = projectStatementRows(latest, review.plan, additions);
      // No awaited operation between the final snapshot check and one-store write.
      if (additions.length) write(latest.targetKey, next);
    }
    let journalPending = false;
    try {
      if (db?.documents_local && (additions.length || document.statementImportV1?.status !== 'applied')) await db.documents_local.update(document.local_id, {reviewStatus: 'verified', statementImportV1: {...document.statementImportV1, status: 'applied', appliedAt: new Date().toISOString()}, updated_at: new Date().toISOString()});
    } catch { journalPending = true; }
    if (additions.length || document.statementImportV1?.status !== 'applied') notify(review.plan.kind, next);
    return {document, added: additions.length, duplicates: review.plan.duplicates.length, readOnly: review.plan.kind === 'logs', journalPending};
  });
}
