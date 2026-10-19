import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { transform, loadBindings } from 'next/dist/build/swc/index.js';
import { makeFixture, originalText, testProfile } from './testFixture.mjs';

const fixture = await makeFixture();
const core = await import(fixture.url('auditReadinessCoreV1.js'));
const storage = await import(fixture.url('auditReadinessStorageV1.js'));
const packet = await import(fixture.url('evidenceWorkspacePacketV110453.js'));
const { sha256, readStoredZip } = await import(pathToFileURL(path.join(fixture.backup, 'chunkedZipV110431.js')));
const { normalizeBusinessStore, BUSINESS_STORE_KEY } = await import(pathToFileURL(path.join(fixture.business, 'businessStore.js')));
const memory = new Map(), original = new Blob([originalText], { type: 'application/pdf' }), hash = await sha256(await original.arrayBuffer());
const priorWindow = globalThis.window;
const priorNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
globalThis.window = new EventTarget(); window.localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) };
const fuel = { id: 'doc/fuel-1', kind: 'document', name: 'Synthetic-fuel.pdf', category: 'fuel', unit: '228', loadNo: '', date: '2026-10-19', source: { local_id: 'fuel-1', sha256: hash, file_size_bytes: original.size } };
const distance = { ...fuel, id: 'doc/distance-1', name: '=Synthetic-distance.pdf', category: 'other', source: { ...fuel.source, local_id: 'distance-1' } };
const missing = { ...fuel, id: 'doc/license-1', name: 'Synthetic-license.pdf', category: 'permit', source: { ...fuel.source, local_id: 'license-1' } };
const rows = [fuel, distance, missing], state = { eventsByDay: { '2026-10-19': [{ id: 'protected', status: 'SB', startMin: 0, endMin: 600 }] }, signatureByDay: { '2026-10-19': { signed: true } }, motive: { untouched: true } }, protectedState = structuredClone(state);
const readOriginal = async row => row.id === missing.id ? null : original;
const options = { rows, area: 'ifta', week: '2026-10-19', today: '2026-10-19', scope: { unit: '228', driverId: 'driver-a' } };
let business;
async function saveCheck(requirementId, selected, extra = {}) {
  const model = core.buildAudit({ ...options, business }), instance = model.items.find(v => v.requirement.id === requirementId);
  return storage.saveAuditReview(instance, { status: 'checked', reviewer: 'Synthetic Reviewer', sourceIds: [selected.id], coverageFrom: '2026-10-19', coverageThrough: '2026-10-25', confirmations: instance.requirement.questions.map(() => true), note: '', ...extra }, model.profile, rows, { readOriginal: async () => original });
}
try {
  await test('installer is repeatable and both JSX modules compile', async () => {
    await loadBindings();
    for (const name of ['AuditReadinessV1.jsx', 'EvidenceWorkspaceV110453.jsx']) await transform(fs.readFileSync(path.join(fixture.owner, name), 'utf8'), { filename: name, jsc: { parser: { syntax: 'ecmascript', jsx: true }, target: 'es2022' }, module: { type: 'es6' } });
    const workspace = fs.readFileSync(path.join(fixture.owner, 'EvidenceWorkspaceV110453.jsx'), 'utf8');
    assert(workspace.includes("['audit','Audit']")); assert(workspace.includes("category:request.category,unit:request.unit||'',loadNo:request.loadNo||''"));
  });
  await test('save verifies bytes, records scoped evidence and survives business normalization/reopen', async () => {
    business = await storage.saveAuditProfile(testProfile, core.emptyProfile());
    ({ business } = await saveCheck('ifta-fuel', fuel));
    const reopened = normalizeBusinessStore(storage.readAuditBusiness());
    assert.equal(reopened[core.PROFILE_KEY].iftaBase, 'IL'); assert.equal(reopened[core.PROFILE_KEY].irpBase, 'NJ');
    assert.equal(reopened[core.REVIEWS_KEY][0].sourceRefs[0].sha256, hash);
    assert.equal(core.buildAudit({ ...options, business: reopened }).items.find(v => v.requirement.id === 'ifta-fuel').status, 'checked');
    await assert.rejects(storage.verifyAuditSources([fuel], { readOriginal: async () => new Blob(['changed original']) }), /bytes do not match/);
    const cancelled = new AbortController(); cancelled.abort(); await assert.rejects(storage.verifyAuditSources([fuel], { signal: cancelled.signal, readOriginal }), { name: 'AbortError' });
    assert.deepEqual(state, protectedState);
  });
  await test('ZIP includes linked original once, source hashes, applicability and unresolved original disclosure', async () => {
    ({ business } = await saveCheck('ifta-distance', distance));
    ({ business } = await saveCheck('ifta-license', missing, { coverageFrom: '2026-01-01', coverageThrough: '2026-12-31' }));
    const model = core.buildAudit({ ...options, business }), selected = core.packetRowsFor(model), index = core.auditIndex(model);
    assert.equal(selected.length, 3);
    const result = await packet.preparePacket(selected, { scenario: 'all', from: model.week.from, to: model.week.to, auditArea: 'ifta' }, { readOriginal, auditIndex: index });
    assert.equal(result.originals, 1); assert.equal(result.records, 3); assert.equal(result.missing.length, 1);
    const zip = await readStoredZip(result.file), manifest = JSON.parse(await zip.get('manifest.json').blob.text()), reviewIndex = JSON.parse(await zip.get('Audit-readiness.json').blob.text());
    assert.equal(manifest.auditIndexFile, 'Audit-readiness.json'); assert.equal(manifest.records[0].path, manifest.records[1].path);
    assert.equal(await zip.get(manifest.records[0].path).blob.text(), originalText);
    assert.equal(manifest.records[0].auditSha256, hash);
    assert.equal(reviewIndex.confirmedProfile.iftaBase, 'IL'); assert.equal(reviewIndex.week.from, '2026-10-19');
    assert.equal(reviewIndex.checks.find(v => v.requirement === 'ifta-license').status, 'needs_review');
    assert.equal(reviewIndex.counts.checked, 2); assert.equal(reviewIndex.archiveVerification.unavailableOriginals.length, 1);
    assert.match(await zip.get('Start-here.html').blob.text(), /Audit-readiness.json/);
    assert.match(await zip.get('index.csv').blob.text(), /'=Synthetic-distance/);
    assert.deepEqual(state, protectedState);
  });
  await test('existing packets keep their original behavior without an audit index', async () => {
    const result = await packet.preparePacket([fuel, distance], { scenario: 'all' }, { readOriginal }), zip = await readStoredZip(result.file);
    assert.equal(result.originals, 1); assert(!zip.has('Audit-readiness.json'));
    const manifest = JSON.parse(await zip.get('manifest.json').blob.text()); assert(!('auditIndexFile' in manifest)); assert(!('auditSha256' in manifest.records[0]));
  });
  await test('malformed saved business data and storage failures cannot overwrite records', async () => {
    const saved = memory.get(BUSINESS_STORE_KEY); memory.set(BUSINESS_STORE_KEY, '{malformed');
    assert.throws(() => storage.readAuditBusiness(), /could not be read/);
    await assert.rejects(storage.saveAuditProfile(testProfile, core.emptyProfile()), /could not be read/);
    assert.equal(memory.get(BUSINESS_STORE_KEY), '{malformed'); memory.set(BUSINESS_STORE_KEY, saved);
    const write = window.localStorage.setItem; window.localStorage.setItem = () => { throw new DOMException('Quota full', 'QuotaExceededError'); };
    const previous = memory.get(BUSINESS_STORE_KEY);
    await assert.rejects(storage.saveAuditProfile(testProfile, core.normalizeAudit(business).profile), { name: 'QuotaExceededError' });
    assert.equal(memory.get(BUSINESS_STORE_KEY), previous); window.localStorage.setItem = write;
  });
  await test('paired preview adapters isolate all review persistence from real account storage', async () => {
    const accountBefore = [...memory.entries()], localStorage = window.localStorage;
    window.localStorage = { getItem: () => { throw Error('Real account read forbidden in this preview test'); }, setItem: () => { throw Error('Real account write forbidden in this preview test'); } };
    window.__OWNER_OP_BUSINESS_STORE_VOLATILE_V10963__ = true;
    let sample = { sampleOnly: true }, writes = 0;
    const adapter = { readStore: () => structuredClone(sample), writeStore: (next, expected) => { assert.deepEqual(expected, sample); sample = structuredClone(next); writes++; }, readOriginal };
    try {
      sample = await storage.saveAuditProfile(testProfile, core.emptyProfile(), adapter);
      const model = core.buildAudit({ ...options, business: sample }), instance = model.items.find(v => v.requirement.id === 'ifta-fuel');
      const saved = await storage.saveAuditReview(instance, { status: 'checked', reviewer: 'Preview Reviewer', sourceIds: [fuel.id], coverageFrom: '2026-10-19', coverageThrough: '2026-10-25', confirmations: instance.requirement.questions.map(() => true), note: 'Synthetic adapter test' }, model.profile, rows, adapter);
      assert.equal(writes, 2); assert.equal(saved.business[core.REVIEWS_KEY][0].reviewer, 'Preview Reviewer'); assert.equal(sample.sampleOnly, true);
      await assert.rejects(storage.saveAuditProfile(testProfile, core.normalizeAudit(sample).profile, { readStore: adapter.readStore }), /both readStore and writeStore/);
      assert.deepEqual([...memory.entries()], accountBefore);
    } finally { window.localStorage = localStorage; delete window.__OWNER_OP_BUSINESS_STORE_VOLATILE_V10963__; }
  });
} finally { globalThis.window = priorWindow; if (priorNavigator) Object.defineProperty(globalThis, 'navigator', priorNavigator); else delete globalThis.navigator; fixture.cleanup(); }
