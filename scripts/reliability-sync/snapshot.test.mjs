import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-snapshot-contract-'));
after(() => fs.rmSync(root, { recursive: true, force: true }));
fs.copyFileSync(new URL('./snapshot.js', import.meta.url), path.join(root, 'snapshot.mjs'));
fs.copyFileSync(new URL('../v110455/accountCore.js', import.meta.url), path.join(root, 'accountCoreV110455.js'));
fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
const { snapshotChange, statusTransition, archiveChanged } = await import(pathToFileURL(path.join(root, 'snapshot.mjs')));
const { recordsFrom } = await import(pathToFileURL(path.join(root, 'accountCoreV110455.js')));
const initial = { activeDriverId: 'test', activeDay: '2026-10-18', view: 'logbook',
  eventsByDay: { '2026-10-18': [{ id: 'a', status: 'OFF', startMin: 0, endMin: 600, note: 'Recorded' }] } };
test('re-saving an identical durable snapshot performs no write and no sync', () => {
  assert.deepEqual(snapshotChange(initial, structuredClone(initial)), { write: false, records: false, archive: false });
});
test('navigation, selection and sheets are durable locally without a network mutation', () => {
  const next = { ...initial, activeDay: '2026-10-17', view: 'documents', sheet: { type: 'edit' }, selectedIds: ['a'] };
  assert.deepEqual(snapshotChange(initial, next), { write: true, records: false, archive: false });
});
test('notes, exact minutes, status, signatures and timezone proposals all remain sync changes', () => {
  for (const change of [s => s.eventsByDay['2026-10-18'][0].note = 'Changed',
    s => s.eventsByDay['2026-10-18'][0].endMin = 601, s => s.eventsByDay['2026-10-18'][0].status = 'SB',
    s => s.signatureByDay = { '2026-10-18': { signed: true, signatureDataUrl: 'test-only' } },
    s => s.homeTerminalTimeZoneProposal = { to: 'America/Chicago', effectiveAt: null }]) {
    const next = structuredClone(initial); change(next); const result = snapshotChange(initial, next);
    assert.equal(result.records, true); assert.equal(result.archive, true);
  }
});
test('guide repair timestamp alone cannot cause a receive-save-sync feedback loop', () => {
  const before = { ...initial, loadGuidesById: { x: { id: 'x', loadNo: 'SYNTHETIC', updatedAt: 1, integrityRepairedAt: 1 } } };
  const next = structuredClone(before); next.loadGuidesById.x.updatedAt = 2; next.loadGuidesById.x.integrityRepairedAt = 2;
  assert.equal(snapshotChange(before, next).archive, false);
});
test('archive changes are detected independently from a new working-record revision', () => {
  const base = recordsFrom({ state: initial }); const next = structuredClone(initial); next.currentReason = 'Break';
  assert.equal(archiveChanged(recordsFrom({ state: next }), base), false);
  next.dotWallet = { documents: { a: { id: 'doc', sha256: 'synthetic-digest' } } };
  assert.equal(archiveChanged(recordsFrom({ state: next }), base), true);
});
test('identical errors retain one issue identity and retries cannot hide it', () => {
  const first = statusTransition({}, { phase: 'error', scope: 'all', message: 'Original unavailable' }, 100).next;
  const again = statusTransition(first, { phase: 'error', scope: 'all', message: 'Original unavailable' }, 200);
  assert.equal(again.changed, false); assert.equal(again.next.issue.firstAt, 100);
  const retry = statusTransition(again.next, { phase: 'syncing', scope: 'records', message: 'Syncing changes' }).next;
  const recordSuccess = statusTransition(retry, { phase: 'records_current', scope: 'records', message: 'Records current' }).next;
  assert.equal(recordSuccess.issue.firstAt, 100);
  assert.equal(statusTransition(recordSuccess, { phase: 'current', scope: 'all', message: 'Current' }).next.issue, null);
});
