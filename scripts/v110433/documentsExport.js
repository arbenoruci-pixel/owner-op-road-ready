import { getOwnerOpDb } from '../../lib/local-db/dexie.js';
import { driverLogbookEntries } from '../../source/src/core/team/teamLogbook.js';
import { makePortableReviewV110429 } from '../v110429/portableBackup.js';
import { ChunkedZip, checkAbort, inspectBlob } from '../v110431/chunkedZip.js';

const safe = value => String(value || 'document').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^\.+/, '').slice(0, 90) || 'document';
const suffix = mime => ({ 'application/pdf':'.pdf', 'image/jpeg':'.jpg', 'image/png':'.png', 'image/heic':'.heic', 'image/webp':'.webp', 'text/plain':'.txt' })[mime] || '.bin';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const csv = rows => rows.map(row => row.map(value => '"' + String(value ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
const attachmentKeys = ['attachmentDataUrl', 'originalDataUrl', 'fileDataUrl', 'documentDataUrl'];

async function decodeAttachment(value, signal) {
  if (value instanceof Blob) return value;
  if (typeof value !== 'string' || !/^data:[^,]*;base64,/i.test(value)) return null;
  const comma = value.indexOf(','), parts = [];
  for (let at = comma + 1; at < value.length; at += 131072) {
    checkAbort(signal);
    const raw = atob(value.slice(at, at + 131072));
    parts.push(new Blob([Uint8Array.from(raw, c => c.charCodeAt(0))]));
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return new Blob(parts, { type:value.slice(5, comma).split(';')[0] });
}

// A shareable collection has its own export path. It never enumerates snapshots,
// scanner variants, retry queues or localStorage, and cannot certify a device backup.
export async function buildDocumentsExport({ state = {}, businessStore = {}, appVersion = '', db = getOwnerOpDb(), signal, onProgress = () => {} } = {}) {
  if (!db) throw new Error('The document database is unavailable.');
  const zip = new ChunkedZip(), seen = new Map(), found = new Set(), index = [], missing = [];
  const documents = await db.table('documents_local').toArray();
  const byClient = new Map(documents.filter(row => row.client_document_id).map(row => [row.client_document_id, row]));
  let originalBytes = 0;
  async function addOriginal(blob, record = {}, fallback = '') {
    checkAbort(signal);
    if (!(blob instanceof Blob) || !blob.size) return false;
    const name = record.original_file_name || record.fileName || record.attachmentFileName || record.name || record.title || fallback || 'document';
    const load = record.load_no || record.loadNo || record.extracted?.loadNo || '';
    onProgress(`Preparing ${name} · ${Math.round(originalBytes / 1048576)} MB of documents…`);
    const info = await inspectBlob(blob, { signal });
    const fingerprint = `${info.size}:${info.hashes.join(':')}`;
    let path = seen.get(fingerprint);
    if (!path) {
      const extension = /\.[a-z0-9]{2,5}$/i.test(name) ? '' : suffix(blob.type || record.mime_type);
      path = `Documents/Load-${safe(load || 'Unassigned')}/${String(seen.size + 1).padStart(5, '0')}-${safe(name)}${extension}`;
      zip.add(path, blob, info); seen.set(fingerprint, path); originalBytes += blob.size;
    }
    const id = record.client_document_id || record.clientDocumentId || record.local_id || '';
    if (id) found.add(id);
    if (!index.some(row => row.path === path && row.id === id && row.load === load && row.name === name)) {
      index.push({ path, id, load, name, type:record.type || record.document_type || '', bytes:blob.size });
    }
    return true;
  }
  // Keep every saved original, including an unlinked original, but write identical
  // bytes only once. Names alone never establish that two documents are duplicates.
  const originals = db.table('document_blobs');
  for (let offset = 0; ; offset += 8) {
    checkAbort(signal);
    const rows = await originals.toCollection().offset(offset).limit(8).toArray();
    if (!rows.length) break;
    for (const row of rows) {
      const record = byClient.get(row.client_document_id) || row;
      await addOriginal(row.blob, record, row.file_name || row.local_blob_id);
    }
  }
  // Current legacy wallet, logbook and business attachments can predate the vault.
  // Traverse only attachment containers; historical/recovery state stays out.
  const visited = new WeakSet();
  async function attachments(value, label = '') {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) { for (const row of value) await attachments(row, label); return; }
    for (const key of attachmentKeys) {
      const blob = await decodeAttachment(value[key], signal);
      if (blob) await addOriginal(blob, value, label);
    }
    for (const key of ['attachments', 'documents', 'files']) if (value[key]) {
      const rows = Array.isArray(value[key]) ? value[key] : Object.values(value[key]);
      await attachments(rows, label);
    }
  }
  for (const [name, row] of Object.entries(state.dotWallet?.documents || {})) await attachments(row, name);
  for (const [, book] of driverLogbookEntries(state)) {
    for (const key of ['documentsByDay', 'fuelReceiptsByDay']) {
      for (const [day, rows] of Object.entries(book[key] || {})) await attachments(rows, day);
    }
  }
  for (const key of ['documents', 'loads', 'fuel', 'maintenance', 'expenses']) await attachments(businessStore[key]);
  for (const row of documents) {
    await attachments(row);
    if (!found.has(row.client_document_id)) missing.push(row.original_file_name || row.title || row.client_document_id || 'Unnamed document');
  }
  checkAbort(signal);
  const createdAt = new Date().toISOString();
  const review = makePortableReviewV110429({ createdAt, appVersion, payload:{ state, businessStore, dexie:{ documents_local:documents } } });
  const clock = minute => `${String(Math.floor((minute || 0) / 60)).padStart(2, '0')}:${String((minute || 0) % 60).padStart(2, '0')}`;
  const days = review.logbook.map(day => `<section><h2>${escape(day.day)} · ${escape(day.driverName || day.driverId)}</h2><p>${day.signed ? 'Saved signature on record' : 'No saved signature'} · ${escape(day.certifyStatus)}</p><table><tr><th>Status</th><th>Start</th><th>End</th><th>Location</th><th>Load</th><th>Notes</th></tr>${day.events.map(event => `<tr>${[event.status, clock(event.startMin), clock(event.endMin), event.location, event.loadNo, event.note].map(value => `<td>${escape(value)}</td>`).join('')}</tr>`).join('')}</table></section>`).join('');
  await zip.text('Logbook/Logbook.html', `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Saved logbook</title><style>body{font:16px system-ui;margin:20px;color:#172439}section{overflow:auto;margin:28px 0}td,th{border:1px solid #ccd5df;padding:8px;text-align:left}table{border-collapse:collapse;width:100%}@media print{section{break-before:page}}</style><h1>Road Ready — saved logbook</h1><p>${escape(createdAt)}. Saved records; this copy does not recalculate or certify logs.</p>${days}</html>`, { signal });
  review.chatgptNote = 'Document and logbook export for reading and sharing. This file cannot restore a device. Use Export Everything in Road Ready for a complete device backup.';
  await zip.text('Review/ChatGPT-Review.json', JSON.stringify(review, null, 2), { signal });
  await zip.text('Documents/Index.csv', csv([['File', 'Load', 'Type', 'Original name', 'Bytes'], ...index.map(row => [row.path, row.load, row.type, row.name, row.bytes])]), { signal });
  if (missing.length) await zip.text('Documents/Unavailable-files.txt', `${missing.length} document originals are unavailable on this device:\n${missing.join('\n')}\n`, { signal });
  await zip.text('README.txt', `Road Ready — Documents + Logbook\n\n${seen.size} unique original files; ${review.logbook.length} driver log days.\nDocuments/: saved PDFs and photos. Identical files are included once; Index.csv lists their load references.\nLogbook/: readable saved driver logs.\nReview/: small file for ChatGPT review, including load records.\n\nThis collection is for reading and sharing. For moving to another phone or iPad, use Export Everything in Road Ready.\n`, { signal });
  checkAbort(signal);
  return { file:zip.file(`road-ready-docs-logbook-${createdAt.slice(0, 19).replace(/[:T]/g, '-')}.zip`), documentsOnly:true, createdAt, originals:seen.size, originalBytes, missingOriginals:missing.length, logDays:review.logbook.length, loads:review.loads.length };
}
