import assert from 'node:assert/strict';
import {test} from 'node:test';
import {File} from 'node:buffer';
import {webcrypto} from 'node:crypto';
import {
  CAPTURE_REFERENCE, captureBinary, resolveCaptureOriginal,
  validateCaptureGraph, validateCaptureArchive, validateCaptureDatabase, validateCaptureAccountRecords,
  validateCaptureAccountInstall, persistCaptureRun, readCaptureEvidence,
  importCaptureEvidence,
} from './captureOriginals.js';
import {
  encodeTransferCaptures, compactCaptureTransfer, expandCaptureTransfer,
  decodeTransferCaptures,
} from './captureTransfer.js';
import {compactTransferOriginals, expandTransferOriginals} from './transferContent.js';
import {sha256Original} from './originalStore.js';

if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', {value:webcrypto});

// Pure contracts only. Actual IndexedDB rollback and multiple browser writers
// are exercised separately by the capture browser tests. Every fixture is synthetic.
const copy = value => structuredClone(value);
const fileA = new File(['SYNTHETIC IMAGE A'], 'selected-original.png', {type:'image/png'});
const fileB = new File(['SYNTHETIC IMAGE B'], 'selected-cleaned.png', {type:'image/png'});
const hashA = await sha256Original(fileA);
const hashB = await sha256Original(fileB);
const reference = CAPTURE_REFERENCE;
const byteOriginal = async file => ({
  base64:Buffer.from(await file.arrayBuffer()).toString('base64'),
  sha256:await sha256Original(file), size:file.size, type:file.type,
});
const owner = (id = 'main-owner', file = fileA, hash = hashA) => ({
  local_blob_id:id, client_document_id:'selected-client', blob:file,
  sha256:hash, original_size_bytes:file.size,
});
const capture = (id, {client = 'selected-client', run = 'selected-run', file = fileA,
  hash = hashA, table = 'document_blobs', target = 'main-owner', kind = 'original'} = {}) => ({
  local_asset_id:id, client_document_id:client, capture_run_id:run, current:true,
  variants:[{kind, pageIndex:0}], file_name:'selected-source.png', mime_type:file.type,
  file_size_bytes:file.size, sha256:hash,
  [reference]:{table, id:target, sha256:hash, size:file.size},
});

function memoryDb(initial = {}) {
  const data = new Map();
  const primary = {documents_local:'local_id', document_blobs:'local_blob_id', capture_asset_blobs:'local_asset_id'};
  const operations = [];
  function table(name) {
    if (data.has(name)) return data.get(name);
    const rows = new Map((initial[name] || []).map(row => [row[primary[name]], copy(row)]));
    const selected = (field, value) => [...rows.values()].filter(row => row[field] === value);
    const result = {
      name, rows,
      get:async id => copy(rows.get(id)),
      put:async row => {operations.push({operation:'put', table:name, id:row[primary[name]]}); rows.set(row[primary[name]], copy(row)); return row[primary[name]];},
      toArray:async () => [...rows.values()].map(copy),
      toCollection:() => ({primaryKeys:async () => [...rows.keys()]}),
      where:field => ({equals:value => ({
        first:async () => copy(selected(field, value)[0]),
        toArray:async () => selected(field, value).map(copy),
        primaryKeys:async () => selected(field, value).map(row => row[primary[name]]),
        modify:async change => {
          for (const current of selected(field, value)) {
            const next = copy(current);
            if (typeof change === 'function') change(next); else Object.assign(next, change);
            operations.push({operation:'modify', table:name, id:next[primary[name]]});
            rows.set(next[primary[name]], next);
          }
        },
      })}),
    };
    data.set(name, result);
    return result;
  }
  const db = {
    name:'synthetic-capture-contract-' + crypto.randomUUID(), table, operations,
    transaction:async (...args) => {
      const before = new Map([...data].map(([name, item]) => [name, copy(item.rows)]));
      try {return await args.at(-1)();} catch (error) {
        for (const [name, rows] of before) {const target = table(name).rows; target.clear(); for (const [id, row] of rows) target.set(id, row);}
        throw error;
      }
    },
  };
  for (const name of Object.keys(primary)) db[name] = table(name);
  return db;
}

async function snapshot(db) {
  async function serial(value) {
    if (value instanceof Blob) return {binary:await sha256Original(value), size:value.size, mime:value.type};
    if (Array.isArray(value)) return Promise.all(value.map(serial));
    if (value && typeof value === 'object') {
      const out = {};
      for (const key of Object.keys(value).sort()) out[key] = await serial(value[key]);
      return out;
    }
    return value;
  }
  const out = {};
  for (const table of ['documents_local', 'document_blobs', 'capture_asset_blobs']) out[table] = await serial(await db.table(table).toArray());
  return JSON.stringify(out);
}

const recordKey = (table, id) => JSON.stringify(['table', table, id]);
function accountRecords(groups) {
  const records = {};
  for (const [table, rows] of Object.entries(groups)) for (const row of rows) {
    const id = row[table === 'document_blobs' ? 'local_blob_id' : 'local_asset_id'];
    records[recordKey(table, id)] = row;
  }
  return records;
}

test('capture references resolve through document aliases and capture owners', async () => {
  const raw = {...capture('capture-owner', {file:fileB, hash:hashB}), blob:fileB};
  delete raw[reference];
  const groups = {
    document_blobs:[owner(), {local_blob_id:'main-alias', original_blob_id:'main-owner', sha256:hashA, original_size_bytes:fileA.size}],
    capture_asset_blobs:[capture('via-document', {target:'main-alias'}), raw,
      capture('via-capture', {table:'capture_asset_blobs', target:'capture-owner', file:fileB, hash:hashB})],
  };
  assert.equal(validateCaptureGraph(groups), true);
  assert.equal(await validateCaptureArchive(groups), true);
  const db = memoryDb(groups);
  const document = await resolveCaptureOriginal(db, groups.capture_asset_blobs[0]);
  const variant = await resolveCaptureOriginal(db, groups.capture_asset_blobs[2]);
  assert.deepEqual([document.table, document.id, document.sha256], ['document_blobs', 'main-owner', hashA]);
  assert.deepEqual([variant.table, variant.id, variant.sha256], ['capture_asset_blobs', 'capture-owner', hashB]);
  assert.equal(await variant.blob.text(), await fileB.text());
});

test('missing owners, cycles, ambiguous bytes, and claim mismatches fail closed', async () => {
  const valid = {document_blobs:[owner()], capture_asset_blobs:[capture('asset')]};
  const missing = copy(valid); missing.capture_asset_blobs[0][reference].id = 'absent';
  const wrongSize = copy(valid); wrongSize.capture_asset_blobs[0][reference].size += 1;
  const wrongHash = copy(valid); wrongHash.capture_asset_blobs[0][reference].sha256 = hashB;
  const ambiguous = copy(valid); ambiguous.capture_asset_blobs[0].blob = fileA;
  const cycle = {document_blobs:[], capture_asset_blobs:[
    capture('cycle-a', {table:'capture_asset_blobs', target:'cycle-b'}),
    capture('cycle-b', {table:'capture_asset_blobs', target:'cycle-a'}),
  ]};
  for (const invalid of [missing, wrongSize, wrongHash, ambiguous, cycle]) {
    await assert.rejects(() => validateCaptureArchive(invalid), /Saved photo evidence/);
  }
  const documentCycle = {document_blobs:[
    {local_blob_id:'doc-a', original_blob_id:'doc-b', sha256:hashA, original_size_bytes:fileA.size},
    {local_blob_id:'doc-b', original_blob_id:'doc-a', sha256:hashA, original_size_bytes:fileA.size},
  ], capture_asset_blobs:[capture('asset', {target:'doc-a'})]};
  assert.throws(() => validateCaptureGraph(documentCycle), /cycle/);
});

test('archive validation checks actual bytes, including legacy owners without a hash', async () => {
  assert.equal(fileA.size, fileB.size);
  for (const declared of [hashA, undefined]) {
    const row = owner('main-owner', fileB, declared);
    if (declared === undefined) delete row.sha256;
    await assert.rejects(() => validateCaptureArchive({document_blobs:[row], capture_asset_blobs:[capture('asset')]}), /checksum or size/);
  }
  const legacy = owner(); delete legacy.sha256;
  assert.equal(await validateCaptureArchive({document_blobs:[legacy], capture_asset_blobs:[capture('asset')]}), true);
});

test('duplicate owner/capture IDs are rejected instead of selecting the last row', async () => {
  await assert.rejects(() => validateCaptureArchive({document_blobs:[owner('same'), owner('same', fileB, hashB)], capture_asset_blobs:[capture('asset', {target:'same', file:fileB, hash:hashB})]}), /duplicate/);
  assert.throws(() => validateCaptureGraph({document_blobs:[owner()], capture_asset_blobs:[capture('same'), capture('same')]}), /duplicate/);
  // Identities are scoped by table; a valid owner and capture may share a string.
  assert.equal(validateCaptureGraph({document_blobs:[owner('same')], capture_asset_blobs:[capture('same', {target:'same'})]}), true);
});

test('portable JSON and binary-storage payloads verify before reconstruction', async () => {
  const encoded = await byteOriginal(fileA);
  const binary = {__roadReadyBinary:'Blob', base64:encoded.base64, size:encoded.size, mimeType:encoded.type, sha256:encoded.sha256};
  const groups = {document_blobs:[{...owner(), blob:binary}], capture_asset_blobs:[capture('asset')]};
  assert.equal(await validateCaptureArchive(groups), true);
  const packed = {__roadReadyStoredBinaryV110458:1, bytes:await fileA.arrayBuffer(), type:fileA.type, size:fileA.size};
  assert.equal(await sha256Original(await captureBinary(packed)), hashA);
  groups.document_blobs[0].blob.base64 = (await byteOriginal(fileB)).base64;
  await assert.rejects(() => validateCaptureArchive(groups), /checksum or size/);
  await assert.rejects(() => captureBinary({...binary, size:binary.size + 1}), /incomplete/);
});

test('the frozen cloud-backup table adapter also verifies actual capture owner bytes', async () => {
  const groups = {document_blobs:[owner()], capture_asset_blobs:[capture('asset')]};
  // cloudMirror freezes table arrays; its adapter has no db.capture_asset_blobs
  // property or primaryKeys method. It must not silently skip verification.
  const table = name => ({name, toArray:async () => groups[name], toCollection:() => ({offset:offset => ({limit:limit => ({toArray:async () => groups[name].slice(offset, offset + limit)})})})});
  const frozen = {table, tables:Object.keys(groups).map(table)};
  assert.equal(await validateCaptureDatabase(frozen), true);
  groups.document_blobs[0].blob = fileB;
  await assert.rejects(() => validateCaptureDatabase(frozen), /checksum or size/);
});

test('account records require matching keys and decoded owner bytes at install', async () => {
  const raw = accountRecords({document_blobs:[owner()], capture_asset_blobs:[capture('asset')]});
  const encoded = copy(raw);
  encoded[recordKey('document_blobs', 'main-owner')].blob = {__rrAccountFile:1, kind:'Blob', size:fileA.size, mime:fileA.type, chunks:[{sha256:hashA, bytes:fileA.size}]};
  assert.equal(validateCaptureAccountRecords(encoded), true);
  assert.equal(await validateCaptureAccountInstall(encoded, async key => raw[key]), true);
  const badKey = copy(encoded);
  badKey[recordKey('document_blobs', 'unrelated-key')] = badKey[recordKey('document_blobs', 'main-owner')];
  delete badKey[recordKey('document_blobs', 'main-owner')];
  assert.throws(() => validateCaptureAccountRecords(badKey), /record identity/);
  await assert.rejects(() => validateCaptureAccountInstall(encoded, async key => key === recordKey('document_blobs', 'main-owner') ? {...raw[key], blob:fileB} : raw[key]), /checksum or size/);
  await assert.rejects(() => validateCaptureAccountInstall(encoded, async key => key === recordKey('document_blobs', 'main-owner') ? undefined : raw[key]), /missing/);
  assert.equal(validateCaptureAccountRecords({[JSON.stringify(['state', 'syntheticSetting'])]:{enabled:true}}), true);
});

const groupAssets = assets => assets.map(asset => ({file:asset.file, name:asset.file.name || 'synthetic.png', mimeType:asset.file.type, variants:[{kind:asset.kind, pageIndex:asset.pageIndex || 0}]}));
test('new and repeated captures retain existing owner bytes and every run/variant', async () => {
  const old = {...capture('legacy-owner', {client:'other-client', run:'legacy-run', file:fileB, hash:hashB}), blob:fileB, file_name:'other-original-name.png'};
  delete old[reference]; delete old.sha256;
  const db = memoryDb({documents_local:[{local_id:'selected-local', client_document_id:'selected-client'}], document_blobs:[owner()], capture_asset_blobs:[old]});
  const beforeOwner = await db.document_blobs.get('main-owner');
  const beforeLegacy = await db.capture_asset_blobs.get('legacy-owner');
  const assets = [{file:fileA, kind:'display-final'}, {file:fileB, kind:'original'}];
  const first = await persistCaptureRun({clientDocumentId:'selected-client', assets}, {db, groupAssets});
  const second = await persistCaptureRun({clientDocumentId:'selected-client', assets:assets.map(asset => ({...asset, file:new File([asset.file], 'renamed.png', {type:asset.file.type})}))}, {db, groupAssets});
  assert.notEqual(first.runId, second.runId);
  const rows = await db.capture_asset_blobs.toArray();
  assert.equal(rows.filter(row => row.client_document_id === 'selected-client').length, 4);
  assert.equal(rows.filter(row => row.blob).length, 1);
  assert.equal((await db.documents_local.get('selected-local')).capture_runs.length, 2);
  assert.deepEqual(await db.document_blobs.get('main-owner'), beforeOwner);
  assert.deepEqual(await db.capture_asset_blobs.get('legacy-owner'), beforeLegacy);
  assert.equal(await sha256Original((await db.document_blobs.get('main-owner')).blob), hashA);
  assert.equal(await sha256Original((await db.capture_asset_blobs.get('legacy-owner')).blob), hashB);
  assert.ok(!db.operations.some(operation => operation.operation === 'put' && (operation.id === 'main-owner' || operation.id === 'legacy-owner')));
  for (const descriptor of second.assets) assert.equal(await sha256Original((await resolveCaptureOriginal(db, await db.capture_asset_blobs.get(descriptor.localAssetId))).blob), descriptor.sha256);
});

test('a damaged main owner is rejected before a new capture reference is saved', async () => {
  const db = memoryDb({documents_local:[{local_id:'selected-local', client_document_id:'selected-client'}], document_blobs:[owner('main-owner', fileA, hashB)]});
  const before = await snapshot(db);
  await assert.rejects(() => persistCaptureRun({clientDocumentId:'selected-client', assets:[{file:fileA, kind:'original'}]}, {db, groupAssets}), /checksum or size/);
  assert.equal(await snapshot(db), before);
  assert.equal(db.operations.length, 0);
});

test('selected capture export resolves external owners without exporting their filing metadata', async () => {
  const external = {...owner('outside-owner', fileB, hashB), client_document_id:'outside-client', load_no:'TEST-OUTSIDE', title:'PRIVATE-OUTSIDE-TITLE'};
  const selected = capture('selected-asset', {target:'outside-owner', file:fileB, hash:hashB});
  const db = memoryDb({documents_local:[{local_id:'selected-local', client_document_id:'selected-client', capture_asset_count:1}], document_blobs:[external], capture_asset_blobs:[selected]});
  const entries = await readCaptureEvidence(db, {client_document_id:'selected-client'});
  assert.equal(entries.length, 1);
  assert.equal(await sha256Original(entries[0].blob), hashB);
  assert.equal(entries[0].record.client_document_id, 'selected-client');
  assert.equal(entries[0].record[reference], undefined);
  assert.equal(entries[0].record.blob, undefined);
  const metadata = JSON.stringify(entries.map(entry => entry.record));
  for (const outside of ['outside-client', 'outside-owner', 'TEST-OUTSIDE', 'PRIVATE-OUTSIDE-TITLE']) assert.ok(!metadata.includes(outside));
});

test('import retains a pre-existing capture owner and rejects conflicting bytes under its ID', async () => {
  const existing = {...capture('existing-asset'), blob:fileA}; delete existing[reference];
  const db = memoryDb({documents_local:[{local_id:'selected-local', client_document_id:'selected-client', capture_run_id:'selected-run'}], capture_asset_blobs:[existing]});
  // Compare the persisted snapshot: Node 20 structuredClone returns a Blob for
  // a File input. Its prototype is not part of the stored owner contract.
  const {blob:ownerBlobBefore, ...ownerMetadataBefore} = await db.capture_asset_blobs.get('existing-asset');
  const ownerBytesBefore = new Uint8Array(await ownerBlobBefore.arrayBuffer());
  const ownerHashBefore = await sha256Original(ownerBlobBefore);
  assert.equal(ownerHashBefore, hashA);
  const record = copy(existing); delete record.blob;
  await importCaptureEvidence(db, [{record, blob:fileA}]);
  const {blob:ownerBlobAfter, ...ownerMetadataAfter} = await db.capture_asset_blobs.get('existing-asset');
  assert.deepEqual(ownerMetadataAfter, ownerMetadataBefore);
  assert.deepEqual(new Uint8Array(await ownerBlobAfter.arrayBuffer()), ownerBytesBefore);
  assert.equal(await sha256Original(ownerBlobAfter), ownerHashBefore);
  assert.equal(ownerBlobAfter.size, ownerBlobBefore.size);
  assert.equal(ownerBlobAfter.type, ownerBlobBefore.type);
  assert.deepEqual(db.operations.filter(operation => operation.table === 'capture_asset_blobs'), []);
  const before = await snapshot(db);
  await assert.rejects(() => db.transaction('rw', db.capture_asset_blobs, db.document_blobs, db.documents_local, () => importCaptureEvidence(db, [{record:{...record, sha256:hashB}, blob:fileB}])), /conflicts/);
  assert.equal(await snapshot(db), before);
});

async function transferFixture() {
  const record = {client_document_id:'selected-client', load_no:'TEST-SELECTED'};
  const first = {...capture('main-capture'), blob:fileA}; delete first[reference];
  const second = {...capture('clean-capture', {file:fileB, hash:hashB, kind:'clean-ocr'}), blob:fileB}; delete second[reference];
  const entries = [first, second].map(row => {const metadata = {...row}; delete metadata.blob; return {record:metadata, blob:row.blob};});
  const captures = await encodeTransferCaptures(record, async () => entries);
  const payload = {format:'road-ready-document-transfer', version:1, scope:{kind:'load', loadNo:'TEST-SELECTED'}, records:{loads:[]}, documents:[{record, original:await byteOriginal(fileA), captures}]};
  return {payload, entries};
}

test('version 3 retains selected versions and stores each content dependency once', async () => {
  const {payload} = await transferFixture();
  const encoded = compactCaptureTransfer(compactTransferOriginals(payload));
  assert.equal(encoded.version, 3);
  assert.deepEqual(Object.keys(encoded.originals).sort(), [hashA, hashB].sort());
  for (const item of Object.values(encoded.originals)) assert.deepEqual(Object.keys(item).sort(), ['base64', 'sha256', 'size']);
  const expanded = expandTransferOriginals(expandCaptureTransfer(encoded));
  assert.equal(expanded.version, 1);
  assert.equal(expanded.documents.length, 1);
  const decoded = await decodeTransferCaptures(expanded.documents, fileA.size + fileB.size);
  assert.equal(decoded.length, 2);
  assert.deepEqual(decoded.map(item => item.record.local_asset_id), ['main-capture', 'clean-capture']);
  assert.deepEqual(await Promise.all(decoded.map(item => sha256Original(item.blob))), [hashA, hashB]);
});

test('version 3 rejects missing dependencies, altered references, scope mismatches and duplicate IDs', async () => {
  const {payload} = await transferFixture();
  const encoded = compactCaptureTransfer(payload);
  const missing = copy(encoded); delete missing.originals[hashB];
  assert.throws(() => expandCaptureTransfer(missing), /missing or damaged/);
  const damaged = copy(encoded); damaged.documents[0].captures[0].original.size += 1;
  assert.throws(() => expandCaptureTransfer(damaged), /missing or damaged/);
  const wrongScope = expandCaptureTransfer(copy(encoded)); wrongScope.documents[0].captures[0].record.client_document_id = 'unselected-client';
  await assert.rejects(() => decodeTransferCaptures(wrongScope.documents, 10000), /scope/);
  const duplicate = expandCaptureTransfer(copy(encoded)); duplicate.documents[0].captures.push(copy(duplicate.documents[0].captures[0]));
  await assert.rejects(() => decodeTransferCaptures(duplicate.documents, 10000), /Duplicate capture/);
  const changedBytes = expandCaptureTransfer(copy(encoded)); changedBytes.documents[0].captures[0].original.base64 = (await byteOriginal(fileB)).base64;
  await assert.rejects(() => decodeTransferCaptures(changedBytes.documents, 10000), /damaged or incomplete/);
});

test('capture budget counts additional unique bytes, without charging the main original twice', async () => {
  const {payload} = await transferFixture();
  const expanded = expandCaptureTransfer(compactCaptureTransfer(payload));
  assert.equal((await decodeTransferCaptures(expanded.documents, fileB.size)).length, 2);
  await assert.rejects(() => decodeTransferCaptures(expanded.documents, fileB.size - 1), /too large/);
});

test('version 1 and shared-original version 2 remain readable without captures', async () => {
  const original = await byteOriginal(fileA);
  const v1 = {format:'road-ready-document-transfer', version:1, scope:{kind:'load', loadNo:'TEST-SELECTED'}, records:{loads:[]}, documents:[{record:{client_document_id:'first-client'}, original}]};
  assert.strictEqual(compactCaptureTransfer(v1), v1);
  assert.strictEqual(expandCaptureTransfer(v1), v1);
  assert.strictEqual(expandTransferOriginals(v1), v1);
  assert.deepEqual(await decodeTransferCaptures(v1.documents, 0), []);
  const v2 = compactTransferOriginals({...v1, documents:[...v1.documents, {record:{client_document_id:'second-client'}, original:{...original}}]});
  assert.equal(v2.version, 2);
  assert.strictEqual(compactCaptureTransfer(v2), v2);
  assert.strictEqual(expandCaptureTransfer(v2), v2);
  const expanded = expandTransferOriginals(v2);
  assert.equal(expanded.version, 1);
  assert.deepEqual(expanded.documents.map(item => item.original), [original, original]);
  assert.deepEqual(await decodeTransferCaptures(expanded.documents, 0), []);
});
