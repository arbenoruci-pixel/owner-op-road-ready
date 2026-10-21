// Additional persistence tests; fake-indexeddb is a separate, pinned test-only
// dependency and is deliberately absent from the production dependency graph.
import 'fake-indexeddb/auto';
import test, {before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import {parseStatementCsv, iftaStatementSummary} from '../../source/src/modules/smart-import/core.js';
import {prepareStatementReview, prepareLogbookReview, commitStatementReview, stageStatementOriginal, readImportSnapshot} from '../../source/src/modules/smart-import/storage.js';
import {getOwnerOpDb} from '../../lib/local-db/dexie.js';
import {BUSINESS_STORE_KEY, readBusinessStore} from '../../source/src/modules/business/businessStore.js';

const values = new Map();
const store = {getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key), clear: () => values.clear()};
globalThis.localStorage = store;
globalThis.window = new EventTarget(); window.localStorage = store;
const context = {workspaceId: 'sample-owner', driverId: 'd1', driverName: 'Sample driver'};
const lock = async (name, work) => work();
let db;
const csv = 'Transaction Date,Merchant,State,Gallons,Total,Transaction ID,Vehicle\n2026-10-01,Station,IL,100,350,MF-1,7005';
const fuelReview = (name = 'Mudflap.csv') => { const file = new File([csv], name, {type: 'text/csv'}); return prepareStatementReview(file, parseStatementCsv(csv, name, {...context, provider: 'Mudflap'}), context); };
before(async () => { db = getOwnerOpDb(); await db.open(); });
beforeEach(async () => { for (const table of db.tables) await table.clear(); values.clear(); values.set('owner-op-account-data-owner-v1', 'sample-owner'); });
after(async () => { await db.delete(); delete globalThis.window; delete globalThis.localStorage; });

test('actual Dexie transaction saves one canonical row and a byte-exact source', async () => {
  const logs = {eventsByDay: {'2026-10-01': [{id: 'driving', status: 'D', startMin: 100, endMin: 200}]}, signatureByDay: {'2026-10-01': 'signed'}};
  values.set('sample-rods', JSON.stringify(logs));
  await db.app_snapshots.put({key: 'sample-rods', value: logs});
  const input = await fuelReview(), result = await commitStatementReview(input, {db, lock});
  const business = readBusinessStore();
  assert.equal(result.added, 1); assert.equal(business.fuel.length, 1);
  assert.equal(iftaStatementSummary({}, business, '2026-Q4').fuelTotal, 350);
  const document = await db.documents_local.get(result.document.local_id);
  const blob = await db.document_blobs.where('client_document_id').equals(document.client_document_id).first();
  assert.equal(await blob.blob.text(), csv); assert.equal(document.statementImportV1.status, 'applied');
  assert.equal(values.get('sample-rods'), JSON.stringify(logs)); assert.deepEqual((await db.app_snapshots.get('sample-rods')).value, logs);
});
test('renamed reimport preserves the original identity and keeps totals once', async () => {
  await commitStatementReview(await fuelReview(), {db, lock});
  const before = values.get(BUSINESS_STORE_KEY), result = await commitStatementReview(await fuelReview('renamed.csv'), {db, lock});
  assert.equal(result.added, 0); assert.equal(result.duplicates, 1);
  assert.equal(values.get(BUSINESS_STORE_KEY), before);
  assert.equal(await db.documents_local.count(), 1); assert.equal(await db.document_blobs.count(), 1);
  assert.equal((await db.documents_local.toArray())[0].original_file_name, 'Mudflap.csv');
});
test('projection quota failure retains a staged original and retry adds rows once', async () => {
  const input = await fuelReview();
  await assert.rejects(commitStatementReview(input, {db, lock, write: () => { throw Error('QuotaExceededError'); }}), /Quota/);
  assert.equal(values.get(BUSINESS_STORE_KEY), undefined); assert.equal(await db.documents_local.count(), 1);
  assert.equal((await db.documents_local.toArray())[0].statementImportV1.status, 'staged');
  await commitStatementReview(await fuelReview(), {db, lock});
  assert.equal(readBusinessStore().fuel.length, 1); assert.equal(await db.document_blobs.count(), 1);
});
test('real transaction rollback cannot leave metadata without its original', async () => {
  const input = await fuelReview();
  // A corrupt retained blob triggers a failure after the document add.
  const staged = await stageStatementOriginal(input, db);
  await db.documents_local.delete(staged.local_id);
  const original = await db.document_blobs.toCollection().first();
  await db.document_blobs.update(original.local_blob_id, {sha256: 'corrupt'});
  await assert.rejects(stageStatementOriginal(input, db), /verification/);
  assert.equal(await db.documents_local.count(), 0); assert.equal(readBusinessStore().fuel.length, 0);
});
test('an intervening save survives the failed projection', async () => {
  const input = await fuelReview();
  const stage = async review => { const document = await stageStatementOriginal(review, db); values.set(BUSINESS_STORE_KEY, JSON.stringify({fuel: [], expenses: [{id: 'concurrent', total: 12}]})); return document; };
  await assert.rejects(commitStatementReview(input, {db, lock, stage}), /changed while saving/);
  assert.equal(readBusinessStore().expenses[0].id, 'concurrent'); assert.equal(readBusinessStore().fuel.length, 0);
});
test('PDF reports are read-only, driver-scoped and share identical original bytes', async () => {
  const bytes = '%PDF-1.4\n% synthetic persistence fixture\n%%EOF';
  const file = new File([bytes], 'Motive-logbook.pdf', {type: 'application/pdf'});
  const options = {provider: 'Motive / KeepTruckin', timezone: 'America/Chicago', periodStart: '2026-09-25', periodEnd: '2026-10-05'};
  const before = readImportSnapshot('fuel').serialized;
  const first = await prepareLogbookReview(file, options, context);
  await commitStatementReview(first, {db, lock});
  const second = await prepareLogbookReview(file, options, {...context, driverId: 'd2', driverName: 'Second sample driver'});
  await commitStatementReview(second, {db, lock});
  assert.equal(readImportSnapshot('fuel').serialized, before);
  assert.equal(await db.documents_local.count(), 2); assert.equal(await db.document_blobs.count(), 1);
  assert.equal(await db.duty_events_local.count(), 0); assert.equal(await db.log_days_local.count(), 0);
  const documents = await db.documents_local.toArray();
  assert.deepEqual(documents.map(document => document.extracted.driverId).sort(), ['d1', 'd2']);
  assert.equal(await (await db.document_blobs.toCollection().first()).blob.text(), bytes);
});
test('the same PDF cannot silently acquire a different report timezone', async () => {
  const file = new File(['%PDF-1.4\n%%EOF'], 'Motive.pdf', {type: 'application/pdf'});
  const options = {provider: 'Motive / KeepTruckin', timezone: 'America/Chicago', periodStart: '2026-10-01', periodEnd: '2026-10-01'};
  await commitStatementReview(await prepareLogbookReview(file, options, context), {db, lock});
  const changed = await prepareLogbookReview(file, {...options, timezone: 'America/New_York'}, context);
  await assert.rejects(commitStatementReview(changed, {db, lock}), /different dates or timezone/);
  assert.equal((await db.documents_local.toArray())[0].extracted.timezone, 'America/Chicago');
});
