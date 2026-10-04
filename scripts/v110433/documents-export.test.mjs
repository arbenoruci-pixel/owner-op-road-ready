import assert from 'node:assert/strict';
import { buildDocumentsExport } from './documentsExport.js';
import { readStoredZip, CHUNK_BYTES } from '../v110431/chunkedZip.js';
import { inspectLargeBackup } from '../v110431/largeBackup.js';

const unit = new Uint8Array(CHUNK_BYTES).fill(65);
const original = new Blob([unit, unit, unit, unit], { type:'application/pdf' });
const other = new Blob([unit, 'different original'], { type:'application/pdf' });
const discardedVariants = new Blob(Array.from({ length:1178 }, () => new Blob([unit])));
assert.ok(discardedVariants.size > 1.15 * 1024 ** 3);
const documents = [
  { client_document_id:'one', original_file_name:'bol.pdf', load_no:'LOAD-A', type:'bol' },
  { client_document_id:'copy', original_file_name:'renamed-bol.pdf', load_no:'LOAD-B', type:'bol' },
  { client_document_id:'different', original_file_name:'bol.pdf', load_no:'LOAD-A', type:'bol' },
  { client_document_id:'formula', original_file_name:'=SUM(1,2).pdf', load_no:'+99', type:'@SUM(1)' },
  { client_document_id:'missing', original_file_name:'unavailable.pdf' },
];
const originals = [
  { client_document_id:'one', blob:original },
  { client_document_id:'copy', blob:original },
  { client_document_id:'different', blob:other },
  { client_document_id:'formula', blob:original },
  { client_document_id:'orphan', local_blob_id:'unlinked-original.pdf', blob:new Blob(['unlinked original'], { type:'application/pdf' }) },
];
const reads = [];
const db = { table(name) {
  reads.push(name);
  if (name === 'documents_local') return { toArray:async () => documents };
  if (name === 'document_blobs') return { toCollection:() => ({ offset:offset => ({ limit:limit => ({ toArray:async () => originals.slice(offset, offset + limit) }) }) }) };
  throw new Error(`Document export read an internal table: ${name}`);
}, get tables() { throw new Error('Document export must not enumerate the complete database'); } };
const state = {
  activeDriverId:'driver-one', teamDrivers:[{ id:'driver-one', name:'Driver One' }, { id:'driver-two', name:'Driver Two' }],
  eventsByDay:{ '2026-10-01':[{ status:'OFF', startMin:0, endMin:1440, note:'<script>must be escaped</script>' }] },
  teamLogbooksByDriverId:{ 'driver-two':{ eventsByDay:{ '2026-10-02':[{ status:'SB', startMin:0, endMin:1440 }] } } },
  dotWallet:{ documents:{ permit:{ name:'permit.png', attachmentDataUrl:'data:image/png;base64,AQID' }, legacyRegistration:{ name:'registration.png', photoDataUrl:'data:image/png;base64,BwgJ' } } },
  documentsByDay:{ '2026-10-01':[{ fileName:'log-photo.jpg', attachmentDataUrl:'data:image/jpeg;base64,BAUG' }] },
  dutySafetyBackupByDay:{ history:discardedVariants },
};
const businessStore = { loads:[{ loadNo:'LOAD-A' }, { loadNo:'LOAD-B' }], documents:[{ fileName:'permit.png', attachmentDataUrl:'data:image/png;base64,AQID' }], history:discardedVariants };
const nativeRead = Blob.prototype.arrayBuffer;
Blob.prototype.arrayBuffer = function() { assert.ok(this.size <= CHUNK_BYTES, 'Original reads must remain bounded'); return nativeRead.call(this); };
try {
  const result = await buildDocumentsExport({ db, state, businessStore });
  assert.equal(result.documentsOnly, true);
  assert.equal(result.archive, undefined, 'Sharing collection cannot masquerade as a complete backup');
  assert.equal(result.originals, 6, 'Exact duplicate bytes are one file; differing same-name documents and both wallet attachment formats survive');
  assert.equal(result.missingOriginals, 1);
  assert.equal(result.logDays, 2);
  assert.ok(result.file.size < 6 * CHUNK_BYTES, '1.15 GiB internal history must not enter the shareable ZIP');
  assert.deepEqual([...new Set(reads)].sort(), ['document_blobs', 'documents_local']);
  const files = await readStoredZip(result.file);
  assert.equal(files.has('Road-Ready-Backup.roadready.json'), false);
  assert.equal([...files.keys()].some(name => /Saved-assets|Records\//.test(name)), false);
  const index = await files.get('Documents/Index.csv').blob.text();
  assert.match(index, /LOAD-A/); assert.match(index, /LOAD-B/); assert.match(index, /renamed-bol/);
  assert.ok(index.includes('"\'=SUM(1,2).pdf"')); assert.ok(index.includes('"\'+99"')); assert.ok(index.includes('"\'@SUM(1)"'));
  const legacyImage = [...files].find(([name]) => name.endsWith('registration.png'));
  assert.deepEqual(new Uint8Array(await legacyImage[1].blob.arrayBuffer()), new Uint8Array([7,8,9]));
  const html = await files.get('Logbook/Logbook.html').blob.text();
  assert.match(html, /Driver One/); assert.match(html, /Driver Two/); assert.match(html, /&lt;script&gt;/);
  assert.equal(html.includes('<script>'), false);
  const report = await files.get('Documents/Unavailable-files.txt').blob.text();
  assert.match(report, /unavailable.pdf/);
  const pdfs = [...files.values()].filter(row => row.size === original.size);
  assert.equal(pdfs.length, 1);
  assert.deepEqual(new Uint8Array(await pdfs[0].blob.slice(-4).arrayBuffer()), new Uint8Array([65,65,65,65]));
  await assert.rejects(() => inspectLargeBackup(result.file), /not a supported complete/);
  const controller = new AbortController();
  await assert.rejects(() => buildDocumentsExport({ db, state, signal:controller.signal, onProgress:() => controller.abort() }), { name:'AbortError' });
  console.log(`PASS: >1.15 GiB recovery assets excluded; ${Math.round(result.file.size / 1024)} KiB documents ZIP; exact-byte dedup, different same-name originals, unlinked originals, wallet/log attachments, both drivers, missing-file report, cancellation and full-backup rejection`);
} finally { Blob.prototype.arrayBuffer = nativeRead; }
