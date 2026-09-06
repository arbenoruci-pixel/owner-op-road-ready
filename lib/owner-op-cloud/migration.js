'use client';

import { cloudClient, cloudSession, backupLocalData, enableAutoBackup, localState, sha256 } from './client.js';
import { canonical } from './core.js';
import { getOwnerOpDb } from '../local-db/dexie.js';
import { readBusinessStore } from '../../source/src/modules/business/businessStore.js';

const BUCKET = 'owner-op-private';
const JOURNAL_PREFIX = 'owner-op-full-migration-v1:';
const SAFETY_META_KEY = 'owner-op-road-ready-last-device-safety-export-v1';

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function journalKey(uid) { return JOURNAL_PREFIX + uid; }
function readJournal(uid) {
  try { return JSON.parse(localStorage.getItem(journalKey(uid)) || '{}'); }
  catch { return {}; }
}
function writeJournal(uid, value) { localStorage.setItem(journalKey(uid), JSON.stringify(value)); }

async function rpc(name, args = {}) {
  const c = cloudClient();
  const { data, error } = await c.rpc(name, args);
  if (error) throw error;
  return data;
}

export async function migrationStatus() {
  return await rpc('owner_op_migration_status_v1');
}

async function markMigration(status, error = '') {
  return await rpc('owner_op_migration_mark_v1', { p_status: status, p_error: error });
}

function cleanName(value = 'document') {
  return String(value || 'document').replace(/[\r\n\\/]/g, '_').slice(0, 230) || 'document';
}

function mimeAndExtension(blob, doc = {}) {
  const name = String(doc.original_file_name || doc.originalFileName || doc.title || '').toLowerCase();
  let mime = String(blob?.type || doc.mime_type || doc.mimeType || '').toLowerCase();
  let extension = '';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) { mime = 'application/pdf'; extension = 'pdf'; }
  else if (mime === 'image/jpeg' || name.endsWith('.jpg') || name.endsWith('.jpeg')) { mime = 'image/jpeg'; extension = 'jpg'; }
  else if (mime === 'image/png' || name.endsWith('.png')) { mime = 'image/png'; extension = 'png'; }
  else if (mime === 'image/webp' || name.endsWith('.webp')) { mime = 'image/webp'; extension = 'webp'; }
  else if (mime === 'image/tiff' || name.endsWith('.tif') || name.endsWith('.tiff')) { mime = 'image/tiff'; extension = 'tiff'; }
  else if (mime === 'text/csv' || name.endsWith('.csv')) { mime = 'text/csv'; extension = 'csv'; }
  else throw new Error('Unsupported local document format: ' + (doc.original_file_name || doc.title || mime || 'unknown'));
  return { mime, extension };
}

function supportingMetadata(doc = {}) {
  const classification = doc.classification && typeof doc.classification === 'object' ? {
    selectedType: doc.classification.selectedType || '',
    detectedType: doc.classification.detectedType || '',
    confidence: Number.isFinite(Number(doc.classification.confidence)) ? Number(doc.classification.confidence) : null,
    method: doc.classification.method || '',
    source: doc.classification.source || '',
  } : null;
  const extractedInput = doc.extracted && typeof doc.extracted === 'object' ? doc.extracted : {};
  const extracted = {};
  for (const key of ['type','loadNo','bolNo','poNumber','date','documentDate','origin','destination','total','gross','broker','carrierName','stopSequence','linkDay']) {
    const value = extractedInput[key];
    if (['string','number','boolean'].includes(typeof value)) extracted[key] = typeof value === 'string' ? value.slice(0, 500) : value;
  }
  return {
    localId: String(doc.local_id || doc.id || '').slice(0, 180),
    clientDocumentId: String(doc.client_document_id || doc.clientDocumentId || '').slice(0, 180),
    type: String(doc.type || doc.document_type || 'other').slice(0, 100),
    status: String(doc.status || 'active').slice(0, 60),
    title: String(doc.title || doc.original_file_name || 'Document').slice(0, 250),
    originalFileName: String(doc.original_file_name || doc.originalFileName || '').slice(0, 250),
    mimeType: String(doc.mime_type || doc.mimeType || '').slice(0, 100),
    fileSizeBytes: Number(doc.file_size_bytes || doc.fileSizeBytes || 0),
    expiresOn: doc.expires_on || doc.expiresOn || null,
    loadNo: String(doc.load_no || doc.loadNo || '').slice(0, 120),
    relationType: String(doc.relation_type || doc.relationType || '').slice(0, 100),
    createdAt: doc.created_at || doc.createdAt || null,
    updatedAt: doc.updated_at || doc.updatedAt || null,
    classification,
    extracted,
  };
}

async function supportingRows() {
  const db = getOwnerOpDb();
  if (!db) return [];
  const docs = await db.documents_local.toArray();
  return docs.filter(Boolean);
}

async function supportingBlobFor(clientDocumentId) {
  const db = getOwnerOpDb();
  if (!db || !clientDocumentId) return null;
  const row = await db.document_blobs.where('client_document_id').equals(clientDocumentId).first();
  return row?.blob || null;
}

async function uploadSupportingBatch(session, { maxUploads = 10, onProgress = () => {} } = {}) {
  const uid = session.user.id;
  const journal = readJournal(uid); journal.supporting ||= {};
  const docs = await supportingRows();
  let uploaded = 0, remaining = 0;
  const errors = [];

  for (const doc of docs) {
    const key = String(doc.client_document_id || doc.clientDocumentId || doc.local_id || doc.id || '');
    if (!key) continue;
    const blob = await supportingBlobFor(doc.client_document_id || doc.clientDocumentId || '');
    if (!blob) {
      if (!journal.supporting[key]?.missing) errors.push((doc.title || key) + ': local file bytes are missing');
      journal.supporting[key] = { ...(journal.supporting[key] || {}), missing: true };
      writeJournal(uid, journal);
      continue;
    }
    const bytes = await blob.arrayBuffer();
    const fileSha = await sha256(bytes);
    const metadata = supportingMetadata(doc);
    const fingerprint = await sha256(new TextEncoder().encode(fileSha + canonical(metadata)));
    if (journal.supporting[key]?.hash === fingerprint) continue;
    if (uploaded >= maxUploads) { remaining += 1; continue; }

    try {
      onProgress('Cloud copy: ' + (metadata.title || key));
      const { mime, extension } = mimeAndExtension(blob, doc);
      const storagePath = `${uid}/supporting_document/${fileSha}.${extension}`;
      const upload = await cloudClient().storage.from(BUCKET).upload(storagePath, blob, {
        upsert: false,
        contentType: mime,
        cacheControl: '0',
      });
      if (upload.error && !/already exists|duplicate|resource exists/i.test(String(upload.error.message || upload.error))) throw upload.error;

      const result = await rpc('owner_op_supporting_commit_v1', {
        p_payload: {
          document_key: key,
          storage_path: storagePath,
          sha256: fileSha,
          mime_type: mime,
          size_bytes: Number(blob.size || bytes.byteLength || 0),
          original_name: cleanName(doc.original_file_name || doc.originalFileName || metadata.title || key),
          metadata,
        },
      });
      journal.supporting[key] = { hash: fingerprint, revision: result?.revision || 1, sha256: fileSha, storagePath };
      uploaded += 1;
      writeJournal(uid, journal);
    } catch (error) {
      errors.push((metadata.title || key) + ': ' + (error?.message || String(error)));
    }
  }

  return { uploaded, remaining, errors, discovered: docs.length };
}

function stateWithoutEmbeddedWalletFiles(state = {}) {
  const copy = typeof structuredClone === 'function' ? structuredClone(state) : JSON.parse(JSON.stringify(state));
  const docs = copy?.dotWallet?.documents || {};
  for (const value of Object.values(docs)) if (value && typeof value === 'object') delete value.attachmentDataUrl;
  return copy;
}

async function commitStructuredState(session, expectedSummary = {}) {
  const uid = session.user.id;
  const journal = readJournal(uid); journal.state ||= {};
  const state = await localState();
  if (!state) throw new Error('No local Road Ready state found for full migration.');
  const core = stateWithoutEmbeddedWalletFiles(state);
  const business = readBusinessStore();
  const hash = await sha256(new TextEncoder().encode(canonical({ state: core, business })));
  if (journal.state.hash === hash) return { unchanged: true, hash };
  let safety = {};
  try { safety = JSON.parse(localStorage.getItem(SAFETY_META_KEY) || '{}'); } catch {}
  const result = await rpc('owner_op_state_commit_v1', {
    p_state_core: core,
    p_business_store: business,
    p_meta: {
      source_filename: safety.filename || 'verified-device-state',
      source_created_at: safety.createdAt || new Date().toISOString(),
      content_sha256: hash,
      backup_summary: expectedSummary || {},
    },
  });
  journal.state = { hash, revision: result?.revision || 1, updatedAt: new Date().toISOString() };
  writeJournal(uid, journal);
  return { unchanged: false, hash, result };
}

export async function runAuthorizedFullMigration({ onProgress = () => {} } = {}) {
  const session = await cloudSession();
  if (!session) return { status: 'signed_out' };
  const request = await migrationStatus();
  if (!request || !['pending','running'].includes(request.status)) return request || { status: 'none' };

  await markMigration('running');
  try {
    let logWalletPasses = 0;
    for (;;) {
      const pass = await backupLocalData({ maxUploads: 20, bootstrap: true, onProgress });
      if (pass.busy) { await delay(1200); continue; }
      if (pass.errors?.length) throw new Error(pass.errors.join('\n'));
      if (!pass.remaining) break;
      logWalletPasses += 1;
      if (logWalletPasses > 20) throw new Error('Log and wallet migration did not converge.');
      await delay(300);
    }

    let supportingPasses = 0;
    for (;;) {
      const pass = await uploadSupportingBatch(session, { maxUploads: 10, onProgress });
      if (pass.errors?.length) throw new Error(pass.errors.join('\n'));
      if (!pass.remaining) break;
      supportingPasses += 1;
      if (supportingPasses > 30) throw new Error('Supporting-document migration did not converge.');
      await delay(300);
    }

    await commitStructuredState(session, request.expected_summary || {});
    await markMigration('complete');
    enableAutoBackup(session.user.id, true);
    return { status: 'complete' };
  } catch (error) {
    await markMigration('error', error?.message || String(error)).catch(() => {});
    throw error;
  }
}
